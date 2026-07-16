/**
 * Payment Center — Admin/Org Admin
 * Comprehensive payment management:
 *   1. Record individual payment (no discount field in UI — clean)
 *   2. Set Fees & Discount per student
 *   3. Bulk charge all students in an org/class
 *   4. Student Balances table with totals
 *   5. Auto-generated Invoice/Receipt modal after successful payment
 */
import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudentBrief {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  class?: { _id: string; title: string; section: string };
  school?: { _id: string; name: string; address?: string; phone?: string; email?: string; logo?: string };
  totalFees?: number;
  totalFeesPaid?: number;
  totalFeesDue?: number;
  discount?: number;
  status?: string;
}

interface SchoolBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; school?: string | { _id: string }; }

interface BalanceSummary {
  totalStudents: number;
  aggregateFees: number;
  aggregatePaid: number;
  aggregateDue: number;
  collectionRate: number;
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
  date: string;
  notes: string;
  // Balance after this payment
  totalFees: number;
  totalPaid: number;
  totalDue: number;
  discount: number;
}

type TabKey = 'record' | 'set-fees' | 'bulk' | 'balances';

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: 'record', label: 'Record Payment', icon: '💳' },
  { key: 'set-fees', label: 'Set Fees', icon: '📝' },
  { key: 'bulk', label: 'Bulk Charge', icon: '⚡' },
  { key: 'balances', label: 'Student Balances', icon: '📊' },
];

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
        <div className="px-8 py-2">
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
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
            >
              🖨️ Print Receipt
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
// Main Component
// ---------------------------------------------------------------------------

export function PaymentsRecord() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<TabKey>('record');
  const [students, setStudents] = useState<StudentBrief[]>([]);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // ── Tab 1: Record Payment ──
  const [recordStudent, setRecordStudent] = useState('');
  const [recordAmount, setRecordAmount] = useState('');
  const [recordType, setRecordType] = useState('tuition');
  const [recordMethod, setRecordMethod] = useState('cash');
  const [recordNotes, setRecordNotes] = useState('');

  // ── Tab 2: Set Fees ──
  const [feesStudent, setFeesStudent] = useState('');
  const [feesTotal, setFeesTotal] = useState('');
  const [feesDiscount, setFeesDiscount] = useState('0');

  // ── Tab 3: Bulk Charge ──
  const [bulkSchool, setBulkSchool] = useState('');
  const [bulkClass, setBulkClass] = useState('');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkDiscount, setBulkDiscount] = useState('0');
  const [bulkType, setBulkType] = useState('tuition');
  const [bulkMethod, setBulkMethod] = useState('cash');
  const [bulkNotes, setBulkNotes] = useState('');

  // ── Tab 4: Balances ──
  const [balanceStudents, setBalanceStudents] = useState<StudentBrief[]>([]);
  const [balanceSummary, setBalanceSummary] = useState<BalanceSummary | null>(null);
  const [balanceSearch, setBalanceSearch] = useState('');
  const [balanceSort, setBalanceSort] = useState('due');
  const [balanceSchool, setBalanceSchool] = useState('');
  const [balanceClass, setBalanceClass] = useState('');
  const [balanceLoading, setBalanceLoading] = useState(false);

  // ── Invoice Modal ──
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);

  // ── Load reference data ──
  useEffect(() => {
    (async () => {
      try {
        const [sRes, cRes] = await Promise.all([
          api.get('/schools', { params: { limit: '100' } }),
          api.get('/classes', { params: { limit: '200' } }),
        ]);
        setSchools(sRes.data.data || []);
        setClasses(cRes.data.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  // ── Load students for dropdowns ──
  useEffect(() => {
    if (activeTab === 'record' || activeTab === 'set-fees') {
      (async () => {
        try {
          const { data } = await api.get('/students', { params: { limit: '200', approvalStatus: 'approved' } });
          setStudents(data.data || []);
        } catch { /* ignore */ }
      })();
    }
  }, [activeTab]);

  // ── Tab 1: Record Payment ──
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordStudent || !recordAmount || Number(recordAmount) <= 0) {
      setError('Select a student and enter a valid amount'); return;
    }
    setLoading(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/payments', {
        studentId: recordStudent,
        amount: Number(recordAmount),
        discount: 0,
        type: recordType,
        method: recordMethod,
        notes: recordNotes,
      });
      const bal = data.data?.balance;
      const payment = data.data?.payment;

      // Show invoice modal
      const selStudent = students.find(s => s._id === recordStudent);
      const selSchool = schools.find(sc => sc._id === selStudent?.school?._id);
      setInvoiceData({
        invoiceId: `INV-${payment?._id?.slice(-8).toUpperCase() || new Date().getTime().toString(36).toUpperCase()}`,
        paymentId: payment?._id || '',
        studentName: `${selStudent?.profile?.firstName || ''} ${selStudent?.profile?.lastName || ''}`.trim(),
        studentId: selStudent?.studentId || '',
        schoolName: selSchool?.name || selStudent?.school?.name || 'Masjid Al-Rahma',
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
      setRecordAmount(''); setRecordNotes('');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to record'); }
    finally { setLoading(false); }
  };

  // ── Tab 2: Set Fees ──
  const handleSetFees = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feesStudent || !feesTotal) { setError('Select student and enter total fees'); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      const { data } = await api.put(`/payments/set-fees/${feesStudent}`, {
        totalFees: Number(feesTotal), discount: Number(feesDiscount),
      });
      const s = data.data;
      setMessage(`✅ Fees set for ${s?.profile?.firstName} ${s?.profile?.lastName}: Total $${s.totalFees}, Discount $${s.discount}, Due $${s.totalFeesDue}`);
      setFeesTotal(''); setFeesDiscount('0');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  // ── Tab 3: Bulk Charge ──
  const handleBulkCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkAmount || Number(bulkAmount) <= 0) { setError('Enter a valid amount'); return; }
    if (isSuperAdmin && !bulkSchool) { setError('Select an organization for bulk charge'); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/payments/bulk-charge', {
        amount: Number(bulkAmount), discount: Number(bulkDiscount),
        type: bulkType, method: bulkMethod, notes: bulkNotes,
        schoolId: bulkSchool || undefined, classId: bulkClass || undefined,
      });
      const r = data.data;
      setMessage(`⚡ Bulk charge applied to ${r.studentsCharged} students! Total: $${r.totalCharged}. Collection Rate: ${r.collectionRate}%`);
      setBulkAmount(''); setBulkDiscount('0'); setBulkNotes('');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  // ── Tab 4: Student Balances ──
  const fetchBalances = useCallback(async () => {
    setBalanceLoading(true); setError('');
    try {
      const params: any = { sort: balanceSort };
      if (balanceSearch) params.search = balanceSearch;
      if (balanceClass) params.classId = balanceClass;
      const { data } = await api.get('/payments/student-balances', { params });
      setBalanceStudents(data.data?.students || []);
      setBalanceSummary(data.data?.summary || null);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load balances'); }
    finally { setBalanceLoading(false); }
  }, [balanceSearch, balanceSort, balanceClass]);

  useEffect(() => {
    if (activeTab === 'balances') fetchBalances();
  }, [activeTab, fetchBalances]);

  // ── Selected student info ──
  const selStudent = students.find(s => s._id === recordStudent);
  const selFeesStudent = students.find(s => s._id === feesStudent);

  const filteredClasses = bulkSchool
    ? classes.filter(c => {
        const schoolId = typeof c.school === 'string' ? c.school : (c.school as any)?._id;
        return schoolId === bulkSchool;
      })
    : classes;

  const balanceFilteredClasses = balanceSchool
    ? classes.filter(c => {
        const schoolId = typeof c.school === 'string' ? c.school : (c.school as any)?._id;
        return schoolId === balanceSchool;
      })
    : classes;

  // ── Render ──
  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">💰 Payment Center</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Record payments, set fees, bulk charge, and track balances</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setMessage(''); setError(''); }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === t.key ? 'bg-primary-600 text-white shadow-sm' : 'bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {/* ──── Tab 1: Record Payment ──── */}
        {activeTab === 'record' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
            <h2 className="text-lg font-bold mb-4">💳 Record Individual Payment</h2>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="text-xs font-semibold mb-1 block">Student *</label>
                <select value={recordStudent} onChange={e => setRecordStudent(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" required>
                  <option value="">Select a student...</option>
                  {students.map(s => (
                    <option key={s._id} value={s._id}>
                      {s.profile?.firstName} {s.profile?.lastName} ({s.studentId}) — Total: ${s.totalFees || 0} | Due: ${s.totalFeesDue || 0}
                    </option>
                  ))}
                </select>
                {selStudent && (
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                    <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                      <p className="text-[var(--color-text-tertiary)]">Total Fees</p>
                      <p className="font-bold">${(selStudent.totalFees || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                      <p className="text-[var(--color-text-tertiary)]">Discount</p>
                      <p className="font-bold text-amber-600">${(selStudent.discount || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                      <p className="text-[var(--color-text-tertiary)]">Paid</p>
                      <p className="font-bold text-green-600">${(selStudent.totalFeesPaid || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                      <p className="text-[var(--color-text-tertiary)]">Due</p>
                      <p className="font-bold text-red-600">${(selStudent.totalFeesDue || 0).toLocaleString()}</p>
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
        )}

        {/* ──── Tab 2: Set Fees ──── */}
        {activeTab === 'set-fees' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
            <h2 className="text-lg font-bold mb-4">📝 Set Total Fees & Discount</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-4">Set what the student owes in total. Discount reduces the expected amount. The balance will auto-recalculate.</p>
            <form onSubmit={handleSetFees} className="space-y-4">
              <div>
                <label className="text-xs font-semibold mb-1 block">Student *</label>
                <select value={feesStudent} onChange={e => setFeesStudent(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" required>
                  <option value="">Select a student...</option>
                  {students.map(s => (
                    <option key={s._id} value={s._id}>
                      {s.profile?.firstName} {s.profile?.lastName} ({s.studentId}) — Current Total: ${s.totalFees || 0}
                    </option>
                  ))}
                </select>
                {selFeesStudent && (
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                    <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                      <p className="text-[var(--color-text-tertiary)]">Current Total</p>
                      <p className="font-bold">${(selFeesStudent.totalFees || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                      <p className="text-[var(--color-text-tertiary)]">Discount</p>
                      <p className="font-bold text-amber-600">${(selFeesStudent.discount || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                      <p className="text-[var(--color-text-tertiary)]">Paid</p>
                      <p className="font-bold text-green-600">${(selFeesStudent.totalFeesPaid || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-center">
                      <p className="text-[var(--color-text-tertiary)]">Due</p>
                      <p className="font-bold text-red-600">${(selFeesStudent.totalFeesDue || 0).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Total Fees ($) *</label>
                  <input type="number" value={feesTotal} onChange={e => setFeesTotal(e.target.value)}
                    min={0} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="e.g. 500" required />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Discount ($)</label>
                  <input type="number" value={feesDiscount} onChange={e => setFeesDiscount(e.target.value)}
                    min={0} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="0" />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors">
                {loading ? 'Saving...' : '📝 Set Fees & Discount'}
              </button>
            </form>
          </div>
        )}

        {/* ──── Tab 3: Bulk Charge ──── */}
        {activeTab === 'bulk' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
            <h2 className="text-lg font-bold mb-4">⚡ Bulk Charge — All Students</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
              Charge a fixed amount to ALL active students. Optionally filter by organization and/or class. A payment record is created for each student.
            </p>
            <form onSubmit={handleBulkCharge} className="space-y-4">
              {isSuperAdmin && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Organization</label>
                    <select value={bulkSchool} onChange={e => setBulkSchool(e.target.value)}
                      className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                      <option value="">All Organizations</option>
                      {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Class (optional)</label>
                    <select value={bulkClass} onChange={e => setBulkClass(e.target.value)}
                      className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                      <option value="">All Classes</option>
                      {filteredClasses.map(c => <option key={c._id} value={c._id}>{c.title} — {c.section}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {!isSuperAdmin && (
                <div>
                  <label className="text-xs font-semibold mb-1 block">Class (optional)</label>
                  <select value={bulkClass} onChange={e => setBulkClass(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                    <option value="">All Classes</option>
                    {filteredClasses.map(c => <option key={c._id} value={c._id}>{c.title} — {c.section}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Amount Per Student ($) *</label>
                  <input type="number" value={bulkAmount} onChange={e => setBulkAmount(e.target.value)}
                    min={1} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="0.00" required />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Discount Per Student ($)</label>
                  <input type="number" value={bulkDiscount} onChange={e => setBulkDiscount(e.target.value)}
                    min={0} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Type</label>
                  <select value={bulkType} onChange={e => setBulkType(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                    <option value="tuition">Tuition</option><option value="registration">Registration</option>
                    <option value="exam">Exam Fee</option><option value="material">Materials</option>
                    <option value="donation">Donation</option><option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Method</label>
                  <select value={bulkMethod} onChange={e => setBulkMethod(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                    <option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option>
                    <option value="mobile_money">Mobile Money</option><option value="online">Online</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Notes</label>
                <input type="text" value={bulkNotes} onChange={e => setBulkNotes(e.target.value)}
                  placeholder="e.g. Monthly tuition — March 2026" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors">
                {loading ? 'Processing...' : '⚡ Apply Bulk Charge to All Students'}
              </button>
            </form>
          </div>
        )}

        {/* ──── Tab 4: Student Balances ──── */}
        {activeTab === 'balances' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="text" placeholder="Search by name or ID..."
                value={balanceSearch} onChange={e => setBalanceSearch(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
                onKeyDown={e => { if (e.key === 'Enter') fetchBalances(); }} />
              {isSuperAdmin && (
                <select value={balanceSchool} onChange={e => setBalanceSchool(e.target.value)}
                  className="flex-1 sm:flex-none sm:w-48 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                  <option value="">All Schools</option>
                  {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              )}
              <select value={balanceClass} onChange={e => setBalanceClass(e.target.value)}
                className="flex-1 sm:flex-none sm:w-48 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                <option value="">All Classes</option>
                {balanceFilteredClasses.map(c => <option key={c._id} value={c._id}>{c.title} — {c.section}</option>)}
              </select>
              <select value={balanceSort} onChange={e => setBalanceSort(e.target.value)}
                className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                <option value="due">Sort: Highest Due</option>
                <option value="paid">Sort: Most Paid</option>
              </select>
              <button onClick={fetchBalances}
                className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 whitespace-nowrap">
                🔍 Apply
              </button>
            </div>

            {balanceSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">${balanceSummary.aggregateFees.toLocaleString()}</p>
                  <p className="text-xs text-blue-600">Total Fees</p>
                </div>
                <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-3 text-center">
                  <p className="text-xl font-bold text-green-700">${balanceSummary.aggregatePaid.toLocaleString()}</p>
                  <p className="text-xs text-green-600">Collected</p>
                </div>
                <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-center">
                  <p className="text-xl font-bold text-red-700">${balanceSummary.aggregateDue.toLocaleString()}</p>
                  <p className="text-xs text-red-600">Outstanding</p>
                </div>
                <div className="rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/30 p-3 text-center">
                  <p className="text-xl font-bold text-purple-700">{balanceSummary.collectionRate}%</p>
                  <p className="text-xs text-purple-600">Collection Rate</p>
                </div>
              </div>
            )}

            {balanceLoading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

            {!balanceLoading && balanceStudents.length > 0 && (
              <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Student</th>
                        <th className="text-center px-4 py-3 font-semibold hidden sm:table-cell">Total Fees</th>
                        <th className="text-center px-4 py-3 font-semibold hidden md:table-cell">Discount</th>
                        <th className="text-center px-4 py-3 font-semibold">Paid</th>
                        <th className="text-center px-4 py-3 font-semibold">Due</th>
                        <th className="text-center px-4 py-3 font-semibold hidden lg:table-cell">Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balanceStudents.map(s => {
                        const pct = (s.totalFees || 0) > 0 ? Math.round(((s.totalFeesPaid || 0) / (s.totalFees || 1)) * 100) : 0;
                        return (
                          <tr key={s._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-semibold">{s.profile?.firstName} {s.profile?.lastName}</p>
                              <p className="text-xs text-[var(--color-text-tertiary)]">{s.studentId}</p>
                            </td>
                            <td className="px-4 py-3 text-center hidden sm:table-cell font-medium">${(s.totalFees || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-center hidden md:table-cell text-amber-600 font-medium">${(s.discount || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-center text-green-600 font-bold">${(s.totalFeesPaid || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-center text-red-600 font-bold">${(s.totalFeesDue || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                    style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <span className="text-xs font-medium">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!balanceLoading && balanceStudents.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center">
                <p className="text-4xl mb-4">📊</p>
                <p className="text-lg font-semibold">No student balances found</p>
                <p className="text-sm text-[var(--color-text-tertiary)]">Set fees first, then come back to see balances.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Invoice / Receipt Modal */}
      {invoiceData && (
        <InvoiceModal invoice={invoiceData} onClose={() => setInvoiceData(null)} />
      )}
    </div>
  );
}

export default PaymentsRecord;