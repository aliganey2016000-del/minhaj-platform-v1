import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import api from '../../../../lib/axios';

type RequestRow = {
  _id: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewNote?: string;
  teacher?: { name?: string; fullName?: string } | string;
  course?: { _id?: string; title?: { en?: string } | string; courseCode?: string } | string;
  schedule?: { _id?: string; startTime?: string; endTime?: string; class?: { title?: string; section?: string } | string } | string;
};

const idOf = (value: any) => typeof value === 'string' ? value : value?._id || '';
const labelOf = (value: any) => typeof value === 'string' ? value : value?.name || value?.fullName || value?.title?.en || value?.title || value?.courseCode || '—';

export default function SchoolAttendanceUnlockRequests() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [status, setStatus] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/attendance/school/unlock-requests', { params: { status } });
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load attendance unlock requests.');
      setRows([]);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const review = async (row: RequestRow, decision: 'approve' | 'reject') => {
    const course = idOf(row.course);
    const schedule = idOf(row.schedule);
    if (!course || !schedule) { setError('This request is missing its course or schedule reference.'); return; }
    const reviewNote = window.prompt(decision === 'approve' ? 'Optional note for this approval:' : 'Reason for rejecting this request:');
    if (reviewNote === null) return;
    if (decision === 'reject' && !reviewNote.trim()) { setError('Please provide a reason when rejecting a request.'); return; }
    setBusy(row._id); setError(''); setMessage('');
    try {
      await api.patch('/attendance/school/unlock-requests/' + row._id + '/review', {
        course, schedule, date: String(row.date).slice(0, 10), decision, reviewNote: reviewNote.trim(),
      });
      setMessage(decision === 'approve' ? 'Request approved. Attendance has been unlocked.' : 'Request rejected.');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not review this request.');
    } finally { setBusy(''); }
  };

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-black text-[var(--color-text-primary)]">Attendance Unlock Requests</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Review teacher requests to correct completed period attendance.</p></div>
      <div className="flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as 'pending' | 'all')} className="min-h-10 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm"><option value="pending">Pending approval</option><option value="all">All requests</option></select>
        <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 text-sm font-bold"><RefreshCw className="h-4 w-4"/>Refresh</button>
      </div>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
    {message && <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}
    {loading ? <div className="rounded-2xl border border-[var(--color-border-default)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading requests…</div> : rows.length === 0 ? <div className="rounded-2xl border border-[var(--color-border-default)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">No {status === 'pending' ? 'pending ' : ''}unlock requests.</div> : <div className="grid gap-3">
      {rows.map((row) => {
        const schedule: any = row.schedule || {};
        return <article key={row._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-black text-[var(--color-text-primary)]">{labelOf(row.teacher)}</h3><p className="mt-1 text-sm font-semibold text-emerald-600">{labelOf(row.course)}</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{String(row.date).slice(0, 10)} · {schedule.startTime || '—'}–{schedule.endTime || '—'}</p></div>
            <span className={'rounded-full px-3 py-1 text-xs font-bold ' + (row.status === 'pending' ? 'bg-amber-100 text-amber-800' : row.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800')}>{row.status === 'pending' ? 'Pending Approval' : row.status === 'approved' ? 'Approved' : 'Rejected'}</span>
          </div>
          <div className="mt-4 rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Teacher's reason</p><p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">{row.reason}</p></div>
          {row.reviewNote && <p className="mt-3 text-sm text-[var(--color-text-secondary)]">Admin note: {row.reviewNote}</p>}
          {row.status === 'pending' && <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy === row._id} onClick={() => void review(row, 'approve')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4"/>{busy === row._id ? 'Processing…' : 'Approve & Unlock'}</button>
            <button type="button" disabled={busy === row._id} onClick={() => void review(row, 'reject')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300 px-3 text-sm font-bold text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300"><XCircle className="h-4 w-4"/>Reject</button>
          </div>}
        </article>;
      })}
    </div>}
  </section>;
}
