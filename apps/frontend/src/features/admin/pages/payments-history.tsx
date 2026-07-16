/**
 * Payment History — Admin/Org Admin
 * Search, filter, and manage the status of every recorded transaction.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface PaymentRecord {
  _id: string;
  student: { studentId: string; profile?: { firstName: string; lastName: string } };
  amount: number;
  type: string;
  method: string;
  status: 'completed' | 'pending' | 'refunded';
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c[status] || 'bg-gray-100'}`}>{status}</span>;
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    tuition: '📚 Tuition', registration: '📝 Registration', exam: '📋 Exam',
    material: '📖 Materials', donation: '🎁 Donation', other: '📌 Other',
  };
  return <span className="text-xs font-medium">{labels[type] || type}</span>;
}

function MethodBadge({ method }: { method: string }) {
  const labels: Record<string, string> = {
    cash: '💵 Cash', bank_transfer: '🏦 Bank', mobile_money: '📱 Mobile', online: '💻 Online',
  };
  return <span className="text-xs">{labels[method] || method}</span>;
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

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/payments/${id}/status`, { status: newStatus });
      setPayments((prev) => prev.map((p) => (p._id === id ? { ...p, status: newStatus as PaymentRecord['status'] } : p)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📋 Payment History</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} transaction{total === 1 ? '' : 's'}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input type="text" placeholder="Search by name, ID, or notes..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">All Status</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">All Types</option>
            <option value="tuition">Tuition</option>
            <option value="registration">Registration</option>
            <option value="exam">Exam Fee</option>
            <option value="material">Materials</option>
            <option value="donation">Donation</option>
            <option value="other">Other</option>
          </select>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!loading && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Student</th>
                    <th className="text-center px-5 py-3 font-semibold">Amount</th>
                    <th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Type</th>
                    <th className="text-center px-5 py-3 font-semibold hidden lg:table-cell">Method</th>
                    <th className="text-center px-5 py-3 font-semibold">Status</th>
                    <th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">💰 No payments found</p></td></tr>
                  ) : payments.map((p) => (
                    <tr key={p._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <td className="px-5 py-4">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{p.student?.profile?.firstName} {p.student?.profile?.lastName}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{p.student?.studentId}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="font-bold text-base text-green-600">${p.amount.toLocaleString()}</span>
                      </td>
                      <td className="px-5 py-4 text-center hidden md:table-cell"><TypeBadge type={p.type} /></td>
                      <td className="px-5 py-4 text-center hidden lg:table-cell"><MethodBadge method={p.method} /></td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <select value={p.status} onChange={(e) => handleStatusChange(p._id, e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer">
                          <option value="completed">Completed</option>
                          <option value="pending">Pending</option>
                          <option value="refunded">Refunded</option>
                        </select>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell text-xs text-[var(--color-text-tertiary)]">
                        {new Date(p.createdAt).toLocaleDateString()}
                        <p className="text-[10px]">{new Date(p.createdAt).toLocaleTimeString()}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]">
                <p className="text-xs text-[var(--color-text-tertiary)]">{total} payments</p>
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30">← Prev</button>
                  <span className="text-xs text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30">Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentsHistory;
