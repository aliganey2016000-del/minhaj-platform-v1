/**
 * Teacher Exam Portal — Unified
 *
 * Three tabs:
 * 1. Schedule (Jadwal) — teacher's assigned exams
 * 2. Attendance (Qaadis) — mark exam-day attendance for own courses
 * 3. Incidents (Anshaxa) — report & view exam violations/incidents
 *
 * Backend is ready (routes at /exams, /exams/:id/attendance, /exam-incidents).
 * Frontend permissions checked via tenant-scope: teachers only see their own courses' exams.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, Clock, CalendarClock, CheckSquare, FileText, AlertTriangle, X, QrCode, MoreVertical, Trash2, Eye, ChevronDown } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { toTitleCase } from '../../../lib/format';
import { BackButton } from '../../shared/components/back-button';

// ============================================================================
// TYPES
// ============================================================================

interface CourseBrief {
  _id: string;
  title: { en: string };
  category?: string;
  enrolledStudents?: number;
}

interface Exam {
  _id: string;
  title: string;
  course: CourseBrief;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  room?: string;
  instructions?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  autoSchedule?: boolean;
  milestone?: 'mid' | 'final' | null;
  createdAt: string;
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

interface ExamIncident {
  _id: string;
  exam: { _id: string; title: string; examDate?: string; course?: { title: { en: string } } } | null;
  student?: { _id: string; studentId: string; profile?: { firstName: string; lastName: string } };
  type: 'cheating' | 'disruption' | 'technical_issue' | 'accommodation' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
  status: 'open' | 'resolved' | 'dismissed';
  reportedBy: { email: string };
  resolutionNotes?: string;
  resolvedBy?: { email: string };
  resolvedAt?: string;
  createdAt: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getEffectiveStatus(exam: Exam): string {
  if (exam.status === 'cancelled' || exam.status === 'completed') return exam.status;
  if (exam.autoSchedule || !exam.examDate || !exam.startTime || !exam.endTime) return exam.status;

  const datePart = new Date(exam.examDate).toISOString().split('T')[0];
  const start = new Date(`${datePart}T${exam.startTime}`);
  const end = new Date(`${datePart}T${exam.endTime}`);
  const now = new Date();
  if (now >= start && now <= end) return 'ongoing';
  if (now > end) return 'completed';
  return exam.status;
}

const STATUS_PILL_CLASSES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ongoing: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL_CLASSES[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

const ATTENDANCE_STATUS_OPTIONS = [
  { value: 'present', letter: 'P', label: 'Present', active: 'bg-green-600 text-white', idle: 'bg-white dark:bg-slate-900 text-green-700 dark:text-green-400 border border-green-200' },
  { value: 'absent', letter: 'A', label: 'Absent', active: 'bg-red-600 text-white', idle: 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 border border-red-200' },
  { value: 'late', letter: 'L', label: 'Late', active: 'bg-amber-500 text-white', idle: 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border border-amber-200' },
  { value: 'excused', letter: 'E', label: 'Excused', active: 'bg-blue-600 text-white', idle: 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 border border-blue-200' },
];

const INCIDENT_TYPES = [
  { value: 'cheating', label: '🚫 Cheating' },
  { value: 'disruption', label: '📢 Disruption' },
  { value: 'technical_issue', label: '⚙️ Technical Issue' },
  { value: 'accommodation', label: '♿ Accommodation' },
  { value: 'other', label: '📝 Other' },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

// ============================================================================
// TAB 1: EXAM SCHEDULE (JADWAL)
// ============================================================================

function ExamScheduleTab() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewingExam, setViewingExam] = useState<Exam | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/exams', { params: { limit: 200 } });
        setExams(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load exams');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = exams.filter((e) => {
    if (statusFilter && getEffectiveStatus(e) !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return e.title.toLowerCase().includes(q) || (e.course?.title?.en || '').toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) return <div className="flex justify-center py-12"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search exam title or course..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-2.5 text-sm"
        >
          <option value="">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--color-text-tertiary)]">
          <p className="text-lg">📝 No exams found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((exam) => (
            <div
              key={exam._id}
              className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm hover:shadow-md transition-all cursor-pointer"
              onClick={() => setViewingExam(exam)}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300">
                  {exam.course?.title?.en || 'Unknown'}
                </span>
                <StatusBadge status={getEffectiveStatus(exam)} />
              </div>
              <h3 className="font-semibold text-sm mb-2">{toTitleCase(exam.title)}</h3>
              <div className="space-y-1.5 text-xs text-[var(--color-text-tertiary)]">
                {!exam.autoSchedule && exam.examDate && (
                  <p className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {new Date(exam.examDate).toLocaleDateString()}
                  </p>
                )}
                {!exam.autoSchedule && exam.startTime && exam.endTime && (
                  <p className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {exam.startTime} – {exam.endTime}
                  </p>
                )}
                {exam.autoSchedule && (
                  <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    🤖 Self-Paced Exam
                  </p>
                )}
                <p>📊 {exam.totalMarks} marks ({exam.passingMarks} to pass)</p>
                <p>⏱️ {exam.duration} minutes</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Details Modal */}
      {viewingExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setViewingExam(null)}>
          <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">📝 Exam Details</h2>
              <button onClick={() => setViewingExam(null)} className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button>
            </div>

            <div className="space-y-3">
              <div className="text-center pb-3 border-b border-[var(--color-border-subtle)]">
                <p className="text-lg font-bold">{toTitleCase(viewingExam.title)}</p>
                <p className="text-sm text-[var(--color-text-tertiary)]">{viewingExam.course?.title?.en || 'Unknown Course'}</p>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)]">
                <span className="text-sm text-[var(--color-text-tertiary)]">Status</span>
                <StatusBadge status={getEffectiveStatus(viewingExam)} />
              </div>

              {viewingExam.autoSchedule ? (
                <>
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)]">
                    <span className="text-sm text-[var(--color-text-tertiary)]">Scheduling</span>
                    <span className="text-sm font-medium">🤖 Auto (Self-Paced)</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)]">
                    <span className="text-sm text-[var(--color-text-tertiary)]">Unlocks After</span>
                    <span className="text-sm font-medium">{viewingExam.milestone === 'mid' ? 'Mid Exam' : 'Full Course'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)]">
                    <span className="text-sm text-[var(--color-text-tertiary)]">Date</span>
                    <span className="text-sm font-medium">{viewingExam.examDate ? new Date(viewingExam.examDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)]">
                    <span className="text-sm text-[var(--color-text-tertiary)]">Time</span>
                    <span className="text-sm font-medium">{viewingExam.startTime && viewingExam.endTime ? `${viewingExam.startTime} – ${viewingExam.endTime}` : '—'}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)]">
                <span className="text-sm text-[var(--color-text-tertiary)]">Duration</span>
                <span className="text-sm font-medium">{viewingExam.duration} minutes</span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)]">
                <span className="text-sm text-[var(--color-text-tertiary)]">Total Marks</span>
                <span className="text-sm font-medium">{viewingExam.totalMarks}</span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)]">
                <span className="text-sm text-[var(--color-text-tertiary)]">Passing Marks</span>
                <span className="text-sm font-medium">{viewingExam.passingMarks} ({Math.round((viewingExam.passingMarks / viewingExam.totalMarks) * 100)}%)</span>
              </div>

              {viewingExam.room && (
                <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)]">
                  <span className="text-sm text-[var(--color-text-tertiary)]">Room</span>
                  <span className="text-sm font-medium">{viewingExam.room}</span>
                </div>
              )}

              {viewingExam.instructions && (
                <div className="py-1.5">
                  <span className="text-sm text-[var(--color-text-tertiary)]">Instructions</span>
                  <p className="text-sm font-medium mt-1 p-2 rounded-lg bg-[var(--color-surface-secondary)]">{viewingExam.instructions}</p>
                </div>
              )}
            </div>

            <button onClick={() => setViewingExam(null)} className="mt-5 w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TAB 2: ATTENDANCE (QAADIS)
// ============================================================================

function AttendanceTab() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [marks, setMarks] = useState<Record<string, { status: string; notes: string }>>({});
  const [studentSearch, setStudentSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const qrRef = useRef<Html5Qrcode | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/exams', { params: { limit: 200 } });
        setExams(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load exams');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadRoster = async (exam: Exam) => {
    setSelectedExam(exam);
    setRoster([]);
    setMarks({});
    setStudentSearch('');
    setStatusFilter('');
    setError('');
    setMessage('');
    setRosterLoading(true);

    try {
      const { data } = await api.get(`/exams/${exam._id}/attendance`);
      const entries: RosterEntry[] = data.data?.roster || [];
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

  const markAllPresent = () => {
    setMarks((prev) => {
      const next = { ...prev };
      roster.forEach((r) => {
        next[r.student._id] = { status: 'present', notes: prev[r.student._id]?.notes || '' };
      });
      return next;
    });
  };

  const handleScanSuccess = (decodedText: string) => {
    const code = decodedText.trim();
    const match = roster.find((r) => r.student.studentId.toLowerCase() === code.toLowerCase());
    if (!match) {
      setScanMessage(`⚠️ No student found for "${code}"`);
      return;
    }
    setMarks((prev) => ({ ...prev, [match.student._id]: { status: 'present', notes: prev[match.student._id]?.notes || '' } }));
    setScanMessage(`✅ ${match.student.profile?.firstName} marked Present`);
  };

  useEffect(() => {
    if (!scannerOpen) return;
    const qr = new Html5Qrcode('attendance-qr-reader');
    qrRef.current = qr;
    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      (decodedText) => handleScanSuccess(decodedText),
      () => {}
    ).catch(() => setScanMessage('⚠️ Could not access camera'));

    return () => {
      qr.stop().then(() => qr.clear()).catch(() => {});
      qrRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerOpen]);

  const handleSave = async () => {
    if (!selectedExam || roster.length === 0) return;
    setSaving(true);
    setError('');

    try {
      const records = roster.map((r) => ({
        student: r.student._id,
        status: marks[r.student._id]?.status || 'present',
        notes: marks[r.student._id]?.notes || '',
      }));
      await api.post(`/exams/${selectedExam._id}/attendance`, { records });
      setMessage(`✅ Attendance saved for ${records.length} student(s)`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const rosterToShow = roster.filter((r) => {
    if (statusFilter && marks[r.student._id]?.status !== statusFilter) return false;
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      const name = `${r.student.profile?.firstName || ''} ${r.student.profile?.lastName || ''}`.toLowerCase();
      return name.includes(q) || r.student.studentId.toLowerCase().includes(q);
    }
    return true;
  });

  const presentCount = roster.filter((r) => marks[r.student._id]?.status === 'present').length;
  const absentCount = roster.filter((r) => marks[r.student._id]?.status === 'absent').length;
  const lateCount = roster.filter((r) => marks[r.student._id]?.status === 'late').length;
  const excusedCount = roster.filter((r) => marks[r.student._id]?.status === 'excused').length;

  if (loading) return <div className="flex justify-center py-12"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}
      {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}

      {!selectedExam ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[var(--color-text-secondary)]">Select an exam to mark attendance:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {exams.map((exam) => (
              <button
                key={exam._id}
                onClick={() => loadRoster(exam)}
                className="text-left rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 hover:shadow-md transition-all"
              >
                <p className="font-semibold text-sm">{toTitleCase(exam.title)}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">{exam.course?.title?.en}</p>
                {!exam.autoSchedule && exam.examDate && (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{new Date(exam.examDate).toLocaleDateString()}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">{toTitleCase(selectedExam.title)}</h3>
              <p className="text-sm text-[var(--color-text-tertiary)]">{selectedExam.course?.title?.en}</p>
            </div>
            <button
              onClick={() => setSelectedExam(null)}
              className="rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-surface-tertiary)]"
            >
              Change Exam
            </button>
          </div>

          {/* Stats */}
          {roster.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Present', count: presentCount, key: 'present', color: 'text-green-700' },
                { label: 'Absent', count: absentCount, key: 'absent', color: 'text-red-700' },
                { label: 'Late', count: lateCount, key: 'late', color: 'text-amber-700' },
                { label: 'Excused', count: excusedCount, key: 'excused', color: 'text-blue-700' },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStatusFilter(statusFilter === s.key ? '' : s.key)}
                  className={`rounded-lg border p-2 text-center text-xs font-semibold transition-all ${
                    statusFilter === s.key
                      ? `bg-slate-100 dark:bg-slate-800 ${s.color}`
                      : 'border-[var(--color-border-default)] hover:bg-[var(--color-surface-tertiary)]'
                  }`}
                >
                  <p className={`text-lg font-bold ${s.color}`}>{s.count}</p>
                  <p>{s.label}</p>
                </button>
              ))}
            </div>
          )}

          {/* Search & QR */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search student..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] pl-10 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={() => setScannerOpen(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary-600"
              >
                <QrCode className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={markAllPresent}
              className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
            >
              ✅ All Present
            </button>
          </div>

          {/* Roster Table */}
          {rosterLoading ? (
            <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>
          ) : roster.length === 0 ? (
            <p className="text-center py-8 text-[var(--color-text-tertiary)]">No students enrolled in this exam.</p>
          ) : (
            <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-surface-secondary)]">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-xs">Student</th>
                      <th className="text-center px-4 py-2 font-semibold text-xs">Status</th>
                      <th className="text-left px-4 py-2 font-semibold text-xs">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterToShow.length === 0 ? (
                      <tr><td colSpan={3} className="py-4 text-center text-[var(--color-text-tertiary)]">No students match filter</td></tr>
                    ) : (
                      rosterToShow.map((r) => (
                        <tr key={r.student._id} className="border-t border-[var(--color-border-subtle)]">
                          <td className="px-4 py-3">
                            <p className="font-medium text-sm">{r.student.profile?.firstName} {r.student.profile?.lastName}</p>
                            <p className="text-xs text-[var(--color-text-tertiary)]">{r.student.studentId}</p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="inline-flex items-center gap-0.5">
                              {ATTENDANCE_STATUS_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => handleMarkChange(r.student._id, 'status', opt.value)}
                                  className={`h-6 w-6 rounded text-xs font-bold transition-colors ${
                                    marks[r.student._id]?.status === opt.value ? opt.active : opt.idle
                                  }`}
                                >
                                  {opt.letter}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={marks[r.student._id]?.notes || ''}
                              onChange={(e) => handleMarkChange(r.student._id, 'notes', e.target.value)}
                              placeholder="Optional"
                              className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {roster.length > 0 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving...' : '💾 Save Attendance'}
            </button>
          )}
        </div>
      )}

      {/* QR Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setScannerOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-primary)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--color-border-default)] flex items-center justify-between">
              <p className="font-semibold">📷 Scan Student ID</p>
              <button onClick={() => setScannerOpen(false)} className="text-2xl leading-none">&times;</button>
            </div>
            <div id="attendance-qr-reader" className="w-full" />
            {scanMessage && <p className="p-3 text-center text-sm text-[var(--color-text-secondary)]">{scanMessage}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TAB 3: INCIDENTS (ANSHAXA)
// ============================================================================

function IncidentsTab() {
  const [incidents, setIncidents] = useState<ExamIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [formData, setFormData] = useState({
    type: 'cheating',
    severity: 'medium',
    description: '',
    studentId: '',
  });

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (selectedExam) params.examId = selectedExam;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/exam-incidents', { params });
      setIncidents(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, [selectedExam, statusFilter]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/exams', { params: { limit: 200 } });
        setExams(data.data || []);
      } catch {}
    })();
    fetchIncidents();
  }, [fetchIncidents]);

  const handleSubmitIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam || !formData.type || !formData.description.trim()) return;

    try {
      await api.post('/exam-incidents', {
        exam: selectedExam,
        type: formData.type,
        severity: formData.severity,
        description: formData.description,
        student: formData.studentId || undefined,
      });
      setMessage('✅ Incident reported');
      setFormData({ type: 'cheating', severity: 'medium', description: '', studentId: '' });
      setShowCreateModal(false);
      setTimeout(() => setMessage(''), 3000);
      fetchIncidents();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to report incident');
    }
  };

  const updateIncidentStatus = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/exam-incidents/${id}`, { status: newStatus });
      setIncidents((prev) => prev.map((i) => (i._id === id ? { ...i, status: newStatus as any } : i)));
      setMessage('✅ Incident updated');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}
      {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-2">
          <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Filter by Exam</label>
          <select
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-2.5 text-sm"
          >
            <option value="">All Exams</option>
            {exams.map((e) => (
              <option key={e._id} value={e._id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 space-y-2">
          <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Filter by Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-2.5 text-sm"
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="mt-6 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
        >
          + Report Incident
        </button>
      </div>

      {incidents.length === 0 ? (
        <div className="text-center py-12 text-[var(--color-text-tertiary)]">
          <p className="text-lg">📋 No incidents reported</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <div key={incident._id} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_COLORS[incident.severity]}`}>
                      {incident.severity}
                    </span>
                    <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
                      {INCIDENT_TYPES.find((t) => t.value === incident.type)?.label}
                    </span>
                  </div>
                  <p className="font-semibold text-sm">{incident.exam?.title || 'Unknown Exam'}</p>
                  {incident.student && (
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      Student: {incident.student.profile?.firstName} {incident.student.profile?.lastName} ({incident.student.studentId})
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{incident.description}</p>
                </div>

                <div className="flex-shrink-0">
                  <select
                    value={incident.status}
                    onChange={(e) => updateIncidentStatus(incident._id, e.target.value)}
                    className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-1 text-xs font-medium"
                  >
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)] pt-2 border-t border-[var(--color-border-subtle)]">
                <span>Reported by {incident.reportedBy.email}</span>
                <span>{new Date(incident.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Incident Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">🚩 Report Incident</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-2xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleSubmitIncident} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] block mb-1">Exam *</label>
                <select
                  value={selectedExam}
                  onChange={(e) => setSelectedExam(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
                >
                  <option value="">Select exam...</option>
                  {exams.map((e) => (
                    <option key={e._id} value={e._id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] block mb-1">Type *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
                >
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] block mb-1">Severity</label>
                <select
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] block mb-1">Description *</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What happened?"
                  rows={4}
                  required
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)]">
                  Cancel
                </button>
                <button type="submit" className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700">
                  Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TeacherExamPortal() {
  const [tab, setTab] = useState<'schedule' | 'attendance' | 'incidents'>('schedule');

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        {/* Header */}
        <div>
          <BackButton fallback="/teacher" />
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mt-2">📋 Exam Portal</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Manage your exam schedules, attendance, and incidents</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[var(--color-surface-secondary)] p-1 rounded-xl max-w-md gap-1">
          {[
            { key: 'schedule' as const, label: 'Schedule', icon: CalendarClock },
            { key: 'attendance' as const, label: 'Attendance', icon: CheckSquare },
            { key: 'incidents' as const, label: 'Incidents', icon: AlertTriangle },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 text-sm transition-all rounded-lg px-3 py-2 ${
                tab === key
                  ? 'bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] shadow-sm font-semibold'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'schedule' && <ExamScheduleTab />}
        {tab === 'attendance' && <AttendanceTab />}
        {tab === 'incidents' && <IncidentsTab />}
      </div>
    </div>
  );
}

export default TeacherExamPortal;
