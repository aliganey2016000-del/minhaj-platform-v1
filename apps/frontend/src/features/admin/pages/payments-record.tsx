/**
 * Record Payment — Admin/Org Admin
 * Quick ad-hoc payment recording for a single student (walk-in cash, a
 * donation, anything not tied to a generated Invoice — collecting against
 * an Invoice happens on the Invoices page instead). Shows a printable
 * receipt after a successful record.
 */
import { useEffect, useState, useRef } from 'react';
import { Search, X, CreditCard, Wallet, ShieldCheck, Download, Printer, CheckCircle2, ArrowUpRight, CircleDollarSign, ReceiptText, RefreshCw } from 'lucide-react';
import api from '../../../lib/axios';
import { downloadReceipt } from '../../../lib/receipts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudentBrief {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  school?: { _id: string; name: string; address?: string; phone?: string; email?: string; logo?: string };
  user?: { phone?: string };
  totalFees?: number;
  totalFeesPaid?: number;
  totalFeesDue?: number;
  discount?: number;
}

interface SchoolBrief { _id: string; name: string; }

interface RecentPayment {
  _id: string;
  amount: number;
  type: string;
  method: string;
  status: string;
  createdAt: string;
  student?: { studentId?: string; profile?: { firstName?: string; lastName?: string } };
}

interface InvoiceData {
  invoiceId: string;
  paymentId: string;
  studentName: string;
  studentId: string;
  schoolName: string;
  amount: number;
  feeType: string;
  method: string;
  reference: string;
  date: string;
  notes: string;
  totalFees: number;
  totalPaid: number;
  totalDue: number;
  discount: number;
}

interface DuplicatePayment {
  amount: number;
  method: string;
  reference?: string;
  createdAt: string;
}

const FEE_TYPE_LABELS: Record<string, string> = {
  tuition: 'Tuition Fee',
  registration: 'Registration Fee',
  exam: 'Examination Fee',
  material: 'Learning Materials',
  donation: 'Donation',
  other: 'Other Fee',
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  mobile_money: 'Mobile Money',
  online: 'Online Payment',
};

// ---------------------------------------------------------------------------
// Invoice / Receipt Modal
// ---------------------------------------------------------------------------

function InvoiceModal({ invoice, onClose }: { invoice: InvoiceData; onClose: () => void }) {
  const handlePrint = () => {
    const printContent = document.getElementById('invoice-print-area')?.innerHTML;
    if (!printContent) return;
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Receipt ${invoice.invoiceId}</title>
          <style>
            body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 40px; color: #1e293b; }
            .invoice-box { max-width: 700px; margin: 0 auto; border: 2px solid #10b981; border-radius: 16px; padding: 40px; }
            .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 20px; }
            .header h1 { color: #059669; font-size: 24px; margin: 0; }
            .header .sub { color: #64748b; font-size: 14px; margin-top: 4px; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px; color: #475569; }
            .meta strong { color: #1e293b; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            table th { background: #ecfdf5; color: #059669; text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; }
            table td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
            .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #10b981; }
            .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
            .stamp { display: inline-block; border: 2px solid #10b981; border-radius: 8px; padding: 8px 20px; color: #059669; font-weight: 700; font-size: 14px; margin-top: 16px; transform: rotate(-5deg); }
            @media print { body { padding: 0; } .invoice-box { border: none; border-radius: 0; } }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const handleDownloadPdf = async () => {
    if (!invoice.paymentId) { alert('This receipt has no linked payment record yet — try Print instead.'); return; }
    await downloadReceipt(invoice.paymentId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-obsidian-900 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[95vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        id="invoice-print-area"
      >
        {/* ── Invoice Header ── */}
        <div className="text-center border-b-2 border-emerald-500 dark:border-emerald-600 px-8 pt-8 pb-6">
          <h1 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{invoice.schoolName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Official Payment Receipt</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Masjid Al-Rahma Platform</p>
        </div>

        {/* ── Metadata ── */}
        <div className="px-8 py-4 flex flex-wrap justify-between gap-4 text-sm">
          <div className="space-y-1">
            <p><span className="text-gray-500 dark:text-gray-400">Invoice No:</span> <strong className="text-gray-800 dark:text-gray-200 font-mono">{invoice.invoiceId}</strong></p>
            <p><span className="text-gray-500 dark:text-gray-400">Date & Time:</span> <strong className="text-gray-800 dark:text-gray-200">{invoice.date}</strong></p>
            <p><span className="text-gray-500 dark:text-gray-400">Payment Method:</span> <strong className="text-gray-800 dark:text-gray-200">{METHOD_LABELS[invoice.method] || invoice.method}</strong></p>
            {invoice.reference && <p><span className="text-gray-500 dark:text-gray-400">Reference:</span> <strong className="text-gray-800 dark:text-gray-200 font-mono">{invoice.reference}</strong></p>}
          </div>
          <div className="space-y-1 text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400">Student</p>
            <p className="font-bold text-gray-800 dark:text-gray-200 text-lg">{invoice.studentName}</p>
            <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{invoice.studentId}</p>
          </div>
        </div>

        {/* ── Transaction Table ── */}
        <div className="px-8 py-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-emerald-200 dark:border-emerald-800">
                <th className="text-left py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Description</th>
                <th className="text-right py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-3">
                  <p className="font-semibold text-gray-800 dark:text-gray-200">{FEE_TYPE_LABELS[invoice.feeType] || invoice.feeType}</p>
                  {invoice.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{invoice.notes}</p>}
                </td>
                <td className="py-3 text-right">
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">${invoice.amount.toLocaleString()}</span>
                </td>
              </tr>
              <tr className="total-row">
                <td className="py-3 text-gray-800 dark:text-gray-200">Total Paid (This Transaction)</td>
                <td className="py-3 text-right text-emerald-600 dark:text-emerald-400">${invoice.amount.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Balance Summary ── */}
        <div className="px-8 py-4 mx-4 mb-4 rounded-xl bg-gray-50 dark:bg-obsidian-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Account Balance After This Payment</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Fees</p>
              <p className="text-base font-bold text-gray-800 dark:text-gray-200">${invoice.totalFees.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Discount</p>
              <p className="text-base font-bold text-amber-600 dark:text-amber-400">${invoice.discount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Paid</p>
              <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">${invoice.totalPaid.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Outstanding</p>
              <p className={`text-base font-bold ${invoice.totalDue > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                ${invoice.totalDue.toLocaleString()}
              </p>
            </div>
          </div>
          {/* Mini progress bar */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-700"
              style={{ width: `${invoice.totalFees > 0 ? Math.min(100, Math.round((invoice.totalPaid / invoice.totalFees) * 100)) : 0}%` }}
            />
          </div>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            {invoice.totalFees > 0 ? Math.round((invoice.totalPaid / invoice.totalFees) * 100) : 0}% of total fees collected
          </p>
        </div>

        {/* ── Footer ── */}
        <div className="text-center px-8 pb-8 pt-2">
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} /> Download PDF
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-600 px-6 py-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
            >
              <Printer className="h-4 w-4" strokeWidth={1.75} /> Print
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-6 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-obsidian-700 transition-colors"
            >
              Close
            </button>
          </div>
          <div className="stamp inline-block border-2 border-emerald-500 rounded-lg px-6 py-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm -rotate-3 select-none">
            ✔ PAID
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            This is a computer-generated receipt and does not require a physical signature.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Masjid Al-Rahma Platform &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student Search Picker — type a student ID or phone number (or name) to
// find and pick a student, instead of scrolling a dropdown that only ever
// listed the first 200 approved students (a school with more than that
// simply couldn't record a payment for anyone past #200).
// ---------------------------------------------------------------------------

function studentLabel(s: StudentBrief): string {
  return `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim() || s.studentId;
}

function getStudentFeeSummary(student: Partial<StudentBrief> | null | undefined) {
  const totalFeesPaid = Number(student?.totalFeesPaid ?? 0);
  const totalFeesDue = Number(student?.totalFeesDue ?? 0);
  const totalFeesSet = Number(student?.totalFees ?? 0);
  const totalFees = totalFeesSet > 0 ? totalFeesSet : totalFeesPaid + totalFeesDue;
  const discount = Number(student?.discount ?? 0);

  return {
    totalFees,
    totalFeesPaid,
    totalFeesDue,
    discount,
  };
}

function StudentSearchPicker({ value, onSelect }: { value: StudentBrief | null; onSelect: (s: StudentBrief | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentBrief[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/students', { params: { search: query.trim(), limit: '20', approvalStatus: 'approved' } });
        setResults(data.data || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{studentLabel(value)}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{value.studentId}{value.user?.phone ? ` · ${value.user.phone}` : ''}</p>
        </div>
        <button type="button" onClick={() => { onSelect(null); setQuery(''); }} className="flex-shrink-0 rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-red-600 transition-colors" title="Change student">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search by student ID or phone number..."
          className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] pl-9 pr-4 py-2.5 text-sm"
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
          {searching ? (
            <p className="px-4 py-3 text-xs text-[var(--color-text-tertiary)] text-center">Searching...</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[var(--color-text-tertiary)] text-center">No students found for "{query}".</p>
          ) : (
            results.map((s) => (
              <button
                key={s._id}
                type="button"
                onClick={() => { onSelect(s); setOpen(false); setQuery(''); }}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-surface-tertiary)] transition-colors border-b border-[var(--color-border-subtle)] last:border-0"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--color-text-primary)] truncate">{studentLabel(s)}</span>
                  <span className="block text-xs text-[var(--color-text-tertiary)] font-mono">{s.studentId}{s.user?.phone ? ` · ${s.user.phone}` : ''}</span>
                </span>
                <span className="flex-shrink-0 text-xs text-[var(--color-text-tertiary)]">Due: ${(s.totalFeesDue || 0).toLocaleString()}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm Payment Modal — a financial action deserves a review step before
// it actually hits the API, not just an immediate submit on click.
// ---------------------------------------------------------------------------

interface PendingPayment {
  student: StudentBrief;
  amount: number;
  type: string;
  method: string;
  reference: string;
  notes: string;
  paymentDate: string;
  balanceDue: number;
}

function ConfirmPaymentModal({ pending, duplicate, submitting, onCancel, onConfirm }: { pending: PendingPayment; duplicate: DuplicatePayment | null; submitting: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [largeAmountConfirmed, setLargeAmountConfirmed] = useState(false);
  const isUnusuallyLarge = pending.amount > (pending.balanceDue > 0 ? pending.balanceDue * 10 : 10000);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => !submitting && onCancel()}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Confirm Payment</h2>
        </div>
        <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4 space-y-2.5 text-sm mb-5">
          <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">Student</span><span className="font-semibold text-[var(--color-text-primary)] text-right">{studentLabel(pending.student)}<br /><span className="text-xs font-mono text-[var(--color-text-tertiary)]">{pending.student.studentId}</span></span></div>
          <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">Amount</span><span className="font-bold text-primary-600">${pending.amount.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">Type</span><span className="font-medium text-[var(--color-text-primary)]">{FEE_TYPE_LABELS[pending.type] || pending.type}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">Method</span><span className="font-medium text-[var(--color-text-primary)]">{METHOD_LABELS[pending.method] || pending.method}</span></div>
          {pending.reference && <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">Reference</span><span className="font-medium text-[var(--color-text-primary)] font-mono">{pending.reference}</span></div>}
          <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">Payment date</span><span className="font-medium text-[var(--color-text-primary)]">{new Date(`${pending.paymentDate}T12:00:00`).toLocaleDateString()}</span></div>
        </div>
        {duplicate && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300"><strong>Possible duplicate:</strong> a {duplicate.amount.toLocaleString()} payment for this student was recorded {new Date(duplicate.createdAt).toLocaleTimeString()} via {METHOD_LABELS[duplicate.method] || duplicate.method}. Please verify before continuing.</div>}
        {isUnusuallyLarge && <label className="mb-5 flex cursor-pointer items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"><input type="checkbox" checked={largeAmountConfirmed} onChange={e => setLargeAmountConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-red-600" /> <span><strong>Unusually large amount.</strong> I have verified this amount against the student account before recording it.</span></label>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={submitting} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={submitting || (isUnusuallyLarge && !largeAmountConfirmed)} className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors">{submitting ? 'Recording...' : 'Confirm Payment'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PaymentsRecord() {
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<StudentBrief | null>(null);
  const [recordAmount, setRecordAmount] = useState('');
  const [recordType, setRecordType] = useState('tuition');
  const [recordMethod, setRecordMethod] = useState('cash');
  const [recordReference, setRecordReference] = useState('');
  const [recordNotes, setRecordNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [duplicatePayment, setDuplicatePayment] = useState<DuplicatePayment | null>(null);

  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  // Regenerated after every successful submit, so a retry of the SAME
  // attempt reuses the same key (idempotent) while a genuinely new payment
  // gets a fresh one.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const [balanceLoading, setBalanceLoading] = useState(false);
  const isValid = !!selectedStudent && !!recordAmount && Number(recordAmount) > 0;
  const selectedFeeSummary = getStudentFeeSummary(selectedStudent);

  useEffect(() => {
    if (!selectedStudent?._id) return;
    let cancelled = false;
    setBalanceLoading(true);
    api.get('/payments/student-balances', { params: { search: selectedStudent.studentId } })
      .then(({ data }) => {
        const match = (data.data?.students || []).find((s: StudentBrief) => s._id === selectedStudent._id);
        if (!cancelled && match) {
          setSelectedStudent(prev => prev ? {
            ...prev,
            totalFees: Number(match.totalFees ?? 0),
            totalFeesPaid: Number(match.totalFeesPaid ?? 0),
            totalFeesDue: Number(match.totalFeesDue ?? 0),
            discount: Number(match.discount ?? 0),
          } : prev);
        }
      })
      .catch(() => { /* Keep identity data if balance refresh fails. */ })
      .finally(() => { if (!cancelled) setBalanceLoading(false); });
    return () => { cancelled = true; };
  }, [selectedStudent?._id, selectedStudent?.studentId]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/schools', { params: { limit: '100' } });
        setSchools(data.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchRecentPayments = async () => {
    setLoadingRecent(true);
    try {
      const { data } = await api.get('/payments', { params: { limit: '5', page: '1' } });
      setRecentPayments(data.data || []);
    } catch {
      setRecentPayments([]);
    } finally {
      setLoadingRecent(false);
    }
  };

  useEffect(() => { fetchRecentPayments(); }, []);

  const handleReviewPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !recordAmount || Number(recordAmount) <= 0) {
      setError('Select a student and enter a valid amount'); return;
    }
    const selectedDate = new Date(`${paymentDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oldestAllowed = new Date(today);
    oldestAllowed.setDate(oldestAllowed.getDate() - 30);
    if (!paymentDate || Number.isNaN(selectedDate.getTime()) || selectedDate > today || selectedDate < oldestAllowed) {
      setError('Payment date must be today or within the previous 30 days'); return;
    }
    setError('');
    setDuplicatePayment(null);
    try {
      const { data } = await api.get('/payments/duplicate-check', { params: { studentId: selectedStudent._id, amount: Number(recordAmount) } });
      setDuplicatePayment(data.data?.duplicate || null);
    } catch { /* duplicate checking is advisory and must not block recording */ }
    setPendingPayment({
      student: selectedStudent, amount: Number(recordAmount), type: recordType,
      method: recordMethod, reference: recordReference.trim(), notes: recordNotes, paymentDate,
      balanceDue: selectedFeeSummary.totalFeesDue,
    });
  };

  const handleConfirmPayment = async () => {
    if (!pendingPayment) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/payments', {
        studentId: pendingPayment.student._id,
        amount: pendingPayment.amount,
        discount: 0,
        type: pendingPayment.type,
        method: pendingPayment.method,
        reference: pendingPayment.reference || undefined,
        notes: pendingPayment.notes,
        paymentDate: pendingPayment.paymentDate,
        idempotencyKey: idempotencyKeyRef.current,
      });
      idempotencyKeyRef.current = crypto.randomUUID();
      const bal = data.data?.balance;
      const payment = data.data?.payment;
      const derivedBalance = {
        totalFees: Number(bal?.totalFees ?? 0),
        totalPaid: Number(bal?.totalPaid ?? 0),
        totalDue: Number(bal?.totalDue ?? 0),
        discount: Number(bal?.discount ?? 0),
      };
      if (derivedBalance.totalFees <= 0) {
        derivedBalance.totalFees = derivedBalance.totalPaid + derivedBalance.totalDue;
      }

      const selSchool = schools.find(sc => sc._id === pendingPayment.student.school?._id);
      setInvoiceData({
        // The app's own receipt number (RCT-YYYY-<id>), generated server-side
        // and guaranteed unique — not a client-fabricated id.
        invoiceId: payment?.receiptNumber || `RCT-${new Date().getFullYear()}-${payment?._id?.toUpperCase() || ''}`,
        paymentId: payment?._id || '',
        studentName: studentLabel(pendingPayment.student),
        studentId: pendingPayment.student.studentId || '',
        schoolName: selSchool?.name || pendingPayment.student.school?.name || 'Unknown Organization',
        amount: pendingPayment.amount,
        feeType: pendingPayment.type,
        method: pendingPayment.method,
        reference: pendingPayment.reference,
        date: new Date(`${pendingPayment.paymentDate}T12:00:00`).toLocaleString(),
        notes: pendingPayment.notes,
        totalFees: derivedBalance.totalFees,
        totalPaid: derivedBalance.totalPaid,
        totalDue: derivedBalance.totalDue,
        discount: derivedBalance.discount,
      });

      setMessage(`Payment of $${pendingPayment.amount.toLocaleString()} recorded successfully!`);
      setRecordAmount(''); setRecordReference(''); setRecordNotes(''); setPaymentDate(new Date().toISOString().slice(0, 10)); setSelectedStudent(null); setPendingPayment(null); setDuplicatePayment(null);
      fetchRecentPayments();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to record'); setPendingPayment(null); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 sm:p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 dark:border-primary-900/50 dark:bg-primary-950/30 dark:text-primary-300"><CircleDollarSign className="h-3.5 w-3.5" /> Finance desk</div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl"><CreditCard className="h-7 w-7 text-primary-600" strokeWidth={1.75} /> Record Payment</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-tertiary)]">Record an ad-hoc payment for a single student, then issue a printable receipt.</p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-[var(--color-text-tertiary)] sm:flex"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Review required before recording</div>
        </div>

        {message && <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700"><CheckCircle2 className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)] lg:items-start">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-7">
          <form onSubmit={handleReviewPayment} className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3"><label className="text-sm font-semibold text-[var(--color-text-primary)]">Student *</label><span className="text-[11px] text-[var(--color-text-tertiary)]">Search ID, phone, or name</span></div>
              <StudentSearchPicker value={selectedStudent} onSelect={setSelectedStudent} />
              {selectedStudent && (
                <div className="mt-3">
                  {balanceLoading && (
                    <div className="mb-2 text-center text-[11px] text-[var(--color-text-tertiary)]">Refreshing invoice balance…</div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3 text-center">
                    <p className="text-[var(--color-text-tertiary)]">Total Fees</p>
                    <p className="font-bold">${selectedFeeSummary.totalFees.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3 text-center">
                    <p className="text-[var(--color-text-tertiary)]">Discount</p>
                    <p className="font-bold text-amber-600">${selectedFeeSummary.discount.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3 text-center">
                    <p className="text-[var(--color-text-tertiary)]">Paid</p>
                    <p className="font-bold text-green-600">${selectedFeeSummary.totalFeesPaid.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3 text-center">
                    <p className="text-[var(--color-text-tertiary)]">Due</p>
                    <p className="font-bold text-red-600">${selectedFeeSummary.totalFeesDue.toLocaleString()}</p>
                  </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]">Amount ($) *</label>
              <input type="number" value={recordAmount} onChange={e => setRecordAmount(e.target.value)}
                min={0.01} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-lg font-semibold text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10" placeholder="0.00" required />
              {selectedStudent && (
                <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                  Balance due: ${selectedFeeSummary.totalFeesDue.toLocaleString()}
                  {Number(recordAmount) > selectedFeeSummary.totalFeesDue && Number(recordAmount) > 0 && (
                    <span className="text-amber-600 dark:text-amber-400"> — this exceeds the current balance due</span>
                  )}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]">Payment date *</label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} min={new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)} max={new Date().toISOString().slice(0, 10)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10" required />
              <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">Today or up to 30 days ago</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]">Type</label>
                <select value={recordType} onChange={e => setRecordType(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10">
                  {Object.entries(FEE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]">Method</label>
                <select value={recordMethod} onChange={e => setRecordMethod(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10">
                  {Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            {(recordMethod === 'mobile_money' || recordMethod === 'bank_transfer' || recordMethod === 'online') && (
              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]">Reference / Transaction No.</label>
                <input type="text" value={recordReference} onChange={e => setRecordReference(e.target.value)}
                  placeholder="e.g. EVC-2026-88213 or bank slip number" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10" />
              </div>
            )}
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]">Notes</label>
              <textarea value={recordNotes} onChange={e => setRecordNotes(e.target.value)} rows={2}
                placeholder="Optional notes..." className="w-full resize-y rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10" />
            </div>
            <button type="submit" disabled={loading || !isValid}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary-600/20 transition-colors hover:bg-primary-700 disabled:opacity-60">
              <Wallet className="h-4 w-4" strokeWidth={1.75} />
              {isValid ? `Record $${Number(recordAmount).toLocaleString()} Payment` : 'Record Payment'}
            </button>
          </form>
        </div>
        <aside className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Payment snapshot</p><h2 className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">Ready when you are</h2></div><div className="rounded-xl bg-primary-50 p-2.5 text-primary-600 dark:bg-primary-950/30 dark:text-primary-300"><ReceiptText className="h-5 w-5" /></div></div>
          <div className="mt-6 space-y-4 border-t border-[var(--color-border-subtle)] pt-5 text-sm">
            <div className="flex items-center justify-between gap-4"><span className="text-[var(--color-text-tertiary)]">Student</span><span className="max-w-[170px] truncate text-right font-semibold text-[var(--color-text-primary)]">{selectedStudent ? studentLabel(selectedStudent) : 'Not selected'}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-[var(--color-text-tertiary)]">Amount</span><span className="font-bold text-primary-600">{recordAmount && Number(recordAmount) > 0 ? `$${Number(recordAmount).toLocaleString()}` : '$0.00'}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-[var(--color-text-tertiary)]">Method</span><span className="font-semibold text-[var(--color-text-primary)]">{METHOD_LABELS[recordMethod]}</span></div>
          </div>
          <div className="mt-6 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/20"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" /><p className="text-xs leading-5 text-emerald-800 dark:text-emerald-300">A receipt is generated after confirmation. You can download or print it immediately.</p></div></div>
          <div className="mt-5 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]"><ArrowUpRight className="h-3.5 w-3.5" /> Secure review before submission</div>
        </aside>
        </div>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div><h2 className="text-base font-bold text-[var(--color-text-primary)]">Recent payments</h2><p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">The latest transactions recorded by your organization</p></div>
            <button type="button" onClick={fetchRecentPayments} disabled={loadingRecent} className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-secondary)] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loadingRecent ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
          {loadingRecent && recentPayments.length === 0 ? <div className="px-6 py-10 text-center text-xs text-[var(--color-text-tertiary)]">Loading recent payments...</div> : recentPayments.length === 0 ? <div className="px-6 py-10 text-center text-xs text-[var(--color-text-tertiary)]">No payments recorded yet.</div> : (
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {recentPayments.map((payment) => {
                const name = `${payment.student?.profile?.firstName || ''} ${payment.student?.profile?.lastName || ''}`.trim() || payment.student?.studentId || 'Unknown student';
                return <div key={payment._id} className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--color-surface-secondary)] sm:px-6"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{name}</p><p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{payment.student?.studentId || 'No ID'} · {METHOD_LABELS[payment.method] || payment.method} · {new Date(payment.createdAt).toLocaleDateString()}</p></div><div className="flex flex-shrink-0 items-center gap-3"><span className="hidden rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 sm:inline-flex">{payment.status}</span><span className="text-sm font-bold text-emerald-600">${Number(payment.amount || 0).toLocaleString()}</span></div></div>;
              })}
            </div>
          )}
        </section>
      </div>

      {pendingPayment && (
        <ConfirmPaymentModal
          pending={pendingPayment}
          duplicate={duplicatePayment}
          submitting={loading}
          onCancel={() => { setPendingPayment(null); setDuplicatePayment(null); }}
          onConfirm={handleConfirmPayment}
        />
      )}
      {invoiceData && (
        <InvoiceModal invoice={invoiceData} onClose={() => setInvoiceData(null)} />
      )}
    </div>
  );
}

export default PaymentsRecord;
