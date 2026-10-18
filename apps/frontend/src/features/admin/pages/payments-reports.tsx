/**
 * Reports & Reconciliation — school-scoped finance reporting.
 * Collections are a date-range flow. Outstanding balances are a current
 * invoice snapshot, optionally limited by the selected billing period.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  AlertCircle, ArrowRight, BarChart3, BellRing, CalendarDays, CheckCircle2,
  CircleDollarSign, Clock3, CreditCard, Download, FileWarning, Landmark,
  ReceiptText, RefreshCw, TrendingUp, UsersRound, WalletCards,
} from 'lucide-react';
import api from '../../../lib/axios';

interface CollectionReport {
  totalCollected: number;
  grossCollected?: number;
  totalRefunded?: number;
  transactionCount: number;
  refundCount?: number;
  totalOutstanding?: number;
  overdueOutstanding?: number;
  overdueCount?: number;
  byDay: { date: string; amount: number }[];
  byMethod: { method: string; amount: number }[];
  byType: { type: string; amount: number }[];
}
interface Cashier {
  cashierId: string;
  email: string;
  transactionCount: number;
  totalCollected: number;
  totalRefunded?: number;
  netCollected?: number;
  byMethod: { method: string; amount: number }[];
}
interface OverdueInvoice {
  _id: string;
  title: string;
  period: string;
  amountDue: number;
  dueDate: string;
  student?: { _id?: string; studentId: string; profile?: { firstName?: string; lastName?: string } };
}

function schoolDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Mogadishu', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return get('year') + '-' + get('month') + '-' + get('day');
}
const todayISO = () => schoolDay(new Date());
const monthStartISO = () => todayISO().slice(0, 7) + '-01';
const money = (n?: number) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const formatMethod = (value: string) => ({
  cash: 'Cash', mobile_money: 'Mobile Money', bank_transfer: 'Bank Transfer', online: 'Online Payment',
}[value] || value.replace(/_/g, ' '));
const displayDate = (value: string) => {
  const match = value.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return value;
  const date = new Date(value.slice(0, 10) + 'T12:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};
const studentName = (invoice: OverdueInvoice) =>
  [invoice.student?.profile?.firstName, invoice.student?.profile?.lastName].filter(Boolean).join(' ') ||
  invoice.student?.studentId || 'Student';
function chartDays(from: string, to: string, rows: CollectionReport['byDay']) {
  if (!from || !to) return rows || [];
  const beginning = Date.parse(from + 'T12:00:00Z');
  const end = Date.parse(to + 'T12:00:00Z');
  if (!Number.isFinite(beginning) || !Number.isFinite(end)) return rows || [];
  const days = Math.round((end - beginning) / 86400000);
  if (days < 0 || days > 45) return rows || [];
  const amounts = new Map((rows || []).map(row => [row.date, Number(row.amount) || 0]));
  return Array.from({ length: days + 1 }, (_, i) => {
    const date = new Date(beginning + i * 86400000).toISOString().slice(0, 10);
    return { date, amount: amounts.get(date) || 0 };
  });
}

const actionButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-secondary)] disabled:cursor-not-allowed disabled:opacity-50';
const selectClass = 'min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15';

export function PaymentsReports() {
  const [from, setFrom] = useState(monthStartISO);
  const [to, setTo] = useState(todayISO);
  const [period, setPeriod] = useState('');
  const [periods, setPeriods] = useState<string[]>([]);
  const [rangePreset, setRangePreset] = useState('month');
  const [collection, setCollection] = useState<CollectionReport | null>(null);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [overdue, setOverdue] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [sendingReminders, setSendingReminders] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    let active = true;
    api.get('/reports/periods').then(({ data }) => {
      if (active) setPeriods(Array.isArray(data.data) ? data.data : []);
    }).catch(() => { /* An empty period list must never block collection reporting. */ });
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    const request = ++requestVersion.current;
    setLoading(true);
    setError('');
    if (!from || !to || from > to) {
      setError('Please choose a valid date range.');
      setLoading(false);
      return;
    }
    const params = { from, to, ...(period ? { period } : {}) };
    const [collectionResult, reconciliationResult, overdueResult] = await Promise.allSettled([
      api.get('/reports/collection', { params }),
      api.get('/reports/reconciliation', { params }),
      api.get('/reports/overdue', { params: period ? { period } : {} }),
    ]);
    if (request !== requestVersion.current) return;
    if (collectionResult.status === 'fulfilled') setCollection(collectionResult.value.data.data);
    else {
      setCollection(null);
      setError(collectionResult.reason?.response?.data?.message || 'Could not load collection totals.');
    }
    if (reconciliationResult.status === 'fulfilled') setCashiers(reconciliationResult.value.data.data?.cashiers || []);
    else { setCashiers([]); setError(current => current || 'Could not load cashier records.'); }
    if (overdueResult.status === 'fulfilled') setOverdue(overdueResult.value.data.data || []);
    else { setOverdue([]); setError(current => current || 'Could not load overdue invoices.'); }
    setLoading(false);
  }, [from, to, period]);

  useEffect(() => { void load(); return () => { requestVersion.current += 1; }; }, [load]);

  const applyPreset = (next: string) => {
    setRangePreset(next);
    if (next === 'custom') return;
    const today = todayISO();
    let start = today;
    if (next === 'month') start = today.slice(0, 7) + '-01';
    if (next === 'week') {
      const day = new Date(today + 'T12:00:00Z');
      const daysAfterSaturday = (day.getUTCDay() + 1) % 7;
      day.setUTCDate(day.getUTCDate() - daysAfterSaturday);
      start = day.toISOString().slice(0, 10);
    }
    setFrom(start);
    setTo(today);
  };

  const exportXlsx = async (type: 'collection' | 'overdue' | 'reconciliation') => {
    try {
      const { data } = await api.get('/reports/export', {
        params: { type, from, to, ...(period ? { period } : {}) }, responseType: 'blob',
      });
      const url = URL.createObjectURL(data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = type + '-' + from + '-to-' + to + '.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Export failed. Please try again.');
    }
  };

  const sendAllReminders = async () => {
    if (!overdue.length || sendingReminders) return;
    if (!window.confirm('Send in-app reminders for ' + overdue.length + ' overdue invoice(s)' +
      (period ? ' in ' + period : '') + '?')) return;
    setSendingReminders(true);
    setReminderMessage('');
    try {
      const { data } = await api.post('/reports/send-reminders', period ? { period } : {});
      setReminderMessage(data.data?.remindersSent > 0
        ? 'Sent in-app reminders for ' + data.data.remindersSent + ' overdue invoice(s).'
        : 'No eligible students or parents were found for reminders.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not send reminders.');
    } finally { setSendingReminders(false); }
  };

  const daily = useMemo(() => chartDays(from, to, collection?.byDay || []), [collection, from, to]);
  const methods = collection?.byMethod || [];
  const gross = Number(collection?.grossCollected) || 0;
  const overdueDue = overdue.reduce((sum, item) => sum + Math.max(0, Number(item.amountDue) || 0), 0);

  const metrics = [
    { label: 'NET COLLECTED', value: money(collection?.totalCollected), note: 'After refunds', Icon: CircleDollarSign, style: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-800 dark:border-emerald-900/50 dark:from-emerald-950/30 dark:to-teal-950/20 dark:text-emerald-300', iconStyle: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' },
    { label: 'GROSS COLLECTED', value: money(collection?.grossCollected), note: 'Before refunds', Icon: WalletCards, style: 'border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 text-blue-800 dark:border-sky-900/50 dark:from-sky-950/30 dark:to-blue-950/20 dark:text-sky-300', iconStyle: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' },
    { label: 'TRANSACTIONS', value: String(collection?.transactionCount ?? 0), note: 'Completed payments', Icon: ReceiptText, style: 'border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 text-indigo-800 dark:border-violet-900/50 dark:from-violet-950/30 dark:to-indigo-950/20 dark:text-violet-300', iconStyle: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300' },
    { label: 'REFUNDED', value: money(collection?.totalRefunded), note: String(collection?.refundCount || 0) + ' refunds', Icon: RefreshCw, style: 'border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 text-rose-800 dark:border-rose-900/50 dark:from-rose-950/30 dark:to-pink-950/20 dark:text-rose-300', iconStyle: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300' },
    { label: 'TOTAL OUTSTANDING', value: money(collection?.totalOutstanding), note: 'Current unpaid invoices', Icon: CreditCard, style: 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-800 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-orange-950/20 dark:text-amber-300', iconStyle: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
    { label: 'OVERDUE BALANCE', value: money(collection?.overdueOutstanding), note: String(collection?.overdueCount || 0) + ' overdue invoices', Icon: Clock3, style: 'border-red-200 bg-gradient-to-br from-red-50 to-rose-50 text-red-800 dark:border-red-900/50 dark:from-red-950/30 dark:to-rose-950/20 dark:text-red-300', iconStyle: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
  ];

  return (
    <main className="min-h-screen bg-[var(--color-surface-secondary)] px-4 pb-10 pt-7 sm:px-6 sm:pt-8 lg:px-10 lg:pt-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-800 via-teal-700 to-cyan-700 px-5 py-6 text-white shadow-lg sm:px-8 sm:py-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border-[36px] border-white/10" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-1/4 h-28 w-28 rounded-full bg-white/5 blur-xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white"><TrendingUp className="h-3.5 w-3.5" /> Finance intelligence</span>
            <h1 className="mt-3 flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl"><BarChart3 className="h-7 w-7 shrink-0" /> Reports &amp; Reconciliation</h1>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-teal-50 sm:text-sm">Monitor collections, understand each cashier's activity and track outstanding student invoices.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/admin/payments/history" className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50">Payment History <ArrowRight className="h-3.5 w-3.5" /></Link>
              <Link to="/admin/payments/balances" className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/15 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/25">Student Balances <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </header>

        <section aria-label="Report filters" className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)]"><CalendarDays className="h-4 w-4 text-emerald-600" /> Report filters</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Date range</span>
              <select className={selectClass} value={rangePreset} onChange={e => applyPreset(e.target.value)}>
                <option value="today">Today</option><option value="week">This week (from Saturday)</option>
                <option value="month">This month</option><option value="custom">Custom range</option>
              </select>
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Billing period</span>
              <select className={selectClass} value={period} onChange={e => setPeriod(e.target.value)}>
                <option value="">All billing periods</option>
                {periods.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /> Refresh</button>
          </div>
          {rangePreset === 'custom' && <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block min-w-0"><span className="mb-1 block text-xs text-[var(--color-text-secondary)]">From</span><input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className={selectClass} /></label>
            <label className="block min-w-0"><span className="mb-1 block text-xs text-[var(--color-text-secondary)]">To</span><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={selectClass} /></label>
          </div>}
          <p className="mt-3 text-[11px] leading-5 text-[var(--color-text-tertiary)]">Collections use the selected dates (Africa/Mogadishu time). Outstanding and overdue balances are current invoice balances, filtered by billing period when selected.</p>
        </section>

        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {reminderMessage && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{reminderMessage}</div>}

        {loading && !collection ? <div role="status" className="flex items-center justify-center gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-sm text-[var(--color-text-secondary)]"><RefreshCw className="h-5 w-5 animate-spin text-emerald-600" /> Loading financial reports...</div> : collection && <>
          <section aria-label="Financial overview" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {metrics.map(m => <div key={m.label} className={'min-w-0 rounded-2xl border p-3.5 shadow-sm sm:p-4 ' + m.style}>
              <div className="flex items-start justify-between gap-1">
                <p className="text-[10px] font-bold uppercase leading-4 tracking-wide opacity-85 sm:text-[11px]">{m.label}</p>
                <span className={'rounded-lg p-1.5 ' + m.iconStyle}><m.Icon className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 break-words text-2xl font-extrabold leading-none tabular-nums sm:text-[27px]">{m.value}</p>
              <p className="mt-2 text-[11px] leading-4 opacity-75">{m.note}</p>
            </div>)}
          </section>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-text-primary)] sm:text-lg"><TrendingUp className="h-5 w-5 text-emerald-600" /> Collection trend</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Daily net activity · {displayDate(from)} – {displayDate(to)}</p></div>
                <button className={actionButton} onClick={() => void exportXlsx('collection')}><Download className="h-4 w-4" /> Excel</button>
              </div>
              {daily.length > 0 ? <div className="mt-6 h-56 w-full sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 8, right: 4, left: -20, bottom: 2 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 4" opacity={0.2} />
                    <XAxis dataKey="date" tickFormatter={displayDate} tick={{ fontSize: 10 }} minTickGap={20} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => '$' + v} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip labelFormatter={label => displayDate(String(label))} formatter={(value: number) => [money(Number(value)), 'Net activity']} contentStyle={{ borderRadius: 12, border: '1px solid #cbd5e1' }} />
                    <Bar dataKey="amount" name="Net activity" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div> : <div className="mt-5 rounded-xl bg-[var(--color-surface-secondary)] px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">No transactions in this date range.</div>}
            </section>

            <section className="min-w-0 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-6">
              <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-text-primary)] sm:text-lg"><Landmark className="h-5 w-5 text-blue-600" /> Payment methods</h2>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Gross payments by collection channel</p>
              <div className="mt-5 space-y-4">
                {methods.length ? methods.map((method, index) => {
                  const share = gross > 0 ? Math.max(0, Math.min(100, method.amount / gross * 100)) : 0;
                  const colors = ['bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500'];
                  return <div key={method.method}>
                    <div className="mb-2 flex justify-between gap-2 text-sm"><span className="font-medium text-[var(--color-text-secondary)]">{formatMethod(method.method)}</span><span className="font-bold text-[var(--color-text-primary)]">{money(method.amount)} <span className="ml-1 text-[11px] font-normal text-[var(--color-text-tertiary)]">{share.toFixed(0)}%</span></span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={'h-full rounded-full transition-all ' + colors[index % colors.length]} style={{ width: share + '%' }} /></div>
                  </div>;
                }) : <p className="rounded-xl bg-[var(--color-surface-secondary)] p-4 text-xs text-[var(--color-text-tertiary)]">No payments by method for this period.</p>}
              </div>
              <div className="mt-6 border-t border-[var(--color-border-subtle)] pt-4"><h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">By fee type</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(collection.byType || []).length ? collection.byType.map(t => <div key={t.type} className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="truncate text-xs capitalize text-[var(--color-text-tertiary)]">{t.type}</p><p className="mt-1 text-base font-extrabold text-[var(--color-text-primary)]">{money(t.amount)}</p></div>) : <p className="col-span-2 text-xs text-[var(--color-text-tertiary)]">No fee types recorded.</p>}
                </div>
              </div>
            </section>
          </div>

          <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
              <div><h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-text-primary)] sm:text-lg"><UsersRound className="h-5 w-5 text-violet-600" /> Cashier collection breakdown</h2><p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">Recorded collections and refunds by operator. This is not bank / wallet statement verification.</p></div>
              <button className={actionButton} onClick={() => void exportXlsx('reconciliation')}><Download className="h-4 w-4" /> Excel</button>
            </div>
            {cashiers.length ? <>
              <div className="space-y-3 px-4 pb-4 lg:hidden">
                {cashiers.map(c => <article key={c.cashierId} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-all text-sm font-bold text-[var(--color-text-primary)]">{c.email}</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{c.transactionCount} transactions</p></div><span className="shrink-0 rounded-lg bg-emerald-100 px-2 py-1 text-sm font-extrabold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">{money(c.netCollected ?? (c.totalCollected - (c.totalRefunded || 0)))}</span></div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--color-border-default)] pt-3 text-xs">
                    <span className="text-[var(--color-text-tertiary)]">Gross</span><span className="text-right font-bold text-[var(--color-text-primary)]">{money(c.totalCollected)}</span>
                    {(c.byMethod || []).map(m => <div key={m.method} className="col-span-2 flex justify-between gap-2"><span className="text-[var(--color-text-secondary)]">{formatMethod(m.method)}</span><span className="font-bold text-[var(--color-text-primary)]">{money(m.amount)}</span></div>)}
                    <span className="text-rose-600">Refunded</span><span className="text-right font-bold text-rose-600">{money(c.totalRefunded)}</span>
                  </div>
                </article>)}
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm"><thead className="border-y border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]"><tr>
                  <th className="px-5 py-3 text-left font-semibold">Cashier</th><th className="px-3 py-3 text-center font-semibold">Payments</th><th className="px-3 py-3 text-right font-semibold">Cash</th><th className="px-3 py-3 text-right font-semibold">Mobile</th><th className="px-3 py-3 text-right font-semibold">Bank / Online</th><th className="px-3 py-3 text-right font-semibold">Refunds</th><th className="px-5 py-3 text-right font-semibold">Net</th>
                </tr></thead><tbody>{cashiers.map(c => {
                  const by = (key: string) => (c.byMethod || []).find(m => m.method === key)?.amount || 0;
                  return <tr key={c.cashierId} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-surface-secondary)]">
                    <td className="break-all px-5 py-4 font-medium">{c.email}</td><td className="px-3 py-4 text-center">{c.transactionCount}</td><td className="px-3 py-4 text-right">{money(by('cash'))}</td><td className="px-3 py-4 text-right">{money(by('mobile_money'))}</td><td className="px-3 py-4 text-right">{money(by('bank_transfer') + by('online'))}</td><td className="px-3 py-4 text-right text-rose-600">{money(c.totalRefunded)}</td><td className="px-5 py-4 text-right font-extrabold text-emerald-600">{money(c.netCollected ?? (c.totalCollected - (c.totalRefunded || 0)))}</td>
                  </tr>;
                })}</tbody></table>
              </div>
            </> : <div className="px-4 pb-6 text-sm text-[var(--color-text-tertiary)]">No cashier collections for this range.</div>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-4 py-3 text-xs text-[var(--color-text-secondary)] sm:px-6"><span>Need to trace a transaction or receipt?</span><Link to="/admin/payments/history" className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300">Open Payment History <ArrowRight className="h-3.5 w-3.5" /></Link></div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
              <div><h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-text-primary)] sm:text-lg"><FileWarning className="h-5 w-5 text-amber-600" /> Overdue invoices <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{overdue.length}</span></h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Currently past due · {money(overdueDue)} unpaid · {period || 'all billing periods'}</p></div>
              <div className="flex flex-wrap gap-2"><button disabled={sendingReminders || overdue.length === 0} onClick={() => void sendAllReminders()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"><BellRing className="h-4 w-4" /> {sendingReminders ? 'Sending...' : 'Remind All'}</button><button className={actionButton} onClick={() => void exportXlsx('overdue')}><Download className="h-4 w-4" /> Excel</button></div>
            </div>
            {overdue.length ? <>
              <div className="space-y-3 px-4 pb-4 md:hidden">
                {overdue.map(inv => <article key={inv._id} className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold text-[var(--color-text-primary)]">{studentName(inv)}</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{inv.student?.studentId}</p></div><span className="shrink-0 text-base font-extrabold text-rose-600">{money(inv.amountDue)}</span></div>
                  <p className="mt-3 text-sm text-[var(--color-text-primary)]">{inv.title} <span className="text-xs text-[var(--color-text-tertiary)]">· {inv.period}</span></p><p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Due {displayDate(schoolDay(new Date(inv.dueDate)))}</p>
                </article>)}
              </div>
              <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead className="border-y border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]"><tr><th className="px-5 py-3 text-left">Student</th><th className="px-4 py-3 text-left">Invoice &amp; period</th><th className="px-4 py-3 text-right">Amount due</th><th className="px-5 py-3 text-right">Due date</th></tr></thead><tbody>{overdue.map(inv => <tr key={inv._id} className="border-b border-[var(--color-border-subtle)] last:border-0"><td className="px-5 py-3"><p className="font-semibold">{studentName(inv)}</p><p className="text-xs text-[var(--color-text-tertiary)]">{inv.student?.studentId}</p></td><td className="px-4 py-3"><p>{inv.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{inv.period}</p></td><td className="px-4 py-3 text-right font-bold text-rose-600">{money(inv.amountDue)}</td><td className="px-5 py-3 text-right text-xs text-amber-700 dark:text-amber-300">{displayDate(schoolDay(new Date(inv.dueDate)))}</td></tr>)}</tbody></table></div>
            </> : <div className="mx-4 mb-5 flex items-center gap-3 rounded-xl bg-emerald-50 p-5 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5 shrink-0" /> No overdue invoices in this billing period.</div>}
          </section>

          <p className="flex items-start gap-2 px-1 text-[11px] leading-5 text-[var(--color-text-tertiary)]"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Cashier breakdown tracks recorded payments; verification against bank or mobile-money statements must still be completed in the accounting reconciliation workflow.</p>
        </>}
      </div>
    </main>
  );
}

export default PaymentsReports;
