/**
 * Exam Attendance — Invigilator Portal (Admin/Teacher)
 * Mark exam-day attendance for the roster of an exam's course.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Clock, CalendarX, ClipboardCheck, Zap, Info, Printer, CheckSquare, FileText, BarChart3, QrCode, X, AlertTriangle, RotateCcw } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface SchoolBrief { _id: string; name: string; }
interface DepartmentBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; }

interface ExamBrief {
  _id: string;
  title: string;
  examDate: string;
  startTime?: string;
  endTime?: string;
  status: string;
  autoSchedule?: boolean;
  course?: {
    _id: string;
    title: { en: string };
    enrolledStudents?: number;
    class?: { _id: string; title: string; section: string; department?: { _id: string; name: string } } | null;
    school?: { _id: string; name: string } | null;
  };
}
interface StudentBrief {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  class?: { _id: string; title: string; section: string } | null;
}
interface RosterEntry {
  student: StudentBrief;
  seat: { room?: { name: string }; deskNumber: string } | null;
  attendance: {
    status: string;
    notes?: string;
    markedAt?: string;
    markedBy?: { name: string; role: string } | null;
  } | null;
}

/**
 * Display-only status derived from the exam's actual clock instead of the
 * stored `status` field — that field is a manual label nobody reliably
 * flips the moment an exam starts, so a fixed-schedule exam sitting right
 * in its 11:54–14:57 window at 13:36 would otherwise still read
 * "Scheduled". Self-paced exams have no single shared window (each
 * student gets their own), so those fall back to the stored status as-is.
 */
function getEffectiveStatus(e: ExamBrief): string {
  if (e.status === 'cancelled' || e.status === 'completed') return e.status;
  if (e.autoSchedule || !e.examDate || !e.startTime || !e.endTime) return e.status;

  const datePart = new Date(e.examDate).toISOString().split('T')[0];
  const start = new Date(`${datePart}T${e.startTime}`);
  const end = new Date(`${datePart}T${e.endTime}`);
  const now = new Date();
  if (now >= start && now <= end) return 'ongoing';
  if (now > end) return 'completed';
  return e.status;
}

const STATUS_OPTIONS: { value: string; letter: string; label: string; active: string; idle: string }[] = [
  { value: 'present', letter: 'P', label: 'Present', active: 'bg-green-600 text-white border-green-600', idle: 'bg-white dark:bg-slate-900 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900/50 hover:bg-green-50 dark:hover:bg-green-950/30' },
  { value: 'absent', letter: 'A', label: 'Absent', active: 'bg-red-600 text-white border-red-600', idle: 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30' },
  { value: 'late', letter: 'L', label: 'Late', active: 'bg-amber-500 text-white border-amber-500', idle: 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50 hover:bg-amber-50 dark:hover:bg-amber-950/30' },
  { value: 'excused', letter: 'E', label: 'Excused', active: 'bg-blue-600 text-white border-blue-600', idle: 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-950/30' },
];

function StatusButtons({ value, onChange }: { value: string; onChange: (status: string) => void }) {
  return (
    <div className="inline-flex items-center gap-1" role="group">
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`h-7 w-7 rounded-lg border text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
            value === opt.value ? opt.active : opt.idle
          }`}
        >
          {opt.letter}
        </button>
      ))}
    </div>
  );
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  present: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  excused: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE_CLASSES[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export function ExamAttendanceManage() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'org_admin';
  const navigate = useNavigate();
  const [examSearch, setExamSearch] = useState('');

  // Cascading Organization → Department → Class filters that narrow the
  // Exam dropdown, mirroring the pattern in Course Attendance Management.
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [filterSchool, setFilterSchool] = useState('');
  const [departments, setDepartments] = useState<DepartmentBrief[]>([]);
  const [filterDepartment, setFilterDepartment] = useState('');
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [filterClass, setFilterClass] = useState('');
  const [classesLoading, setClassesLoading] = useState(false);

  const [tab, setTab] = useState<'take' | 'view' | 'report'>('take');
  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  // Sourced from the same GET /exams/:id/attendance response as the roster
  // itself (rather than a separately-fetched exams list, which could be
  // filtered/paginated out of sync) so Course/Date/Time always match what's
  // actually loaded.
  const [examDetails, setExamDetails] = useState<ExamBrief | null>(null);
  const [marks, setMarks] = useState<Record<string, { status: string; notes: string }>>({});
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // QR/Barcode camera check-in — scanning a student ID card marks them
  // Present in one motion instead of hunting them in a long list.
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const qrRef = useRef<Html5Qrcode | null>(null);

  // Incident / malpractice reporting — a quick flag on a student's record
  // during a live exam, stored as a prefixed note.
  const [reportingStudentId, setReportingStudentId] = useState<string | null>(null);
  const [incidentReason, setIncidentReason] = useState('');

  // View Records "Logs" action — there's no multi-entry audit trail (one
  // ExamAttendance row per student, updated in place), so this shows the
  // record's current marking metadata rather than a history list.
  const [auditEntry, setAuditEntry] = useState<RosterEntry | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/schools');
        const list: SchoolBrief[] = data.data || [];
        setSchools(list);
        // org_admin only ever has their own organization — /schools already
        // scopes the list to just it, so auto-select it instead of showing
        // a misleading "All Organizations" default they can't actually use.
        if (isOrgAdmin && list[0]) setFilterSchool(list[0]._id);
      } catch {}
    })();
  }, [isOrgAdmin]);

  // Organization → Departments
  useEffect(() => {
    if (!filterSchool) { setDepartments([]); setFilterDepartment(''); return; }
    setDepartmentsLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/departments?school=${filterSchool}`);
        setDepartments(data.data || []);
      } catch {
        setDepartments([]);
      } finally {
        setDepartmentsLoading(false);
      }
    })();
    setFilterDepartment('');
    setFilterClass('');
    setSelectedExam('');
  }, [filterSchool]);

  // Department → Classes
  useEffect(() => {
    if (!filterDepartment) { setClasses([]); setFilterClass(''); return; }
    setClassesLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/classes?department=${filterDepartment}`);
        setClasses(data.data || []);
      } catch {
        setClasses([]);
      } finally {
        setClassesLoading(false);
      }
    })();
    setFilterClass('');
    setSelectedExam('');
  }, [filterDepartment]);

  useEffect(() => { setSelectedExam(''); }, [filterClass]);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '200' };
      if (filterSchool) params.school = filterSchool;
      const { data } = await api.get('/exams', { params });
      setExams(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, [filterSchool]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  // Exams don't carry a department/class query param on the backend — the
  // Class narrows client-side against each exam's populated course.class.
  const examsToShow = exams.filter((e) => {
    if (filterClass) return e.course?.class?._id === filterClass;
    if (filterDepartment) return e.course?.class?.department?._id === filterDepartment;
    return true;
  });

  // Today's Exams — surfaces same-day exams up front so the invigilator
  // doesn't have to hunt through the cascade/dropdown to find what's due.
  const todayStr = new Date().toDateString();
  const examsTodayAll = examsToShow.filter((e) => e.examDate && new Date(e.examDate).toDateString() === todayStr);
  const examsToday = examSearch.trim()
    ? examsTodayAll.filter((e) => {
        const q = examSearch.trim().toLowerCase();
        return e.title.toLowerCase().includes(q) || (e.course?.title?.en || '').toLowerCase().includes(q);
      })
    : examsTodayAll;

  // Opens a plain printable roster in a new tab — a fallback for an
  // invigilator who wants a paper sign-in sheet before touching the
  // digital Mark Attendance flow.
  const printAttendanceSheet = async (exam?: ExamBrief | null) => {
    if (!exam) return;
    try {
      const { data } = await api.get(`/exams/${exam._id}/attendance`);
      const entries: RosterEntry[] = data.data?.roster || [];
      const rows = entries
        .map(
          (r, i) => `<tr><td>${i + 1}</td><td>${r.student.profile?.firstName || ''} ${r.student.profile?.lastName || ''}</td><td>${r.student.studentId}</td><td>${r.seat ? `${r.seat.room?.name || ''} · ${r.seat.deskNumber}` : ''}</td><td></td></tr>`
        )
        .join('');
      const html = `<!doctype html><html><head><title>${exam.title} — Attendance Sheet</title>
        <style>
          body { font-family: sans-serif; padding: 24px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          p { color: #555; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 13px; }
          th { background: #f3f4f6; }
        </style>
      </head><body>
        <h1>${exam.title} — ${exam.course?.title?.en || ''}</h1>
        <p>${exam.examDate ? new Date(exam.examDate).toLocaleDateString() : 'Self-Paced'} ${exam.startTime ? `· ${exam.startTime} – ${exam.endTime}` : ''}</p>
        <table><thead><tr><th>#</th><th>Student Name</th><th>Student ID</th><th>Seat</th><th>Signature</th></tr></thead><tbody>${rows}</tbody></table>
        <script>window.onload = () => window.print();</script>
      </body></html>`;
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch {
      setError('Failed to load roster for printing');
    }
  };

  const exportReportCsv = (exam?: ExamBrief | null) => {
    if (roster.length === 0) return;
    const header = ['Student ID', 'Student Name', 'Status'];
    const rows = roster.map((r) => [r.student.studentId, `${r.student.profile?.firstName || ''} ${r.student.profile?.lastName || ''}`.trim(), r.attendance?.status || 'present']);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const examName = (exam?.title || 'exam').replace(/[^a-z0-9]+/gi, '-');
    a.download = `exam-attendance-${examName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadRoster = async (examId: string) => {
    setSelectedExam(examId);
    setTab('take');
    setRoster([]);
    setExamDetails(null);
    setMessage('');
    setStudentSearch('');
    setStatusFilter('');
    if (!examId) return;
    setRosterLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/exams/${examId}/attendance`);
      const entries: RosterEntry[] = data.data?.roster || [];
      setExamDetails(data.data?.exam || null);
      setRoster(entries);
      const m: Record<string, { status: string; notes: string }> = {};
      entries.forEach((e) => {
        m[e.student._id] = {
          status: e.attendance?.status || 'present',
          notes: e.attendance?.notes || '',
        };
      });
      setMarks(m);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load roster');
    } finally {
      setRosterLoading(false);
    }
  };

  const handleMarkChange = (studentId: string, field: 'status' | 'notes', value: string) => {
    setMarks((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
  };

  // Bulk-mark everyone Present in one click — the common case is nearly
  // everyone showing up for an exam.
  const markAllPresent = () => {
    setMarks((prev) => {
      const next = { ...prev };
      roster.forEach((r) => { next[r.student._id] = { status: 'present', notes: prev[r.student._id]?.notes || '' }; });
      return next;
    });
  };

  const markAllAbsent = () => {
    setMarks((prev) => {
      const next = { ...prev };
      roster.forEach((r) => { next[r.student._id] = { status: 'absent', notes: prev[r.student._id]?.notes || '' }; });
      return next;
    });
  };

  // Clears back to each student's saved status (or Present as the default
  // for anyone with no record yet) — undoes any unsaved in-progress edits.
  const resetAllMarks = () => {
    const m: Record<string, { status: string; notes: string }> = {};
    roster.forEach((r) => {
      m[r.student._id] = { status: r.attendance?.status || 'present', notes: r.attendance?.notes || '' };
    });
    setMarks(m);
  };

  // QR/Barcode scan handler — decoded text is expected to be the student's
  // studentId (e.g. "STU-2026-0039"), same format printed on ID cards.
  const handleScanSuccess = (decodedText: string) => {
    const code = decodedText.trim();
    const match = roster.find((r) => r.student.studentId.toLowerCase() === code.toLowerCase());
    if (!match) {
      setScanMessage(`⚠️ No student found for "${code}"`);
      return;
    }
    setMarks((prev) => ({ ...prev, [match.student._id]: { status: 'present', notes: prev[match.student._id]?.notes || '' } }));
    setScanMessage(`✅ ${match.student.profile?.firstName} ${match.student.profile?.lastName} marked Present`);
  };

  useEffect(() => {
    if (!scannerOpen) return;
    const qr = new Html5Qrcode('exam-qr-reader');
    qrRef.current = qr;
    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      (decodedText) => handleScanSuccess(decodedText),
      () => {}
    ).catch(() => setScanMessage('⚠️ Could not access camera. Check permissions.'));

    return () => {
      qr.stop().then(() => qr.clear()).catch(() => {});
      qrRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerOpen]);

  const startIncidentReport = (studentId: string) => {
    setReportingStudentId(studentId);
    setIncidentReason('');
  };

  const submitIncidentReport = () => {
    if (!reportingStudentId || !incidentReason.trim()) return;
    setMarks((prev) => {
      const existingNotes = prev[reportingStudentId]?.notes || '';
      const flag = `🚩 Malpractice reported: ${incidentReason.trim()}`;
      const notes = existingNotes ? `${existingNotes} | ${flag}` : flag;
      return { ...prev, [reportingStudentId]: { status: prev[reportingStudentId]?.status || 'present', notes } };
    });
    setReportingStudentId(null);
    setIncidentReason('');
  };

  const handleSave = async () => {
    if (!selectedExam || roster.length === 0) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const records = roster.map((r) => ({
        student: r.student._id,
        status: marks[r.student._id]?.status || 'present',
        notes: marks[r.student._id]?.notes || '',
      }));
      await api.post(`/exams/${selectedExam}/attendance`, { records });
      setMessage(`✅ Attendance saved for ${records.length} student(s)`);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  const effectiveStatus = (studentId: string) => marks[studentId]?.status || 'present';
  const presentCount = roster.filter((r) => effectiveStatus(r.student._id) === 'present').length;
  const absentCount = roster.filter((r) => effectiveStatus(r.student._id) === 'absent').length;
  const lateCount = roster.filter((r) => effectiveStatus(r.student._id) === 'late').length;
  const excusedCount = roster.filter((r) => effectiveStatus(r.student._id) === 'excused').length;

  const rosterToShow = roster.filter((r) => {
    if (statusFilter && effectiveStatus(r.student._id) !== statusFilter) return false;
    if (studentSearch.trim()) {
      const q = studentSearch.trim().toLowerCase();
      const name = `${r.student.profile?.firstName || ''} ${r.student.profile?.lastName || ''}`.toLowerCase();
      if (!name.includes(q) && !r.student.studentId.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const showStickySaveBar = !!selectedExam && roster.length > 0 && !rosterLoading && tab === 'take';

  return (
    <div className={`p-6 lg:p-10 pt-20 lg:pt-10 ${showStickySaveBar ? 'pb-28' : ''}`}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">✅ Exam Attendance</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Invigilator portal — mark exam-day attendance</p>
        </div>

        {/* Filters — Organization → Department → Class cascade + Exam */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100/80 dark:border-slate-800 shadow-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              🏢 Organization {isOrgAdmin && <span className="text-slate-400 font-normal">(your org)</span>}
            </label>
            {isOrgAdmin ? (
              <div className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 flex items-center text-sm font-medium text-slate-600 dark:text-slate-300">
                {schools.find((s) => s._id === filterSchool)?.name || 'Your Organization'}
              </div>
            ) : (
              <select
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full"
              >
                <option value="">All Organizations</option>
                {schools.map((s) => (<option key={s._id} value={s._id}>{s.name}</option>))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">🏫 Department</label>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              disabled={!filterSchool || departmentsLoading}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{!filterSchool ? 'Select organization first' : 'All Departments'}</option>
              {departments.map((d) => (<option key={d._id} value={d._id}>{d.name}</option>))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">👥 Class</label>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              disabled={!filterDepartment || classesLoading}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{!filterDepartment ? 'Select department first' : 'All Classes'}</option>
              {classes.map((c) => (<option key={c._id} value={c._id}>{c.title} ({c.section})</option>))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">📝 Exam</label>
            <select
              value={selectedExam}
              onChange={(e) => loadRoster(e.target.value)}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full"
            >
              <option value="">Choose an exam...</option>
              {examsToShow.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.title} — {e.course?.title?.en} ({e.examDate ? new Date(e.examDate).toLocaleDateString() : 'Self-Paced Exam'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Switcher — segmented control, matching Course Attendance */}
        {selectedExam && (
          <div className="flex bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl max-w-md gap-1">
            {([
              { key: 'take' as const, label: 'Take Attendance', icon: CheckSquare },
              { key: 'view' as const, label: 'View Records', icon: FileText },
              { key: 'report' as const, label: 'Report', icon: BarChart3 },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 text-sm transition-all ${
                  tab === key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm rounded-lg font-semibold px-4 py-2'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 px-4 py-2'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {/* Self-paced exams check themselves in — no one needs to walk the
            room, so make that obvious instead of leaving an invigilator
            wondering why students already show Present. */}
        {selectedExam && examDetails?.autoSchedule && (
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 p-4 text-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
            🤖 <span><strong>Auto Check-in enabled</strong> — this is a self-paced exam, so students are automatically marked Present the moment they start it. You can still review or override any student's status below.</span>
          </div>
        )}

        {/* Clickable stat cards */}
        {selectedExam && roster.length > 0 && (tab === 'take' || tab === 'view') && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              { key: 'present', count: presentCount, label: 'Present', border: 'border-green-200 dark:border-green-900/50', bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-300', sub: 'text-green-600 dark:text-green-400', ring: 'ring-green-500' },
              { key: 'absent', count: absentCount, label: 'Absent', border: 'border-red-200 dark:border-red-900/50', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', sub: 'text-red-600 dark:text-red-400', ring: 'ring-red-500' },
              { key: 'late', count: lateCount, label: 'Late', border: 'border-amber-200 dark:border-amber-900/50', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', sub: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500' },
              { key: 'excused', count: excusedCount, label: 'Excused', border: 'border-blue-200 dark:border-blue-900/50', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', sub: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500' },
            ] as const).map((stat) => (
              <button
                key={stat.key}
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === stat.key ? '' : stat.key))}
                className={`rounded-xl border ${stat.border} ${stat.bg} p-4 text-center transition-all hover:shadow-sm ${
                  statusFilter === stat.key ? `ring-2 ${stat.ring} ring-offset-1` : ''
                }`}
              >
                <p className={`text-2xl font-bold ${stat.text}`}>{stat.count}</p>
                <p className={`text-xs ${stat.sub}`}>{stat.label}</p>
              </button>
            ))}
          </div>
        )}

        {rosterLoading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!rosterLoading && selectedExam && roster.length === 0 && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">No students enrolled in this exam's course.</p></div>
        )}

        {/* ── Take Attendance ── */}
        {!rosterLoading && roster.length > 0 && tab === 'take' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="p-4 border-b border-[var(--color-border-default)] flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" strokeWidth={1.75} />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student name or ID..."
                  className="w-full h-10 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
                <button
                  type="button"
                  onClick={() => { setScanMessage(''); setScannerOpen(true); }}
                  title="Scan student ID card"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                >
                  <QrCode className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => printAttendanceSheet(examDetails)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors flex-shrink-0"
                >
                  🖨️ Print Sheet
                </button>
                <button
                  type="button"
                  onClick={resetAllMarks}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors flex-shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} /> Reset
                </button>
                <button
                  type="button"
                  onClick={markAllAbsent}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex-shrink-0"
                >
                  ❌ Mark All Absent
                </button>
                <button
                  type="button"
                  onClick={markAllPresent}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-xs font-semibold text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors flex-shrink-0"
                >
                  ✅ Mark All Present
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 dark:bg-slate-800/40">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Student</th>
                    <th className="text-center px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase hidden sm:table-cell">Seat</th>
                    <th className="text-center px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Status</th>
                    <th className="text-center px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterToShow.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">
                        No students match this filter.
                      </td>
                    </tr>
                  )}
                  {rosterToShow.map((r, i) => (
                    <tr
                      key={r.student._id}
                      className={`border-b border-slate-100 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors ${
                        i % 2 === 1 ? 'bg-slate-50 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium">{r.student.profile?.firstName} {r.student.profile?.lastName}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">{r.student.studentId}</p>
                      </td>
                      <td className="px-5 py-3 text-center hidden sm:table-cell">
                        {r.seat ? <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{r.seat.room?.name} · {r.seat.deskNumber}</code> : <span className="text-xs text-[var(--color-text-tertiary)]">Unassigned</span>}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <StatusButtons
                          value={marks[r.student._id]?.status || 'present'}
                          onChange={(status) => handleMarkChange(r.student._id, 'status', status)}
                        />
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={marks[r.student._id]?.notes || ''}
                            onChange={(e) => handleMarkChange(r.student._id, 'notes', e.target.value)}
                            className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                            placeholder="Optional"
                          />
                          <button
                            type="button"
                            title="Report malpractice"
                            onClick={() => startIncidentReport(r.student._id)}
                            className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {rosterToShow.length === roster.length ? `${roster.length} students` : `${rosterToShow.length} of ${roster.length} students shown`}
              </p>
            </div>
          </div>
        )}

        {/* ── View Records (read-only) ── */}
        {!rosterLoading && roster.length > 0 && tab === 'view' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="p-4 border-b border-[var(--color-border-default)] flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" strokeWidth={1.75} />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student name or ID..."
                  className="w-full h-10 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
              </div>
              <button
                type="button"
                onClick={() => printAttendanceSheet(examDetails)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors flex-shrink-0"
              >
                🖨️ Print Sheet
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 dark:bg-slate-800/40">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Student Name / ID</th>
                    <th className="text-left px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Course / Class</th>
                    <th className="text-left px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Date / Day</th>
                    <th className="text-left px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Exam Time</th>
                    <th className="text-left px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Marked By / Time</th>
                    <th className="text-center px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Status</th>
                    <th className="text-left px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Notes &amp; Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterToShow.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">No students match this filter.</td>
                    </tr>
                  )}
                  {rosterToShow.map((r, i) => (
                    <tr
                      key={r.student._id}
                      className={`border-b border-slate-100 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors ${
                        i % 2 === 1 ? 'bg-slate-50 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      {/* Student Name / ID */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        <p className="font-medium text-[var(--color-text-primary)]">{r.student.profile?.firstName} {r.student.profile?.lastName}</p>
                        <code className="text-[11px] text-[var(--color-text-tertiary)]">{r.student.studentId}</code>
                      </td>

                      {/* Course / Class */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        <p className="text-xs text-[var(--color-text-secondary)]">{examDetails?.course?.title?.en || '—'}</p>
                        <span className="inline-block mt-0.5 rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {r.student.class ? `${r.student.class.title} (${r.student.class.section})` : '—'}
                        </span>
                      </td>

                      {/* Date / Day */}
                      <td className="px-5 py-3 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                        {examDetails?.examDate
                          ? `${new Date(examDetails.examDate).toLocaleDateString(undefined, { weekday: 'long' })}, ${new Date(examDetails.examDate).toLocaleDateString()}`
                          : 'Self-Paced'}
                      </td>

                      {/* Exam Time */}
                      <td className="px-5 py-3 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                        {examDetails?.startTime && examDetails?.endTime ? `${examDetails.startTime} – ${examDetails.endTime}` : '—'}
                      </td>

                      {/* Marked By / Time Marked */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        <p className="text-xs text-[var(--color-text-secondary)]">{r.attendance?.markedBy?.name || '—'}</p>
                        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
                          {r.attendance?.markedAt ? new Date(r.attendance.markedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3 text-center"><StatusBadge status={r.attendance?.status || 'present'} /></td>

                      {/* Notes & Actions */}
                      <td className="px-5 py-3 min-w-[10rem]">
                        <p className="text-xs text-[var(--color-text-tertiary)] mb-1.5">{r.attendance?.notes || '—'}</p>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setTab('take'); setStudentSearch(r.student.studentId); }}
                            title="Edit Status"
                            className="rounded-md border border-[var(--color-border-default)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setAuditEntry(r)}
                            title="View Audit Logs"
                            className="rounded-md border border-[var(--color-border-default)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                          >
                            Logs
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {rosterToShow.length === roster.length ? `${roster.length} students` : `${rosterToShow.length} of ${roster.length} students shown`}
              </p>
            </div>
          </div>
        )}

        {/* ── Report ── */}
        {!rosterLoading && roster.length > 0 && tab === 'report' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="p-4 border-b border-[var(--color-border-default)] flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--color-text-secondary)]">Attendance Summary</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printAttendanceSheet(examDetails)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                >
                  🖨️ Print Sheet
                </button>
                <button
                  type="button"
                  onClick={() => exportReportCsv(examDetails)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                >
                  ⬇️ Export to Excel
                </button>
              </div>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {([
                { label: 'Present', count: presentCount, pct: Math.round((presentCount / roster.length) * 100), color: 'text-green-600 dark:text-green-400' },
                { label: 'Absent', count: absentCount, pct: Math.round((absentCount / roster.length) * 100), color: 'text-red-600 dark:text-red-400' },
                { label: 'Late', count: lateCount, pct: Math.round((lateCount / roster.length) * 100), color: 'text-amber-600 dark:text-amber-400' },
                { label: 'Excused', count: excusedCount, pct: Math.round((excusedCount / roster.length) * 100), color: 'text-blue-600 dark:text-blue-400' },
              ]).map((s) => (
                <div key={s.label} className="rounded-xl border border-[var(--color-border-default)] p-4 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{s.label} ({s.pct}%)</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto border-t border-[var(--color-border-default)]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 dark:bg-slate-800/40">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Student ID</th>
                    <th className="text-left px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Student Name</th>
                    <th className="text-center px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r, i) => (
                    <tr key={r.student._id} className={`border-b border-slate-100 dark:border-slate-800 ${i % 2 === 1 ? 'bg-slate-50 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900'}`}>
                      <td className="px-5 py-3"><code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{r.student.studentId}</code></td>
                      <td className="px-5 py-3 font-medium">{r.student.profile?.firstName} {r.student.profile?.lastName}</td>
                      <td className="px-5 py-3 text-center"><StatusBadge status={r.attendance?.status || 'present'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sticky Save bar */}
        {showStickySaveBar && (
          <div className="fixed bottom-0 left-0 right-0 lg:left-72 z-30 border-t border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
            <div className="mx-auto max-w-6xl px-6 lg:px-10 py-3 flex items-center justify-between gap-4">
              <p className="text-xs text-[var(--color-text-tertiary)] hidden sm:block">
                {roster.length} students &middot; {presentCount} present / {absentCount} absent / {lateCount} late / {excusedCount} excused
              </p>
              <div className="flex items-center gap-3 ml-auto">
                {savedFlash && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">✓ Saved</span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm"
                >
                  {saving ? 'Saving...' : '💾 Save Attendance'}
                </button>
              </div>
            </div>
          </div>
        )}

        {!selectedExam && (
          <>
            {/* KPI summary — a quick read on today's exam load before diving
                into any one roster. */}
            {examsToday.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <p className="text-2xl font-bold text-[var(--color-text-primary)]">{examsToday.length}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Total Exams Today</p>
                </div>
                <div className="rounded-xl border border-green-100 dark:border-green-900/40 bg-green-50/60 dark:bg-green-950/20 p-4">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400 flex items-center gap-2">
                    {examsToday.filter((e) => getEffectiveStatus(e) === 'ongoing').length}
                    {examsToday.some((e) => getEffectiveStatus(e) === 'ongoing') && (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-green-600/80 dark:text-green-400/70 mt-0.5">Ongoing Exams</p>
                </div>
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                    {examsToday.reduce((sum, e) => sum + (e.course?.enrolledStudents || 0), 0)}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Expected Students</p>
                </div>
                <div className="rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-4">
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{examsToday.filter((e) => e.autoSchedule).length}</p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5">Auto Check-in Exams</p>
                </div>
              </div>
            )}

            {examsTodayAll.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--color-text-secondary)]">Today's Exams</p>
                {examsTodayAll.length >= 6 && (
                  <div className="relative max-w-xs w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" strokeWidth={1.75} />
                    <input
                      type="text"
                      value={examSearch}
                      onChange={(e) => setExamSearch(e.target.value)}
                      placeholder="Search by course name..."
                      className="w-full h-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                    />
                  </div>
                )}
              </div>
            )}

            {examsToday.length > 0 ? (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                  {examsToday.map((e) => {
                    const effectiveStatus = getEffectiveStatus(e);
                    return (
                    <div
                      key={e._id}
                      className="group bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-sm text-[var(--color-text-primary)] truncate">{e.title}</p>
                        {effectiveStatus === 'ongoing' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-600" />
                            </span>
                            Ongoing
                          </span>
                        ) : (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 capitalize bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {effectiveStatus}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[var(--color-text-tertiary)] truncate">{e.course?.title?.en || 'Untitled Course'}</p>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {e.autoSchedule ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            <Zap className="h-3 w-3" strokeWidth={2} /> Self-Paced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            🏫 Class Exam
                          </span>
                        )}
                      </div>

                      {e.startTime && e.endTime && (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
                          <Clock className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
                          {e.startTime} – {e.endTime}
                        </div>
                      )}

                      <div className="flex items-center gap-3 -mt-1">
                        <button
                          type="button"
                          onClick={() => navigate('/admin/exams')}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                          <Info className="h-3 w-3" strokeWidth={2} /> View Details
                        </button>
                        <button
                          type="button"
                          onClick={() => printAttendanceSheet(e)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                          <Printer className="h-3 w-3" strokeWidth={2} /> Print Sheet
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => loadRoster(e._id)}
                        className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={2} />
                        Mark Attendance
                      </button>
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 rounded-2xl p-12 text-center">
                <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <CalendarX className="h-8 w-8 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
                </div>
                <p className="text-lg text-[var(--color-text-secondary)]">
                  {examSearch.trim() ? `No exams match "${examSearch}".` : 'No exams scheduled for today.'}
                </p>
                <p className="text-sm mt-1 text-[var(--color-text-tertiary)]">👆 Select an exam above to mark attendance.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* QR/Barcode Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setScannerOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-primary)] shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--color-border-default)] flex items-center justify-between">
              <p className="font-semibold text-sm text-[var(--color-text-primary)]">📷 Scan Student ID Card</p>
              <button type="button" onClick={() => setScannerOpen(false)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div id="exam-qr-reader" className="w-full" />
            {scanMessage && (
              <p className="p-3 text-center text-sm text-[var(--color-text-secondary)] border-t border-[var(--color-border-default)]">{scanMessage}</p>
            )}
            <p className="px-4 pb-4 text-xs text-[var(--color-text-tertiary)] text-center">Point the camera at the student's ID card barcode/QR code.</p>
          </div>
        </div>
      )}

      {/* Incident / Malpractice Report Modal */}
      {reportingStudentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReportingStudentId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-primary)] shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--color-border-default)] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" strokeWidth={2} />
              <p className="font-semibold text-sm text-[var(--color-text-primary)]">Report Malpractice</p>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                value={incidentReason}
                onChange={(e) => setIncidentReason(e.target.value)}
                placeholder="Describe what happened (e.g. caught with notes, talking to another student)..."
                rows={4}
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportingStudentId(null)}
                  className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitIncidentReport}
                  disabled={!incidentReason.trim()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs Modal — the record's marking metadata (there's no
          multi-entry history, one row per student per exam updated in place) */}
      {auditEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAuditEntry(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-primary)] shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--color-border-default)] flex items-center justify-between">
              <p className="font-semibold text-sm text-[var(--color-text-primary)]">Audit Log</p>
              <button type="button" onClick={() => setAuditEntry(null)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Student</p>
                <p className="font-medium text-[var(--color-text-primary)]">{auditEntry.student.profile?.firstName} {auditEntry.student.profile?.lastName} ({auditEntry.student.studentId})</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Status</p>
                <StatusBadge status={auditEntry.attendance?.status || 'present'} />
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Marked By</p>
                <p className="text-[var(--color-text-primary)]">{auditEntry.attendance?.markedBy?.name || 'Not yet marked'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Time Marked</p>
                <p className="text-[var(--color-text-primary)]">{auditEntry.attendance?.markedAt ? new Date(auditEntry.attendance.markedAt).toLocaleString() : '—'}</p>
              </div>
              {auditEntry.attendance?.notes && (
                <div>
                  <p className="text-xs text-[var(--color-text-tertiary)]">Notes</p>
                  <p className="text-[var(--color-text-primary)]">{auditEntry.attendance.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExamAttendanceManage;
