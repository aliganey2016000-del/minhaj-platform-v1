/**
 * Payment History — Admin/Org Admin
 * Financially safe history: completed payments cannot be moved back to pending;
 * refunds are displayed separately from the original transaction.
 */

import { useEffect, useState, useCallback } from 'react';
import { Download, Search, RotateCcw, CalendarDays, CircleDollarSign, ReceiptText } from 'lucide-react';
import api from '../../../lib/axios';
import { downloadReceipt, hasReceipt } from '../../../lib/receipts';

interface PaymentRecord {
  _id: string;
  student: { studentId: string; profile?: { firstName: string; lastName: string } };
  amount: number;
  discount?: number;
  refundedAmount?: number;
  currency?: string;
  reference?: string;
  type: string;
  method: string;
  status: 'completed' | 'pending' | 'refunded';
  createdAt: string;
}

function StatusBadge({ status }: { status: PaymentRecord['status'] }) {
  const config: Record<string, { label: string; className: string }> = {
    completed: { label: 'Completed', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    refunded: { label: 'Refunded', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  };
  const item = config[status] || config.pending;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${item.className}`}>{item.label}</span>;
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = { tuition: 'Tuition', registration: 'Registration', exam: 'Exam', material: 'Materials', donation: 'Donation', other: 'Other' };
  return <span className="text-xs font-medium">{labels[type] || type}</span>;
}

function MethodBadge({ method }: { method: string }) {
  const labels: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank', mobile_money: 'Mobile money', online: 'Online' };
  return <span className="text-xs">{labels[method] || method}</span>;
}

function money(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toLocaleString()}`;
  }
}

function dateRange(preset: string): { from?: string; to?: string } {
  const now = new Date();
  const format = (date: Date) => date.toISOString().slice(0, 10);
  if (preset === 'today') return { from: format(now), to: format(now) };
  const start = new Date(now);
  if (preset === 'week') start.setDate(now.getDate() - now.getDay());
  if (preset === 'month') start.setDate(1);
  return preset === 'custom' ? {} : { from: format(start), to: format(now) };
}

export function PaymentsHistory() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [datePreset, setDatePreset] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page: String(page), limit: '20' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      const range = datePreset === 'custom' ? { from: customFrom, to: customTo } : dateRange(datePreset);
      if (range.from) params.dateFrom = range.from;
      if (range.to) params.dateTo = range.to;
      const { data } = await api.get('/payments', { params });
      setPayments(data.data || []);
      setTotal(data.meta?.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load payments');
    } finally { setLoading(false); }
  }, [page, search, statusFilter, typeFilter, datePreset, customFrom, customTo]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const completePayment = async (id: string) => {
    try {
      await api.patch(`/payments/${id}/status`, { status: 'completed' });
      await fetchPayments();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to complete payment');
    }
  };

  const totalPages = Math.ceil(total / 20);
  const currency = payments[0]?.currency || 'USD';
  const totalCollected = payments.filter((payment) => payment.status === 'completed').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalRefunded = payments.reduce((sum, payment) => sum + Number(payment.refundedAmount || 0), 0);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Payment History</h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{total} transaction{total === 1 ? '' : 's'} · immutable collection history</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-2 text-xs text-[var(--color-text-tertiary)]">
            Completed payments can only be reversed through a refund.
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Total collected</p><CircleDollarSign className="h-5 w-5 text-emerald-600" /></div><p className="mt-3 text-2xl font-bold text-emerald-800 dark:text-emerald-200">{money(totalCollected, currency)}</p><p className="mt-1 text-xs text-emerald-700/70 dark:text-emerald-300/70">Completed payments in filtered results</p></div>
          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5 dark:border-primary-900/50 dark:bg-primary-950/20"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Transactions</p><ReceiptText className="h-5 w-5 text-primary-600" /></div><p className="mt-3 text-2xl font-bold text-primary-800 dark:text-primary-200">{total.toLocaleString()}</p><p className="mt-1 text-xs text-primary-700/70 dark:text-primary-300/70">Matching your current filters</p></div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/20"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">Refunded amount</p><ReceiptText className="h-5 w-5 text-rose-600" /></div><p className="mt-3 text-2xl font-bold text-rose-800 dark:text-rose-200">{money(totalRefunded, currency)}</p><p className="mt-1 text-xs text-rose-700/70 dark:text-rose-300/70">Refunds in loaded results</p></div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:flex-row sm:flex-wrap">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input type="text" placeholder="Search student, ID, notes, or reference..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">All Status</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="refunded">Refunded</option>
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">All Types</option><option value="tuition">Tuition</option><option value="registration">Registration</option><option value="exam">Exam Fee</option><option value="material">Materials</option><option value="donation">Donation</option><option value="other">Other</option>
          </select>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5"><CalendarDays className="h-4 w-4 text-[var(--color-text-tertiary)]" /><select value={datePreset} onChange={(e) => { setDatePreset(e.target.value); setPage(1); }} className="bg-transparent py-1 text-sm outline-none"><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option><option value="custom">Custom Range</option></select></div>
          {datePreset === 'custom' && <><input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" aria-label="From date" /><input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" aria-label="To date" /></>}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Student</th>
                    <th className="px-5 py-3 text-right font-semibold">Collected</th>
                    <th className="hidden px-5 py-3 text-right font-semibold md:table-cell">Refunded</th>
                    <th className="hidden px-5 py-3 text-center font-semibold md:table-cell">Type</th>
                    <th className="hidden px-5 py-3 text-center font-semibold lg:table-cell">Method</th>
                    <th className="px-5 py-3 text-center font-semibold">Status</th>
                    <th className="hidden px-5 py-3 text-left font-semibold lg:table-cell">Date</th>
                    <th className="px-5 py-3 text-center font-semibold">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={8} className="py-16 text-center text-[var(--color-text-tertiary)]"><p className="mb-1 text-lg">No payments found</p><p className="text-xs">Try another filter or search term.</p></td></tr>
                  ) : payments.map((p) => {
                    const currency = p.currency || 'USD';
                    return (
                      <tr key={p._id} className="border-b border-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-surface-secondary)]">
                        <td className="px-5 py-5">
                          <p className="truncate font-semibold">{p.student?.profile?.firstName} {p.student?.profile?.lastName}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{p.student?.studentId}{p.reference ? ` · ${p.reference}` : ''}</p>
                        </td>
                        <td className="px-5 py-5 text-right">
                          <span className="font-bold text-green-600">{money(p.amount, currency)}</span>
                          {(p.discount || 0) > 0 && <p className="text-[11px] text-[var(--color-text-tertiary)]">Discount {money(p.discount || 0, currency)}</p>}
                        </td>
                        <td className="hidden px-5 py-5 text-right md:table-cell">
                          {(p.refundedAmount || 0) > 0 ? <span className="font-semibold text-red-600">-{money(p.refundedAmount || 0, currency)}</span> : <span className="text-[var(--color-text-tertiary)]">—</span>}
                        </td>
                        <td className="hidden px-5 py-5 text-center md:table-cell"><TypeBadge type={p.type} /></td>
                        <td className="hidden px-5 py-5 text-center lg:table-cell"><MethodBadge method={p.method} /></td>
                        <td className="px-5 py-5 text-center">
                          {p.status === 'pending' ? (
                            <button type="button" onClick={() => completePayment(p._id)} title="Confirm money received and apply it to the invoice" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300">
                              <RotateCcw className="h-3 w-3" /> Complete
                            </button>
                          ) : <StatusBadge status={p.status} />}
                        </td>
                        <td className="hidden px-5 py-5 text-xs text-[var(--color-text-tertiary)] lg:table-cell">{new Date(p.createdAt).toLocaleDateString()}<p className="text-[10px]">{new Date(p.createdAt).toLocaleTimeString()}</p></td>
                        <td className="px-5 py-5 text-center">
                          {hasReceipt(p.status) && <button type="button" onClick={() => downloadReceipt(p._id)} title="Download official receipt" className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 px-2.5 py-1.5 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50 dark:border-primary-900/50 dark:hover:bg-primary-950/30"><Download className="h-3.5 w-3.5" strokeWidth={1.75} /><span className="hidden xl:inline">Receipt</span></button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-5 py-3"><p className="text-xs text-[var(--color-text-tertiary)]">{total} payments</p><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium disabled:opacity-30">← Prev</button><span className="text-xs text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium disabled:opacity-30">Next →</button></div></div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentsHistory;
