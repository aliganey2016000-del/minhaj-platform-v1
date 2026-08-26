/**
 * Record Payment — Admin/Org Admin
 * Quick ad-hoc payment recording for a single student (walk-in cash, a
 * donation, anything not tied to a generated Invoice — collecting against
 * an Invoice happens on the Invoices page instead). Shows a printable
 * receipt after a successful record.
 */
import { useEffect, useState, useRef } from 'react';
import { Search, X } from 'lucide-react';
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

interface InvoiceData {
  invoiceId: string;
  paymentId: string;
  studentName: string;
  studentId: string;
  schoolName: string;
  amount: number;
  feeType: string;
  method: string;
  date: string;
  notes: string;
  totalFees: number;
  totalPaid: number;
  totalDue: number;
  discount: number;
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
              ⬇️ Download PDF
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-600 px-6 py-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
            >
              🖨️ Print
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
// Main Component
// ---------------------------------------------------------------------------

export function PaymentsRecord() {
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [selectedStudent, setSelectedStudent] = useState<StudentBrief | null>(null);
  const [recordAmount, setRecordAmount] = useState('');
  const [recordType, setRecordType] = useState('tuition');
  const [recordMethod, setRecordMethod] = useState('cash');
  const [recordNotes, setRecordNotes] = useState('');

  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  // Regenerated after every successful submit, so a retry of the SAME
  // attempt reuses the same key (idempotent) while a genuinely new payment
  // gets a fresh one.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/schools', { params: { limit: '100' } });
        setSchools(data.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !recordAmount || Number(recordAmount) <= 0) {
      setError('Select a student and enter a valid amount'); return;
    }
    setLoading(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/payments', {
        studentId: selectedStudent._id,
        amount: Number(recordAmount),
        discount: 0,
        type: recordType,
        method: recordMethod,
        notes: recordNotes,
        idempotencyKey: idempotencyKeyRef.current,
      });
      idempotencyKeyRef.current = crypto.randomUUID();
      const bal = data.data?.balance;
      const payment = data.data?.payment;

      const selSchool = schools.find(sc => sc._id === selectedStudent.school?._id);
      setInvoiceData({
        invoiceId: `INV-${payment?._id?.slice(-8).toUpperCase() || new Date().getTime().toString(36).toUpperCase()}`,
        paymentId: payment?._id || '',
        studentName: studentLabel(selectedStudent),
        studentId: selectedStudent.studentId || '',
        schoolName: selSchool?.name || selectedStudent.school?.name || 'Masjid Al-Rahma',
        amount: Number(recordAmount),
        feeType: recordType,
        method: recordMethod,
        date: new Date().toLocaleString(),
        notes: recordNotes,
        totalFees: bal?.totalFees || 0,
        totalPaid: bal?.totalPaid || 0,
        totalDue: bal?.totalDue || 0,
        discount: bal?.discount || 0,
      });

      setMessage(`✅ Payment of $${Number(recordAmount).toLocaleString()} recorded successfully!`);
      setRecordAmount(''); setRecordNotes(''); setSelectedStudent(null);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to record'); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">💳 Record Payment</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Record an ad-hoc payment for a single student — cash in hand, a donation, anything not tied to a generated invoice.</p>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card max-w-2xl">
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1 block">Student *</label>
              <StudentSearchPicker value={selectedStudent} onSelect={setSelectedStudent} />
              {selectedStudent && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                    <p className="text-[var(--color-text-tertiary)]">Total Fees</p>
                    <p className="font-bold">${(selectedStudent.totalFees || 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                    <p className="text-[var(--color-text-tertiary)]">Discount</p>
                    <p className="font-bold text-amber-600">${(selectedStudent.discount || 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                    <p className="text-[var(--color-text-tertiary)]">Paid</p>
                    <p className="font-bold text-green-600">${(selectedStudent.totalFeesPaid || 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                    <p className="text-[var(--color-text-tertiary)]">Due</p>
                    <p className="font-bold text-red-600">${(selectedStudent.totalFeesDue || 0).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold mb-1 block">Amount ($) *</label>
              <input type="number" value={recordAmount} onChange={e => setRecordAmount(e.target.value)}
                min={1} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="0.00" required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Type</label>
                <select value={recordType} onChange={e => setRecordType(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                  <option value="tuition">Tuition</option><option value="registration">Registration</option>
                  <option value="exam">Exam Fee</option><option value="material">Materials</option>
                  <option value="donation">Donation</option><option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Method</label>
                <select value={recordMethod} onChange={e => setRecordMethod(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                  <option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option>
                  <option value="mobile_money">Mobile Money</option><option value="online">Online</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Notes</label>
              <input type="text" value={recordNotes} onChange={e => setRecordNotes(e.target.value)}
                placeholder="Optional notes..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors">
              {loading ? 'Processing...' : `💰 Record $${Number(recordAmount || 0).toLocaleString()}`}
            </button>
          </form>
        </div>
      </div>

      {invoiceData && (
        <InvoiceModal invoice={invoiceData} onClose={() => setInvoiceData(null)} />
      )}
    </div>
  );
}

export default PaymentsRecord;
