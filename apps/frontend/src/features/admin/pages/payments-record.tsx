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
interface InvoiceBrief { _id: string; title: string; period: string; amount: number; amountPaid: number; amountDue: number; status: string; dueDate: string; }
interface RecentPayment { _id: string; amount: number; type: string; method: string; status: string; createdAt: string; student?: { studentId?: string; profile?: { firstName?: string; lastName?: string } }; }
interface InvoiceData { invoiceId: string; paymentId: string; studentName: string; studentId: string; schoolName: string; amount: number; feeType: string; method: string; reference: string; date: string; notes: string; totalFees: number; totalPaid: number; totalDue: number; discount: number; }
interface DuplicatePayment { amount: number; method: string; reference?: string; createdAt: string; }

const FEE_TYPE_LABELS: Record<string, string> = { tuition: 'Tuition Fee', registration: 'Registration Fee', exam: 'Examination Fee', material: 'Learning Materials', donation: 'Donation', other: 'Other Fee' };
const METHOD_LABELS: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank Transfer', mobile_money: 'Mobile Money', online: 'Online Payment' };

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
            @page { size: A4; margin: 12mm; }
            *, *::before, *::after { box-sizing: border-box; }
            html, body { width: 100%; margin: 0; padding: 0; background: #fff; }
            body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b; }
            .invoice-box { width: 100%; max-width: 190mm; margin: 0 auto; border: 2px solid #10b981; border-radius: 16px; padding: 40px; }
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
            @media print {
              html, body { width: 100% !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
              .invoice-box {
                display: block !important;
                width: 100% !important;
                max-width: 190mm !important;
                margin: 0 auto !important;
                padding: 40px !important;
                box-shadow: none !important;
                transform: none !important;
                position: static !important;
                inset: auto !important;
                left: auto !important;
                right: auto !important;
                border: 2px solid #10b981;
                border-radius: 16px;
              }
              button, .no-print, .print-hidden, .modal-backdrop, .backdrop, .overlay, nav, aside, header, [aria-label='Close'] { display: none !important; }
            }
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
      <div className="bg-white dark:bg-obsidian-900 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()} id="invoice-print-area">
        <div className="text-center border-b-2 border-emerald-500 dark:border-emerald-600 px-8 pt-8 pb-6">
          <h1 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{invoice.schoolName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Official Payment Receipt</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Sahal Education Platform</p>
        </div>
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
        <div className="px-8 py-2 overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b-2 border-emerald-200 dark:border-emerald-800"><th className="text-left py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Description</th><th className="text-right py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Amount</th></tr></thead>
            <tbody><tr className="border-b border-gray-200 dark:border-gray-700"><td className="py-3"><p className="font-semibold text-gray-800 dark:text-gray-200">{FEE_TYPE_LABELS[invoice.feeType] || invoice.feeType}</p>{invoice.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{invoice.notes}</p>}</td><td className="py-3 text-right"><span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">${invoice.amount.toLocaleString()}</span></td></tr><tr className="total-row"><td className="py-3 text-gray-800 dark:text-gray-200">Total Paid (This Transaction)</td><td className="py-3 text-right text-emerald-600 dark:text-emerald-400">${invoice.amount.toLocaleString()}</td></tr></tbody>
          </table>
        </div>
        <div className="px-8 py-4 mx-4 mb-4 rounded-xl bg-gray-50 dark:bg-obsidian-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Account Balance After This Payment</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div><p className="text-xs text-gray-500 dark:text-gray-400">Total Fees</p><p className="text-base font-bold text-gray-800 dark:text-gray-200">${invoice.totalFees.toLocaleString()}</p></div>
            <div><p className="text-xs text-gray-500 dark:text-gray-400">Discount</p><p className="text-base font-bold text-amber-600 dark:text-amber-400">${invoice.discount.toLocaleString()}</p></div>
            <div><p className="text-xs text-gray-500 dark:text-gray-400">Total Paid</p><p className="text-base font-bold text-emerald-600 dark:text-emerald-400">${invoice.totalPaid.toLocaleString()}</p></div>
            <div><p className="text-xs text-gray-500 dark:text-gray-400">Outstanding</p><p className={`text-base font-bold ${invoice.totalDue > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>${invoice.totalDue.toLocaleString()}</p></div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-700" style={{ width: `${invoice.totalFees > 0 ? Math.min(100, Math.round((invoice.totalPaid / invoice.totalFees) * 100)) : 0}%` }} /></div>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-1.5">{invoice.totalFees > 0 ? Math.round((invoice.totalPaid / invoice.totalFees) * 100) : 0}% of total fees collected</p>
        </div>
        <div className="text-center px-8 pb-8 pt-2">
          <div className="flex items-center justify-center gap-4 mb-4"><button onClick={handleDownloadPdf} className="no-print inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"><Download className="h-4 w-4" strokeWidth={1.75} /> Download PDF</button><button onClick={handlePrint} className="no-print inline-flex items-center gap-2 rounded-xl border border-emerald-600 px-6 py-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"><Printer className="h-4 w-4" strokeWidth={1.75} /> Print</button><button onClick={onClose} aria-label="Close" className="no-print inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-6 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-obsidian-700 transition-colors">Close</button></div>
          <div className="stamp inline-block border-2 border-emerald-500 rounded-lg px-6 py-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm -rotate-3 select-none">✔ PAID</div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">This is a computer-generated receipt and does not require a physical signature.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Sahal Education Platform &copy; {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}

function studentLabel(s: StudentBrief): string { return `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim() || s.studentId; }
function getStudentFeeSummary(student: Partial<StudentBrief> | null | undefined) { const totalFeesPaid = Number(student?.totalFeesPaid ?? 0); const totalFeesDue = Number(student?.totalFeesDue ?? 0); const totalFeesSet = Number(student?.totalFees ?? 0); const totalFees = totalFeesSet > 0 ? totalFeesSet : totalFeesPaid + totalFeesDue; const discount = Number(student?.discount ?? 0); return { totalFees, totalFeesPaid, totalFeesDue, discount }; }

function StudentSearchPicker({ value, onSelect }: { value: StudentBrief | null; onSelect: (s: StudentBrief | null) => void }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<StudentBrief[]>([]); const [searching, setSearching] = useState(false); const [open, setOpen] = useState(false); const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  useEffect(() => { if (query.trim().length < 2) { setResults([]); return; } setSearching(true); const t = setTimeout(() => { api.get('/students', { params: { search: query.trim(), limit: 20 } }).then(r => setResults(Array.isArray(r.data) ? r.data : (r.data?.students || r.data?.data || []))).catch(() => setResults([])).finally(() => setSearching(false)); }, 250); return () => clearTimeout(t); }, [query]);
  return <div ref={containerRef}>{/* existing picker UI */}</div>;
}

export default function PaymentsRecord() { return null; }
