/**
 * Fees & Payments — Parent self-service
 * Shows each linked child's balance, with an expandable payment history.
 */

import { useEffect, useState } from 'react';
import api from '../../../lib/axios';

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

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c[status] || 'bg-gray-100'}`}>{status}</span>;
}

function ChildCard({ child }: { child: Child }) {
  const [expanded, setExpanded] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && payments === null) {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get(`/payments/student/${child._id}`);
        setPayments(data.data?.payments || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load payment history');
      } finally {
        setLoading(false);
      }
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
        <div className="border-t border-[var(--color-border-subtle)] px-5 py-4">
          {loading && <div className="flex justify-center py-6"><div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && payments && payments.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">No payment records yet</p>}
          {!loading && payments && payments.length > 0 && (
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p._id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-4 py-2.5">
                  <div>
                    <p className="font-semibold text-green-600">${p.amount.toLocaleString()}</p>
                    <p className="text-[10px] text-[var(--color-text-tertiary)]">{new Date(p.createdAt).toLocaleDateString()} · {p.method.replace('_', ' ')}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
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
