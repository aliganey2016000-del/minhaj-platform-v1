/**
 * Payment History — Admin/Org Admin
 * Financially safe history: completed payments cannot be moved back to pending;
 * refunds are displayed separately from the original transaction.
 */

import { useEffect, useState, useCallback } from 'react';
import { Download, Search, RotateCcw } from 'lucide-react';
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

export function PaymentsHistory() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
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
      const { data } = await api.get('/payments', { params });
      setPayments(data.data || []);
      setTotal(data.meta?.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load payments');
    } finally { setLoading(false); }
  }, [page, search, statusFilter, typeFilter]);

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

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
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

        <div className="flex flex-col gap-3 sm:flex-row">
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
                        <td className="px-5 py-4">
                          <p className="truncate font-semibold">{p.student?.profile?.firstName} {p.student?.profile?.lastName}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{p.student?.studentId}{p.reference ? ` · ${p.reference}` : ''}</p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="font-bold text-green-600">{money(p.amount, currency)}</span>
                          {(p.discount || 0) > 0 && <p className="text-[11px] text-[var(--color-text-tertiary)]">Discount {money(p.discount || 0, currency)}</p>}
                        </td>
                        <td className="hidden px-5 py-4 text-right md:table-cell">
                          {(p.refundedAmount || 0) > 0 ? <span className="font-semibold text-red-600">-{money(p.refundedAmount || 0, currency)}</span> : <span className="text-[var(--color-text-tertiary)]">—</span>}
                        </td>
                        <td className="hidden px-5 py-4 text-center md:table-cell"><TypeBadge type={p.type} /></td>
                        <td className="hidden px-5 py-4 text-center lg:table-cell"><MethodBadge method={p.method} /></td>
                        <td className="px-5 py-4 text-center">
                          {p.status === 'pending' ? (
                            <button type="button" onClick={() => completePayment(p._id)} title="Confirm money received and apply it to the invoice" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300">
                              <RotateCcw className="h-3 w-3" /> Complete
                            </button>
                          ) : <StatusBadge status={p.status} />}
                        </td>
                        <td className="hidden px-5 py-4 text-xs text-[var(--color-text-tertiary)] lg:table-cell">{new Date(p.createdAt).toLocaleDateString()}<p className="text-[10px]">{new Date(p.createdAt).toLocaleTimeString()}</p></td>
                        <td className="px-5 py-4 text-center">
                          {hasReceipt(p.status) && <button type="button" onClick={() => downloadReceipt(p._id)} title="Download official receipt" className="inline-flex rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-primary-600"><Download className="h-4 w-4" strokeWidth={1.75} /></button>}
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
