import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, CircleAlert, Crown, FileText, Laptop, RefreshCw } from 'lucide-react';
import api from '../../../lib/axios';

type Subscription = { _id: string; grade: number; amount: number; paymentReference: string; status: string; startsAt?: string; expiresAt?: string; createdAt?: string; reviewedAt?: string };
const day = 86400000;
const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
function status(row: Subscription, now: number) {
  if (row.status !== 'approved') return row.status;
  if (!row.startsAt || !row.expiresAt || !Number.isFinite(Date.parse(row.startsAt)) || !Number.isFinite(Date.parse(row.expiresAt))) return 'unavailable';
  if (Date.parse(row.expiresAt) <= now) return 'expired';
  return Date.parse(row.startsAt) <= now ? 'active' : 'scheduled';
}
const labels: Record<string, string> = { active: 'Rukumasho shaqaynaysa', pending: 'Xaqiijin ayaa la sugayaa', expired: 'Rukumashadu way dhacday', rejected: 'Codsiga waa la diiday', revoked: 'Rukumashada waa la joojiyey', scheduled: 'Weli ma bilaaban', unavailable: 'Xogta muddada lama xaqiijin' };
export function StudentSubscription() {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [grade, setGrade] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const loaded = useRef(false);
  const load = useCallback(async () => {
    if (!loaded.current) setLoading(true); setError('');
    try {
      const [subscriptions, catalog] = await Promise.all([api.get('/global-subscriptions/mine'), api.get('/courses/global')]);
      setRows(subscriptions.data.data || []);
      const value = catalog.data.meta?.grade;
      setGrade(value === 8 || value === 12 ? value : null);
    } catch { setError('Rukumashada lama soo rari karin. Fadlan mar kale isku day.'); }
    finally { loaded.current = true; setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, [load]);
  const history = rows.filter(row => row.grade === grade).sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));
  const active = history.filter(row => status(row, now) === 'active').sort((a, b) => Date.parse(b.expiresAt!) - Date.parse(a.expiresAt!))[0];
  const pending = history.find(row => row.status === 'pending');
  const current = active || pending || history[0];
  const currentStatus = current ? status(current, now) : 'none';
  const days = active ? Math.max(0, Math.ceil((Date.parse(active.expiresAt!) - now) / day)) : 0;
  const proportion = active ? Math.min(1, Math.max(0, (Date.parse(active.expiresAt!) - now) / (Date.parse(active.expiresAt!) - Date.parse(active.startsAt!)))) : 0;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!grade || active || pending || busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await api.post('/global-subscriptions/requests', { grade, paymentReference: reference.trim() }); setReference(''); setNotice('Tixraaca lacag-bixinta waa la gudbiyey. Maamulka ayaa xaqiijinaya.'); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Codsiga lama gudbin. Mar kale isku day.'); }
    finally { setBusy(false); }
  };
  if (loading) return <main className="mx-auto max-w-5xl p-5 sm:p-8"><p role="status">Rukumashada waa la soo rarayaa...</p></main>;

  const isActive = !!active;
  const expiring = isActive && days <= 30;
  const canSubmit = !active && !pending && !!grade;
  const tone: 'ok' | 'todo' | 'exp' =
    isActive && !expiring ? 'ok'
      : isActive || currentStatus === 'pending' || currentStatus === 'scheduled' || currentStatus === 'none' ? 'todo'
        : 'exp';
  const toneStyle = {
    ok: { bg: 'from-[#07352f] via-[#0b4a3f] to-[#082a2a] shadow-[0_24px_60px_rgba(4,54,48,.28)]', accent: 'text-emerald-300', ring: 'border-[#0b4a3f]', dot: 'bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,.18)]', badge: 'bg-emerald-300 text-emerald-950', bar: 'bg-emerald-300', cta: 'bg-emerald-300 text-emerald-950 hover:bg-emerald-200' },
    todo: { bg: 'from-[#3b2808] via-[#5a3a0c] to-[#2f1f08] shadow-[0_24px_60px_rgba(90,58,12,.3)]', accent: 'text-amber-300', ring: 'border-[#5a3a0c]', dot: 'bg-amber-300 shadow-[0_0_0_4px_rgba(252,211,77,.18)]', badge: 'bg-amber-300 text-amber-950', bar: 'bg-amber-300', cta: 'bg-amber-300 text-amber-950 hover:bg-amber-200' },
    exp: { bg: 'from-[#3b0d12] via-[#5a1218] to-[#2a0a0e] shadow-[0_24px_60px_rgba(90,18,24,.3)]', accent: 'text-red-300', ring: 'border-[#5a1218]', dot: 'bg-red-300 shadow-[0_0_0_4px_rgba(252,165,165,.18)]', badge: 'bg-red-300 text-red-950', bar: 'bg-red-300', cta: 'bg-red-300 text-red-950 hover:bg-red-200' },
  }[tone];
  const title = isActive
    ? (expiring ? 'Rukumashadaadu way dhammaanaysaa' : 'Waxaad diyaar u tahay guusha')
    : currentStatus === 'pending' ? 'Xaqiijin ayaa la sugayaa'
      : currentStatus === 'expired' ? 'Rukumashadaadii way dhammaatay'
        : currentStatus === 'none' ? 'U diyaar garow guushaada'
          : labels[currentStatus] || 'Rukumasho ma jirto';
  const statusText = isActive ? labels.active : currentStatus === 'none' ? 'Weli ma lihid rukumasho' : labels[currentStatus] || currentStatus;
  const StatusIcon = tone === 'ok' ? Check : CircleAlert;
  const facts: [string, string][] = [
    ['Qiimaha', active ? `$${active.amount} / sanad` : '$5 / sanad'],
    [isActive ? 'Lacagta' : 'Muddada', isActive ? 'La xaqiijiyey' : '365 maalmood'],
    ['Fasalka', grade ? `Grade ${grade}` : 'Lama xaqiijin'],
  ];
  const input = 'block w-full rounded-2xl border border-white/20 bg-black/20 px-4 py-3.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20';

  return <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-7">
    <header>
      <p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-emerald-500">Guuldoon{grade ? ` · Grade ${grade}` : ''}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Rukumashadayda</h1>
    </header>

    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-300 p-4 text-sm"><span>{error}</span><button onClick={() => void load()} className="flex items-center gap-2 font-semibold"><RefreshCw size={16} />Mar kale isku day</button></div>}

    {!error && <>
      <article className={`relative overflow-hidden rounded-[28px] bg-gradient-to-br text-white ${toneStyle.bg}`}>
        <div className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-full border-[34px] border-white/[.04]" aria-hidden="true" />
        <div className="relative p-5 sm:p-6">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[.16em] text-white/55">Guuldoon{grade ? ` · Grade ${grade}` : ''}</p>
          <div className="mt-4 flex items-center gap-4">
            <span className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border border-white/15 bg-white/[.08] ${toneStyle.accent}`}>
              <Crown size={31} strokeWidth={1.7} />
              <span className={`absolute -bottom-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full border-[3px] ${toneStyle.ring} ${toneStyle.badge}`}><StatusIcon size={14} strokeWidth={3} /></span>
            </span>
            <div className="min-w-0">
              <h2 className="text-balance text-xl font-extrabold leading-tight">{title}</h2>
              <span className={`mt-2 inline-flex items-center gap-2 text-[12.5px] font-bold ${toneStyle.accent}`}><span className={`h-2 w-2 rounded-full ${toneStyle.dot}`} />{statusText}</span>
            </div>
          </div>
        </div>

        <div className="relative h-0" aria-hidden="true">
          <div className="mx-6 border-t-2 border-dashed border-white/20" />
          <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[var(--color-page-background)]" />
          <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-[var(--color-page-background)]" />
        </div>

        <div className="relative p-5 sm:p-6">
          {isActive && <>
            <div className="flex items-baseline gap-2.5"><strong className="text-[56px] font-extrabold leading-none tracking-tight tabular-nums">{days}</strong><span className="text-sm font-semibold text-white/70">maalmood ayaa haray</span></div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/[.12]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - proportion) * 100)} aria-label="Muddada rukumashada la isticmaalay"><div className={`h-full rounded-full ${toneStyle.bar}`} style={{ width: `${Math.max(1, Math.round((1 - proportion) * 100))}%` }} /></div>
            <div className="mt-2 flex justify-between gap-3 text-xs tabular-nums text-white/60"><span>Bilow · {date(active?.startsAt)}</span><span>Dhacaysa · {date(active?.expiresAt)}</span></div>
          </>}
          {!isActive && current?.expiresAt && currentStatus === 'expired' && <p className="mb-4 text-sm text-white/70">Waxay dhacday <strong className="text-white">{date(current.expiresAt)}</strong>.</p>}

          <dl className={`grid grid-cols-[repeat(3,auto)] justify-between gap-2.5 ${isActive ? 'mt-[18px]' : ''}`}>
            {facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[10.5px] font-bold uppercase tracking-[.12em] text-white/50">{label}</dt><dd className="mt-1.5 whitespace-nowrap text-[13.5px] font-bold tabular-nums">{value}</dd></div>)}
          </dl>

          {isActive && <Link to="/student/global-courses" className={`mt-[18px] flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-extrabold transition ${toneStyle.cta}`}><BookOpen size={18} />Eeg koorsooyinka<ArrowRight size={16} /></Link>}

          {canSubmit && <form onSubmit={submit} className="mt-[18px] space-y-3">
            <p className="text-[13.5px] leading-6 text-white/75">La xiriir maamulka si aad u hesho tilmaamaha lacag-bixinta. Sanadkaagu wuxuu bilaabmaa marka $5 la xaqiijiyo.</p>
            <label className="block text-xs font-bold text-white/70">Tixraaca lacag-bixinta<input required maxLength={120} value={reference} onChange={e => setReference(e.target.value)} className={`${input} mt-1.5`} /></label>
            <button disabled={busy || !reference.trim()} className={`flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${toneStyle.cta}`}>{busy ? 'Waa la gudbinayaa...' : 'Gudbi si loo xaqiijiyo'}{!busy && <ArrowRight size={16} />}</button>
          </form>}
          {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>}
        </div>
      </article>

      <Link to="/student/guuldoon/devices" className="flex items-center gap-3.5 rounded-[20px] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 transition hover:border-emerald-500/30">
        <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-emerald-500/12 text-emerald-500"><Laptop size={20} /></span>
        <span className="min-w-0 flex-1"><b className="block text-[14.5px] font-extrabold">Qalabkayga</b><small className="text-[12.5px] text-[var(--color-text-tertiary)]">Hubi browser-ka Guuldoon u furan</small></span>
        <ChevronRight size={18} className="text-[var(--color-text-tertiary)]" />
      </Link>

      <details className="group rounded-[20px] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 text-[14.5px] font-extrabold [&::-webkit-details-marker]:hidden">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-surface-tertiary)] text-emerald-500"><FileText size={18} /></span>
          <span className="flex-1">Taariikhda lacag-bixinta</span>
          <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11.5px] font-extrabold text-emerald-500">{history.length}</span>
          <ChevronDown size={18} className="text-[var(--color-text-tertiary)] transition group-open:rotate-180" />
        </summary>
        {history.length === 0
          ? <p className="border-t border-[var(--color-border-subtle)] p-4 text-sm text-[var(--color-text-secondary)]">Weli ma jiraan codsiyo fasalkaaga ah.</p>
          : history.map(row => {
            const st = status(row, now);
            return <div key={row._id} className="flex items-center gap-3 border-t border-[var(--color-border-subtle)] px-4 py-3">
              <div className="min-w-0 flex-1"><b className="block text-sm tabular-nums">{date(row.reviewedAt || row.createdAt)}</b><small className="block break-all text-xs text-[var(--color-text-tertiary)]">Tixraac {row.paymentReference}</small></div>
              <div className="text-right"><b className="block text-sm tabular-nums">${row.amount} USD</b><span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st === 'active' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{labels[st] || row.status}</span></div>
            </div>;
          })}
      </details>

      <p className="text-center text-[13px] text-[var(--color-text-tertiary)]">Caawimaad? La xiriir maamulka school-kaaga. Lacagaha school-ka iyo rukumashada Guuldoon waa kala gaar.</p>
    </>}
  </main>;
}
