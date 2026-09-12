import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, Clock3, Loader2, Search, ShieldCheck } from 'lucide-react';
import api from '../../../lib/axios';

type Status = 'present' | 'absent' | 'late' | 'excused';
type ReasonCode = '' | 'sick' | 'medical' | 'family_emergency' | 'school_activity' | 'suspension' | 'transport_delay' | 'other';

interface Session {
  _id: string;
  className: string;
  course?: { _id: string; title?: { en?: string }; courseCode?: string };
  teacherName: string;
  regularTeacherName?: string;
  isSubstitute?: boolean;
  startTime: string;
  endTime: string;
  attendance: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    locked: boolean;
    completionStatus?: 'not_taken' | 'partial' | 'complete';
    expectedStudents?: number | null;
    recordedStudents?: number;
  };
}

interface RosterStudent {
  _id: string;
  studentId: string;
  name: string;
  attendance?: { status: Status; notes?: string; reasonCode?: ReasonCode; arrivalTime?: string; departureTime?: string; locked?: boolean } | null;
}

interface SessionDetail {
  schedule: Session;
  locked: boolean;
  completionStatus?: 'not_taken' | 'partial' | 'complete';
  roster: RosterStudent[];
}

interface Draft {
  status: Status;
  reasonCode: ReasonCode;
  arrivalTime: string;
  departureTime: string;
  notes: string;
}

const STATUS_OPTIONS: Array<{ value: Status; label: string; short: string; active: string }> = [
  { value: 'present', label: 'Present', short: 'P', active: 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  { value: 'absent', label: 'Absent', short: 'A', active: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  { value: 'late', label: 'Late', short: 'L', active: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  { value: 'excused', label: 'Excused', short: 'E', active: 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
];

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

function subject(session: Session) {
  return session.course?.title?.en || session.course?.courseCode || 'Subject';
}

export function TeacherSchoolAttendance() {
  const [date, setDate] = useState(localDate());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [calendarDay, setCalendarDay] = useState<{ name?: string; type?: string; isInstructional?: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadSessions = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await api.get('/attendance/school/sessions', { params: { date } });
      setSessions(response.data?.data?.sessions || []);
      setCalendarDay(response.data?.data?.calendarDay || null);
      setSelectedId('');
      setDetail(null);
      setDrafts({});
    } catch (e: any) {
      setSessions([]);
      setError(e?.response?.data?.message || 'Could not load your school attendance sessions.');
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const openSession = async (sessionId: string) => {
    setSelectedId(sessionId); setLoading(true); setError(''); setMessage('');
    try {
      const response = await api.get(`/attendance/school/session/${sessionId}`, { params: { date } });
      const next: SessionDetail = response.data?.data;
      setDetail(next);
      const nextDrafts: Record<string, Draft> = {};
      for (const student of next.roster || []) {
        nextDrafts[student._id] = {
          status: student.attendance?.status || 'present',
          reasonCode: student.attendance?.reasonCode || '',
          arrivalTime: student.attendance?.arrivalTime || '',
          departureTime: student.attendance?.departureTime || '',
          notes: student.attendance?.notes || '',
        };
      }
      setDrafts(nextDrafts);
    } catch (e: any) {
      setDetail(null);
      setError(e?.response?.data?.message || 'Could not open this attendance session.');
    } finally { setLoading(false); }
  };

  const visibleRoster = useMemo(() => {
    const rows = detail?.roster || [];
    const q = search.trim().toLowerCase();
    return q ? rows.filter((row) => row.name.toLowerCase().includes(q) || row.studentId.toLowerCase().includes(q)) : rows;
  }, [detail, search]);

  const markAll = (status: Status) => {
    if (!detail || detail.locked) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const student of detail.roster) {
        const previous = next[student._id] || { status: 'present' as Status, reasonCode: '' as ReasonCode, arrivalTime: '', departureTime: '', notes: '' };
        next[student._id] = { ...previous, status, ...(status === 'present' ? { reasonCode: '' as ReasonCode, arrivalTime: '', departureTime: '' } : {}) };
      }
      return next;
    });
  };

  const save = async () => {
    if (!detail?.schedule?.course?._id || detail.locked || !detail.roster.length) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await api.post('/attendance', {
        course: detail.schedule.course._id,
        schedule: detail.schedule._id,
        date,
        records: detail.roster.map((student) => ({ student: student._id, ...(drafts[student._id] || { status: 'present' }) })),
      });
      setMessage('Attendance submitted and locked successfully.');
      await loadSessions();
      await openSession(detail.schedule._id);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not submit attendance.');
    } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2 text-emerald-600"><CalendarCheck className="h-5 w-5"/><span className="text-xs font-bold uppercase tracking-wide">Teacher</span></div><h1 className="mt-1 text-2xl font-black text-[var(--color-text-primary)]">School Attendance</h1><p className="text-sm text-[var(--color-text-tertiary)]">Your scheduled lessons and substitute coverage appear automatically.</p></div>
        <label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"/></label>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      {calendarDay?.isInstructional === false && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><strong>{calendarDay.name || 'Non-instructional day'}:</strong> attendance is closed.</div>}

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-bold text-[var(--color-text-primary)]">Scheduled Classes</h2><span className="text-xs text-[var(--color-text-tertiary)]">{sessions.length} session{sessions.length === 1 ? '' : 's'}</span></div>
        {loading && !detail ? <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600"/></div> : sessions.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">No assigned classes for this date.</div> : <div className="grid gap-3 md:grid-cols-2">{sessions.map((session) => <button key={session._id} type="button" onClick={() => openSession(session._id)} className={`rounded-2xl border p-4 text-left transition hover:border-emerald-400 ${selectedId === session._id ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-[var(--color-text-primary)]">{session.className}</p><p className="text-sm font-semibold text-emerald-600">{subject(session)}</p></div>{session.attendance.completionStatus === 'complete' ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>Complete</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Not taken</span>}</div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-tertiary)]"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5"/>{session.startTime}–{session.endTime}</span>{session.isSubstitute && <span className="inline-flex items-center gap-1 font-semibold text-blue-600"><ShieldCheck className="h-3.5 w-3.5"/>Substitute coverage</span>}</div></button>)}</div>}
      </section>

      {detail && (
        <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
          <div className="border-b border-[var(--color-border-default)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-lg font-bold text-[var(--color-text-primary)]">{detail.schedule.className} · {subject(detail.schedule)}</p><p className="text-xs text-[var(--color-text-tertiary)]">{detail.schedule.startTime}–{detail.schedule.endTime}{detail.schedule.isSubstitute ? ` · Covering for ${detail.schedule.regularTeacherName || 'regular teacher'}` : ''}</p></div><div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-9 pr-3 text-sm"/></div></div><div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{STATUS_OPTIONS.map((option) => <button key={option.value} type="button" disabled={detail.locked} onClick={() => markAll(option.value)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-bold text-[var(--color-text-secondary)] disabled:opacity-50">All {option.label}</button>)}</div></div>
          <div className="divide-y divide-[var(--color-border-subtle)]">{visibleRoster.map((student) => { const draft = drafts[student._id] || { status: 'present' as Status, reasonCode: '' as ReasonCode, arrivalTime: '', departureTime: '', notes: '' }; return <div key={student._id} className="p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold text-[var(--color-text-primary)]">{student.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId}</p></div><div className="grid grid-cols-4 gap-1 sm:flex">{STATUS_OPTIONS.map((option) => <button key={option.value} type="button" disabled={detail.locked} onClick={() => setDrafts((current) => ({ ...current, [student._id]: { ...draft, status: option.value, ...(option.value === 'present' ? { reasonCode: '' as ReasonCode, arrivalTime: '', departureTime: '' } : {}) } }))} className={`h-10 min-w-10 rounded-lg border text-xs font-black disabled:opacity-50 ${draft.status === option.value ? option.active : 'border-[var(--color-border-default)] text-[var(--color-text-tertiary)]'}`}>{option.short}</button>)}</div></div>{draft.status !== 'present' && <div className="mt-3 grid gap-2 sm:grid-cols-4"><select value={draft.reasonCode} disabled={detail.locked} onChange={(e) => setDrafts((current) => ({ ...current, [student._id]: { ...draft, reasonCode: e.target.value as ReasonCode } }))} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs">{REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select>{draft.status === 'late' && <input type="time" value={draft.arrivalTime} disabled={detail.locked} onChange={(e) => setDrafts((current) => ({ ...current, [student._id]: { ...draft, arrivalTime: e.target.value } }))} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs"/>}<input type="time" value={draft.departureTime} disabled={detail.locked} onChange={(e) => setDrafts((current) => ({ ...current, [student._id]: { ...draft, departureTime: e.target.value } }))} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs"/><input value={draft.notes} disabled={detail.locked} onChange={(e) => setDrafts((current) => ({ ...current, [student._id]: { ...draft, notes: e.target.value } }))} placeholder="Note" className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs"/></div>}</div>; })}</div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">{detail.roster.length} active approved student{detail.roster.length === 1 ? '' : 's'} · full roster submission required</p><button type="button" onClick={save} disabled={saving || detail.locked || !detail.roster.length} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Submitting...' : detail.locked ? 'Submitted & Locked' : 'Submit Attendance'}</button></div>
        </section>
      )}
    </div>
  );
}

export default TeacherSchoolAttendance;
