import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Trash2, UserRoundCheck } from 'lucide-react';
import api from '../../../../lib/axios';

type Session = { _id: string; className: string; course?: { title?: { en?: string }; courseCode?: string }; teacherName: string; regularTeacherName?: string; startTime: string; endTime: string; isSubstitute?: boolean };
type Assignment = {
  _id: string;
  reason?: string;
  teacher?: { teacherId?: string; profile?: { firstName?: string; lastName?: string }; user?: { email?: string } };
  schedule?: { class?: { title?: string; section?: string }; course?: { title?: { en?: string }; courseCode?: string }; startTime?: string; endTime?: string };
};

function localDate() {
  const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function subject(session?: Session) { return session?.course?.title?.en || session?.course?.courseCode || 'Subject'; }
function teacherName(teacher?: Assignment['teacher']) { const name = `${teacher?.profile?.firstName || ''} ${teacher?.profile?.lastName || ''}`.trim(); return name || teacher?.user?.email || teacher?.teacherId || 'Teacher'; }
function assignmentClass(row: Assignment) { const cls = row.schedule?.class; return cls ? `${cls.title || ''}${cls.section ? ` (${cls.section})` : ''}` : '—'; }
function assignmentSubject(row: Assignment) { return row.schedule?.course?.title?.en || row.schedule?.course?.courseCode || 'Subject'; }

export function SchoolSubstitutesPanel() {
  const [date, setDate] = useState(localDate());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedule, setSchedule] = useState('');
  const [teacher, setTeacher] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [sessionResponse, substituteResponse] = await Promise.all([
        api.get('/attendance/school/sessions', { params: { date } }),
        api.get('/attendance/school/substitutes', { params: { date } }),
      ]);
      const nextSessions = sessionResponse.data?.data?.sessions || [];
      setSessions(nextSessions);
      setAssignments(substituteResponse.data?.data || []);
      setSchedule((current) => current && nextSessions.some((row: Session) => row._id === current) ? current : nextSessions[0]?._id || '');
    } catch (e: any) {
      setSessions([]); setAssignments([]);
      setError(e?.response?.data?.message || 'Could not load substitute coverage.');
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => sessions.find((row) => row._id === schedule), [sessions, schedule]);

  const assign = async () => {
    if (!schedule || !teacher.trim()) { setError('Choose a scheduled class and enter Teacher ID or teacher email.'); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      await api.post('/attendance/school/substitutes', { date, schedule, teacher: teacher.trim(), reason: reason.trim() });
      setMessage('Substitute teacher assigned. The substitute can now see and take attendance for this class on this date.');
      setTeacher(''); setReason('');
      await load();
    } catch (e: any) { setError(e?.response?.data?.message || 'Could not assign substitute teacher.'); }
    finally { setLoading(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this substitute assignment?')) return;
    setLoading(true); setError('');
    try { await api.delete(`/attendance/school/substitutes/${id}`); await load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not remove substitute assignment.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
        <div className="mb-4"><p className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]"><UserRoundCheck className="h-5 w-5"/>Assign Substitute Teacher</p><p className="text-xs text-[var(--color-text-tertiary)]">A substitute assignment applies only to one scheduled lesson on one date; it does not replace the regular course teacher.</p></div>
        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
        <div className="space-y-3">
          <label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"/></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Scheduled Class</span><select value={schedule} onChange={(e) => setSchedule(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"><option value="">Select scheduled class...</option>{sessions.map((row) => <option key={row._id} value={row._id}>{row.startTime}–{row.endTime} · {row.className} · {subject(row)}</option>)}</select></label>
          {selected && <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs text-[var(--color-text-secondary)]"><strong>Regular teacher:</strong> {selected.regularTeacherName || selected.teacherName}</div>}
          <label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Substitute Teacher</span><input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Teacher ID or teacher email" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"/></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Reason</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Regular teacher on leave" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"/></label>
          <button type="button" onClick={assign} disabled={loading || !schedule || !teacher.trim()} className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Saving...' : 'Assign Substitute'}</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
        <div className="border-b border-[var(--color-border-default)] p-4"><p className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]"><CalendarClock className="h-5 w-5"/>Coverage for {date}</p><p className="text-xs text-[var(--color-text-tertiary)]">Assigned substitutes receive attendance access only for these dated sessions.</p></div>
        {loading && assignments.length === 0 ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading coverage...</div> : assignments.length === 0 ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No substitute assignments for this date.</div> : <div className="divide-y divide-[var(--color-border-subtle)]">{assignments.map((row) => <div key={row._id} className="flex items-start gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-semibold text-[var(--color-text-primary)]">{assignmentClass(row)} · {assignmentSubject(row)}</p><p className="mt-1 text-sm text-emerald-600">{teacherName(row.teacher)}</p><p className="text-xs text-[var(--color-text-tertiary)]">{row.schedule?.startTime}–{row.schedule?.endTime}{row.reason ? ` · ${row.reason}` : ''}</p></div><button type="button" onClick={() => remove(row._id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Remove substitute"><Trash2 className="h-4 w-4"/></button></div>)}</div>}
      </div>
    </div>
  );
}

export default SchoolSubstitutesPanel;
