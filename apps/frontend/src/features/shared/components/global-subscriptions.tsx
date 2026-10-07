import { useCallback, useEffect, useState } from 'react';
import { StudentSubscription } from './student-subscription';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

type Subscription = { _id: string; grade: number; amount: number; currency: string; paymentReference: string; status: string; expiresAt?: string; user?: { email: string }; school?: { name: string } };
export function GlobalSubscriptions() {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState<Subscription[]>([]);
  const [grade, setGrade] = useState(12);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(isStudent ? '/global-subscriptions/mine' : '/global-subscriptions/admin', { params: { page } });
      setRows(data.data || []);
      setTotal(data.pagination?.total || data.meta?.total || 0);
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to load subscriptions'); }
    finally { setLoading(false); }
  }, [isStudent, page]);
  useEffect(() => { if (isStudent || isAdmin || user?.role === 'org_admin') void load(); }, [load, isStudent, isAdmin, user?.role]);
  if (isStudent) return <StudentSubscription />;
  if (!isStudent && !isAdmin && user?.role !== 'org_admin') return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.post('/global-subscriptions/requests', { grade, paymentReference: reference }); setReference(''); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Unable to submit payment reference'); }
    finally { setBusy(false); }
  };
  const review = async (row: Subscription, action: string) => {
    if (!window.confirm(action === 'approve' ? `Have you independently verified receipt of $5 USD for ${row.paymentReference}?` : `${action === 'reject' ? 'Reject' : 'Revoke'} this subscription?`)) return;
    setBusy(true); setError('');
    try { await api.post(`/global-subscriptions/${row._id}/review`, { action, paymentReceived: action === 'approve' }); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Unable to review subscription'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 sm:p-6">
    <h2 className="text-lg font-bold">{isStudent ? 'My Guuldoon Subscription' : 'Guuldoon Subscription Payments'}</h2>
    <p className="text-sm">$5 USD · 365 days · All global subjects in your selected grade.</p>
    {isStudent && <><p className="text-sm text-[var(--color-text-secondary)]">Ask the platform administrator for payment instructions. Submit your transaction reference after payment. Your year starts after the administrator verifies receipt. School fees and school services are separate.</p>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <label className="text-sm">Grade<select value={grade} onChange={e => setGrade(Number(e.target.value))} className="block w-full rounded-lg border bg-transparent p-2"><option value={8}>Grade 8</option><option value={12}>Grade 12</option></select></label>
        <label className="flex-1 text-sm">Payment reference<input required maxLength={120} value={reference} onChange={e => setReference(e.target.value)} className="block w-full rounded-lg border bg-transparent p-2" /></label>
        <button disabled={busy} className="self-end rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Submit for verification</button>
      </form><p className="text-xs text-[var(--color-text-tertiary)]">After your subscription is active, verify your current browser in My Device using the same account password.</p></>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {loading ? <p>Loading subscriptions...</p> : rows.length === 0 ? <p className="text-sm">No subscription requests.</p> : <div className="space-y-3">{rows.map(row => {
      const status = row.status === 'approved' && row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now() ? 'expired' : row.status === 'approved' ? 'active' : row.status;
      return <article key={row._id} className="flex flex-col justify-between gap-3 rounded-xl border border-[var(--color-border-subtle)] p-3 sm:flex-row">
        <div className="min-w-0 text-sm"><p className="font-semibold">Grade {row.grade} · {status}</p><p className="break-all">{row.paymentReference} · $5 USD</p>{row.user && <p className="break-all">{row.user.email} · {row.school?.name}</p>}{row.expiresAt && <p>Expires: {new Date(row.expiresAt).toLocaleDateString()}</p>}</div>
        {isAdmin && <div className="flex flex-wrap items-center gap-2">{row.status === 'pending' && <><button disabled={busy} onClick={() => review(row, 'approve')} className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white">Verify $5 received</button><button disabled={busy} onClick={() => review(row, 'reject')} className="rounded-lg border px-3 py-2 text-sm">Reject</button></>}{row.status === 'approved' && <button disabled={busy} onClick={() => review(row, 'revoke')} className="rounded-lg border px-3 py-2 text-sm text-red-600">Revoke</button>}</div>}
      </article>;
    })}</div>}
    {!isStudent && <div className="flex gap-3"><button disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={rows.length < 50 || loading || (total > 0 && page * 50 >= total)} onClick={() => setPage(page + 1)}>Next</button></div>}
  </section>;
}
