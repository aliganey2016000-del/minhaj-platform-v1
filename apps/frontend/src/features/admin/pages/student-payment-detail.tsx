import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Download, Loader2, ReceiptText, WalletCards } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { downloadReceipt, hasReceipt } from '../../../lib/receipts';

interface StudentDetails {
  _id: string;
  studentId: string;
  profile?: { firstName?: string; lastName?: string };
  class?: { title?: string; section?: string };
  totalFees?: number;
  totalFeesPaid?: number;
  totalFeesDue?: number;
  discount?: number;
}

interface PaymentRecord {
  _id: string;
  amount: number;
  refundedAmount?: number;
  discount?: number;
  currency?: string;
  type: string;
  method: string;
  status: string;
  reference?: string;
  notes?: string;
  createdAt: string;
  recordedBy?: { email?: string };
}

interface InvoiceRecord {
  _id: string;
  title: string;
  period: string;
  amount: number;
  discount?: number;
  amountPaid: number;
  amountDue: number;
  status: string;
  issueDate?: string;
  dueDate?: string;
  generatedBy?: { email?: string };
}

interface AdjustmentRecord {
  _id: string;
  type: string;
  valueType: string;
  inputValue: number;
  amount: number;
  reason: string;
  createdAt: string;
  grantedBy?: { email?: string };
  invoice?: { title?: string; period?: string };
}

const typeLabels: Record<string, string> = { tuition: 'Tuition', registration: 'Registration', exam: 'Examination', material: 'Learning materials', donation: 'Donation', other: 'Other' };
const methodLabels: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank transfer', mobile_money: 'Mobile money', online: 'Online payment' };

function money(value: number, currency = 'USD') {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0); }
  catch { return `${currency} ${(value || 0).toLocaleString()}`; }
}

export function StudentPaymentDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      setLoading(true);
      try {
        const [studentResponse, paymentsResponse, invoicesResponse, adjustmentsResponse] = await Promise.all([
          api.get(`/students/${studentId}`),
          api.get('/payments', { params: { studentId, page: '1', limit: '100' } }),
          api.get('/invoices', { params: { studentId, page: '1', limit: '100' } }),
          api.get('/fee-adjustments', { params: { studentId, page: '1', limit: '100' } }),
        ]);
        setStudent(studentResponse.data.data);
        setPayments(paymentsResponse.data.data || []);
        setInvoices(invoicesResponse.data.data || []);
        setAdjustments(adjustmentsResponse.data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load student payment details');
      } finally { setLoading(false); }
    })();
  }, [studentId]);

  if (loading) return <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>;
  if (error || !student) return <div className="p-6 pt-20 lg:p-10 lg:pt-10"><div className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-600">{error || 'Student not found'}</div></div>;

  const name = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId;
  const totalPaid = Number(student.totalFeesPaid || 0);
  const totalDue = Number(student.totalFeesDue || 0);
  const totalCharged = Number(student.totalFees || 0) || totalPaid + totalDue + Number(student.discount || 0);
  const currency = payments[0]?.currency || 'USD';
  const collectionRate = totalCharged > 0 ? Math.min(100, Math.round((totalPaid / totalCharged) * 100)) : 0;
  const activities = [
    ...invoices.map((invoice) => ({ date: invoice.issueDate || invoice.dueDate || '', kind: 'Invoice', title: invoice.title, detail: invoice.period, actor: invoice.generatedBy?.email || 'System', amount: invoice.amount, discount: invoice.discount || 0, paid: invoice.amountPaid, due: invoice.amountDue, status: invoice.status, paymentId: '' })),
    ...adjustments.map((adjustment) => ({ date: adjustment.createdAt, kind: 'Adjustment', title: typeLabels[adjustment.type] || adjustment.type, detail: adjustment.invoice?.title || adjustment.reason, actor: adjustment.grantedBy?.email || '—', amount: adjustment.amount, discount: adjustment.amount, paid: 0, due: 0, status: 'applied', paymentId: '' })),
    ...payments.map((payment) => ({ date: payment.createdAt, kind: 'Payment', title: typeLabels[payment.type] || payment.type, detail: payment.reference ? `Ref: ${payment.reference}` : methodLabels[payment.method] || payment.method, actor: payment.recordedBy?.email || '—', amount: payment.amount, discount: payment.discount || 0, paid: payment.amount, due: 0, status: payment.status, paymentId: payment._id })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <button type="button" onClick={() => navigate('/admin/payments/balances')} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-primary-600"><ArrowLeft className="h-4 w-4" /> Student balances</button>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Payment account</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">{name}</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{student.studentId}{student.class ? ` · ${student.class.title} (${student.class.section})` : ''}</p></div>
          <p className="inline-flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]"><CalendarDays className="h-4 w-4" /> Complete account history</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20"><p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Total charged</p><p className="mt-3 text-2xl font-bold text-blue-800 dark:text-blue-200">{money(totalCharged, currency)}</p><p className="mt-1 text-xs text-blue-700/70 dark:text-blue-300/70">Fees assigned to account</p></div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Total paid</p><p className="mt-3 text-2xl font-bold text-emerald-800 dark:text-emerald-200">{money(totalPaid, currency)}</p><p className="mt-1 text-xs text-emerald-700/70 dark:text-emerald-300/70">Collected to date</p></div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/20"><p className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">Remaining</p><p className="mt-3 text-2xl font-bold text-rose-800 dark:text-rose-200">{money(totalDue, currency)}</p><p className="mt-1 text-xs text-rose-700/70 dark:text-rose-300/70">Current outstanding balance</p></div>
          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5 dark:border-primary-900/50 dark:bg-primary-950/20"><p className="text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Collection rate</p><p className="mt-3 text-2xl font-bold text-primary-800 dark:text-primary-200">{collectionRate}%</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-100 dark:bg-primary-900/40"><div className="h-full rounded-full bg-primary-600" style={{ width: `${collectionRate}%` }} /></div></div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4 sm:px-6"><div><h2 className="text-lg font-bold text-[var(--color-text-primary)]">Financial activity</h2><p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Charges, discounts, payments, and account changes from the beginning</p></div><span className="rounded-full bg-[var(--color-surface-secondary)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">{activities.length} record{activities.length === 1 ? '' : 's'}</span></div>
          {activities.length === 0 ? <div className="px-6 py-14 text-center text-sm text-[var(--color-text-tertiary)]"><ReceiptText className="mx-auto mb-3 h-8 w-8 opacity-50" />No financial activity recorded yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-[var(--color-surface-secondary)]"><tr><th className="px-5 py-3 text-left font-semibold">Date</th><th className="px-5 py-3 text-left font-semibold">Activity</th><th className="px-5 py-3 text-left font-semibold">Handled by</th><th className="px-5 py-3 text-right font-semibold">Amount</th><th className="px-5 py-3 text-right font-semibold">Discount</th><th className="px-5 py-3 text-right font-semibold">Paid / Due</th><th className="px-5 py-3 text-center font-semibold">Status</th><th className="px-5 py-3 text-center font-semibold">Receipt</th></tr></thead><tbody>{activities.map((activity, index) => <tr key={`${activity.kind}-${activity.date}-${index}`} className="border-t border-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-surface-secondary)]"><td className="whitespace-nowrap px-5 py-5 text-xs text-[var(--color-text-tertiary)]">{new Date(activity.date).toLocaleDateString()}<p className="mt-0.5 text-[10px]">{new Date(activity.date).toLocaleTimeString()}</p></td><td className="px-5 py-5"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${activity.kind === 'Payment' ? 'bg-emerald-50 text-emerald-700' : activity.kind === 'Adjustment' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{activity.kind}</span><p className="mt-1 font-semibold text-[var(--color-text-primary)]">{activity.title}</p><p className="mt-0.5 max-w-[260px] truncate text-xs text-[var(--color-text-tertiary)]" title={activity.detail}>{activity.detail}</p></td><td className="px-5 py-5 text-xs text-[var(--color-text-secondary)]">{activity.actor}</td><td className="px-5 py-5 text-right font-bold text-[var(--color-text-primary)]">{money(activity.amount, currency)}</td><td className="px-5 py-5 text-right font-semibold text-amber-600">{activity.discount ? money(activity.discount, currency) : '—'}</td><td className="px-5 py-5 text-right text-xs"><span className="text-emerald-600">{activity.paid ? money(activity.paid, currency) : '—'}</span><span className="text-[var(--color-text-tertiary)]"> / {activity.due ? money(activity.due, currency) : '—'}</span></td><td className="px-5 py-5 text-center"><span className="rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-xs font-semibold capitalize text-[var(--color-text-secondary)]">{activity.status}</span></td><td className="px-5 py-5 text-center">{activity.paymentId && hasReceipt(activity.status) && <button type="button" onClick={() => downloadReceipt(activity.paymentId)} title="Download official receipt" className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 px-2.5 py-1.5 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50 dark:border-primary-900/50 dark:hover:bg-primary-950/30"><Download className="h-3.5 w-3.5" /> Receipt</button>}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </div>
  );
}

export default StudentPaymentDetail;
