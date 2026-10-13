import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BadgeCheck, CheckCircle2, Clock3, CreditCard, MessageSquare, Phone, RefreshCw, Smartphone, XCircle } from 'lucide-react';
import { StudentSubscription } from './student-subscription';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

type Subscription = {
  _id: string; grade: number; amount: number; currency: string; paymentReference: string; status: string;
  startsAt?: string; expiresAt?: string; createdAt?: string; payerPhone?: string; autoVerified?: boolean; gateway?: string;
  user?: { email: string }; school?: { name: string };
};
type SmsRow = { _id: string; from?: string; body: string; receivedAt?: string; amountUsd?: number | null; phones?: string[]; status: 'matched' | 'unmatched' };
type Tab = 'payments' | 'sms';
type Filter = 'all' | 'pending' | 'active' | 'closed';

const errorText = (err: any, fallback: string) => err?.response?.data?.message || fallback;
const dateTime = (value?: string) => (value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const dateOnly = (value?: string) => (value ? new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '-');
const AVATARS = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-pink-500'];
function avatarColor(text: string) { let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVATARS[h % AVATARS.length]; }

function displayStatus(row: Subscription): 'pending' | 'active' | 'expired' | 'rejected' | 'revoked' {
  if (row.status === 'approved') return row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now() ? 'expired' : 'active';
  return row.status as 'pending' | 'rejected' | 'revoked';
}
const STATUS_STYLE: Record<string, { label: string; badge: string; stripe: string }> = {
  pending: { label: 'Sugaya', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200', stripe: 'border-l-amber-400' },
  active: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200', stripe: 'border-l-emerald-500' },
  expired: { label: 'Dhacay', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200', stripe: 'border-l-orange-400' },
  rejected: { label: 'La diiday', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200', stripe: 'border-l-rose-500' },
  revoked: { label: 'La joojiyay', badge: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200', stripe: 'border-l-slate-400' },
};

function StatCard({ label, value, hint, tone, icon }: { label: string; value: number | string; hint?: string; tone: string; icon: React.ReactNode }) {
  return (
    <article className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-sm ${tone}`}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/15" />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/85">{label}</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-white/80">{hint}</p>}
        </div>
        <span className="rounded-xl bg-white/20 p-2">{icon}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{children}</span>;
}

/** Super Admin: forwarded payment SMS messages and whether each one activated a subscription. */
function SmsTab() {
  const [rows, setRows] = useState<SmsRow[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/global-subscriptions/sms-webhook/recent'); setRows(data.data || []); }
    catch (err) { setError(errorText(err, 'Unable to load forwarded messages')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const [smsFilter, setSmsFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const matched = rows?.filter((row) => row.status === 'matched').length || 0;
  const shown = rows?.filter((row) => smsFilter === 'all' || row.status === smsFilter);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="La helay" value={rows?.length ?? '-'} hint="20-kii ugu dambeeyay" tone="bg-gradient-to-br from-sky-500 to-blue-600" icon={<MessageSquare size={20} />} />
        <StatCard label="Furay" value={matched} hint="Subscription activated" tone="bg-gradient-to-br from-emerald-500 to-teal-600" icon={<BadgeCheck size={20} />} />
        <div className="col-span-2 flex items-center justify-between gap-3 rounded-2xl border bg-[var(--color-surface-primary)] p-4 sm:col-span-1">
          <p className="text-sm text-[var(--color-text-secondary)]">Fariimaha taleefanka merchant-ka ee SMS Forwarder u gudbiyo.</p>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh
          </button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {rows && rows.length === 0 && <p className="rounded-2xl border bg-[var(--color-surface-primary)] p-6 text-center text-sm text-[var(--color-text-secondary)]">Wali SMS lama helin. Hubi app-ka SMS Forwarder (taleefanka merchant-ka) iyo secret-ka.</p>}
      <div className="flex flex-wrap gap-2">
        {([['all', 'Dhammaan'], ['matched', 'Furay'], ['unmatched', 'Lama furin']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setSmsFilter(value)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${smsFilter === value ? 'bg-sky-600 text-white' : 'border text-[var(--color-text-secondary)]'}`}>{label}</button>
        ))}
      </div>
      <div className="space-y-3">
        {shown?.map((row) => {
          const incoming = /ka\s+heshay|received/i.test(row.body) && !/uwareejisay|dirtay|sent|transferred|deducted|recharge/i.test(row.body);
          return (
            <article key={row._id} className={`rounded-2xl border border-l-4 bg-[var(--color-surface-primary)] p-4 shadow-sm ${row.status === 'matched' ? 'border-l-emerald-500' : 'border-l-slate-300 dark:border-l-slate-600'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={row.status === 'matched' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}>
                  {row.status === 'matched' ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{row.status === 'matched' ? 'Furay subscription' : 'Lama furin'}
                </Chip>
                <Chip tone={incoming ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' : 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'}>
                  {incoming ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{incoming ? 'Qaadasho' : 'Kale (dirid / kharash)'}
                </Chip>
                {row.amountUsd != null && <Chip tone="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">${row.amountUsd}</Chip>}
                {row.phones?.map((phone) => <Chip key={phone}><Phone size={12} />{phone}</Chip>)}
                <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">{row.from || '-'} · {dateTime(row.receivedAt)}</span>
              </div>
              <p className="mt-2 break-words text-sm text-[var(--color-text-secondary)]">{row.body}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PaymentsTab({ isSuper }: { isSuper: boolean }) {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/global-subscriptions/admin', { params: { page } });
      setRows(data.data || []);
      setTotal(data.pagination?.total || data.meta?.total || 0);
      setError('');
    } catch (err) { setError(errorText(err, 'Unable to load subscriptions')); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);

  const review = async (row: Subscription, action: 'approve' | 'reject' | 'revoke') => {
    const message = action === 'approve' ? `Ma xaqiijisay inaad heshay $5 USD (${row.payerPhone || row.paymentReference})?` : action === 'reject' ? 'Ma diidaa codsigan?' : 'Ma joojisaa subscription-kan?';
    if (!window.confirm(message)) return;
    setBusy(true); setError('');
    try { await api.post(`/global-subscriptions/${row._id}/review`, { action, paymentReceived: action === 'approve' }); await load(); }
    catch (err) { setError(errorText(err, 'Unable to review subscription')); }
    finally { setBusy(false); }
  };

  const counts = useMemo(() => {
    const c = { pending: 0, active: 0, closed: 0 };
    for (const row of rows) { const s = displayStatus(row); if (s === 'pending') c.pending += 1; else if (s === 'active') c.active += 1; else c.closed += 1; }
    return c;
  }, [rows]);
  const visible = rows.filter((row) => {
    const s = displayStatus(row);
    return filter === 'all' || (filter === 'pending' && s === 'pending') || (filter === 'active' && s === 'active') || (filter === 'closed' && !['pending', 'active'].includes(s));
  });
  const FILTERS: { value: Filter; label: string; count?: number }[] = [
    { value: 'all', label: 'Dhammaan', count: rows.length },
    { value: 'pending', label: 'Sugaya', count: counts.pending },
    { value: 'active', label: 'Active', count: counts.active },
    { value: 'closed', label: 'Dhammaaday', count: counts.closed },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Dhammaan" value={total || rows.length} hint="$5 / sanad" tone="bg-gradient-to-br from-sky-500 to-blue-600" icon={<CreditCard size={20} />} />
        <StatCard label="Sugaya" value={counts.pending} hint="Xaqiijin ayaa loo baahan yahay" tone="bg-gradient-to-br from-amber-400 to-orange-500" icon={<Clock3 size={20} />} />
        <StatCard label="Active" value={counts.active} hint="Rukumasho shaqeysa" tone="bg-gradient-to-br from-emerald-500 to-teal-600" icon={<CheckCircle2 size={20} />} />
        <StatCard label="Dhammaaday" value={counts.closed} hint="La diiday / dhacay" tone="bg-gradient-to-br from-rose-500 to-pink-600" icon={<XCircle size={20} />} />
      </div>

      <div role="group" aria-label="Shaandhee" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${filter === item.value ? 'border-transparent bg-sky-600 text-white' : 'bg-[var(--color-surface-primary)] hover:bg-sky-50 dark:hover:bg-slate-800'}`}>
            {item.label} <span className="ml-1 opacity-80">{item.count}</span>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="text-sm">Loading subscriptions...</p> : visible.length === 0 ? <p className="rounded-2xl border bg-[var(--color-surface-primary)] p-6 text-center text-sm text-[var(--color-text-secondary)]">Wax codsi ah ma jiro.</p> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((row) => {
            const s = displayStatus(row);
            const style = STATUS_STYLE[s];
            const name = row.user?.email || 'Arday';
            return (
              <article key={row._id} className={`rounded-2xl border border-l-4 bg-[var(--color-surface-primary)] p-4 shadow-sm ${style.stripe}`}>
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-base font-bold text-white ${avatarColor(name)}`}>{name.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-all font-bold">{name}</p>
                      <Chip tone={style.badge}>{style.label}</Chip>
                    </div>
                    <p className="break-words text-sm text-[var(--color-text-secondary)]">{row.school?.name || '-'}</p>
                  </div>
                  <Chip tone="bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">Grade {row.grade}</Chip>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip tone="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">$5 USD</Chip>
                  {row.payerPhone && <Chip><Phone size={12} />{row.payerPhone}</Chip>}
                  {row.autoVerified && <Chip tone="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"><BadgeCheck size={12} />{row.gateway === 'waafipay' ? 'Wallet (WaafiPay)' : 'SMS auto'}</Chip>}
                  <Chip><Smartphone size={12} /><span className="break-all">{row.paymentReference}</span></Chip>
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                  Codsi: {dateTime(row.createdAt)}{row.expiresAt ? ` · Dhacaya: ${dateOnly(row.expiresAt)}` : ''}
                </p>
                {isSuper && (s === 'pending' || s === 'active') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s === 'pending' && <>
                      <button type="button" disabled={busy} onClick={() => review(row, 'approve')} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Verify $5 received</button>
                      <button type="button" disabled={busy} onClick={() => review(row, 'reject')} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">Reject</button>
                    </>}
                    {s === 'active' && <button type="button" disabled={busy} onClick={() => review(row, 'revoke')} className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50">Revoke</button>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 text-sm">
        <button type="button" disabled={page === 1 || loading} onClick={() => setPage(page - 1)} className="rounded-xl border px-4 py-2 font-semibold disabled:opacity-40">Previous</button>
        <span className="font-semibold">Page {page}</span>
        <button type="button" disabled={rows.length < 50 || loading || (total > 0 && page * 50 >= total)} onClick={() => setPage(page + 1)} className="rounded-xl border px-4 py-2 font-semibold disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

export function GlobalSubscriptions() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('payments');
  if (user?.role === 'student') return <StudentSubscription />;
  const isSuper = user?.role === 'admin';
  if (!isSuper && user?.role !== 'org_admin') return null;
  const tabs: { value: Tab; label: string; icon: React.ReactNode }[] = [
    { value: 'payments', label: 'Lacag-bixin', icon: <CreditCard size={16} /> },
    ...(isSuper ? [{ value: 'sms' as Tab, label: 'SMS-yada', icon: <MessageSquare size={16} /> }] : []),
  ];
  const tabStyle: Record<Tab, string> = { payments: 'bg-emerald-600 text-white shadow', sms: 'bg-sky-600 text-white shadow' };
  return (
    <section className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-sky-600 to-emerald-500 px-5 py-4 text-white shadow-lg">
        <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/15" />
        <p className="relative text-sm font-semibold text-white/95">$5 USD · 365 maalmood · dhammaan maaddooyinka fasalka la doortay</p>
      </div>
      <div role="tablist" aria-label="Qaybaha" className="sticky top-0 z-10 grid gap-2 rounded-2xl border bg-[var(--color-surface-primary)] p-1.5 shadow-sm" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((item) => (
          <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} onClick={() => setTab(item.value)}
            className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-3 text-sm font-bold transition-colors ${tab === item.value ? tabStyle[item.value] : 'text-[var(--color-text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {item.icon}{item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pb-20">
        {tab === 'payments' ? <PaymentsTab isSuper={isSuper} /> : <SmsTab />}
      </div>
    </section>
  );
}
