import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardEdit,
  Download,
  GraduationCap,
  Printer,
  RotateCcw,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { ResultsEntry } from './results-entry';

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
  status?: string;
  attendanceSummary?: {
    present?: number;
    absent?: number;
    totalMarked?: number;
  };
  course?: {
    _id?: string;
    title?: { en?: string };
    class?: { _id?: string; title?: string; section?: string };
  };
}

interface EntrySummaryCourse {
  _id: string;
  totalStudents: number;
  gradedStudents: number;
  completed: boolean;
}

interface EntrySummary {
  courses?: EntrySummaryCourse[];
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

export function MarksEntryWorkspace() {
  const { periodId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedExamId = searchParams.get('examId') || '';
  const selectedCourseId = searchParams.get('courseId') || '';

  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [summary, setSummary] = useState<EntrySummary | null>(null);
  const [classFilter, setClassFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const progressByCourse = useMemo(() => {
    const map = new Map<string, EntrySummaryCourse>();
    (summary?.courses || []).forEach((item) => map.set(String(item._id), item));
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
    uniqueExams.map((exam) => exam.examDate ? new Date(exam.examDate).toISOString().slice(0, 10) : '').filter(Boolean)
  )).sort(), [uniqueExams]);

  const filteredExams = useMemo(() => {
    const text = query.trim().toLowerCase();
    return uniqueExams.filter((exam) => {
      const courseId = String(exam.course?._id || '');
      const classId = String(exam.course?.class?._id || '');
      const date = exam.examDate ? new Date(exam.examDate).toISOString().slice(0, 10) : '';
      const present = Number(exam.attendanceSummary?.present || 0);
      const absent = Number(exam.attendanceSummary?.absent || 0);
      const marked = Number(exam.attendanceSummary?.totalMarked || 0);
      const total = progressByCourse.get(courseId)?.totalStudents || marked;

      if (classFilter !== 'all' && classId !== classFilter) return false;
      if (courseFilter !== 'all' && courseId !== courseFilter) return false;
      if (dateFilter !== 'all' && date !== dateFilter) return false;
      if (attendanceFilter === 'complete' && !(total > 0 && marked >= total)) return false;
      if (attendanceFilter === 'pending' && total > 0 && marked >= total) return false;
      if (text && ![exam.course?.title?.en, classLabel(exam), exam.title].some((value) => String(value || '').toLowerCase().includes(text))) return false;
      return present >= 0 && absent >= 0;
    });
  }, [uniqueExams, classFilter, courseFilter, dateFilter, attendanceFilter, query, progressByCourse]);

  const totals = useMemo(() => uniqueExams.reduce((acc, exam) => {
    const courseId = String(exam.course?._id || '');
    const attendance = exam.attendanceSummary || {};
    const marked = Number(attendance.totalMarked || 0);
    acc.courses += 1;
    acc.students += progressByCourse.get(courseId)?.totalStudents || marked;
    acc.present += Number(attendance.present || 0);
    acc.absent += Number(attendance.absent || 0);
    return acc;
  }, { courses: 0, students: 0, present: 0, absent: 0 }), [uniqueExams, progressByCourse]);

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

  const selectedExam = uniqueExams.find((exam) => exam._id === selectedExamId) || null;

  const attendanceHref = period
    ? `/admin/exams/attendance?periodId=${encodeURIComponent(period._id)}&examName=${encodeURIComponent(period.name)}&academicYear=${encodeURIComponent(period.academicYear)}&startDate=${encodeURIComponent(period.startDate || '')}&endDate=${encodeURIComponent(period.endDate || '')}`
    : '/admin/exams/attendance';

  const exportSummary = () => {
    const rows = [
      ['Course', 'Class', 'Date', 'Students', 'Present', 'Absent'],
      ...filteredExams.map((exam) => {
        const courseId = String(exam.course?._id || '');
        const attendance = exam.attendanceSummary || {};
        return [
          exam.course?.title?.en || 'Course',
          classLabel(exam),
          formatDate(exam.examDate),
          String(progressByCourse.get(courseId)?.totalStudents || attendance.totalMarked || 0),
          String(attendance.present || 0),
          String(attendance.absent || 0),
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
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportSummary} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700">
              <Download className="h-4 w-4" /> Export
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700">
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        </header>

        <nav className="grid grid-cols-4 gap-1 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm">
          <Link to={`/admin/exams/schedule?periodId=${encodeURIComponent(periodId)}`} className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-black text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]">
            <CalendarDays className="h-4 w-4 shrink-0" /><span className="truncate">Schedule</span>
          </Link>
          <Link to={`/admin/exams/rooms?periodId=${encodeURIComponent(periodId)}`} className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-black text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]">
            <Building2 className="h-4 w-4 shrink-0" /><span className="truncate">Rooms</span>
          </Link>
          <Link to={attendanceHref} className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-black text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]">
            <ClipboardCheck className="h-4 w-4 shrink-0" /><span className="truncate">Attendance</span>
          </Link>
          <div className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2 text-xs font-black text-white shadow-sm">
            <ClipboardEdit className="h-4 w-4 shrink-0" /><span className="truncate">Results</span>
          </div>
        </nav>

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
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto]">
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
            <select value={attendanceFilter} onChange={(event) => setAttendanceFilter(event.target.value)} className="min-h-10 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-xs font-bold text-[var(--color-text-secondary)] outline-none">
              <option value="all">All Attendance</option>
              <option value="complete">Attendance Complete</option>
              <option value="pending">Attendance Pending</option>
            </select>
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search course or class..." className="min-h-10 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] pl-9 pr-3 text-xs outline-none focus:border-emerald-500" />
            </label>
            <button type="button" onClick={resetFilters} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700">
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>
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
              const total = progressByCourse.get(courseId)?.totalStudents || marked;
              const graded = progressByCourse.get(courseId)?.gradedStudents || 0;
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
                    <span>{graded}/{total} graded</span>
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
                    Enter Results
                  </button>
                </article>
              );
            })}
          </section>
        )}

        {selectedCourseId && selectedExamId && selectedExam && (
          <section id="marks-sheet" className="scroll-mt-4 space-y-3 pt-2">
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-black text-[var(--color-text-primary)]">
                    {selectedExam.course?.title?.en || 'Course'} — {classLabel(selectedExam)}
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                    {formatDate(selectedExam.examDate, true)} · Present {selectedExam.attendanceSummary?.present || 0} · Absent {selectedExam.attendanceSummary?.absent || 0}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete('courseId');
                    next.delete('examId');
                    setSearchParams(next, { replace: true });
                  }}
                  className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-black text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
                >
                  Close Sheet
                </button>
              </div>
            </div>
            <ResultsEntry embedded backFallback={`/admin/results/enter/${periodId}`} />
          </section>
        )}
      </main>
    </div>
  );
}

export default MarksEntryWorkspace;
