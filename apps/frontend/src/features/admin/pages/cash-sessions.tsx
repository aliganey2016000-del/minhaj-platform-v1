/**
 * Cash Sessions — finance operations UI.
 *
 * Lets cashiers/finance operators open and close a cash drawer, review the
 * server-calculated expected cash, and inspect recent reconciliations.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, Clock3, LockKeyhole, RefreshCw, UnlockKeyhole } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface School { _id: string; name: string; status?: string; }
interface Cashier { _id?: string; email?: string; }
interface CashSession {
  _id: string;
  cashier: Cashier | string;
  school: School | string;
  status: 'open' | 'closed';
  openingBalance: number;
  expectedCash: number;
  closingBalance?: number;
  cashCollected?: number;
  cashRefunded?: number;
  variance?: number;
  openingNote?: string;
  closingNote?: string;
  openedAt: string;
  closedAt?: string;
}

const FINANCE_ROLES = new Set(['admin', 'org_admin', 'finance_manager', 'cashier', 'auditor']);

function money(value: number | undefined, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toLocaleString()}`;
  }
}

function errorMessage(err: any, fallback: string) {
  return err?.response?.data?.message || fallback;
}

function schoolName(value: School | string) {
  return typeof value === 'string' ? value : value?.name || 'Organization';
}

function cashierName(value: Cashier | string) {
  return typeof value === 'string' ? value : value?.email || 'Cashier';
}

export function CashSessions() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const canOperate = ['admin', 'org_admin', 'finance_manager', 'cashier'].includes(user?.role || '');
  const [current, setCurrent] = useState<CashSession | null>(null);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openForm, setOpenForm] = useState({ schoolId: '', openingBalance: '', openingNote: '' });
  const [closeForm, setCloseForm] = useState({ closingBalance: '', closingNote: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const requests: Promise<any>[] = [
        api.get('/cash-sessions/current'),
        api.get('/cash-sessions', { params: statusFilter === 'all' ? {} : { status: statusFilter } }),
      ];
      if (isSuperAdmin) requests.push(api.get('/schools', { params: { limit: '100' } }));
      const [currentRes, sessionsRes, schoolsRes] = await Promise.all(requests);
      setCurrent(currentRes.data.data || null);
      setSessions(sessionsRes.data.data || []);
      if (schoolsRes) setSchools((schoolsRes.data.data || []).filter((s: School) => s.status !== 'inactive'));
    } catch (err: any) {
      setError(errorMessage(err, 'Failed to load cash sessions'));
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const selectedSchool = useMemo(() => schools.find((s) => s._id === openForm.schoolId), [schools, openForm.schoolId]);

  const openSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const payload: Record<string, unknown> = {
        openingBalance: Number(openForm.openingBalance),
        openingNote: openForm.openingNote.trim() || undefined,
      };
      if (isSuperAdmin) payload.schoolId = openForm.schoolId;
      await api.post('/cash-sessions/open', payload);
      setOpenForm({ schoolId: '', openingBalance: '', openingNote: '' });
      setNotice('Cash session opened successfully.');
      await load();
    } catch (err: any) {
      setError(errorMessage(err, 'Failed to open cash session'));
    } finally { setSaving(false); }
  };

  const closeSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api.post(`/cash-sessions/${current._id}/close`, {
        closingBalance: Number(closeForm.closingBalance),
        closingNote: closeForm.closingNote.trim() || undefined,
      });
      setCloseForm({ closingBalance: '', closingNote: '' });
      setNotice('Cash session closed and reconciled.');
      await load();
    } catch (err: any) {
      setError(errorMessage(err, 'Failed to close cash session'));
    } finally { setSaving(false); }
  };

  if (!FINANCE_ROLES.has(user?.role || '')) {
    return <div className="p-6 lg:p-10 pt-20 lg:pt-10"><div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">You do not have access to cash-session controls.</div></div>;
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300"><Banknote className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wider">Finance Operations</span></div>
            <h1 className="mt-1 text-3xl font-bold text-[var(--color-text-primary)]">Cash Sessions</h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Open a drawer, collect cash, then reconcile the expected balance before closing.</p>
          </div>
          <button type="button" onClick={() => { setError(''); setNotice(''); load(); }} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-secondary)] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>

        {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {notice && <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-950/30 dark:text-green-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

        <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm font-semibold">Current cash session</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">The server calculates expected cash from completed cash payments and refunds.</p></div>
              {current ? <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700 dark:bg-green-900/30 dark:text-green-300"><UnlockKeyhole className="h-3.5 w-3.5" /> Open</span> : <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-tertiary)]"><LockKeyhole className="h-3.5 w-3.5" /> Closed</span>}
            </div>

            {current ? (
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Opening float</p><p className="mt-1 text-xl font-bold">{money(current.openingBalance)}</p></div>
                  <div className="rounded-xl bg-green-50 p-4 dark:bg-green-950/20"><p className="text-xs text-green-700 dark:text-green-300">Cash collected</p><p className="mt-1 text-xl font-bold text-green-700 dark:text-green-300">{money(current.cashCollected)}</p></div>
                  <div className="rounded-xl bg-red-50 p-4 dark:bg-red-950/20"><p className="text-xs text-red-700 dark:text-red-300">Cash refunded</p><p className="mt-1 text-xl font-bold text-red-700 dark:text-red-300">{money(current.cashRefunded)}</p></div>
                  <div className="rounded-xl bg-primary-50 p-4 dark:bg-primary-950/20"><p className="text-xs text-primary-700 dark:text-primary-300">Expected cash</p><p className="mt-1 text-xl font-bold text-primary-700 dark:text-primary-300">{money(current.expectedCash)}</p></div>
                </div>

                {canOperate ? (
                  <form onSubmit={closeSession} className="rounded-xl border border-[var(--color-border-default)] p-4">
                    <div className="mb-4 flex items-center gap-2"><LockKeyhole className="h-4 w-4" /><div><p className="text-sm font-semibold">Close & reconcile</p><p className="text-xs text-[var(--color-text-tertiary)]">Count the physical cash drawer before submitting.</p></div></div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-medium">Physical closing cash<input required min="0" step="0.01" inputMode="decimal" value={closeForm.closingBalance} onChange={(e) => setCloseForm({ ...closeForm, closingBalance: e.target.value })} className="mt-1.5 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" placeholder="0.00" /></label>
                      <label className="text-sm font-medium">Closing note<span className="ml-1 font-normal text-[var(--color-text-tertiary)]">(optional)</span><textarea rows={2} value={closeForm.closingNote} onChange={(e) => setCloseForm({ ...closeForm, closingNote: e.target.value })} className="mt-1.5 w-full resize-none rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" placeholder="Explain a shortage, overage, or handover..." /></label>
                    </div>
                    <div className="mt-4 flex justify-end"><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"><LockKeyhole className="h-4 w-4" />{saving ? 'Reconciling…' : 'Close session'}</button></div>
                  </form>
                ) : null}
              </div>
            ) : canOperate ? (
              <form onSubmit={openSession} className="mt-5 rounded-xl border border-dashed border-[var(--color-border-default)] p-4">
                <div className="mb-4 flex items-center gap-2"><UnlockKeyhole className="h-4 w-4" /><div><p className="text-sm font-semibold">Open a cash session</p><p className="text-xs text-[var(--color-text-tertiary)]">Record the physical float before accepting cash.</p></div></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {isSuperAdmin && <label className="text-sm font-medium">Organization<select required value={openForm.schoolId} onChange={(e) => setOpenForm({ ...openForm, schoolId: e.target.value })} className="mt-1.5 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"><option value="">Select organization…</option>{schools.map((school) => <option key={school._id} value={school._id}>{school.name}</option>)}</select></label>}
                  <label className="text-sm font-medium">Opening float<input required min="0" step="0.01" inputMode="decimal" value={openForm.openingBalance} onChange={(e) => setOpenForm({ ...openForm, openingBalance: e.target.value })} className="mt-1.5 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" placeholder="0.00" /></label>
                  <label className="text-sm font-medium sm:col-span-2">Opening note<span className="ml-1 font-normal text-[var(--color-text-tertiary)]">(optional)</span><textarea rows={2} value={openForm.openingNote} onChange={(e) => setOpenForm({ ...openForm, openingNote: e.target.value })} className="mt-1.5 w-full resize-none rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" placeholder="Drawer handover, float source, or other context..." /></label>
                </div>
                {isSuperAdmin && openForm.schoolId && <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Opening for <strong>{selectedSchool?.name}</strong>.</p>}
                <div className="mt-4 flex justify-end"><button disabled={saving || (isSuperAdmin && !openForm.schoolId)} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"><UnlockKeyhole className="h-4 w-4" />{saving ? 'Opening…' : 'Open session'}</button></div>
              </form>
            ) : <div className="mt-5 rounded-xl bg-[var(--color-surface-secondary)] p-5 text-sm text-[var(--color-text-tertiary)]">There is no open session for your account. Auditors have read-only access to reconciliations.</div>}
          </section>

          <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Control rules</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Cash handling is enforced by the backend.</p></div><Clock3 className="h-5 w-5 text-[var(--color-text-tertiary)]" /></div>
            <ul className="mt-5 space-y-3 text-sm text-[var(--color-text-secondary)]">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />One open session per cashier and organization.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />Expected cash includes completed cash payments and completed refunds.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />Closing records the physical count and calculates the variance.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />Tenant-scoped finance roles cannot cross organization boundaries.</li>
            </ul>
            {current && <div className="mt-5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 text-xs"><p className="font-semibold">Session details</p><p className="mt-1 text-[var(--color-text-tertiary)]">{schoolName(current.school)} · {cashierName(current.cashier)} · opened {new Date(current.openedAt).toLocaleString()}</p></div>}
          </section>
        </div>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Session history</h2><p className="text-xs text-[var(--color-text-tertiary)]">Latest 100 sessions visible to your finance role.</p></div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs"><option value="all">All statuses</option><option value="open">Open</option><option value="closed">Closed</option></select></div>
          {loading ? <div className="py-12 text-center text-sm text-[var(--color-text-tertiary)]">Loading sessions…</div> : sessions.length === 0 ? <div className="py-12 text-center text-sm text-[var(--color-text-tertiary)]">No cash sessions found.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-[var(--color-border-default)]"><tr><th className="px-5 py-3 text-left font-semibold">Organization</th><th className="px-5 py-3 text-left font-semibold">Cashier</th><th className="px-5 py-3 text-right font-semibold">Opening</th><th className="hidden px-5 py-3 text-right font-semibold md:table-cell">Collected</th><th className="hidden px-5 py-3 text-right font-semibold md:table-cell">Expected</th><th className="px-5 py-3 text-right font-semibold">Closing</th><th className="px-5 py-3 text-right font-semibold">Variance</th><th className="px-5 py-3 text-center font-semibold">Status</th></tr></thead><tbody>{sessions.map((session) => { const variance = session.variance || 0; return <tr key={session._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)]"><td className="px-5 py-3.5 font-medium">{schoolName(session.school)}</td><td className="px-5 py-3.5 text-[var(--color-text-secondary)]">{cashierName(session.cashier)}</td><td className="px-5 py-3.5 text-right">{money(session.openingBalance)}</td><td className="hidden px-5 py-3.5 text-right md:table-cell">{money(session.cashCollected)}</td><td className="hidden px-5 py-3.5 text-right md:table-cell">{money(session.expectedCash)}</td><td className="px-5 py-3.5 text-right">{session.status === 'closed' ? money(session.closingBalance) : '—'}</td><td className={`px-5 py-3.5 text-right font-semibold ${variance === 0 ? 'text-green-600' : variance > 0 ? 'text-amber-600' : 'text-red-600'}`}>{session.status === 'closed' ? money(variance) : '—'}</td><td className="px-5 py-3.5 text-center">{session.status === 'closed' ? <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">Closed</span> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Open</span>}</td></tr>; })}</tbody></table></div>}
        </section>
      </div>
    </div>
  );
}

export default CashSessions;
