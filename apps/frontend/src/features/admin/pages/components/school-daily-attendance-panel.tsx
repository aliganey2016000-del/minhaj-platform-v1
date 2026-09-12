import { useCallback, useEffect, useMemo, useState } from 'react';
import { DoorOpen, LogOut, Search, Save, Users } from 'lucide-react';
import api from '../../../../lib/axios';

type Status = '' | 'present' | 'absent' | 'late' | 'excused';
type Reason = '' | 'sick' | 'medical' | 'family_emergency' | 'school_activity' | 'suspension' | 'transport_delay' | 'other';
type Row = {
  _id: string;
  studentId: string;
  name: string;
  class?: { _id: string; title?: string; section?: string } | null;
  daily?: { status: Exclude<Status, ''>; reasonCode?: Reason; arrivalTime?: string; departureTime?: string; notes?: string; source?: string } | null;
  derivedStatus?: Exclude<Status, ''> | null;
  effectiveStatus?: Exclude<Status, ''> | null;
};
type RosterResponse = {
  calendarDay?: { name?: string; type?: string; isInstructional?: boolean } | null;
  summary: { total: number; present: number; late: number; absent: number; excused: number; unmarked: number };
  roster: Row[];
};
type Draft = { status: Status; reasonCode: Reason; arrivalTime: string; departureTime: string; notes: string };

const REASONS: Array<{ value: Reason; label: string }> = [
  { value: '', label: 'Reason' },
  { value: 'sick', label: 'Sick' },
  { value: 'medical', label: 'Medical' },
  { value: 'family_emergency', label: 'Family emergency' },
  { value: 'school_activity', label: 'School activity' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'transport_delay', label: 'Transport delay' },
  { value: 'other', label: 'Other' },
];

function localDate() {
  const d = new Date();
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function localTime() { return new Date().toTimeString().slice(0, 5); }
function className(row: Row) { return row.class ? `${row.class.title || ''}${row.class.section ? ` (${row.class.section})` : ''}` : '—'; }

function StatusPill({ status }: { status?: Status | null }) {
  if (!status) return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Unmarked</span>;
  const cls = status === 'present' ? 'bg-emerald-100 text-emerald-700' : status === 'late' ? 'bg-amber-100 text-amber-700' : status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${cls}`}>{status}</span>;
}

export function SchoolDailyAttendancePanel() {
  const [date, setDate] = useState(localDate());
  const [data, setData] = useState<RosterResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [studentLookup, setStudentLookup] = useState('');
  const [movementTime, setMovementTime] = useState(localTime());

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await api.get('/attendance/school/daily', { params: { date } });
      const next: RosterResponse = response.data?.data;
      setData(next);
      const nextDrafts: Record<string, Draft> = {};
      for (const row of next?.roster || []) {
        nextDrafts[row._id] = {
          status: row.daily?.status || '',
          reasonCode: row.daily?.reasonCode || '',
          arrivalTime: row.daily?.arrivalTime || '',
          departureTime: row.daily?.departureTime || '',
          notes: row.daily?.notes || '',
        };
      }
      setDrafts(nextDrafts);
    } catch (e: any) {
      setData(null);
      setError(e?.response?.data?.message || 'Could not load daily attendance.');
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = data?.roster || [];
    return q ? rows.filter((row) => row.name.toLowerCase().includes(q) || row.studentId.toLowerCase().includes(q) || className(row).toLowerCase().includes(q)) : rows;
  }, [data, search]);

  const save = async () => {
    const records = (data?.roster || []).filter((row) => drafts[row._id]?.status).map((row) => ({ student: row._id, ...drafts[row._id] }));
    if (!records.length) { setError('Mark at least one student before saving daily attendance.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      await api.post('/attendance/school/daily', { date, records });
      setMessage(`Saved daily attendance for ${records.length} student${records.length === 1 ? '' : 's'}.`);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message || 'Could not save daily attendance.'); }
    finally { setSaving(false); }
  };

  const markAllPresent = () => {
    if (!data) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const row of data.roster) next[row._id] = { ...(next[row._id] || { reasonCode: '', arrivalTime: '', departureTime: '', notes: '' }), status: 'present', reasonCode: '', arrivalTime: '', departureTime: '' };
      return next;
    });
  };

  const movement = async (kind: 'in' | 'out') => {
    if (!studentLookup.trim()) { setError('Enter Student ID first.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      if (kind === 'in') {
        const response = await api.post('/attendance/school/check-in', { date, student: studentLookup.trim(), arrivalTime: movementTime });
        setMessage(response.data?.message || 'Student checked in.');
      } else {
        const response = await api.post('/attendance/school/check-out', { date, student: studentLookup.trim(), departureTime: movementTime });
        setMessage(response.data?.message || 'Student checked out.');
      }
      setStudentLookup('');
      await load();
    } catch (e: any) { setError(e?.response?.data?.message || `Could not check student ${kind === 'in' ? 'in' : 'out'}.`); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-bold text-[var(--color-text-primary)]">Daily School Attendance</p><p className="text-xs text-[var(--color-text-tertiary)]">Whole-day attendance. Section attendance remains separate and can provide a derived status.</p></div><label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /></label></div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
          <p className="font-bold text-[var(--color-text-primary)]">Reception Check-in / Check-out</p><p className="mb-3 text-xs text-[var(--color-text-tertiary)]">Use Student ID. Check-in automatically identifies Late using the student's first scheduled class.</p>
          <div className="grid grid-cols-[1fr_105px] gap-2"><input value={studentLookup} onChange={(e) => setStudentLookup(e.target.value)} placeholder="Student ID" className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"/><input type="time" value={movementTime} onChange={(e) => setMovementTime(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2.5 text-sm"/></div>
          <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => movement('in')} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><DoorOpen className="h-4 w-4"/>Check In</button><button type="button" onClick={() => movement('out')} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] disabled:opacity-50"><LogOut className="h-4 w-4"/>Check Out</button></div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      {data?.calendarDay?.isInstructional === false && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><strong>{data.calendarDay.name || 'Non-instructional day'}:</strong> daily attendance is closed.</div>}

      {data && data.roster.length > 0 && <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{[['Students', data.summary.total], ['Present', data.summary.present], ['Late', data.summary.late], ['Absent', data.summary.absent], ['Excused', data.summary.excused], ['Unmarked', data.summary.unmarked]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 text-center"><p className="text-xs text-[var(--color-text-tertiary)]">{label}</p><p className="text-xl font-bold text-[var(--color-text-primary)]">{value}</p></div>)}</div>}

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
        <div className="flex flex-col gap-3 border-b border-[var(--color-border-default)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]"><Users className="h-4 w-4"/>Student Roster</p><p className="text-xs text-[var(--color-text-tertiary)]">Explicit daily status overrides the section-derived status.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student/class..." className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-9 pr-3 text-sm"/></div><button type="button" onClick={markAllPresent} disabled={!data?.roster.length} className="rounded-xl border border-emerald-300 px-3 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-50">Mark All Present</button></div></div>
        {loading ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading daily roster...</div> : visible.length === 0 ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No students found for this date.</div> : <div className="divide-y divide-[var(--color-border-subtle)]">{visible.map((row) => {
          const draft = drafts[row._id] || { status: '' as Status, reasonCode: '' as Reason, arrivalTime: '', departureTime: '', notes: '' };
          return <div key={row._id} className="p-4"><div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_150px_150px_130px_130px_minmax(160px,1fr)] lg:items-center"><div><p className="font-semibold text-[var(--color-text-primary)]">{row.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{row.studentId} · {className(row)}</p><div className="mt-1 flex items-center gap-2"><StatusPill status={row.effectiveStatus}/>{!row.daily && row.derivedStatus && <span className="text-[10px] text-[var(--color-text-tertiary)]">from period attendance</span>}</div></div><select value={draft.status} onChange={(e) => setDrafts((current) => ({ ...current, [row._id]: { ...draft, status: e.target.value as Status } }))} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs"><option value="">Do not change</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="excused">Excused</option></select><select value={draft.reasonCode} onChange={(e) => setDrafts((current) => ({ ...current, [row._id]: { ...draft, reasonCode: e.target.value as Reason } }))} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs">{REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select><input type="time" title="Arrival" value={draft.arrivalTime} onChange={(e) => setDrafts((current) => ({ ...current, [row._id]: { ...draft, arrivalTime: e.target.value } }))} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs"/><input type="time" title="Departure" value={draft.departureTime} onChange={(e) => setDrafts((current) => ({ ...current, [row._id]: { ...draft, departureTime: e.target.value } }))} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs"/><input value={draft.notes} onChange={(e) => setDrafts((current) => ({ ...current, [row._id]: { ...draft, notes: e.target.value } }))} placeholder="Note" className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs"/></div></div>;
        })}</div>}
        <div className="flex justify-end border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4"><button type="button" onClick={save} disabled={saving || !data?.roster.length} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{saving ? 'Saving...' : 'Save Daily Attendance'}</button></div>
      </div>
    </div>
  );
}

export default SchoolDailyAttendancePanel;
