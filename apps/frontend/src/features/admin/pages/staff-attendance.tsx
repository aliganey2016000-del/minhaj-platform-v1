import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, History, UsersRound } from 'lucide-react';
import api from '../../../lib/axios';

type Status = 'present' | 'absent' | 'late' | 'excused';
type Row = { staff: { _id: string; email: string; phone?: string; title?: string; profile?: { firstName?: string; lastName?: string } | null; department?: { name?: string } | null }; attendance?: { status: Status; notes?: string } | null };

const statuses: { value: Status; label: string }[] = [
  { value: 'present', label: 'Present' }, { value: 'absent', label: 'Absent' }, { value: 'late', label: 'Late' }, { value: 'excused', label: 'Excused' },
];
const inputClass = 'rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm';

function today() { return new Date().toISOString().slice(0, 10); }

export function StaffAttendance() {
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try { const response = await api.get('/hr/staff-attendance', { params: { date } }); setRows(response.data.data?.rows || []); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to load staff attendance'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [date]);

  const summary = useMemo(() => ({
    total: rows.length,
    present: rows.filter((r) => r.attendance?.status === 'present').length,
    absent: rows.filter((r) => r.attendance?.status === 'absent').length,
    late: rows.filter((r) => r.attendance?.status === 'late').length,
  }), [rows]);

  const mark = async (userId: string, status: Status) => {
    setSaving(userId); setError(''); setMessage('');
    try { await api.post('/hr/staff-attendance', { userId, date, status }); setRows((current) => current.map((row) => row.staff._id === userId ? { ...row, attendance: { ...(row.attendance || {}), status } } : row)); setMessage('Attendance saved.'); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to save attendance'); }
    finally { setSaving(null); }
  };

  const loadHistory = async () => {
    try { const response = await api.get('/hr/staff-attendance/history'); setHistory(response.data.data || []); setShowHistory(true); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to load attendance history'); }
  };

  return <div className="space-y-6 p-4 sm:p-6">
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300"><UsersRound className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Human Resources</p><h1 className="mt-1 text-2xl font-bold">Staff Attendance</h1><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Simple daily attendance for your staff.</p></div></div>
        <div className="flex flex-wrap gap-2"><label className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--color-text-tertiary)]" /><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><button onClick={loadHistory} className={`${inputClass} inline-flex items-center gap-2 font-medium`}><History className="h-4 w-4" /> History</button></div>
      </div>
    </div>
    {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Staff</p><p className="mt-1 text-xl font-bold">{summary.total}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Present</p><p className="mt-1 text-xl font-bold">{summary.present}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Absent</p><p className="mt-1 text-xl font-bold">{summary.absent}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Late</p><p className="mt-1 text-xl font-bold">{summary.late}</p></div></div>
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
      {loading ? <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">Loading staff...</div> : rows.length === 0 ? <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">No active staff found.</div> : <div className="divide-y divide-[var(--color-border-default)]">{rows.map((row) => { const name = `${row.staff.profile?.firstName || ''} ${row.staff.profile?.lastName || ''}`.trim() || row.staff.email; const status = row.attendance?.status; return <div key={row.staff._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-semibold">{name}</p><p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{row.staff.title || 'Staff'}{row.staff.department?.name ? ` · ${row.staff.department.name}` : ''}{row.staff.phone ? ` · ${row.staff.phone}` : ''}</p></div><div className="flex items-center gap-2"><Clock3 className="hidden h-4 w-4 text-[var(--color-text-tertiary)] sm:block" />{statuses.map((item) => <button key={item.value} disabled={saving === row.staff._id} onClick={() => mark(row.staff._id, item.value)} className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${status === item.value ? 'border-primary-600 bg-primary-600 text-white' : 'border-[var(--color-border-default)] hover:border-primary-400'} disabled:opacity-50`}>{status === item.value && <Check className="mr-1 inline h-3 w-3" />}{item.label}</button>)}</div></div>; })}</div>}
    </div>
    {showHistory && <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Recent history</h2><p className="text-xs text-[var(--color-text-tertiary)]">Latest 200 attendance records.</p></div><button onClick={() => setShowHistory(false)} className="text-sm text-primary-600">Close</button></div><div className="space-y-2">{history.length === 0 ? <p className="text-sm text-[var(--color-text-tertiary)]">No attendance records yet.</p> : history.slice(0, 50).map((record) => { const profile = record.user?.profile; const name = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || record.user?.email || 'Staff'; return <div key={record._id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><span>{name}</span><span className="text-[var(--color-text-tertiary)]">{String(record.date).slice(0,10)} · {record.status}</span></div>; })}</div></div>}
  </div>;
}

export default StaffAttendance;
