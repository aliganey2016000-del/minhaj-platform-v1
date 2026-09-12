import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CreditCard, FileText, Search, ShieldCheck, Wallet, X } from 'lucide-react';
import api from '../../../lib/axios';
import { PaymentReceipt } from './payment-receipt';
import type { PaymentReceiptData } from './payment-receipt';

interface Student {
  _id: string;
  studentId: string;
  profile?: { firstName?: string; lastName?: string };
  school?: { _id?: string; name?: string };
  class?: { _id?: string; title?: string; name?: string };
}

interface Invoice {
  _id: string;
  title: string;
  period: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  discount?: number;
  status: 'pending' | 'partial' | 'paid' | 'void' | string;
  dueDate: string;
}

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const studentName = (s: Student) => `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim() || s.studentId;

function StudentPicker({ value, onChange }: { value: Student | null; onChange: (s: Student | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/students', { params: { search: query.trim(), limit: '20', approvalStatus: 'approved' } });
        setResults(data.data || []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (value) return <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{studentName(value)}</p><p className="font-mono text-xs text-[var(--color-text-tertiary)]">{value.studentId}</p></div><button type="button" onClick={() => onChange(null)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]"><X className="h-4 w-4" /></button></div>;

  return <div ref={ref} className="relative"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search by student ID, phone, or name..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-9 pr-4 text-sm outline-none focus:border-primary-500" /></div>{open && query.trim().length >= 2 && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">{loading ? <p className="px-4 py-4 text-center text-xs text-[var(--color-text-tertiary)]">Searching...</p> : results.length === 0 ? <p className="px-4 py-4 text-center text-xs text-[var(--color-text-tertiary)]">No students found.</p> : results.map(s => <button key={s._id} type="button" onClick={() => { onChange(s); setQuery(''); setOpen(false); }} className="flex w-full items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3 text-left last:border-0 hover:bg-[var(--color-surface-secondary)]"><span><span className="block text-sm font-semibold text-[var(--color-text-primary)]">{studentName(s)}</span><span className="block font-mono text-xs text-[var(--color-text-tertiary)]">{s.studentId}</span></span><span className="text-xs text-[var(--color-text-tertiary)]">Select</span></button>)}</div>}</div>;
}

export function PaymentsRecordInvoice() {
  const [student, setStudent] = useState<Student | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [review, setReview] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceiptData | null>(null);

  useEffect(() => {
    if (!student?._id) { setInvoices([]); setSelectedId(''); setAmount(''); return; }
    setLoadingInvoices(true); setError('');
    api.get(`/invoices/student/${student._id}`).then(({ data }) => {
      const open = ((data.data || []) as Invoice[]).filter(inv => inv.status !== 'void' && Number(inv.amountDue) > 0);
      setInvoices(open);
      const first = open[0];
      setSelectedId(first?._id || ''); setAmount(first ? String(first.amountDue) : '');
    }).catch(err => { setInvoices([]); setSelectedId(''); setAmount(''); setError(err.response?.data?.message || 'Failed to load student invoices'); }).finally(() => setLoadingInvoices(false));
  }, [student?._id]);

  const invoice = useMemo(() => invoices.find(i => i._id === selectedId) || null, [invoices, selectedId]);
  const outstanding = invoices.reduce((sum, i) => sum + Number(i.amountDue || 0), 0);
  const amountNumber = Number(amount);

  const chooseInvoice = (id: string) => { setSelectedId(id); const next = invoices.find(i => i._id === id); setAmount(next ? String(next.amountDue) : ''); setError(''); };

  const reviewPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return setError('Select a student first.');
    if (!invoice) return setError('Select an outstanding invoice before recording a payment.');
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return setError('Enter a valid payment amount.');
    if (amountNumber > Number(invoice.amountDue) + 0.001) return setError(`Payment cannot exceed the invoice balance of ${money(invoice.amountDue)}.`);
    if (!paymentDate) return setError('Payment date is required.');
    setError(''); setMessage(''); setReview(true);
  };

  const submit = async () => {
    if (!student || !invoice) return;
    setLoading(true); setError('');
    try {
      const response = await api.post('/payments', { studentId: student._id, invoiceId: invoice._id, amount: amountNumber, discount: 0, type: 'tuition', method, reference: reference.trim() || undefined, notes: notes.trim() || undefined, paymentDate, idempotencyKey: crypto.randomUUID() });
      const savedPayment = response.data?.data?.payment || response.data?.payment;
      setReceipt({ payment: savedPayment, invoice: { ...invoice, amountPaid: Number(invoice.amountPaid || 0) + amountNumber, amountDue: Math.max(0, Number(invoice.amountDue || 0) - amountNumber) }, student, amount: amountNumber, method, reference: reference.trim(), notes: notes.trim(), paymentDate });
      setMessage(`${money(amountNumber)} payment recorded successfully.`);
      setReview(false); setReference(''); setNotes('');
      const { data } = await api.get(`/invoices/student/${student._id}`);
      const open = (data.data || []).filter((inv: Invoice) => inv.status !== 'void' && Number(inv.amountDue) > 0);
      setInvoices(open);
      const next = open.find((inv: Invoice) => inv._id === invoice._id) || open[0];
      setSelectedId(next?._id || ''); setAmount(next ? String(next.amountDue) : '');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to record payment.'); setReview(false); }
    finally { setLoading(false); }
  };

  if (receipt) return <PaymentReceipt data={receipt} onClose={() => setReceipt(null)} />;

  return <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10"><div className="mx-auto max-w-6xl space-y-6">
    <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700"><CreditCard className="h-3.5 w-3.5" /> Finance desk</div><h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl"><Wallet className="h-7 w-7 text-primary-600" /> Record Invoice Payment</h1><p className="mt-2 text-sm text-[var(--color-text-tertiary)]">Every student payment must be applied to an existing invoice. Walk-in / Ad-hoc invoices are not created automatically.</p></div>
    {message && <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" />{message}</div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
      <form onSubmit={reviewPayment} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-7">
        <div><label className="mb-2 block text-sm font-semibold">Student *</label><StudentPicker value={student} onChange={setStudent} /></div>
        {student && <div className="mt-5 space-y-3"><div className="flex items-center justify-between"><label className="text-sm font-semibold">Outstanding Invoice *</label><span className="text-xs text-[var(--color-text-tertiary)]">Total outstanding: {money(outstanding)}</span></div>{loadingInvoices ? <div className="rounded-xl border border-[var(--color-border-default)] p-4 text-center text-sm text-[var(--color-text-tertiary)]">Loading invoices...</div> : invoices.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><FileText className="mb-2 h-5 w-5" /><p className="font-semibold">No outstanding invoice found</p><p className="mt-1 text-xs">This student cannot receive a payment from this screen until an invoice is created.</p></div> : <div className="space-y-2">{invoices.map(inv => <button key={inv._id} type="button" onClick={() => chooseInvoice(inv._id)} className={`w-full rounded-xl border p-4 text-left transition ${selectedId === inv._id ? 'border-primary-500 bg-primary-50/60 ring-2 ring-primary-500/10' : 'border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]'}`}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{inv.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{inv.period} · Due {new Date(inv.dueDate).toLocaleDateString()}</p></div><span className="shrink-0 text-sm font-bold text-red-600">{money(inv.amountDue)} due</span></div><div className="mt-2 flex gap-4 text-[11px] text-[var(--color-text-tertiary)]"><span>Total {money(inv.amount)}</span><span>Paid {money(inv.amountPaid)}</span><span className="capitalize">{inv.status}</span></div></button>)}</div>}</div>}
        {invoice && <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[var(--color-text-tertiary)]">Invoice Total</p><p className="font-bold">{money(invoice.amount)}</p></div><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[var(--color-text-tertiary)]">Paid</p><p className="font-bold text-emerald-600">{money(invoice.amountPaid)}</p></div><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[var(--color-text-tertiary)]">Remaining</p><p className="font-bold text-red-600">{money(invoice.amountDue)}</p></div></div>}
        {invoice && <div className="mt-5 space-y-4"><div><label className="mb-2 block text-sm font-semibold">Payment Amount *</label><input type="number" min="0.01" max={invoice.amountDue} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-lg font-semibold outline-none focus:border-primary-500" /></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-semibold">Payment Method</label><select value={method} onChange={e => setMethod(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm"><option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="bank_transfer">Bank Transfer</option><option value="online">Online Payment</option></select></div><div><label className="mb-2 block text-sm font-semibold">Payment Date</label><input type="date" value={paymentDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setPaymentDate(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm" /></div></div>{method !== 'cash' && <div><label className="mb-2 block text-sm font-semibold">Reference / Transaction No.</label><input value={reference} onChange={e => setReference(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm" placeholder="EVC, bank slip, transaction number..." /></div>}<div><label className="mb-2 block text-sm font-semibold">Notes</label><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm" /></div><button type="submit" disabled={loading || !invoice} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"><ShieldCheck className="h-4 w-4" /> Review Payment</button></div>}
      </form>
      <aside className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-6"><p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Payment rule</p><h2 className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">Invoice-first collection</h2><p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">Payments are linked directly to an existing invoice. No automatic Walk-in / Ad-hoc invoice is created from this screen.</p><div className="mt-5 space-y-3 text-sm"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>Student identity is verified before collection.</span></div><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>Payment cannot exceed the selected invoice balance.</span></div><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>A branded receipt appears immediately after success.</span></div></div></aside>
    </div>
  </div>{review && invoice && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md rounded-2xl bg-[var(--color-surface-primary)] p-6 shadow-2xl"><h2 className="text-lg font-bold">Confirm Payment</h2><p className="mt-2 text-sm text-[var(--color-text-tertiary)]">You are recording {money(amountNumber)} against <strong>{invoice.title}</strong> for <strong>{student ? studentName(student) : ''}</strong>.</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-xs text-[var(--color-text-tertiary)]">Payment</p><p className="font-bold">{money(amountNumber)}</p></div><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-xs text-[var(--color-text-tertiary)]">Balance after</p><p className="font-bold">{money(Math.max(0, invoice.amountDue - amountNumber))}</p></div></div><div className="mt-6 flex gap-3"><button onClick={() => setReview(false)} disabled={loading} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-3 text-sm font-semibold">Cancel</button><button onClick={submit} disabled={loading} className="flex-1 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white">{loading ? 'Recording...' : 'Confirm & Record'}</button></div></div></div>}
  </div>;
}
