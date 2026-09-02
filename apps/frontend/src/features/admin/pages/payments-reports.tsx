/**
 * Reports & Reconciliation — Admin/Org Admin
 * Collection totals over a date range, cashier reconciliation (who
 * collected what), and an overdue-invoices list with a reminder action.
 * Reminders are in-app notifications only — no SMS/WhatsApp/email gateway
 * is configured in this app.
 */

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, BellRing } from 'lucide-react';
import api from '../../../lib/axios';

interface CollectionReport {
  totalCollected: number;
  transactionCount: number;
  byDay: { date: string; amount: number }[];
  byMethod: { method: string; amount: number }[];
  byType: { type: string; amount: number }[];
}

interface Cashier {
  cashierId: string;
  email: string;
  transactionCount: number;
  totalCollected: number;
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

  const [collection, setCollection] = useState<CollectionReport | null>(null);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [overdue, setOverdue] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderMessage, setReminderMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
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

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📊 Reports & Reconciliation</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Collection totals, cashier reconciliation, and overdue invoices.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={ic} />
            <span className="text-[var(--color-text-tertiary)] text-sm">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={ic} />
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}
        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!loading && (
          <>
            {/* ── Collection Report ── */}
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg">Collection Report</h2>
                <button onClick={() => exportXlsx('collection')} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors"><Download className="h-3.5 w-3.5" strokeWidth={1.75} /> Export</button>
              </div>
              {collection ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-center">
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
                </>
              ) : <p className="text-sm text-[var(--color-text-tertiary)]">No data for this range.</p>}
            </div>

            {/* ── Cashier Reconciliation ── */}
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
              <div className="flex items-center justify-between p-6 pb-4">
                <h2 className="font-bold text-lg">Cashier Reconciliation</h2>
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
                        <tr key={c.cashierId} className="border-b border-[var(--color-border-subtle)]">
                          <td className="px-6 py-2.5">{c.email}</td>
                          <td className="px-4 py-2.5 text-center">{c.transactionCount}</td>
                          <td className="px-4 py-2.5 text-right">${fmt((c.byMethod || []).find((m) => m.method === 'cash')?.amount)}</td>
                          <td className="px-6 py-2.5 text-right font-semibold">${fmt(c.totalCollected)}</td>
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
