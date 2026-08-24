/**
 * Invoices — Admin ledger
 * Bills generated from Fee Structures (or created manually). Collecting a
 * payment here creates a normal Payment record (visible in Payment History
 * exactly like any other payment), updates the invoice's own paid/due, and
 * recalculates the student's totalFeesPaid/totalFeesDue (shown on
 * Overview/Student Balances) from all of their invoices — Invoice is the
 * single source of truth for balances.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, MoreVertical, Wallet, Eye, Ban, Undo2, Download, FileDown, Trash2, type LucideIcon } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { downloadReceipt, hasReceipt } from '../../../lib/receipts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchoolBrief { _id: string; name: string; }
interface FeeStructureBrief { _id: string; title: string; feeType: string; amount: number; billingCycle: string; }
interface ClassBrief { _id: string; title: string; section: string; }

interface InvoiceLineItem { description: string; amount: number; }
interface InvoiceItem {
  _id: string;
  student?: { _id: string; studentId: string; profile?: { firstName: string; lastName: string } };
  school?: { _id: string; name: string };
  feeStructure?: { _id: string; title: string; feeType: string };
  title: string;
  period: string;
  lineItems: InvoiceLineItem[];
  amount: number;
  amountPaid: number;
  amountDue: number;
  isOverdue: boolean;
  status: 'pending' | 'partial' | 'paid' | 'void';
  dueDate: string;
  issueDate: string;
  notes?: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50',
  partial: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900/50',
  paid: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50',
  void: 'bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800',
};

function StatusBadge({ status, isOverdue }: { status: string; isOverdue?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>{status}</span>
      {isOverdue && <span className="rounded-full bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/50 px-2 py-0.5 text-[10px] font-semibold">Overdue</span>}
    </div>
  );
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg max-w-md ${type === 'success' ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'}`}><span>{type === 'success' ? '✅' : '❌'}</span><span>{message}</span><button onClick={onClose} className="ml-2 text-lg leading-none opacity-60 hover:opacity-100">&times;</button></div>;
}

// ---------------------------------------------------------------------------
// Generate Invoices Modal
// ---------------------------------------------------------------------------

function GenerateInvoicesModal({ feeStructures, onClose, onDone }: { feeStructures: FeeStructureBrief[]; onClose: () => void; onDone: () => void }) {
  const [feeStructureId, setFeeStructureId] = useState('');
  const [period, setPeriod] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ eligible: number; alreadyBilled: number; created: number; failed: number } | null>(null);

  const handleGenerate = async () => {
    if (!feeStructureId || !period.trim()) return;
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/invoices/generate-bulk', {
        feeStructureId, period: period.trim(),
        dueDate: dueDate || undefined,
        academicYear: academicYear.trim() || undefined,
      });
      setResult(data.data);
    } catch (err: any) { setError(err.response?.data?.message || err.message || 'Failed to generate invoices'); } finally { setLoading(false); }
  };

  const ic = 'w-full rounded-xl border px-3 py-2 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors border-[var(--color-border-default)]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold text-[var(--color-text-primary)]">🧾 Generate Invoices</h2><button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700 dark:text-green-300">
              ✅ Created {result.created} invoice{result.created !== 1 ? 's' : ''}{result.alreadyBilled > 0 ? `, ${result.alreadyBilled} already billed for this period — skipped` : ''}. {result.eligible} student{result.eligible !== 1 ? 's were' : ' was'} eligible in total.
            </div>
            <button onClick={onDone} className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">Done</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Fee Structure *</label>
              <select className={ic} value={feeStructureId} onChange={e => setFeeStructureId(e.target.value)}>
                <option value="">Select an active fee structure...</option>
                {feeStructures.map(fs => <option key={fs._id} value={fs._id}>{fs.title} — ${(fs.amount ?? 0).toLocaleString()} ({fs.billingCycle.replace('_', ' ')})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Period *</label>
              <input className={ic} value={period} onChange={e => setPeriod(e.target.value)} placeholder="e.g. March 2026, Term 1" />
              <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">A student is billed at most once per fee structure + period — re-running this is always safe.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Due Date</label><input className={ic} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /><p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">Defaults from the structure's due-days offset</p></div>
              <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Academic Year</label><input className={ic} value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="Optional" /></div>
            </div>
            {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} disabled={loading} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleGenerate} disabled={loading || !feeStructureId || !period.trim()} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}Generate</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collect Payment Modal
// ---------------------------------------------------------------------------

function CollectPaymentModal({ invoice, onClose, onDone }: { invoice: InvoiceItem; onClose: () => void; onDone: () => void }) {
  const remaining = (invoice.amount ?? 0) - (invoice.amountPaid ?? 0);
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Generated once when the modal opens and resent unchanged on retry, so a
  // double-click or network retry can't create a duplicate payment.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (amt > remaining + 0.001) { setError(`Amount exceeds remaining balance of $${remaining.toLocaleString()}`); return; }
    setLoading(true); setError('');
    try {
      await api.post(`/invoices/${invoice._id}/collect-payment`, { amount: amt, method, notes: notes.trim() || undefined, idempotencyKey: idempotencyKeyRef.current });
      onDone();
    } catch (err: any) { setError(err.response?.data?.message || err.message || 'Failed to collect payment'); } finally { setLoading(false); }
  };

  const ic = 'w-full rounded-xl border px-3 py-2 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors border-[var(--color-border-default)]';
  const studentName = invoice.student?.profile ? `${invoice.student.profile.firstName} ${invoice.student.profile.lastName}` : invoice.student?.studentId || 'Student';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-[var(--color-text-primary)]">💵 Collect Payment</h2><button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
        <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 mb-4 text-sm space-y-1">
          <p className="font-semibold text-[var(--color-text-primary)]">{studentName} — {invoice.title}</p>
          <p className="text-[var(--color-text-tertiary)]">Amount: ${(invoice.amount ?? 0).toLocaleString()} · Paid: ${(invoice.amountPaid ?? 0).toLocaleString()} · Due: ${remaining.toLocaleString()}</p>
        </div>
        <div className="space-y-3">
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Amount ($) *</label><input className={ic} type="number" min={0.01} max={remaining} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Method</label><select className={ic} value={method} onChange={e => setMethod(e.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="mobile_money">Mobile Money</option><option value="online">Online</option></select></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Notes</label><input className={ic} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></div>
          {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}Collect</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View Details Modal
// ---------------------------------------------------------------------------

interface PaymentEntry { _id: string; amount: number; discount?: number; method: string; createdAt: string; notes?: string; status: 'completed' | 'pending' | 'refunded'; }

function RefundModal({ payment, onClose, onDone }: { payment: PaymentEntry; onClose: () => void; onDone: () => void }) {
  const refundable = Math.max(0, (payment.amount || 0) - (payment.discount || 0));
  const [amount, setAmount] = useState(String(refundable));
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (!reason.trim()) { setError('A reason is required'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/refunds', { paymentId: payment._id, amount: amt, reason: reason.trim() });
      onDone();
    } catch (err: any) { setError(err.response?.data?.message || err.message || 'Failed to issue refund'); } finally { setLoading(false); }
  };

  const ic = 'w-full rounded-xl border px-3 py-2 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors border-[var(--color-border-default)]';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-[var(--color-text-primary)]">↩️ Refund Payment</h2><button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
        <div className="space-y-3">
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Amount ($) *</label><input className={ic} type="number" min={0.01} max={refundable} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Reason *</label><input className={ic} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being refunded?" /></div>
          {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={loading} className="flex-1 rounded-xl bg-red-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}Issue Refund</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk Void Modal — undo a mistaken "Generate Invoices" run. There is no
// hard-delete for Invoice (financial audit trail), so this voids every
// invoice in the chosen batch that has no payments collected yet.
// ---------------------------------------------------------------------------

interface InvoiceBatch { batchId: string; title: string; period: string; createdAt: string; count: number; totalAmount: number; voidableCount: number; }

function BulkVoidModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [batches, setBatches] = useState<InvoiceBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [voidingId, setVoidingId] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/invoices/batches');
      setBatches(data.data || []);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load batches'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleVoid = async (batch: InvoiceBatch) => {
    if (!window.confirm(`Void ${batch.voidableCount} invoice(s) from "${batch.title}" (${batch.period})? This cannot be undone.`)) return;
    setVoidingId(batch.batchId); setError(''); setResult('');
    try {
      const { data } = await api.post(`/invoices/batches/${batch.batchId}/void`, {});
      setResult(data.message);
      await load();
      onDone();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to void batch'); } finally { setVoidingId(''); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2"><h2 className="text-lg font-bold text-[var(--color-text-primary)]">🗑️ Undo a Bulk Generate</h2><button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">Voids every invoice from a "Generate Invoices" run that hasn't been paid yet. Invoices with payments already collected are left untouched and reported separately — invoices are never hard-deleted.</p>
        {result && <div className="mb-3 rounded-lg border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-xs text-green-700 dark:text-green-400">{result}</div>}
        {error && <div className="mb-3 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
        {loading && <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>}
        {!loading && batches.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">No bulk-generated batches found.</p>}
        {!loading && batches.length > 0 && (
          <div className="space-y-2">
            {batches.map(b => (
              <div key={b.batchId} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border-default)] p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{b.title}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{new Date(b.createdAt).toLocaleString()} · {b.count} invoice{b.count !== 1 ? 's' : ''} · ${b.totalAmount.toLocaleString()}{b.voidableCount < b.count ? ` · ${b.count - b.voidableCount} already paid` : ''}</p>
                </div>
                <button
                  onClick={() => handleVoid(b)}
                  disabled={voidingId === b.batchId || b.voidableCount === 0}
                  title={b.voidableCount === 0 ? 'Every invoice in this batch already has a payment' : undefined}
                  className="flex-shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >{voidingId === b.batchId ? 'Voiding…' : `Void ${b.voidableCount}`}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ViewInvoiceModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [invoice, setInvoice] = useState<InvoiceItem | null>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundingPayment, setRefundingPayment] = useState<PaymentEntry | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/invoices/${invoiceId}`);
      setInvoice(data.data.invoice);
      setPayments(data.data.payments || []);
    } finally { setLoading(false); }
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const studentName = invoice?.student?.profile ? `${invoice.student.profile.firstName} ${invoice.student.profile.lastName}` : invoice?.student?.studentId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-[var(--color-text-primary)]">Invoice Details</h2><button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
        {loading && <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>}
        {!loading && invoice && (
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-[var(--color-text-primary)]">{invoice.title}</p>
              <p className="text-sm text-[var(--color-text-tertiary)]">{studentName} · {invoice.period}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border-default)] divide-y divide-[var(--color-border-subtle)]">
              {invoice.lineItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-[var(--color-text-secondary)]">{item.description}</span><span className="font-medium text-[var(--color-text-primary)]">${(item.amount ?? 0).toLocaleString()}</span></div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold"><span>Total</span><span>${(invoice.amount ?? 0).toLocaleString()}</span></div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2"><p className="font-semibold text-[var(--color-text-primary)]">${(invoice.amountPaid ?? 0).toLocaleString()}</p><p className="text-[var(--color-text-tertiary)]">Paid</p></div>
              <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2"><p className="font-semibold text-[var(--color-text-primary)]">${(invoice.amountDue ?? 0).toLocaleString()}</p><p className="text-[var(--color-text-tertiary)]">Due</p></div>
              <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2"><p className="font-semibold text-[var(--color-text-primary)] capitalize">{invoice.status}</p><p className="text-[var(--color-text-tertiary)]">Status</p></div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)] mb-2">Payments Collected</p>
              {payments.length === 0 ? <p className="text-sm text-[var(--color-text-tertiary)]">None yet</p> : (
                <div className="rounded-xl border border-[var(--color-border-default)] divide-y divide-[var(--color-border-subtle)]">
                  {payments.map(p => (
                    <div key={p._id} className="flex items-center justify-between px-3 py-2 text-sm gap-2">
                      <span className="text-[var(--color-text-secondary)]">{new Date(p.createdAt).toLocaleDateString()} · {p.method.replace('_', ' ')}{p.status === 'refunded' && <span className="ml-1.5 text-[10px] font-semibold text-red-600 dark:text-red-400">REFUNDED</span>}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-[var(--color-text-primary)]">${(p.amount ?? 0).toLocaleString()}</span>
                        {hasReceipt(p.status) && (
                          <button onClick={() => downloadReceipt(p._id)} title="Download receipt" className="rounded-lg p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-primary-600 transition-colors"><Download className="h-3.5 w-3.5" strokeWidth={1.75} /></button>
                        )}
                        {p.status !== 'refunded' && (
                          <button onClick={() => setRefundingPayment(p)} title="Refund this payment" className="rounded-lg p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"><Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} /></button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={onClose} className="w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Close</button>
          </div>
        )}
      </div>
      {refundingPayment && (
        <RefundModal
          payment={refundingPayment}
          onClose={() => setRefundingPayment(undefined)}
          onDone={() => { setRefundingPayment(undefined); load(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row Actions
// ---------------------------------------------------------------------------

interface RowAction { label: string; icon: LucideIcon; onClick: () => void; tone: 'default' | 'danger' | 'success'; disabled?: boolean; title?: string; }
const rowActionTone: Record<RowAction['tone'], string> = { default: 'text-primary-600', success: 'text-green-600', danger: 'text-red-600' };

function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  return (<>
    <button ref={btnRef} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="rounded-lg border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-1.5 text-[var(--color-text-secondary)] shadow-sm hover:bg-[var(--color-surface-tertiary)] transition-colors" title="More Actions"><MoreVertical className="h-4 w-4" strokeWidth={1.75} /></button>
    {open && btnRef.current && createPortal(
      <div ref={menuRef} style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().bottom + 4, right: window.innerWidth - btnRef.current.getBoundingClientRect().right, zIndex: 100 }} className="w-48 rounded-xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] shadow-md py-1">
        {actions.map((a) => (<button key={a.label} disabled={a.disabled} title={a.title} onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick(); }} className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${rowActionTone[a.tone]}`}><a.icon className="h-3.5 w-3.5" strokeWidth={1.75} /> {a.label}</button>))}
      </div>,
      document.body,
    )}
  </>);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function InvoicesManage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructureBrief[]>([]);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [feeStructureFilter, setFeeStructureFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [showGenerate, setShowGenerate] = useState(false);
  const [showBulkVoid, setShowBulkVoid] = useState(false);
  const [collectingInvoice, setCollectingInvoice] = useState<InvoiceItem | undefined>(undefined);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get('/schools', { params: { limit: '100' } }); setSchools(data.data || []); } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const params: Record<string, string> = { isActive: 'true', limit: '100' };
        if (filterSchool) params.school = filterSchool;
        const { data } = await api.get('/fee-structures', { params });
        setFeeStructures(data.data || []);
      } catch { setFeeStructures([]); }
      try {
        const params: Record<string, string> = { limit: '200', status: 'active' };
        if (filterSchool) params.schoolId = filterSchool;
        const { data } = await api.get('/classes', { params });
        setClasses(data.data || []);
      } catch { setClasses([]); }
    })();
  }, [filterSchool]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = { limit: '100' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (feeStructureFilter) params.feeStructureId = feeStructureFilter;
      if (classFilter) params.classId = classFilter;
      if (filterSchool) params.school = filterSchool;
      const { data } = await api.get('/invoices', { params });
      setInvoices(data.data || []);
      setSelectedIds([]);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, feeStructureFilter, classFilter, filterSchool]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : invoices.map((inv) => inv._id));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.length} selected invoice(s)? Invoices with payments already collected will be skipped. This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const { data } = await api.delete('/invoices', { data: { ids: selectedIds } });
      setToast({ message: data.message, type: 'success' });
      fetchInvoices();
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to delete invoices', type: 'error' });
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleVoid = async (invoice: InvoiceItem) => {
    if (!window.confirm(`Void invoice "${invoice.title}" for this student?`)) return;
    try {
      await api.patch(`/invoices/${invoice._id}/void`, {});
      setToast({ message: 'Invoice voided', type: 'success' });
      fetchInvoices();
    } catch (err: any) { setToast({ message: err.response?.data?.message || 'Failed to void invoice', type: 'error' }); }
  };

  const buildRowActions = (inv: InvoiceItem): RowAction[] => [
    { label: 'Collect Payment', icon: Wallet, onClick: () => setCollectingInvoice(inv), tone: 'success', disabled: inv.status === 'paid' || inv.status === 'void' },
    { label: 'View Details', icon: Eye, onClick: () => setViewingInvoiceId(inv._id), tone: 'default' },
    { label: 'Void', icon: Ban, onClick: () => handleVoid(inv), tone: 'danger', disabled: inv.status === 'void' || inv.amountPaid > 0, title: inv.amountPaid > 0 ? 'Cannot void — payments already collected' : undefined },
  ];

  const exportCsv = () => {
    const headers = ['Student ID', 'Student Name', 'Title', 'Period', 'Amount', 'Paid', 'Due', 'Status', 'Due Date'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = invoices.map((inv) => {
      const studentName = inv.student?.profile ? `${inv.student.profile.firstName} ${inv.student.profile.lastName}` : '';
      return [inv.student?.studentId || '', studentName, inv.title, inv.period, inv.amount ?? 0, inv.amountPaid ?? 0, inv.amountDue ?? 0, inv.status, new Date(inv.dueDate).toLocaleDateString()].map(escape).join(',');
    });
    const csv = [headers.map(escape).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const headerActions: RowAction[] = [
    { label: 'Generate Invoices', icon: FileText, onClick: () => setShowGenerate(true), tone: 'success' },
    { label: 'Export CSV', icon: FileDown, onClick: exportCsv, tone: 'default', disabled: invoices.length === 0, title: invoices.length === 0 ? 'No invoices to export' : undefined },
    { label: 'Bulk Void (undo generate)', icon: Trash2, onClick: () => setShowBulkVoid(true), tone: 'danger' },
  ];

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">
              <FileText className="h-7 w-7 sm:h-8 sm:w-8 text-primary-600" strokeWidth={1.75} />
              Invoices
            </h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Bills generated from Fee Structures — collect payments and track status here.</p>
          </div>
          <div className="flex-shrink-0"><RowActionsMenu actions={headerActions} /></div>
        </div>

        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            {isSuperAdmin && (<select value={filterSchool} onChange={e => setFilterSchool(e.target.value)} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Organizations</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>)}
            <input type="text" placeholder="Search by student, title, ID..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="flex-1 sm:flex-none sm:w-36 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Status</option><option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="void">Void</option></select>
            <select value={feeStructureFilter} onChange={e => setFeeStructureFilter(e.target.value)} className="flex-1 sm:flex-none sm:w-48 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Fee Structures</option>{feeStructures.map(fs => <option key={fs._id} value={fs._id}>{fs.title}</option>)}</select>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Classes</option>{classes.map(c => <option key={c._id} value={c._id}>{c.title} — {c.section}</option>)}</select>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm">{error}</p></div>}
        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-3">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">{selectedIds.length} invoice{selectedIds.length !== 1 ? 's' : ''} selected</p>
            <button type="button" onClick={handleBulkDelete} disabled={bulkDeleting} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"><Trash2 className="h-4 w-4" strokeWidth={1.75} />{bulkDeleting ? 'Deleting…' : 'Delete Selected'}</button>
          </div>
        )}
        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}
        {!loading && !error && invoices.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card"><p className="text-4xl mb-4">🧾</p><p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No invoices found</p><p className="text-sm text-[var(--color-text-tertiary)]">Click "Generate Invoices" to bill students from an active fee structure.</p></div>}

        {!loading && !error && invoices.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]"><tr>
              <th className="text-center px-3 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-4 w-4 accent-red-600" /></th>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Student</th>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Title / Period</th>
              <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">Amount</th>
              <th className="text-right px-4 py-3 font-semibold whitespace-nowrap hidden md:table-cell">Paid</th>
              <th className="text-right px-4 py-3 font-semibold whitespace-nowrap hidden md:table-cell">Due</th>
              <th className="text-center px-4 py-3 font-semibold whitespace-nowrap">Status</th>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap hidden lg:table-cell">Due Date</th>
              <th className="text-center px-4 py-3 font-semibold whitespace-nowrap">Actions</th>
            </tr></thead>
              <tbody>{invoices.map(inv => {
                const studentName = inv.student?.profile ? `${inv.student.profile.firstName} ${inv.student.profile.lastName}` : inv.student?.studentId || '—';
                return (
                  <tr key={inv._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                    <td className="px-3 py-3 text-center"><input type="checkbox" checked={selectedIds.includes(inv._id)} onChange={() => toggleSelect(inv._id)} className="h-4 w-4 accent-red-600" /></td>
                    <td className="px-4 py-3"><p className="font-semibold text-[var(--color-text-primary)]">{studentName}</p><p className="text-xs text-[var(--color-text-tertiary)]">{inv.student?.studentId}</p></td>
                    <td className="px-4 py-3"><p className="text-[var(--color-text-primary)]">{inv.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{inv.period}</p></td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--color-text-primary)]">${(inv.amount ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-[var(--color-text-secondary)]">${(inv.amountPaid ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-[var(--color-text-secondary)]">${(inv.amountDue ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={inv.status} isOverdue={inv.isOverdue} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell text-[var(--color-text-secondary)]">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-center"><RowActionsMenu actions={buildRowActions(inv)} /></td>
                  </tr>
                );
              })}</tbody></table></div>
          </div>
        )}
      </div>

      {showGenerate && (
        <GenerateInvoicesModal
          feeStructures={feeStructures}
          onClose={() => setShowGenerate(false)}
          onDone={() => { setShowGenerate(false); fetchInvoices(); }}
        />
      )}
      {collectingInvoice && (
        <CollectPaymentModal
          invoice={collectingInvoice}
          onClose={() => setCollectingInvoice(undefined)}
          onDone={() => { setToast({ message: 'Payment collected', type: 'success' }); setCollectingInvoice(undefined); fetchInvoices(); }}
        />
      )}
      {viewingInvoiceId && <ViewInvoiceModal invoiceId={viewingInvoiceId} onClose={() => setViewingInvoiceId(undefined)} />}
      {showBulkVoid && (
        <BulkVoidModal
          onClose={() => setShowBulkVoid(false)}
          onDone={() => { setToast({ message: 'Batch voided', type: 'success' }); fetchInvoices(); }}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
