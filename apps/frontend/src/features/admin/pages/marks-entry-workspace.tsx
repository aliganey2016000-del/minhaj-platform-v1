import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ClipboardEdit,
  Download,
  FileUp,
  GraduationCap,
  Loader2,
  Printer,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../../../lib/axios';

interface ExamPeriod {
  _id: string;
  name: string;
  academicYear: string;
  term?: string;
  startDate?: string;
  endDate?: string;
  status: 'draft' | 'published' | 'closed';
}

interface Exam {
  _id: string;
  title: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  totalMarks?: number;
  passingMarks?: number;
  status?: string;
  resultCount?: number;
  attendanceSummary?: {
    present?: number;
    absent?: number;
    totalMarked?: number;
  };
  course?: {
    _id?: string;
    title?: { en?: string };
    class?: { _id?: string; title?: string; section?: string };
    teacher?: any;
  };
}

interface EntrySummaryCourse {
  _id: string;
  totalStudents: number;
}

interface EntrySummary {
  courses?: EntrySummaryCourse[];
}

interface AttendanceRosterRow {
  student?: {
    _id?: string;
    studentId?: string;
    profile?: { firstName?: string; lastName?: string };
    class?: { title?: string; section?: string };
  };
  attendance?: { status?: string } | null;
}

interface ResultRow {
  _id: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  status: string;
  remarks?: string;
  student?: {
    _id?: string;
    studentId?: string;
    profile?: { firstName?: string; lastName?: string };
  };
}

type SheetAttendance = 'present' | 'absent' | 'unmarked';

interface SheetRow {
  studentId: string;
  studentCode: string;
  studentName: string;
  attendance: SheetAttendance;
  marks: string;
  remarks: string;
  resultId?: string;
  savedGrade?: string;
  savedPercentage?: number;
}

const formatDate = (value?: string, withYear = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
};

const formatRange = (period?: ExamPeriod) => {
  if (!period) return '';
  const start = period.startDate ? formatDate(period.startDate, true) : '';
  const end = period.endDate ? formatDate(period.endDate, true) : '';
  return start && end ? `${start} – ${end}` : start || end || 'Dates not set';
};

const classLabel = (exam: Exam) => {
  const cls = exam.course?.class;
  if (!cls?.title) return 'Class not set';
  return cls.section ? `${cls.title} - ${cls.section}` : cls.title;
};

const isMarksSubmitted = (exam: Exam) => {
  const attendanceMarked = Number(exam.attendanceSummary?.totalMarked || 0);
  const resultCount = Number(exam.resultCount || 0);
  return attendanceMarked > 0 && resultCount >= attendanceMarked;
};

const teacherLabel = (exam: Exam) => {
  const profile = exam.course?.teacher?.profile;
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  return name || 'Teacher not assigned';
};

const studentName = (row: AttendanceRosterRow) => {
  const profile = row.student?.profile;
  return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || row.student?.studentId || 'Student';
};

const gradeFor = (marks: number, total: number, absent = false) => {
  if (absent) return { percentage: 0, grade: 'N/A', status: 'Absent' };
  const percentage = total > 0 ? Math.round((marks / total) * 100) : 0;
  const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 50 ? 'D' : 'F';
  return { percentage, grade, status: percentage >= 50 ? 'Passed' : 'Failed' };
};

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
};

export function MarksEntryWorkspace() {
  const { periodId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedExamId = searchParams.get('examId') || '';
  const selectedCourseId = searchParams.get('courseId') || '';
  const importRef = useRef<HTMLInputElement | null>(null);

  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [summary, setSummary] = useState<EntrySummary | null>(null);
  const [classFilter, setClassFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [submissionTab, setSubmissionTab] = useState<'pending' | 'submitted'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetSaving, setSheetSaving] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [sheetMessage, setSheetMessage] = useState('');

  const load = async () => {
    if (!periodId) return;
    setLoading(true);
    setError('');
    try {
      const [periodResponse, examResponse, summaryResponse] = await Promise.all([
        api.get('/exams/periods'),
        api.get('/exams', { params: { period: periodId, limit: 200 } }),
        api.get('/gradebook-courses/entry-summary'),
      ]);
      setPeriods(periodResponse.data?.data || []);
      setExams(examResponse.data?.data || []);
      setSummary(summaryResponse.data?.data || null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load this marks entry workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [periodId]);

  const period = useMemo(() => periods.find((item) => item._id === periodId), [periodId, periods]);

  const totalStudentsByCourse = useMemo(() => {
    const map = new Map<string, number>();
    (summary?.courses || []).forEach((item) => map.set(String(item._id), Number(item.totalStudents || 0)));
    return map;
  }, [summary]);

  const uniqueExams = useMemo(() => {
    const map = new Map<string, Exam>();
    exams.forEach((exam) => {
      const courseId = String(exam.course?._id || '');
      if (!courseId) return;
      const existing = map.get(courseId);
      if (!existing) {
        map.set(courseId, exam);
        return;
      }
      const currentDate = new Date(exam.examDate || 0).getTime();
      const existingDate = new Date(existing.examDate || 0).getTime();
      if (currentDate < existingDate) map.set(courseId, exam);
    });
    return Array.from(map.values()).sort((a, b) =>
      classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true })
      || String(a.course?.title?.en || '').localeCompare(String(b.course?.title?.en || ''))
    );
  }, [exams]);

  const selectedExam = useMemo(
    () => uniqueExams.find((exam) => exam._id === selectedExamId) || null,
    [uniqueExams, selectedExamId],
  );

  const classes = useMemo(() => {
    const map = new Map<string, string>();
    uniqueExams.forEach((exam) => {
      const id = String(exam.course?.class?._id || '');
      if (id) map.set(id, classLabel(exam));
    });
    return Array.from(map, ([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [uniqueExams]);

  const courses = useMemo(() => uniqueExams
    .map((exam) => ({
      value: String(exam.course?._id || ''),
      label: exam.course?.title?.en || 'Course',
    }))
    .filter((item) => item.value)
    .sort((a, b) => a.label.localeCompare(b.label)), [uniqueExams]);

  const dates = useMemo(() => Array.from(new Set(
    uniqueExams.map((exam) => {
      if (!exam.examDate) return '';
      const date = new Date(exam.examDate);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
    }).filter(Boolean)
  )).sort(), [uniqueExams]);

  const baseFilteredExams = useMemo(() => {
    const text = query.trim().toLowerCase();
    return uniqueExams.filter((exam) => {
      const courseId = String(exam.course?._id || '');
      const classId = String(exam.course?.class?._id || '');
      const rawDate = exam.examDate ? new Date(exam.examDate) : null;
      const date = rawDate && !Number.isNaN(rawDate.getTime()) ? rawDate.toISOString().slice(0, 10) : '';
      const marked = Number(exam.attendanceSummary?.totalMarked || 0);
      const total = totalStudentsByCourse.get(courseId) || marked;

      if (classFilter !== 'all' && classId !== classFilter) return false;
      if (courseFilter !== 'all' && courseId !== courseFilter) return false;
      if (dateFilter !== 'all' && date !== dateFilter) return false;
      if (attendanceFilter === 'complete' && !(total > 0 && marked >= total)) return false;
      if (attendanceFilter === 'pending' && total > 0 && marked >= total) return false;
      if (text && ![exam.course?.title?.en, classLabel(exam), exam.title].some((value) => String(value || '').toLowerCase().includes(text))) return false;
      return true;
    });
  }, [uniqueExams, classFilter, courseFilter, dateFilter, attendanceFilter, query, totalStudentsByCourse]);

  const submissionCounts = useMemo(() => ({
    pending: baseFilteredExams.filter((exam) => !isMarksSubmitted(exam)).length,
    submitted: baseFilteredExams.filter((exam) => isMarksSubmitted(exam)).length,
  }), [baseFilteredExams]);

  const filteredExams = useMemo(
    () => baseFilteredExams.filter((exam) => submissionTab === 'submitted' ? isMarksSubmitted(exam) : !isMarksSubmitted(exam)),
    [baseFilteredExams, submissionTab],
  );

  const totals = useMemo(() => uniqueExams.reduce((acc, exam) => {
    const courseId = String(exam.course?._id || '');
    const attendance = exam.attendanceSummary || {};
    const marked = Number(attendance.totalMarked || 0);
    acc.courses += 1;
    acc.students += totalStudentsByCourse.get(courseId) || marked;
    acc.present += Number(attendance.present || 0);
    acc.absent += Number(attendance.absent || 0);
    return acc;
  }, { courses: 0, students: 0, present: 0, absent: 0 }), [uniqueExams, totalStudentsByCourse]);

  const resetFilters = () => {
    setClassFilter('all');
    setCourseFilter('all');
    setDateFilter('all');
    setAttendanceFilter('all');
    setQuery('');
  };

  const openExam = (exam: Exam) => {
    const courseId = String(exam.course?._id || '');
    if (!courseId) return;
    const next = new URLSearchParams(searchParams);
    next.set('courseId', courseId);
    next.set('examId', exam._id);
    setSearchParams(next, { replace: false });
    window.setTimeout(() => document.getElementById('marks-sheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const loadSheet = async (examId: string) => {
    if (!examId) {
      setSheetRows([]);
      return;
    }
    setSheetLoading(true);
    setSheetError('');
    setSheetMessage('');
    try {
      const [attendanceResponse, resultsResponse] = await Promise.all([
        api.get(`/exams/${examId}/attendance`),
        api.get('/results', { params: { examId, limit: 200 } }),
      ]);
      const roster: AttendanceRosterRow[] = attendanceResponse.data?.data?.roster || [];
      const existing: ResultRow[] = resultsResponse.data?.data || [];
      const resultByStudent = new Map(
        existing.map((result) => [String(result.student?._id || ''), result])
      );

      setSheetRows(roster.map((row) => {
        const studentId = String(row.student?._id || '');
        const result = resultByStudent.get(studentId);
        const rawStatus = row.attendance?.status;
        const attendance: SheetAttendance = rawStatus === 'present'
          ? 'present'
          : rawStatus === 'absent'
            ? 'absent'
            : 'unmarked';
        return {
          studentId,
          studentCode: row.student?.studentId || '',
          studentName: studentName(row),
          attendance,
          marks: attendance === 'absent' ? '0' : result ? String(result.marksObtained ?? '') : '',
          remarks: result?.remarks || '',
          resultId: result?._id,
          savedGrade: result?.grade,
          savedPercentage: result?.percentage,
        };
      }));
    } catch (err: any) {
      setSheetError(err?.response?.data?.message || 'Could not load the student marks sheet.');
      setSheetRows([]);
    } finally {
      setSheetLoading(false);
    }
  };

  useEffect(() => { void loadSheet(selectedExamId); }, [selectedExamId]);

  const maxMarks = Number(selectedExam?.totalMarks || 100);

  const updateMarks = (studentId: string, value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    const safe = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    setSheetRows((rows) => rows.map((row) => row.studentId === studentId ? { ...row, marks: safe } : row));
    setSheetMessage('');
  };

  const updateRemarks = (studentId: string, value: string) => {
    setSheetRows((rows) => rows.map((row) => row.studentId === studentId ? { ...row, remarks: value } : row));
    setSheetMessage('');
  };

  const saveSheet = async () => {
    if (!selectedExam) return;
    const invalid = sheetRows.find((row) => row.attendance === 'present' && row.marks !== '' && (Number(row.marks) < 0 || Number(row.marks) > maxMarks));
    if (invalid) {
      setSheetError(`Marks must be between 0 and ${maxMarks}.`);
      return;
    }

    const results = sheetRows.flatMap((row) => {
      if (!row.studentId || row.attendance === 'unmarked') return [];
      if (row.attendance === 'present' && row.marks === '') return [];
      return [{
        student: row.studentId,
        marksObtained: row.attendance === 'absent' ? 0 : Number(row.marks),
        totalMarks: maxMarks,
        remarks: row.remarks,
        ...(row.attendance === 'absent' ? { status: 'absent' } : {}),
      }];
    });

    if (!results.length) {
      setSheetError('No marks are ready to save. Mark exam attendance first, then enter scores for present students.');
      return;
    }

    setSheetSaving(true);
    setSheetError('');
    setSheetMessage('');
    try {
      await api.post('/results/bulk', { exam: selectedExam._id, results });
      setSheetMessage(`Saved ${results.length} student result${results.length === 1 ? '' : 's'}.`);
      await Promise.all([loadSheet(selectedExam._id), load()]);
    } catch (err: any) {
      setSheetError(err?.response?.data?.message || 'Failed to save marks.');
    } finally {
      setSheetSaving(false);
    }
  };

  const exportSheet = () => {
    if (!selectedExam || !sheetRows.length) return;
    const rows = [
      ['Student ID', 'Student Name', 'Attendance', 'Score', 'Total Marks', 'Grade', 'Remark'],
      ...sheetRows.map((row) => {
        const marks = row.attendance === 'absent' ? 0 : Number(row.marks || 0);
        const preview = gradeFor(marks, maxMarks, row.attendance === 'absent');
        return [
          row.studentCode,
          row.studentName,
          row.attendance,
          row.marks,
          String(maxMarks),
          row.marks === '' && row.attendance === 'present' ? '' : preview.grade,
          row.remarks,
        ];
      }),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedExam.course?.title?.en || 'marks'}-${period?.name || 'exam'}.csv`.replace(/\s+/g, '-').toLowerCase();
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importSheet = async (file?: File) => {
    if (!file) return;
    setSheetError('');
    setSheetMessage('');
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error('CSV has no student rows.');
      const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().trim());
      const idIndex = headers.findIndex((header) => ['student id', 'studentid', 'id'].includes(header));
      const scoreIndex = headers.findIndex((header) => ['score', 'marks', 'marks obtained'].includes(header));
      const remarkIndex = headers.findIndex((header) => ['remark', 'remarks'].includes(header));
      if (idIndex < 0 || scoreIndex < 0) throw new Error('CSV must contain Student ID and Score columns.');

      const imported = new Map<string, { marks: string; remarks?: string }>();
      for (const line of lines.slice(1)) {
        const cells = parseCsvLine(line);
        const code = String(cells[idIndex] || '').trim();
        const score = String(cells[scoreIndex] || '').trim();
        if (!code || score === '') continue;
        const numeric = Number(score);
        if (Number.isNaN(numeric) || numeric < 0 || numeric > maxMarks) continue;
        imported.set(code, { marks: String(numeric), remarks: remarkIndex >= 0 ? String(cells[remarkIndex] || '') : undefined });
      }

      let matched = 0;
      setSheetRows((rows) => rows.map((row) => {
        const value = imported.get(row.studentCode);
        if (!value || row.attendance !== 'present') return row;
        matched += 1;
        return { ...row, marks: value.marks, remarks: value.remarks ?? row.remarks };
      }));
      setSheetMessage(`Imported marks for ${matched} present student${matched === 1 ? '' : 's'}. Review them, then click Save All.`);
    } catch (err: any) {
      setSheetError(err?.message || 'Could not import the CSV file.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const exportSummary = () => {
    const rows = [
      ['Course', 'Class', 'Date', 'Students', 'Present', 'Absent', 'Results Entered'],
      ...filteredExams.map((exam) => {
        const courseId = String(exam.course?._id || '');
        const attendance = exam.attendanceSummary || {};
        return [
          exam.course?.title?.en || 'Course',
          classLabel(exam),
          formatDate(exam.examDate),
          String(totalStudentsByCourse.get(courseId) || attendance.totalMarked || 0),
          String(attendance.present || 0),
          String(attendance.absent || 0),
          String(exam.resultCount || 0),
        ];
      }),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${period?.name || 'exam'}-marks-entry.csv`.replace(/\s+/g, '-').toLowerCase();
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-16 sm:p-5 sm:pt-20 lg:p-8 lg:pt-6">
      <main className="mx-auto max-w-[1500px] space-y-4">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link to="/admin/results/enter" className="mb-2 inline-flex items-center gap-2 text-xs font-black text-[var(--color-text-secondary)] hover:text-emerald-600">
              <ArrowLeft className="h-4 w-4" />
              Marks Entry
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
                {period?.name || (loading ? 'Loading exam…' : 'Exam')}
              </h1>
              {period && (
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black capitalize ${
                  period.status === 'published'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : period.status === 'draft'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                  {period.status}
                </span>
              )}
            </div>
            {period && (
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                {formatRange(period)} <span className="mx-1.5">·</span> Academic Year {period.academicYear}{period.term ? ` · ${period.term}` : ''}
              </p>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
          {[
            { label: 'Courses', value: totals.courses, icon: GraduationCap, tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' },
            { label: 'Total Students', value: totals.students, icon: Users, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
            { label: 'Present', value: totals.present, icon: CheckCircle2, tone: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300' },
            { label: 'Absent', value: totals.absent, icon: XCircle, tone: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm sm:p-4">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-xl font-black leading-none text-[var(--color-text-primary)] sm:text-2xl">{item.value}</p>
                    <p className="mt-1 truncate text-[10px] font-bold text-[var(--color-text-tertiary)] sm:text-xs">{item.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search course or class..."
                className="min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] pl-9 pr-3 text-xs outline-none focus:border-emerald-500 sm:text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition sm:px-4 ${
                showFilters
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              All Filters
            </button>
          </div>

          {showFilters && (
            <div className="mt-3 grid gap-2 border-t border-[var(--color-border-subtle)] pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="min-h-10 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-xs font-bold text-[var(--color-text-secondary)] outline-none">
                <option value="all">All Classes</option>
                {classes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} className="min-h-10 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-xs font-bold text-[var(--color-text-secondary)] outline-none">
                <option value="all">All Courses</option>
                {courses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="min-h-10 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-xs font-bold text-[var(--color-text-secondary)] outline-none">
                <option value="all">All Dates</option>
                {dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
              </select>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <select value={attendanceFilter} onChange={(event) => setAttendanceFilter(event.target.value)} className="min-h-10 min-w-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-xs font-bold text-[var(--color-text-secondary)] outline-none">
                  <option value="all">All Attendance</option>
                  <option value="complete">Attendance Complete</option>
                  <option value="pending">Attendance Pending</option>
                </select>
                <button type="button" onClick={resetFilters} title="Reset filters" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]">
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm">
          <nav className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1">
            <button
              type="button"
              onClick={() => setSubmissionTab('pending')}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-black transition sm:text-sm ${
                submissionTab === 'pending' ? 'bg-amber-500 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-primary)]'
              }`}
            >
              Not Submitted
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${submissionTab === 'pending' ? 'bg-white/20 text-white' : 'bg-[var(--color-surface-primary)] text-[var(--color-text-tertiary)]'}`}>
                {submissionCounts.pending}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSubmissionTab('submitted')}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-black transition sm:text-sm ${
                submissionTab === 'submitted' ? 'bg-emerald-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-primary)]'
              }`}
            >
              Submitted
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${submissionTab === 'submitted' ? 'bg-white/20 text-white' : 'bg-[var(--color-surface-primary)] text-[var(--color-text-tertiary)]'}`}>
                {submissionCounts.submitted}
              </span>
            </button>
          </nav>
        </section>

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-emerald-600" />
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center">
            <BookOpenCheck className="mx-auto h-9 w-9 text-[var(--color-text-tertiary)]" />
            <h2 className="mt-3 font-black text-[var(--color-text-primary)]">No course exams found</h2>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">No scheduled courses match the selected filters.</p>
          </div>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {filteredExams.map((exam, index) => {
              const courseId = String(exam.course?._id || '');
              const attendance = exam.attendanceSummary || {};
              const marked = Number(attendance.totalMarked || 0);
              const total = totalStudentsByCourse.get(courseId) || marked;
              const graded = Number(exam.resultCount || 0);
              const tone = index % 4 === 0
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30'
                : index % 4 === 1
                  ? 'bg-violet-50 text-violet-600 dark:bg-violet-950/30'
                  : index % 4 === 2
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30';
              const active = selectedExamId === exam._id;
              return (
                <article key={exam._id} className={`rounded-2xl border bg-[var(--color-surface-primary)] p-3.5 shadow-sm transition ${active ? 'border-emerald-500 ring-2 ring-emerald-500/15' : 'border-[var(--color-border-default)]'}`}>
                  <div className="flex items-start gap-2.5">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><BookOpenCheck className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-black text-[var(--color-text-primary)]">{exam.course?.title?.en || 'Course'}</h3>
                      <p className="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)]">{classLabel(exam)} · {formatDate(exam.examDate)}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-text-secondary)]">
                        <UserRound className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
                        <span className="truncate">{teacherLabel(exam)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-lg bg-[var(--color-surface-secondary)] px-1.5 py-2">
                      <p className="text-sm font-black text-[var(--color-text-primary)]">{total}</p>
                      <p className="text-[9px] font-bold text-[var(--color-text-tertiary)]">Students</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-1.5 py-2 dark:bg-emerald-950/25">
                      <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">{attendance.present || 0}</p>
                      <p className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300">Present</p>
                    </div>
                    <div className="rounded-lg bg-red-50 px-1.5 py-2 dark:bg-red-950/25">
                      <p className="text-sm font-black text-red-700 dark:text-red-300">{attendance.absent || 0}</p>
                      <p className="text-[9px] font-bold text-red-700 dark:text-red-300">Absent</p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-[var(--color-text-tertiary)]">
                    <span>{graded}/{total} results</span>
                    <span>{total ? Math.round((graded / total) * 100) : 0}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${total ? Math.min(100, (graded / total) * 100) : 0}%` }} />
                  </div>

                  <button
                    type="button"
                    onClick={() => openExam(exam)}
                    className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700"
                  >
                    <ClipboardEdit className="h-4 w-4" />
                    Enter Marks
                  </button>
                </article>
              );
            })}
          </section>
        )}

        {selectedCourseId && selectedExamId && selectedExam && (
          <section id="marks-sheet" className="scroll-mt-4 space-y-3 pt-2">
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate font-black text-[var(--color-text-primary)]">
                    {selectedExam.course?.title?.en || 'Course'} — {classLabel(selectedExam)}
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                    {formatDate(selectedExam.examDate, true)} · Total Marks {maxMarks} · Present {selectedExam.attendanceSummary?.present || 0} · Absent {selectedExam.attendanceSummary?.absent || 0}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void importSheet(event.target.files?.[0])} />
                  <button type="button" onClick={() => importRef.current?.click()} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-xs font-black text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]">
                    <FileUp className="h-4 w-4" /> Import CSV
                  </button>
                  <button type="button" onClick={exportSheet} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-xs font-black text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]">
                    <Download className="h-4 w-4" /> Export
                  </button>
                  <button type="button" onClick={() => window.print()} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-xs font-black text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]">
                    <Printer className="h-4 w-4" /> Print
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.delete('courseId');
                      next.delete('examId');
                      setSearchParams(next, { replace: true });
                    }}
                    className="min-h-9 rounded-xl border border-[var(--color-border-default)] px-3 text-xs font-black text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            {sheetError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{sheetError}</div>}
            {sheetMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">{sheetMessage}</div>}

            {sheetLoading ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              </div>
            ) : sheetRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">
                No students are available for this exam.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
                <div className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-2.5 text-xs font-bold text-[var(--color-text-tertiary)]">
                  {sheetRows.length} students · Present {sheetRows.filter((row) => row.attendance === 'present').length} · Absent {sheetRows.filter((row) => row.attendance === 'absent').length} · Attendance missing {sheetRows.filter((row) => row.attendance === 'unmarked').length}
                </div>

                <div className="divide-y divide-[var(--color-border-subtle)] sm:hidden">
                  {sheetRows.map((row) => {
                    const numericMarks = Number(row.marks || 0);
                    const preview = gradeFor(numericMarks, maxMarks, row.attendance === 'absent');
                    const invalid = row.attendance === 'present' && row.marks !== '' && (numericMarks < 0 || numericMarks > maxMarks);
                    const badgeTone = row.attendance === 'present'
                      ? 'bg-emerald-100 text-emerald-700'
                      : row.attendance === 'absent'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-800';
                    return (
                      <div key={row.studentId} className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-black text-[var(--color-text-primary)]">{row.studentName}</p>
                            <p className="text-[10px] font-bold text-[var(--color-text-tertiary)]">{row.studentCode}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black capitalize ${badgeTone}`}>{row.attendance}</span>
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-[var(--color-text-tertiary)]">Score / {maxMarks}</label>
                            <input
                              value={row.marks}
                              onChange={(event) => updateMarks(row.studentId, event.target.value)}
                              disabled={row.attendance !== 'present'}
                              placeholder={row.attendance === 'unmarked' ? 'Attendance first' : '0'}
                              className={`min-h-10 w-full rounded-xl border bg-[var(--color-surface-secondary)] px-3 text-sm font-black outline-none disabled:opacity-60 ${invalid ? 'border-red-400' : 'border-[var(--color-border-default)] focus:border-emerald-500'}`}
                            />
                          </div>
                          <div className="min-w-20 rounded-xl bg-[var(--color-surface-secondary)] px-3 py-2 text-center">
                            <p className="text-[10px] font-bold text-[var(--color-text-tertiary)]">Grade</p>
                            <p className="text-sm font-black text-[var(--color-text-primary)]">{row.attendance === 'unmarked' || (row.attendance === 'present' && row.marks === '') ? '—' : preview.grade}</p>
                          </div>
                        </div>
                        <input value={row.remarks} onChange={(event) => updateRemarks(row.studentId, event.target.value)} placeholder="Remark (optional)" className="min-h-10 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-xs outline-none focus:border-emerald-500" />
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="bg-[var(--color-surface-secondary)] text-[10px] font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Student ID</th>
                        <th className="px-4 py-3">Student Name</th>
                        <th className="px-4 py-3">Attendance</th>
                        <th className="px-4 py-3">Score ({maxMarks})</th>
                        <th className="px-4 py-3">Grade</th>
                        <th className="px-4 py-3">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-subtle)]">
                      {sheetRows.map((row, index) => {
                        const numericMarks = Number(row.marks || 0);
                        const preview = gradeFor(numericMarks, maxMarks, row.attendance === 'absent');
                        const invalid = row.attendance === 'present' && row.marks !== '' && (numericMarks < 0 || numericMarks > maxMarks);
                        const badgeTone = row.attendance === 'present'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : row.attendance === 'absent'
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
                        return (
                          <tr key={row.studentId}>
                            <td className="px-4 py-2.5 text-xs text-[var(--color-text-tertiary)]">{index + 1}</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-[var(--color-text-secondary)]">{row.studentCode}</td>
                            <td className="px-4 py-2.5 font-bold text-[var(--color-text-primary)]">{row.studentName}</td>
                            <td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black capitalize ${badgeTone}`}>{row.attendance}</span></td>
                            <td className="px-4 py-2.5">
                              <input
                                value={row.marks}
                                onChange={(event) => updateMarks(row.studentId, event.target.value)}
                                disabled={row.attendance !== 'present'}
                                placeholder={row.attendance === 'unmarked' ? 'Attendance first' : '0'}
                                className={`w-28 rounded-lg border bg-[var(--color-surface-secondary)] px-2.5 py-1.5 text-xs font-black outline-none disabled:opacity-60 ${invalid ? 'border-red-400' : 'border-[var(--color-border-default)] focus:border-emerald-500'}`}
                              />
                            </td>
                            <td className="px-4 py-2.5 font-black text-[var(--color-text-primary)]">{row.attendance === 'unmarked' || (row.attendance === 'present' && row.marks === '') ? '—' : preview.grade}</td>
                            <td className="px-4 py-2.5">
                              <input value={row.remarks} onChange={(event) => updateRemarks(row.studentId, event.target.value)} placeholder="Optional" className="w-full min-w-40 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Absent students are automatically saved as 0 / N/A. Students with unmarked attendance cannot receive marks yet.</p>
                  <button type="button" onClick={() => void saveSheet()} disabled={sheetSaving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
                    {sheetSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {sheetSaving ? 'Saving...' : 'Save All'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default MarksEntryWorkspace;
