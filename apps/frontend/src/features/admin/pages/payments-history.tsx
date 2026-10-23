/**
 * Payment History — Admin/Org Admin
 * Financially safe history: completed payments cannot be moved back to pending;
 * refunds are displayed separately from the original transaction.
 */

import { useEffect, useState, useCallback } from 'react';
import { Download, Search, RotateCcw, CalendarDays, CircleDollarSign, ReceiptText, MoreVertical, X, Filter, Clock3 } from 'lucide-react';
import api from '../../../lib/axios';
import { downloadReceipt, hasReceipt } from '../../../lib/receipts';

interface PaymentRecord {
  _id: string;
  student: { studentId: string; profile?: { firstName: string; lastName: string } };
  amount: number;
  discount?: number;
  refundedAmount?: number;
  currency?: string;
  reference?: string;
  type: string;
  method: string;
  status: 'completed' | 'pending' | 'refunded';
  createdAt: string;
}

function StatusBadge({ status }: { status: PaymentRecord['status'] }) {
  const config: Record<string, { label: string; className: string }> = {
    completed: { label: 'Completed', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    refunded: { label: 'Refunded', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  };
  const item = config[status] || config.pending;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${item.className}`}>{item.label}</span>;
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = { tuition: 'Tuition', registration: 'Registration', exam: 'Exam', material: 'Materials', donation: 'Donation', other: 'Other' };
  return <span className="text-xs font-medium">{labels[type] || type}</span>;
}

function MethodBadge({ method }: { method: string }) {
  const labels: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank', mobile_money: 'Mobile money', online: 'Online' };
  return <span className="text-xs">{labels[method] || method}</span>;
}

function money(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toLocaleString()}`;
  }
}

function RefundModal({ payment, onClose, onDone }: { payment: PaymentRecord; onClose: () => void; onDone: () => void }) {
  const refundable = Math.max(0, Number(payment.amount || 0) - Number(payment.refundedAmount || 0));
  const [amount, setAmount] = useState(String(refundable));
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    const refundAmount = Number(amount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > refundable) { setError('Enter a valid amount within the refundable balance.'); return; }
    if (!reason.trim()) { setError('A refund reason is required.'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/refunds', { paymentId: payment._id, amount: refundAmount, reason: reason.trim() });
      onDone();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to issue refund'); }
    finally { setLoading(false); }
  };
  const control = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-primary-500/30';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="refund-payment-title" className="w-full max-w-md rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-2xl sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 id="refund-payment-title" className="text-lg font-bold text-[var(--color-text-primary)]">Refund payment</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{payment.student?.profile?.firstName} {payment.student?.profile?.lastName}</p></div>
          <button type="button" onClick={onClose} disabled={loading} aria-label="Close refund dialog" className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)]"><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-900/50 dark:bg-rose-950/20"><p className="text-xs text-rose-700 dark:text-rose-300">Maximum refundable</p><p className="mt-1 text-lg font-bold text-rose-800 dark:text-rose-200">{money(refundable, payment.currency || 'USD')}</p></div>
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-[var(--color-text-primary)]">Refund amount<input className={control + ' mt-1'} type="number" min="0.01" max={refundable} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label className="block text-xs font-semibold text-[var(--color-text-primary)]">Reason for refund<textarea className={control + ' mt-1'} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this payment is being refunded." /></label>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
          <div className="flex gap-2 pt-1"><button type="button" onClick={onClose} disabled={loading} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] disabled:opacity-50">Cancel</button><button type="button" onClick={submit} disabled={loading || refundable <= 0} className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{loading ? 'Processing...' : 'Confirm refund'}</button></div>
        </div>
      </section>
    </div>
  );
}

function dateRange(preset: string): { from?: string; to?: string } {
  const now = new Date();
  const format = (date: Date) => date.toISOString().slice(0, 10);
  if (preset === 'today') return { from: format(now), to: format(now) };
  const start = new Date(now);
  if (preset === 'week') start.setDate(now.getDate() - now.getDay());
  if (preset === 'month') start.setDate(1);
  return preset === 'custom' ? {} : { from: format(start), to: format(now) };
}

export function PaymentsHistory({ embedded = false }: { embedded?: boolean } = {}) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [datePreset, setDatePreset] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [refundPayment, setRefundPayment] = useState<PaymentRecord | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page: String(page), limit: '20' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      const range = datePreset === 'custom' ? { from: customFrom, to: customTo } : dateRange(datePreset);
      if (range.from) params.dateFrom = range.from;
      if (range.to) params.dateTo = range.to;
      const { data } = await api.get('/payments', { params });
      setPayments(data.data || []);
      setTotal(data.meta?.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load payments');
    } finally { setLoading(false); }
  }, [page, search, statusFilter, typeFilter, datePreset, customFrom, customTo]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const completePayment = async (id: string) => {
    try {
      await api.patch(`/payments/${id}/status`, { status: 'completed' });
      await fetchPayments();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to complete payment');
    }
  };

  const totalPages = Math.ceil(total / 20);
  const currency = payments[0]?.currency || 'USD';
  const totalCollected = payments.filter((payment) => payment.status === 'completed').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalRefunded = payments.reduce((sum, payment) => sum + Number(payment.refundedAmount || 0), 0);

  return (
    <div className={embedded ? "bg-[var(--color-surface-secondary)]" : "min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10"}>
      <div className="mx-auto max-w-screen-2xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"><ReceiptText className="h-5 w-5" /></span>
              <div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Payment History</h1><p className="mt-0.5 text-sm text-[var(--color-text-tertiary)]">Review, track and manage student transactions</p></div>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs leading-5 text-[var(--color-text-secondary)] sm:max-w-xs"><RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" /><span>Completed payments are reversed only through a refund.</span></div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm dark:border-emerald-900/50 dark:from-emerald-950/30 dark:to-[var(--color-surface-primary)] sm:p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Total collected</p><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/50"><CircleDollarSign className="h-5 w-5 text-emerald-700 dark:text-emerald-300" /></span></div><p className="mt-2 break-words text-xl font-bold tracking-tight text-emerald-800 dark:text-emerald-200 sm:text-2xl">{money(totalCollected, currency)}</p><p className="mt-1 text-xs text-emerald-700/70 dark:text-emerald-300/70">Completed payments on this page</p></div>
          <div className="rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 to-white p-4 shadow-sm dark:border-primary-900/50 dark:from-primary-950/30 dark:to-[var(--color-surface-primary)] sm:p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Transactions</p><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/50"><ReceiptText className="h-5 w-5 text-primary-700 dark:text-primary-300" /></span></div><p className="mt-2 text-2xl font-bold tracking-tight text-primary-800 dark:text-primary-200">{total.toLocaleString()}</p><p className="mt-1 text-xs text-primary-700/70 dark:text-primary-300/70">Matching current filters</p></div>
          <div className="rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50 to-white p-4 shadow-sm dark:border-rose-900/50 dark:from-rose-950/30 dark:to-[var(--color-surface-primary)] sm:p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">Refunded amount</p><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/50"><RotateCcw className="h-5 w-5 text-rose-700 dark:text-rose-300" /></span></div><p className="mt-2 break-words text-xl font-bold tracking-tight text-rose-800 dark:text-rose-200 sm:text-2xl">{money(totalRefunded, currency)}</p><p className="mt-1 text-xs text-rose-700/70 dark:text-rose-300/70">Refunds in loaded results</p></div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"><Filter className="h-4 w-4 text-primary-600" /> Find transactions</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input type="text" placeholder="Search student, ID, notes, or reference..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full min-w-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm">
            <option value="">All Status</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="refunded">Refunded</option>
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="w-full min-w-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm">
            <option value="">All Types</option><option value="tuition">Tuition</option><option value="registration">Registration</option><option value="exam">Exam Fee</option><option value="material">Materials</option><option value="donation">Donation</option><option value="other">Other</option>
          </select>
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2"><CalendarDays className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" /><select value={datePreset} onChange={(e) => { setDatePreset(e.target.value); setPage(1); }} className="w-full min-w-0 bg-transparent py-0.5 text-sm outline-none"><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option><option value="custom">Custom Range</option></select></div>
          {datePreset === 'custom' && <><input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(1); }} className="w-full min-w-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" aria-label="From date" /><input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(1); }} className="w-full min-w-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" aria-label="To date" /></>}
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>
        ) : (
          <div className="space-y-3 md:hidden">
            {payments.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-12 text-center"><ReceiptText className="mx-auto mb-3 h-8 w-8 text-[var(--color-text-tertiary)]" /><p className="font-semibold text-[var(--color-text-primary)]">No payments found</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Try changing your search or filters.</p></div> : payments.map((p) => {
              const rowCurrency = p.currency || 'USD';
              const studentFullName = `${p.student?.profile?.firstName || ''} ${p.student?.profile?.lastName || ''}`.trim() || 'Unknown student';
              return <article key={p._id} className="overflow-visible rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-secondary)] text-sm font-bold text-[var(--color-text-secondary)]">{studentFullName.split(/\\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span><div className="min-w-0"><p className="break-words font-semibold text-[var(--color-text-primary)]">{studentFullName}</p><p className="mt-0.5 break-all text-xs text-[var(--color-text-tertiary)]">{p.student?.studentId || 'No student ID'}</p>{p.reference && <p className="mt-1 break-all text-xs text-[var(--color-text-tertiary)]">Ref: {p.reference}</p>}</div></div>
                  <div className="shrink-0 text-right"><p className="text-base font-bold text-emerald-600">{money(p.amount, rowCurrency)}</p>{(p.discount || 0) > 0 && <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">Discount {money(p.discount || 0, rowCurrency)}</p>}</div>
                </div>
                <div className="my-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-surface-secondary)] p-3">
                  <div><p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Payment method</p><p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{MethodBadge({ method: p.method })}</p></div>
                  <div><p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Payment type</p><p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{TypeBadge({ type: p.type })}</p></div>
                  <div><p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Refunded</p><p className="mt-1 text-sm font-semibold text-rose-600">{(p.refundedAmount || 0) > 0 ? `-${money(p.refundedAmount || 0, rowCurrency)}` : '—'}</p></div>
                  <div><p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Date</p><p className="mt-1 flex items-center gap-1 text-sm text-[var(--color-text-secondary)]"><Clock3 className="h-3.5 w-3.5 shrink-0" />{new Date(p.createdAt).toLocaleDateString()}</p><p className="ml-4 text-[11px] text-[var(--color-text-tertiary)]">{new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>{p.status === 'pending' ? <button type="button" onClick={() => completePayment(p._id)} title="Confirm money received and apply it to the invoice" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300"><RotateCcw className="h-3.5 w-3.5" /> Complete payment</button> : <StatusBadge status={p.status} />}</div>
                  <div className="flex items-center gap-2">
                    {hasReceipt(p.status) && <button type="button" onClick={() => downloadReceipt(p._id)} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 px-3 py-2 text-xs font-semibold text-primary-600 hover:bg-primary-50 dark:border-primary-900/50 dark:hover:bg-primary-950/30"><Download className="h-3.5 w-3.5" /> Receipt</button>}
                    <div className="relative"><button type="button" aria-label="Payment actions" aria-haspopup="menu" aria-expanded={openActionId === p._id} onClick={() => setOpenActionId(current => current === p._id ? null : p._id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"><MoreVertical className="h-4 w-4" /></button>
                      {openActionId === p._id && <div role="menu" className="absolute right-0 z-30 mt-1 min-w-44 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 text-left shadow-xl">{p.status !== 'pending' && Math.max(0, Number(p.amount || 0) - Number(p.refundedAmount || 0)) > 0 ? <button type="button" role="menuitem" onClick={() => { setRefundPayment(p); setOpenActionId(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"><RotateCcw className="h-4 w-4" /> Refund payment</button> : <span className="block px-3 py-2.5 text-xs text-[var(--color-text-tertiary)]">No actions available</span>}</div>}
                    </div>
                  </div>
                </div>
              </article>;
            })}
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Student</th>
                    <th className="px-5 py-3 text-right font-semibold">Collected</th>
                    <th className="hidden px-5 py-3 text-right font-semibold md:table-cell">Refunded</th>
                    <th className="hidden px-5 py-3 text-center font-semibold md:table-cell">Type</th>
                    <th className="hidden px-5 py-3 text-center font-semibold lg:table-cell">Method</th>
                    <th className="px-5 py-3 text-center font-semibold">Status</th>
                    <th className="hidden px-5 py-3 text-left font-semibold lg:table-cell">Date</th>
                    <th className="px-5 py-3 text-center font-semibold">Receipt</th>
                    <th className="px-5 py-3 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={9} className="py-16 text-center text-[var(--color-text-tertiary)]"><p className="mb-1 text-lg">No payments found</p><p className="text-xs">Try another filter or search term.</p></td></tr>
                  ) : payments.map((p) => {
                    const currency = p.currency || 'USD';
                    return (
                      <tr key={p._id} className="border-b border-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-surface-secondary)]">
                        <td className="px-5 py-5">
                          <p className="truncate font-semibold">{p.student?.profile?.firstName} {p.student?.profile?.lastName}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{p.student?.studentId}{p.reference ? ` · ${p.reference}` : ''}</p>
                        </td>
                        <td className="px-5 py-5 text-right">
                          <span className="font-bold text-green-600">{money(p.amount, currency)}</span>
                          {(p.discount || 0) > 0 && <p className="text-[11px] text-[var(--color-text-tertiary)]">Discount {money(p.discount || 0, currency)}</p>}
                        </td>
                        <td className="hidden px-5 py-5 text-right md:table-cell">
                          {(p.refundedAmount || 0) > 0 ? <span className="font-semibold text-red-600">-{money(p.refundedAmount || 0, currency)}</span> : <span className="text-[var(--color-text-tertiary)]">—</span>}
                        </td>
                        <td className="hidden px-5 py-5 text-center md:table-cell"><TypeBadge type={p.type} /></td>
                        <td className="hidden px-5 py-5 text-center lg:table-cell"><MethodBadge method={p.method} /></td>
                        <td className="px-5 py-5 text-center">
                          {p.status === 'pending' ? (
                            <button type="button" onClick={() => completePayment(p._id)} title="Confirm money received and apply it to the invoice" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300">
                              <RotateCcw className="h-3 w-3" /> Complete
                            </button>
                          ) : <StatusBadge status={p.status} />}
                        </td>
                        <td className="hidden px-5 py-5 text-xs text-[var(--color-text-tertiary)] lg:table-cell">{new Date(p.createdAt).toLocaleDateString()}<p className="text-[10px]">{new Date(p.createdAt).toLocaleTimeString()}</p></td>
                        <td className="px-5 py-5 text-center">
                          {hasReceipt(p.status) && <button type="button" onClick={() => downloadReceipt(p._id)} title="Download official receipt" className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 px-2.5 py-1.5 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50 dark:border-primary-900/50 dark:hover:bg-primary-950/30"><Download className="h-3.5 w-3.5" strokeWidth={1.75} /><span className="hidden xl:inline">Receipt</span></button>}
                        </td>
                        <td className="px-3 py-5 text-center">
                          <div className="relative inline-block">
                            <button type="button" aria-label="Payment actions" aria-haspopup="menu" aria-expanded={openActionId === p._id} onClick={() => setOpenActionId((current) => current === p._id ? null : p._id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-secondary)] focus:outline-none focus:ring-2 focus:ring-primary-500/30"><MoreVertical className="h-4 w-4" /></button>
                            {openActionId === p._id && <div role="menu" className="absolute right-0 z-30 mt-1 min-w-44 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 text-left shadow-xl">
                              {p.status !== 'pending' && Math.max(0, Number(p.amount || 0) - Number(p.refundedAmount || 0)) > 0
                                ? <button type="button" role="menuitem" onClick={() => { setRefundPayment(p); setOpenActionId(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"><RotateCcw className="h-4 w-4" /> Refund payment</button>
                                : <span className="block px-3 py-2.5 text-xs text-[var(--color-text-tertiary)]">No actions available</span>}
                            </div>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && <div className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-xs text-[var(--color-text-tertiary)]">{total} payments · Page {page} of {totalPages}</p><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex-1 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-medium disabled:opacity-30 sm:flex-none">← Previous</button><button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex-1 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-medium disabled:opacity-30 sm:flex-none">Next →</button></div></div>}
          </div>
          {totalPages > 1 && <div className="flex items-center justify-between rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 md:hidden"><span className="text-xs text-[var(--color-text-tertiary)]">{total} payments · {page}/{totalPages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-medium disabled:opacity-30">← Prev</button><button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-medium disabled:opacity-30">Next →</button></div></div>}
        )}
      </div>
      {refundPayment && <RefundModal payment={refundPayment} onClose={() => setRefundPayment(null)} onDone={async () => { setRefundPayment(null); await fetchPayments(); }} />}
    </div>
  );
}

export default PaymentsHistory;
