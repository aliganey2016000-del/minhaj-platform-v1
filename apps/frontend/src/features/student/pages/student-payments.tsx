/**
 * My Fees & Payments — Student self-service
 * Read-only view of the student's own payment history and balance.
 */

import { useEffect, useState } from 'react';
import api from '../../../lib/axios';

interface PaymentRecord {
  _id: string;
  amount: number;
  type: string;
  method: string;
  status: 'completed' | 'pending' | 'refunded';
  notes: string;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  tuition: '📚 Tuition', registration: '📝 Registration', exam: '📋 Exam',
  material: '📖 Materials', donation: '🎁 Donation', other: '📌 Other',
};
const METHOD_LABELS: Record<string, string> = {
  cash: '💵 Cash', bank_transfer: '🏦 Bank Transfer', mobile_money: '📱 Mobile Money', online: '💻 Online',
};

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c[status] || 'bg-gray-100'}`}>{status}</span>;
}

export function StudentPayments() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalDue, setTotalDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/payments/my');
        setPayments(data.data?.payments || []);
        setTotalPaid(data.data?.totalFeesPaid || 0);
        setTotalDue(data.data?.totalFeesDue || 0);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load your payments');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">Retry</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">💰 My Fees & Payments</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{payments.length} transaction{payments.length === 1 ? '' : 's'}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">${totalPaid.toLocaleString()}</p>
            <p className="text-xs text-green-600 dark:text-green-400">Total Paid</p>
          </div>
          <div className={`rounded-xl border p-4 text-center ${totalDue > 0 ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}>
            <p className={`text-2xl font-bold ${totalDue > 0 ? 'text-red-700 dark:text-red-300' : 'text-[var(--color-text-primary)]'}`}>${totalDue.toLocaleString()}</p>
            <p className={`text-xs ${totalDue > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--color-text-tertiary)]'}`}>Balance Due</p>
          </div>
        </div>

        {totalDue > 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-700 dark:text-amber-300">
            ⚠️ You have an outstanding balance of <strong>${totalDue.toLocaleString()}</strong>. Please contact your organization's admin office to settle it.
          </div>
        )}

        {payments.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">💰</p>
            <p className="text-lg">No payment records yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((p) => (
              <div key={p._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-lg text-green-600">${p.amount.toLocaleString()}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{TYPE_LABELS[p.type] || p.type} · {METHOD_LABELS[p.method] || p.method}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                {p.notes && <p className="text-sm text-[var(--color-text-secondary)] mt-2">{p.notes}</p>}
                <p className="text-xs text-[var(--color-text-tertiary)] mt-2">{new Date(p.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentPayments;
