/**
 * Reports & Reconciliation — Admin/Org Admin
 * Collection totals over a date range, cashier reconciliation (who
 * collected what), and an overdue-invoices list with a reminder action.
 * Reminders are in-app notifications only — no SMS/WhatsApp/email gateway
 * is configured in this app.
 */

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, BellRing, CalendarDays, CircleDollarSign, ChartNoAxesCombined, RefreshCw, WalletCards, ReceiptText } from 'lucide-react';
import api from '../../../lib/axios';

interface CollectionReport {
  totalCollected: number;
  transactionCount: number;
  byDay: { date: string; amount: number }[];
  byMethod: { method: string; amount: number }[];
  byType: { type: string; amount: number }[];
  grossCollected?: number;
  totalRefunded?: number;
  refundCount?: number;
}

interface Cashier {
  cashierId: string;
  email: string;
  transactionCount: number;
  totalCollected: number;
  totalRefunded?: number;
  netCollected?: number;
  byMethod: { method: string; amount: number }[];
}

interface OverdueInvoice {
  _id: string;
  title: string;
  period: string;
  amountDue: number;
  dueDate: string;
  student?: { studentId: string; profile?: { firstName: string; lastName: string } };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthStartISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
// Defensive money formatter — report payloads can legitimately arrive with
// missing numeric fields (older/lean backend responses, schema virtuals that
// lean() never executed). Never render `.toLocaleString()` straight off an
// API value; doing so crashed the whole page (TypeError: reading
// 'toLocaleString' of undefined).
function fmt(n?: number): string {
  return (Number(n) || 0).toLocaleString();
}

export function PaymentsReports() {
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [rangePreset, setRangePreset] = useState('month');

  const [collection, setCollection] = useState<CollectionReport | null>(null);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [overdue, setOverdue] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderMessage, setReminderMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    if (!from || !to || from > to) { setError('Choose a valid date range.'); setLoading(false); return; }
    const params = { from, to };
    const [collectionResult, reconciliationResult, overdueResult] = await Promise.allSettled([
      api.get('/reports/collection', { params }),
      api.get('/reports/reconciliation', { params }),
      api.get('/reports/overdue'),
    ]);
    if (collectionResult.status === 'fulfilled') setCollection(collectionResult.value.data.data);
    else setError(collectionResult.reason?.response?.data?.message || 'Failed to load collection report');
    if (reconciliationResult.status === 'fulfilled') setCashiers(reconciliationResult.value.data.data?.cashiers || []);
    if (overdueResult.status === 'fulfilled') setOverdue(overdueResult.value.data.data || []);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const exportXlsx = async (type: 'collection' | 'overdue' | 'reconciliation') => {
    try {
      const { data } = await api.get('/reports/export', { params: { type, from, to }, responseType: 'blob' });
      const url = URL.createObjectURL(data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}-report.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export report');
    }
  };

  const sendAllReminders = async () => {
    setSendingReminders(true); setReminderMessage('');
    try {
      const { data } = await api.post('/reports/send-reminders', {});
      setReminderMessage(data.data?.remindersSent > 0 ? `Sent reminders for ${data.data.remindersSent} overdue invoice(s).` : 'No overdue invoices with a notifiable student/parent were found.');
    } catch (err: any) {
      setReminderMessage(err.response?.data?.message || 'Failed to send reminders');
    } finally {
      setSendingReminders(false);
    }
  };

  const ic = 'rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm';

  const applyPreset = (preset: string) => {
    const now = new Date();
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    const start = new Date(now);
    if (preset === 'today') setFrom(iso(now));
    else if (preset === 'week') { start.setDate(now.getDate() - now.getDay()); setFrom(iso(start)); }
    else if (preset === 'month') { start.setDate(1); setFrom(iso(start)); }
    setTo(iso(now));
    setRangePreset(preset);
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 dark:border-primary-900/50 dark:bg-primary-950/30 dark:text-primary-300"><ChartNoAxesCombined className="h-3.5 w-3.5" /> Finance intelligence</div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl"><ChartNoAxesCombined className="h-7 w-7 text-primary-600" /> Reports &amp; Reconciliation</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-tertiary)]">Monitor collections, reconcile operators, and act on overdue balances.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2">
            <CalendarDays className="ml-2 h-4 w-4 text-primary-600" />
            <select value={rangePreset} onChange={(e) => applyPreset(e.target.value)} className="bg-transparent px-1 py-2 text-sm font-semibold text-[var(--color-text-primary)] outline-none"><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom range</option></select>
            {rangePreset === 'custom' && <><input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={ic} /><span className="text-xs text-[var(--color-text-tertiary)]">to</span><input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={ic} /></>}
            <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}
        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!loading && (
          <>
            {collection && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Net collected</p><CircleDollarSign className="h-5 w-5 text-emerald-600" /></div><p className="mt-3 text-2xl font-bold text-emerald-800 dark:text-emerald-200">${fmt(collection.totalCollected)}</p><p className="mt-1 text-xs text-emerald-700/70 dark:text-emerald-300/70">After refunds in selected range</p></div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Gross collected</p><WalletCards className="h-5 w-5 text-blue-600" /></div><p className="mt-3 text-2xl font-bold text-blue-800 dark:text-blue-200">${fmt(collection.grossCollected)}</p><p className="mt-1 text-xs text-blue-700/70 dark:text-blue-300/70">Before refunds</p></div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/20"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">Refunded</p><RefreshCw className="h-5 w-5 text-rose-600" /></div><p className="mt-3 text-2xl font-bold text-rose-800 dark:text-rose-200">${fmt(collection.totalRefunded)}</p><p className="mt-1 text-xs text-rose-700/70 dark:text-rose-300/70">{collection.refundCount || 0} refund transactions</p></div>
              <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5 dark:border-primary-900/50 dark:bg-primary-950/20"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Transactions</p><ReceiptText className="h-5 w-5 text-primary-600" /></div><p className="mt-3 text-2xl font-bold text-primary-800 dark:text-primary-200">{collection.transactionCount}</p><p className="mt-1 text-xs text-primary-700/70 dark:text-primary-300/70">Completed payments</p></div>
            </div>}
            {/* ── Collection Report ── */}
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-6">
              <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="font-bold text-lg text-[var(--color-text-primary)]">Collection Report</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Daily collection trend for the selected period</p></div>
                <button onClick={() => exportXlsx('collection')} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors"><Download className="h-3.5 w-3.5" strokeWidth={1.75} /> Export</button>
              </div>
              {collection ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3 text-center">
                      <p className="text-xl font-bold text-green-600">${fmt(collection.totalCollected)}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">Total Collected</p>
                    </div>
                    <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-center">
                      <p className="text-xl font-bold text-primary-600">{collection.transactionCount ?? 0}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">Transactions</p>
                    </div>
                    {(collection.byMethod || []).slice(0, 2).map((m) => (
                      <div key={m.method} className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-center">
                        <p className="text-xl font-bold">${fmt(m.amount)}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)] capitalize">{(m.method || '').replace('_', ' ')}</p>
                      </div>
                    ))}
                  </div>
                  {(collection.byDay || []).length > 0 && (
                    <div style={{ width: '100%', height: 220 }}>
                      <ResponsiveContainer>
                        <BarChart data={collection.byDay}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                          <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="mt-6 grid gap-4 border-t border-[var(--color-border-subtle)] pt-5 md:grid-cols-2">
                    <div><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">By payment method</p><div className="space-y-3">{(collection.byMethod || []).map((item) => <div key={item.method}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="capitalize text-[var(--color-text-secondary)]">{(item.method || '').replace('_', ' ')}</span><span className="font-semibold text-[var(--color-text-primary)]">${fmt(item.amount)}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-primary-600" style={{ width: `${collection.totalCollected ? Math.min(100, (item.amount / collection.totalCollected) * 100) : 0}%` }} /></div></div>)}</div></div>
                    <div><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">By fee type</p><div className="grid grid-cols-2 gap-2">{(collection.byType || []).map((item) => <div key={item.type} className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="truncate text-xs capitalize text-[var(--color-text-tertiary)]">{item.type}</p><p className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">${fmt(item.amount)}</p></div>)}</div></div>
                  </div>
                </>
              ) : <p className="text-sm text-[var(--color-text-tertiary)]">No data for this range.</p>}
            </div>

            {/* ── Cashier Reconciliation ── */}
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
              <div className="flex flex-col gap-3 p-5 pb-4 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-4">
                <div><h2 className="font-bold text-lg text-[var(--color-text-primary)]">Cashier Reconciliation</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Operator-level collection and refund accountability</p></div>
                <button onClick={() => exportXlsx('reconciliation')} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors"><Download className="h-3.5 w-3.5" strokeWidth={1.75} /> Export</button>
              </div>
              {cashiers.length === 0 ? (
                <p className="text-sm text-[var(--color-text-tertiary)] px-6 pb-6">No completed payments for this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-surface-secondary)] border-y border-[var(--color-border-default)]">
                      <tr>
                        <th className="text-left px-6 py-2.5 font-semibold">Cashier</th>
                        <th className="text-center px-4 py-2.5 font-semibold">Transactions</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Cash</th>
                        <th className="text-right px-6 py-2.5 font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashiers.map((c) => (
                        <tr key={c.cashierId} className="border-b border-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-surface-secondary)]">
                          <td className="px-6 py-4">{c.email}</td>
                          <td className="px-4 py-4 text-center">{c.transactionCount}</td>
                          <td className="px-4 py-4 text-right">${fmt((c.byMethod || []).find((m) => m.method === 'cash')?.amount)}</td>
                          <td className="px-6 py-4 text-right font-semibold">${fmt(c.totalCollected)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Overdue Invoices ── */}
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
              <div className="flex items-center justify-between p-6 pb-4 flex-wrap gap-2">
                <h2 className="font-bold text-lg">Overdue Invoices ({overdue.length})</h2>
                <div className="flex items-center gap-2">
                  <button onClick={sendAllReminders} disabled={sendingReminders || overdue.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"><BellRing className="h-3.5 w-3.5" strokeWidth={1.75} /> {sendingReminders ? 'Sending...' : 'Remind All'}</button>
                  <button onClick={() => exportXlsx('overdue')} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors"><Download className="h-3.5 w-3.5" strokeWidth={1.75} /> Export</button>
                </div>
              </div>
              {reminderMessage && <p className="px-6 pb-2 text-xs text-[var(--color-text-tertiary)]">{reminderMessage}</p>}
              {overdue.length === 0 ? (
                <p className="text-sm text-[var(--color-text-tertiary)] px-6 pb-6">No overdue invoices 🎉</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-surface-secondary)] border-y border-[var(--color-border-default)]">
                      <tr>
                        <th className="text-left px-6 py-2.5 font-semibold">Student</th>
                        <th className="text-left px-4 py-2.5 font-semibold">Invoice</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Amount Due</th>
                        <th className="text-left px-6 py-2.5 font-semibold">Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overdue.map((inv) => (
                        <tr key={inv._id} className="border-b border-[var(--color-border-subtle)]">
                          <td className="px-6 py-2.5">{inv.student?.profile ? `${inv.student.profile.firstName} ${inv.student.profile.lastName}` : inv.student?.studentId || '—'}</td>
                          <td className="px-4 py-2.5">{inv.title} <span className="text-xs text-[var(--color-text-tertiary)]">· {inv.period}</span></td>
                          <td className="px-4 py-2.5 text-right font-semibold text-red-600">${fmt(inv.amountDue)}</td>
                          <td className="px-6 py-2.5 text-xs text-red-600">{new Date(inv.dueDate).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PaymentsReports;
