/**
 * My Fees & Payments — Student self-service
 * Shows open invoices (with a way to notify the office you want to pay —
 * there's no payment gateway wired into this app, so this can't move money
 * itself, but it beats a dead end) and the student's own payment history.
 */

import { useEffect, useState } from 'react';
import { Download, Bell, Check } from 'lucide-react';
import api from '../../../lib/axios';
import { downloadReceipt, hasReceipt } from '../../../lib/receipts';

interface PaymentRecord {
  _id: string;
  amount: number;
  type: string;
  method: string;
  status: 'completed' | 'pending' | 'refunded';
  notes: string;
  createdAt: string;
}

interface InvoiceRecord {
  _id: string;
  title: string;
  period: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  status: 'pending' | 'partial' | 'paid' | 'void';
  isOverdue: boolean;
  dueDate: string;
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

function InvoiceCard({ invoice }: { invoice: InvoiceRecord }) {
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState('');

  const requestPayment = async () => {
    setRequesting(true); setError('');
    try {
      await api.post(`/invoices/${invoice._id}/request-payment`, {});
      setRequested(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send request');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-lg text-red-600">${invoice.amountDue.toLocaleString()}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{invoice.title} · {invoice.period}</p>
        </div>
        {requested ? (
          <span title="Office notified" className="rounded-lg p-1.5 text-green-600"><Check className="h-4 w-4" strokeWidth={2} /></span>
        ) : (
          <button type="button" onClick={requestPayment} disabled={requesting} title="Notify the office you want to pay this" className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 dark:border-primary-800 px-3 py-1.5 text-xs font-semibold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors disabled:opacity-50">
            <Bell className="h-3.5 w-3.5" strokeWidth={1.75} /> Pay now
          </button>
        )}
      </div>
      <p className="text-xs text-[var(--color-text-tertiary)] mt-2">Due {new Date(invoice.dueDate).toLocaleDateString()}{invoice.isOverdue && <span className="ml-1 font-semibold text-red-600">· Overdue</span>}</p>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {requested && <p className="text-xs text-green-600 mt-1">The office has been notified and will follow up with you.</p>}
    </div>
  );
}

export function StudentPayments() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalDue, setTotalDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      // allSettled — a failure loading invoices shouldn't also block payment
      // history (and vice versa); each panel degrades independently.
      const [paymentsResult, invoicesResult] = await Promise.allSettled([
        api.get('/payments/my'),
        api.get('/invoices/my'),
      ]);
      if (paymentsResult.status === 'fulfilled') {
        setPayments(paymentsResult.value.data.data?.payments || []);
        setTotalPaid(paymentsResult.value.data.data?.totalFeesPaid || 0);
        setTotalDue(paymentsResult.value.data.data?.totalFeesDue || 0);
      } else {
        setError(paymentsResult.reason?.response?.data?.message || 'Failed to load your payments');
      }
      if (invoicesResult.status === 'fulfilled') {
        setInvoices((invoicesResult.value.data.data || []).filter((inv: InvoiceRecord) => inv.status !== 'paid'));
      }
      setLoading(false);
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

        {invoices.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)] mb-2">Open Invoices</p>
            <div className="space-y-3">
              {invoices.map((inv) => <InvoiceCard key={inv._id} invoice={inv} />)}
            </div>
          </div>
        )}

        {totalDue > 0 && invoices.length === 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-700 dark:text-amber-300">
            ⚠️ You have an outstanding balance of <strong>${totalDue.toLocaleString()}</strong>. Please contact your organization's admin office to settle it.
          </div>
        )}

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)] mb-2">Payment History</p>
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
                    <div className="flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      {hasReceipt(p.status) && (
                        <button type="button" onClick={() => downloadReceipt(p._id)} title="Download receipt" className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-primary-600 transition-colors">
                          <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </div>
                  {p.notes && <p className="text-sm text-[var(--color-text-secondary)] mt-2">{p.notes}</p>}
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-2">{new Date(p.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentPayments;
