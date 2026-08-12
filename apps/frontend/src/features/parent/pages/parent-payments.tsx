/**
 * Fees & Payments — Parent self-service
 * Shows each linked child's balance, open invoices (with a way to notify the
 * office they want to pay — there's no payment gateway wired into this app,
 * so this can't move money itself, but it beats a dead end), and an
 * expandable payment history.
 */

import { useEffect, useState } from 'react';
import { Download, Bell, Check } from 'lucide-react';
import api from '../../../lib/axios';
import { downloadReceipt, hasReceipt } from '../../../lib/receipts';

interface Child {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  totalFeesPaid?: number;
  totalFeesDue?: number;
}

interface PaymentRecord {
  _id: string;
  amount: number;
  type: string;
  method: string;
  status: 'completed' | 'pending' | 'refunded';
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

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c[status] || 'bg-gray-100'}`}>{status}</span>;
}

function InvoiceRow({ invoice }: { invoice: InvoiceRecord }) {
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
    <div className="rounded-xl bg-[var(--color-surface-secondary)] px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--color-text-primary)]">{invoice.title}</p>
          <p className="text-[10px] text-[var(--color-text-tertiary)]">{invoice.period} · Due {new Date(invoice.dueDate).toLocaleDateString()}{invoice.isOverdue && <span className="ml-1 font-semibold text-red-600">· Overdue</span>}</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-red-600">${invoice.amountDue.toLocaleString()}</p>
          {requested ? (
            <span title="Office notified" className="rounded-lg p-1.5 text-green-600"><Check className="h-3.5 w-3.5" strokeWidth={2} /></span>
          ) : (
            <button type="button" onClick={requestPayment} disabled={requesting} title="Notify the office you want to pay this" className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-primary-600 transition-colors disabled:opacity-50">
              <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {requested && <p className="text-xs text-green-600 mt-1">The office has been notified and will follow up with you.</p>}
    </div>
  );
}

function ChildCard({ child }: { child: Child }) {
  const [expanded, setExpanded] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && payments === null) {
      setLoading(true);
      setError('');
      // allSettled — a failure loading invoices shouldn't also block payment
      // history (and vice versa); each panel degrades independently.
      const [paymentsResult, invoicesResult] = await Promise.allSettled([
        api.get(`/payments/student/${child._id}`),
        api.get(`/invoices/student/${child._id}`),
      ]);
      if (paymentsResult.status === 'fulfilled') {
        setPayments(paymentsResult.value.data.data?.payments || []);
      } else {
        setError(paymentsResult.reason?.response?.data?.message || 'Failed to load payment history');
      }
      if (invoicesResult.status === 'fulfilled') {
        setInvoices((invoicesResult.value.data.data || []).filter((inv: InvoiceRecord) => inv.status !== 'paid'));
      } else {
        setInvoices([]);
      }
      setLoading(false);
    }
  };

  const due = child.totalFeesDue || 0;

  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--color-surface-secondary)] transition-colors">
        <div className="text-left">
          <p className="font-bold">{child.profile?.firstName} {child.profile?.lastName}</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">{child.studentId}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-[var(--color-text-tertiary)]">Paid</p>
            <p className="font-semibold text-green-600">${(child.totalFeesPaid || 0).toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--color-text-tertiary)]">Due</p>
            <p className={`font-semibold ${due > 0 ? 'text-red-600' : 'text-[var(--color-text-tertiary)]'}`}>${due.toLocaleString()}</p>
          </div>
          <svg className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border-subtle)] px-5 py-4 space-y-5">
          {loading && <div className="flex justify-center py-6"><div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && invoices && invoices.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)] mb-2">Open Invoices</p>
              <div className="space-y-2">
                {invoices.map((inv) => <InvoiceRow key={inv._id} invoice={inv} />)}
              </div>
            </div>
          )}

          {!loading && payments && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)] mb-2">Payment History</p>
              {payments.length === 0 ? <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">No payment records yet</p> : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div key={p._id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-4 py-2.5">
                      <div>
                        <p className="font-semibold text-green-600">${p.amount.toLocaleString()}</p>
                        <p className="text-[10px] text-[var(--color-text-tertiary)]">{new Date(p.createdAt).toLocaleDateString()} · {p.method.replace('_', ' ')}</p>
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
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ParentPayments() {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/parents/me/children');
        setChildren(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load your children');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;

  const totalDue = children.reduce((sum, c) => sum + (c.totalFeesDue || 0), 0);

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">💰 Fees & Payments</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {children.length} child{children.length === 1 ? '' : 'ren'}
            {totalDue > 0 && ` · $${totalDue.toLocaleString()} owed in total`}
          </p>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {children.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">👨‍👩‍👧‍👦</p>
            <p className="text-lg">No children linked to your account yet</p>
            <p className="text-sm mt-1">Contact your organization's admin office to link your child.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {children.map((c) => <ChildCard key={c._id} child={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default ParentPayments;
