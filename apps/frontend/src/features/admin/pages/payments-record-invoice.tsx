import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CreditCard, FileText, Search, ShieldCheck, Wallet, X, History } from 'lucide-react';
import { PaymentsHistory } from './payments-history';
import api from '../../../lib/axios';
import { PaymentReceipt } from './payment-receipt';
import type { PaymentReceiptData } from './payment-receipt';

interface Student {
  _id: string;
  studentId: string;
  profile?: { firstName?: string; lastName?: string };
  school?: { _id?: string; name?: string };
  class?: { _id?: string; title?: string; name?: string; section?: string };
  user?: { email?: string; phone?: string };
}

interface ClassOption {
  _id: string;
  title: string;
  section?: string;
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

function StudentPicker({ value, onChange, classId }: { value: Student | null; onChange: (s: Student | null) => void; classId: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const term = query.trim();
  const canSearch = term.length >= 2 || (Boolean(classId) && term.length === 0);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    let current = true;
    if (!canSearch) {
      setResults([]);
      setLoading(false);
      setLookupError('');
      return () => { current = false; };
    }
    setLoading(true);
    setLookupError('');
    setResults([]);
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/students', {
          params: {
            ...(term ? { search: term } : {}),
            ...(classId ? { classId } : {}),
            limit: '20',
            approvalStatus: 'approved',
            sortBy: 'studentId',
            sortDir: 'asc',
          },
        });
        if (current) setResults(data.data || []);
      } catch {
        if (current) { setResults([]); setLookupError('Could not load students. Try again.'); }
      } finally {
        if (current) setLoading(false);
      }
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [query, classId, canSearch, term]);

  if (value) return <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{studentName(value)}</p><p className="truncate font-mono text-xs text-[var(--color-text-tertiary)]">{value.studentId}{value.user?.email ? ` · ${value.user.email}` : ''}</p></div><button type="button" aria-label="Clear selected student" onClick={() => onChange(null)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]"><X className="h-4 w-4" /></button></div>;

  return <div ref={ref} className="relative">
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input aria-label="Find student by name, ID, email, or phone" value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Name, ID, email, or phone..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-9 pr-4 text-sm outline-none focus:border-primary-500" /></div>
    {open && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
      {!canSearch ? <p className="px-4 py-4 text-center text-xs text-[var(--color-text-tertiary)]">Enter at least 2 characters or select a class to browse students.</p> : loading ? <p className="px-4 py-4 text-center text-xs text-[var(--color-text-tertiary)]">Searching...</p> : lookupError ? <p role="alert" className="px-4 py-4 text-center text-xs text-red-600">{lookupError}</p> : results.length === 0 ? <p className="px-4 py-4 text-center text-xs text-[var(--color-text-tertiary)]">No students found.</p> : <>
        {results.map(s => <button key={s._id} type="button" onClick={() => { onChange(s); setQuery(''); setOpen(false); }} className="flex w-full items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3 text-left last:border-0 hover:bg-[var(--color-surface-secondary)]"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">{studentName(s)}</span><span className="block truncate font-mono text-xs text-[var(--color-text-tertiary)]">{s.studentId}{s.user?.email ? ` · ${s.user.email}` : ''}</span>{!classId && s.class?.title && <span className="block truncate text-xs text-[var(--color-text-tertiary)]">{s.class.title}{s.class.section ? ` · ${s.class.section}` : ''}</span>}</span><span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">Select</span></button>)}
        {results.length === 20 && <p className="px-3 py-2 text-center text-xs text-[var(--color-text-tertiary)]">Showing first 20. Type a name, ID, email or phone to narrow results.</p>}
      </>}
    </div>}
  </div>;
}

function PaymentForm({ embedded = false }: { embedded?: boolean }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('mobile_money');
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
    let current = true;
    const loadClasses = async () => {
      setClassesLoading(true);
      setClassesError(false);
      try {
        const all: ClassOption[] = [];
        let page = 1;
        while (current) {
          const { data } = await api.get('/classes', { params: { status: 'active', limit: '200', page } });
          all.push(...(data.data || []));
          if (!data.meta?.hasNextPage) break;
          page += 1;
        }
        if (current) setClasses(all.sort((a, b) => `${a.title} ${a.section || ''}`.localeCompare(`${b.title} ${b.section || ''}`, undefined, { numeric: true })));
      } catch {
        if (current) { setClasses([]); setClassesError(true); }
      } finally {
        if (current) setClassesLoading(false);
      }
    };
    void loadClasses();
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    if (!student?._id) { setInvoices([]); setSelectedId(''); setAmount(''); setLoadingInvoices(false); return; }
    setInvoices([]); setSelectedId(''); setAmount('');
    setLoadingInvoices(true); setError('');
    api.get(`/invoices/student/${student._id}`).then(({ data }) => {
      if (!current) return;
      const open = ((data.data || []) as Invoice[]).filter(inv => inv.status !== 'void' && Number(inv.amountDue) > 0);
      setInvoices(open);
      const first = open[0];
      setSelectedId(first?._id || ''); setAmount(first ? String(first.amountDue) : '');
    }).catch(err => {
      if (!current) return;
      setInvoices([]); setSelectedId(''); setAmount('');
      setError(err.response?.data?.message || 'Failed to load student invoices');
    }).finally(() => { if (current) setLoadingInvoices(false); });
    return () => { current = false; };
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

  return <div className={embedded ? "bg-[var(--color-surface-secondary)]" : "min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10"}><div className={embedded ? "mx-auto max-w-6xl space-y-6" : "mx-auto max-w-6xl space-y-6"}>
    <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700"><CreditCard className="h-3.5 w-3.5" /> Finance desk</div><h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl"><Wallet className="h-7 w-7 text-primary-600" /> Record Invoice Payment</h1><p className="mt-2 text-sm text-[var(--color-text-tertiary)]">Every student payment must be applied to an existing invoice. Walk-in / Ad-hoc invoices are not created automatically.</p></div>
    {message && <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" />{message}</div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
      <form onSubmit={reviewPayment} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="payment-class-filter" className="mb-2 block text-sm font-semibold">Class filter</label><select id="payment-class-filter" value={classId} onChange={e => { setClassId(e.target.value); setStudent(null); setError(''); }} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 text-sm outline-none focus:border-primary-500"><option value="">All active classes</option>{classes.map(c => <option key={c._id} value={c._id}>{c.title}{c.section ? ` · ${c.section}` : ''}</option>)}</select>{classesLoading && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Loading classes...</p>}{classesError && <p className="mt-1 text-xs text-amber-600">Could not load classes. You can still search all students.</p>}</div>
          <div><label className="mb-2 block text-sm font-semibold">Student filter *</label><StudentPicker value={student} onChange={setStudent} classId={classId} /></div>
        </div>
        {student && <div className="mt-5 space-y-3"><div className="flex items-center justify-between"><label className="text-sm font-semibold">Outstanding Invoice *</label><span className="text-xs text-[var(--color-text-tertiary)]">Total outstanding: {money(outstanding)}</span></div>{loadingInvoices ? <div className="rounded-xl border border-[var(--color-border-default)] p-4 text-center text-sm text-[var(--color-text-tertiary)]">Loading invoices...</div> : invoices.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><FileText className="mb-2 h-5 w-5" /><p className="font-semibold">No outstanding invoice found</p><p className="mt-1 text-xs">This student cannot receive a payment from this screen until an invoice is created.</p></div> : <div className="space-y-2">{invoices.map(inv => <button key={inv._id} type="button" onClick={() => chooseInvoice(inv._id)} className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${selectedId === inv._id ? 'border-emerald-500 bg-emerald-950/40 ring-2 ring-emerald-500/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-secondary)]'}`}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{inv.title}</p><p className="mt-1 text-xs font-medium text-[var(--color-text-secondary)]">{inv.period} · Due {new Date(inv.dueDate).toLocaleDateString()}</p></div><span className="shrink-0 text-sm font-bold text-red-500">{money(inv.amountDue)} due</span></div><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-[var(--color-text-secondary)]"><span>Total <span className="text-[var(--color-text-primary)]">{money(inv.amount)}</span></span><span>Paid <span className="font-semibold text-emerald-500">{money(inv.amountPaid)}</span></span><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${inv.status.toLowerCase() === 'paid' ? 'bg-emerald-500/15 text-emerald-400' : inv.status.toLowerCase() === 'pending' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-500/20 text-slate-200'}`}>{inv.status}</span></div></button>)}</div>}</div>}
        {invoice && <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[var(--color-text-tertiary)]">Invoice Total</p><p className="font-bold">{money(invoice.amount)}</p></div><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[var(--color-text-tertiary)]">Paid</p><p className="font-bold text-emerald-600">{money(invoice.amountPaid)}</p></div><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[var(--color-text-tertiary)]">Remaining</p><p className="font-bold text-red-600">{money(invoice.amountDue)}</p></div></div>}
        {invoice && <div className="mt-5 space-y-4"><div><label className="mb-2 block text-sm font-semibold">Payment Amount *</label><input type="number" min="0.01" max={invoice.amountDue} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-lg font-semibold outline-none focus:border-primary-500" /></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-semibold">Payment Method</label><select value={method} onChange={e => setMethod(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm"><option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="bank_transfer">Bank Transfer</option><option value="online">Online Payment</option></select></div><div><label className="mb-2 block text-sm font-semibold">Payment Date</label><input type="date" value={paymentDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setPaymentDate(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm" /></div></div>{method !== 'cash' && <div><label className="mb-2 block text-sm font-semibold">Reference / Transaction No.</label><input value={reference} onChange={e => setReference(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm" placeholder="EVC, bank slip, transaction number..." /></div>}<div><label className="mb-2 block text-sm font-semibold">Notes</label><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm" /></div><button type="submit" disabled={loading || !invoice} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"><ShieldCheck className="h-4 w-4" /> Review Payment</button></div>}
      </form>
      <aside className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-6"><p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Payment rule</p><h2 className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">Invoice-first collection</h2><p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">Payments are linked directly to an existing invoice. No automatic Walk-in / Ad-hoc invoice is created from this screen.</p><div className="mt-5 space-y-3 text-sm"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>Student identity is verified before collection.</span></div><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>Payment cannot exceed the selected invoice balance.</span></div><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>A branded receipt appears immediately after success.</span></div></div></aside>
    </div>
  </div>{review && invoice && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md rounded-2xl bg-[var(--color-surface-primary)] p-6 shadow-2xl"><h2 className="text-lg font-bold">Confirm Payment</h2><p className="mt-2 text-sm text-[var(--color-text-tertiary)]">You are recording {money(amountNumber)} against <strong>{invoice.title}</strong> for <strong>{student ? studentName(student) : ''}</strong>.</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-xs text-[var(--color-text-tertiary)]">Payment</p><p className="font-bold">{money(amountNumber)}</p></div><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-xs text-[var(--color-text-tertiary)]">Balance after</p><p className="font-bold">{money(Math.max(0, invoice.amountDue - amountNumber))}</p></div></div><div className="mt-6 flex gap-3"><button onClick={() => setReview(false)} disabled={loading} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-3 text-sm font-semibold">Cancel</button><button onClick={submit} disabled={loading} className="flex-1 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white">{loading ? 'Recording...' : 'Confirm & Record'}</button></div></div></div>}
  </div>;}

/**
 * Combined finance workspace. Existing collection and history workflows are
 * kept intact and displayed through tabs without duplicating payment logic.
 */
export function PaymentsRecordInvoice() {
  const [activeTab, setActiveTab] = useState<'record' | 'history'>('record');

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl">
        <div className="mb-3">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">Payments</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Record student payments and review previous transactions from one workspace.</p>
        </div>
        <div role="tablist" aria-label="Payment workspace" className="mb-3 flex w-full gap-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 sm:w-fit">
          <button type="button" role="tab" id="record-payment-tab" aria-selected={activeTab === 'record'} aria-controls="record-payment-panel" onClick={() => setActiveTab('record')}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:flex-none ${activeTab === 'record' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>
            <CreditCard className="h-4 w-4" /> Record Payment
          </button>
          <button type="button" role="tab" id="payment-history-tab" aria-selected={activeTab === 'history'} aria-controls="payment-history-panel" onClick={() => setActiveTab('history')}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:flex-none ${activeTab === 'history' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>
            <History className="h-4 w-4" /> Payment History
          </button>
        </div>
        {activeTab === 'record' ? (
          <section id="record-payment-panel" role="tabpanel" aria-labelledby="record-payment-tab">
            <PaymentForm embedded />
          </section>
        ) : (
          <section id="payment-history-panel" role="tabpanel" aria-labelledby="payment-history-tab">
            <PaymentsHistory embedded />
          </section>
        )}
      </div>
    </div>
  );
}
