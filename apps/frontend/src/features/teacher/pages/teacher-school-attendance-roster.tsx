import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Clock3,
  Loader2,
  Save,
  Search,
  Users,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../../lib/axios';

type Status = 'present' | 'absent';
type ReasonCode = '' | 'sick' | 'medical' | 'family_emergency' | 'school_activity' | 'suspension' | 'transport_delay' | 'other';

interface RosterStudent {
  _id: string;
  studentId: string;
  name: string;
  attendance?: {
    status?: Status;
    notes?: string;
    reasonCode?: ReasonCode;
    locked?: boolean;
  } | null;
}

interface Session {
  _id: string;
  className: string;
  startTime: string;
  endTime: string;
  course?: { _id?: string; title?: { en?: string }; courseCode?: string };
  attendance?: { completionStatus?: 'not_taken' | 'partial' | 'complete' };
}

interface SessionDetail {
  date: string;
  schedule: Session;
  locked: boolean;
  completionStatus?: 'not_taken' | 'partial' | 'complete';
  roster: RosterStudent[];
}

interface Draft {
  status: Status;
  reasonCode: ReasonCode;
  notes: string;
}

const REASONS: Array<{ value: ReasonCode; label: string }> = [
  { value: '', label: 'Reason (optional)' },
  { value: 'sick', label: 'Sick' },
  { value: 'medical', label: 'Medical appointment' },
  { value: 'family_emergency', label: 'Family emergency' },
  { value: 'school_activity', label: 'School activity' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'transport_delay', label: 'Transport delay' },
  { value: 'other', label: 'Other' },
];

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function subject(session?: Session | null) {
  return session?.course?.title?.en || session?.course?.courseCode || 'Subject';
}

export function TeacherSchoolAttendanceRoster() {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const date = params.get('date') || localDate();

  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    if (!scheduleId) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/attendance/school/session/${scheduleId}`, { params: { date } });
      const next: SessionDetail = response.data?.data;
      setDetail(next);
      const nextDrafts: Record<string, Draft> = {};
      for (const student of next?.roster || []) {
        nextDrafts[student._id] = {
          status: student.attendance?.status === 'absent' ? 'absent' : 'present',
          reasonCode: student.attendance?.status === 'absent' ? (student.attendance?.reasonCode || '') : '',
          notes: student.attendance?.notes || '',
        };
      }
      setDrafts(nextDrafts);
    } catch (e: any) {
      setDetail(null);
      setError(e?.response?.data?.message || 'Could not load this attendance session.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [scheduleId, date]);

  const visible = useMemo(() => {
    const rows = detail?.roster || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((student) =>
      `${student.name} ${student.studentId}`.toLowerCase().includes(q)
    );
  }, [detail, search]);

  const counts = useMemo(() => {
    const values = Object.values(drafts);
    return {
      present: values.filter((item) => item.status === 'present').length,
      absent: values.filter((item) => item.status === 'absent').length,
    };
  }, [drafts]);

  const markAll = (status: Status) => {
    if (!detail || detail.locked) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const student of detail.roster) {
        const previous = next[student._id] || { status: 'present' as Status, reasonCode: '' as ReasonCode, notes: '' };
        next[student._id] = {
          ...previous,
          status,
          ...(status === 'present' ? { reasonCode: '' as ReasonCode } : {}),
        };
      }
      return next;
    });
  };

  const save = async () => {
    if (!detail?.schedule?.course?._id || detail.locked || !detail.roster.length) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.post('/attendance', {
        course: detail.schedule.course._id,
        schedule: detail.schedule._id,
        date,
        records: detail.roster.map((student) => ({
          student: student._id,
          ...(drafts[student._id] || { status: 'present' }),
        })),
      });
      setMessage('Attendance submitted and locked successfully.');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not submit attendance.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <button type="button" onClick={() => navigate('/teacher/attendance')} className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-emerald-600">
          <ArrowLeft className="h-4 w-4" /> Back to Attendance
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{error || 'Attendance session not found.'}</div>
      </div>
    );
  }

  const session = detail.schedule;
  const total = detail.roster.length;
  const statusLabel = detail.completionStatus === 'complete' ? 'Completed' : detail.completionStatus === 'partial' ? 'Partial' : 'Not taken';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-3 pt-4 sm:p-5 lg:p-7">
      <button
        type="button"
        onClick={() => navigate('/teacher/attendance')}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Attendance
      </button>

      <section className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-black text-[var(--color-text-primary)] sm:text-2xl">{session.className}</h1>
                <p className="mt-0.5 truncate text-sm font-black text-emerald-600">{subject(session)}</p>
              </div>
              <span className={
                'rounded-full px-3 py-1.5 text-xs font-black ' +
                (detail.completionStatus === 'complete'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-800')
              }>
                {statusLabel}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Time</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-black"><Clock3 className="h-4 w-4" />{session.startTime}–{session.endTime}</p>
              </div>
              <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Students</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-black"><Users className="h-4 w-4" />{total}</p>
              </div>
              <div className="col-span-2 rounded-xl bg-[var(--color-surface-secondary)] p-3 sm:col-span-1">
                <p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Date</p>
                <p className="mt-1 text-sm font-black">{date}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}

      <section className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
        <div className="border-b border-[var(--color-border-subtle)] p-4 sm:p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student..."
              className="min-h-12 w-full rounded-2xl border border-[var(--color-border-default)] bg-transparent py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={detail.locked} onClick={() => markAll('present')} className="min-h-11 rounded-xl bg-emerald-600 px-3 text-sm font-black text-white disabled:opacity-50">
              All Present
            </button>
            <button type="button" disabled={detail.locked} onClick={() => markAll('absent')} className="min-h-11 rounded-xl bg-red-600 px-3 text-sm font-black text-white disabled:opacity-50">
              All Absent
            </button>
          </div>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {visible.map((student, index) => {
            const draft = drafts[student._id] || { status: 'present' as Status, reasonCode: '' as ReasonCode, notes: '' };
            return (
              <div key={student._id} className="px-3 py-3 sm:px-5 sm:py-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate whitespace-nowrap text-sm font-black text-[var(--color-text-primary)] sm:text-[15px]">{student.name}</p>
                      <p className="mt-0.5 truncate text-xs font-medium text-[var(--color-text-tertiary)]">{student.studentId}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      aria-label={`Mark ${student.name} present`}
                      title="Present"
                      disabled={detail.locked}
                      onClick={() => setDrafts((current) => ({
                        ...current,
                        [student._id]: { ...draft, status: 'present', reasonCode: '' },
                      }))}
                      className={
                        'inline-flex h-11 w-11 items-center justify-center rounded-xl border text-base font-black transition disabled:opacity-50 ' +
                        (draft.status === 'present'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-emerald-600/50 text-emerald-600')
                      }
                    >
                      P
                    </button>
                    <button
                      type="button"
                      aria-label={`Mark ${student.name} absent`}
                      title="Absent"
                      disabled={detail.locked}
                      onClick={() => setDrafts((current) => ({
                        ...current,
                        [student._id]: { ...draft, status: 'absent' },
                      }))}
                      className={
                        'inline-flex h-11 w-11 items-center justify-center rounded-xl border text-base font-black transition disabled:opacity-50 ' +
                        (draft.status === 'absent'
                          ? 'border-red-600 bg-red-600 text-white'
                          : 'border-red-600/50 text-red-600')
                      }
                    >
                      A
                    </button>
                  </div>
                </div>

                {draft.status === 'absent' && !detail.locked && (
                  <div className="ml-12 mt-3 grid gap-2 sm:grid-cols-2">
                    <select
                      value={draft.reasonCode}
                      onChange={(e) => setDrafts((current) => ({
                        ...current,
                        [student._id]: { ...draft, reasonCode: e.target.value as ReasonCode },
                      }))}
                      className="min-h-10 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-xs"
                    >
                      {REASONS.map((reason) => <option key={reason.value || 'none'} value={reason.value}>{reason.label}</option>)}
                    </select>
                    <input
                      value={draft.notes}
                      onChange={(e) => setDrafts((current) => ({
                        ...current,
                        [student._id]: { ...draft, notes: e.target.value },
                      }))}
                      placeholder="Excuse / note (optional)"
                      className="min-h-10 rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 text-xs"
                    />
                  </div>
                )}
              </div>
            );
          })}

          {visible.length === 0 && (
            <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No students match this search.</div>
          )}
        </div>

        <div className="border-t border-[var(--color-border-subtle)] p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold">
            <span className="text-emerald-600">{counts.present} Present</span>
            <span className="text-red-600">{counts.absent} Absent</span>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || detail.locked || !detail.roster.length}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : detail.locked ? 'Attendance Submitted' : 'Save Attendance'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default TeacherSchoolAttendanceRoster;
