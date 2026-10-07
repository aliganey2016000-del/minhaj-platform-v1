import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Coins, Crown, FileText, GraduationCap, Laptop, RefreshCw } from 'lucide-react';
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
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [subscriptions, catalog] = await Promise.all([api.get('/global-subscriptions/mine'), api.get('/courses/global')]);
      setRows(subscriptions.data.data || []);
      const value = catalog.data.meta?.grade;
      setGrade(value === 8 || value === 12 ? value : null);
    } catch { setError('Rukumashada lama soo rari karin. Fadlan mar kale isku day.'); }
    finally { setLoading(false); }
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
  const panel = 'rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm';
  if (loading) return <main className="mx-auto max-w-7xl p-5 sm:p-8"><p role="status">Rukumashada waa la soo rarayaa...</p></main>;
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-7">
    <header><h1 className="text-3xl font-bold sm:text-4xl" style={{ fontFamily: 'Georgia, serif' }}>Rukumashadayda</h1><p className="mt-2 text-lg"><span className="font-semibold text-emerald-600">Guuldoon</span>{grade && <span> · Grade {grade}</span>}</p></header>
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-300 p-4 text-sm"><span>{error}</span><button onClick={() => void load()} className="flex items-center gap-2 font-semibold"><RefreshCw size={16} />Mar kale isku day</button></div>}
    {!error && <>
    <section className="grid gap-5 lg:grid-cols-[1.9fr_1fr]">
      <article className="relative isolate overflow-hidden rounded-2xl border-2 border-amber-400/70 bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-600 p-6 text-white shadow-xl shadow-emerald-950/10 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-28 h-96 w-96 rotate-[-30deg] rounded-[80px] border-[40px] border-white/5" aria-hidden="true" />
        <BookOpen size={130} strokeWidth={0.65} className="pointer-events-none absolute -bottom-4 right-2 text-amber-200/20 sm:right-6" aria-hidden="true" />
        <p className="relative flex items-center gap-2 font-bold tracking-wider text-amber-200"><BookOpen size={22} />GUULDOON</p>
        <div className="relative mt-7 flex items-start gap-4"><Crown size={54} strokeWidth={1.3} className="shrink-0 text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]" /><div><h2 className="text-2xl font-bold leading-tight sm:text-3xl" style={{ fontFamily: 'Georgia, serif' }}>{active ? 'Waxaad diyaar u tahay guusha' : 'U diyaar garow guushaada'}</h2><p className="mt-2 text-lg text-amber-200">{grade ? `Dhammaan maaddooyinka Grade ${grade}` : 'Fasalkaaga weli lama xaqiijin'}</p><span className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-emerald-950/50 px-3 py-1.5 text-xs font-semibold">{active && <CheckCircle2 size={15} />}{labels[currentStatus] || 'Weli ma lihid rukumasho'}</span></div></div>
        <div className="relative mt-7 flex flex-wrap items-center gap-5 border-t border-white/20 pt-5"><p className="text-4xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>$5 <span className="text-xl font-normal text-emerald-100">/ sanad</span></p><span className="border-l border-white/20 pl-5 text-sm">365 maalmood</span></div><p className="relative mt-5 border-t border-white/20 pt-4 text-sm text-emerald-50">Cashirro · Maqal · Muuqaal · Imtixaannadii hore</p>
      </article>
      <article className={`${panel} flex flex-col items-center justify-between p-6`}>
        <div className="relative h-40 w-40"><svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="7" className="text-emerald-500/10" /><circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 52}`} strokeDashoffset={`${2 * Math.PI * 52 * (1 - proportion)}`} className="text-emerald-500" /></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-4xl" style={{ fontFamily: 'Georgia, serif' }}>{active ? days : '—'}</strong><span className="mt-1 max-w-24 text-center text-xs text-[var(--color-text-secondary)]">{active ? 'maalmood ayaa haray' : 'Rukumasho firfircoon ma jirto'}</span></div></div>
        <dl className="mt-4 w-full text-sm"><div className="flex justify-between gap-3 border-b border-[var(--color-border-subtle)] py-3"><dt className="flex items-center gap-2"><CalendarDays size={16} />Bilow:</dt><dd>{date(active?.startsAt)}</dd></div><div className="flex justify-between gap-3 py-3"><dt className="flex items-center gap-2"><CalendarDays size={16} />Dhacaysa:</dt><dd>{date(active?.expiresAt)}</dd></div></dl><Link to="/student/global-courses" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 py-3 text-sm font-semibold text-emerald-600"><BookOpen size={18} />Eeg koorsooyinka<ArrowRight size={16} /></Link>
      </article>
    </section>
    <section className="grid gap-4 sm:grid-cols-3"><article className={`${panel} flex items-center gap-4 p-5`}><span className="rounded-full bg-emerald-500/10 p-3 text-emerald-600"><Coins size={26} /></span><div><p className="text-sm text-[var(--color-text-secondary)]">Lacagta la xaqiijiyey</p><p className="mt-1 text-xl font-bold">{active ? `$${active.amount} USD` : '—'}</p></div>{active && <CheckCircle2 className="ml-auto text-emerald-500" size={22} />}</article><Link to="/student/guuldoon/devices" className={`${panel} flex items-center gap-4 p-5`}><span className="rounded-full bg-emerald-500/10 p-3 text-emerald-600"><Laptop size={26} /></span><div><h2 className="font-semibold">Qalabkayga</h2><p className="mt-1 text-xs text-[var(--color-text-secondary)]">Hubi xaaladda qalabka</p></div><ArrowRight className="ml-auto shrink-0 text-emerald-600" size={18} /></Link><article className={`${panel} flex items-center gap-4 p-5`}><span className="rounded-full bg-emerald-500/10 p-3 text-emerald-600"><GraduationCap size={26} /></span><div><p className="text-sm text-[var(--color-text-secondary)]">Fasalkaaga</p><p className="mt-1 text-xl font-bold">{grade ? `Grade ${grade}` : 'Lama xaqiijin'}</p></div></article></section>
    {!active && !pending && grade && <section className={`${panel} p-5`}><h2 className="font-bold">Gudbi tixraaca lacag-bixinta</h2><p className="mt-2 text-sm text-[var(--color-text-secondary)]">La xiriir maamulka si aad u hesho tilmaamaha lacag-bixinta. Sanadkaagu wuxuu bilaabmaa marka $5 la xaqiijiyo.</p><form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row"><label className="flex-1 text-sm">Tixraaca lacag-bixinta<input required maxLength={120} value={reference} onChange={e => setReference(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--color-border-subtle)] bg-transparent p-3" /></label><button disabled={busy || !reference.trim()} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50 sm:self-end">{busy ? 'Waa la gudbinayaa...' : 'Gudbi si loo xaqiijiyo'}</button></form></section>}
    {notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
    <section className={`${panel} p-5`}><h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><FileText size={21} />Taariikhda lacag-bixinta</h2>{history.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">Weli ma jiraan codsiyo fasalkaaga ah.</p> : <div className="overflow-x-auto rounded-xl border border-[var(--color-border-subtle)]"><table className="w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)]"><tr>{['Tixraac', 'Taariikh', 'Lacag', 'Xaalad'].map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{history.map(row => <tr key={row._id} className="border-t border-[var(--color-border-subtle)]"><td className="max-w-52 break-all px-4 py-3">{row.paymentReference}</td><td className="whitespace-nowrap px-4 py-3">{date(row.reviewedAt || row.createdAt)}</td><td className="whitespace-nowrap px-4 py-3">${row.amount} USD</td><td className="px-4 py-3"><span className={`inline-block rounded-full px-3 py-1 text-xs ${status(row, now) === 'active' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>{labels[status(row, now)] || row.status}</span></td></tr>)}</tbody></table></div>}</section>
    <aside className={`${panel} flex flex-wrap items-center justify-between gap-3 p-5`}><div><h2 className="font-semibold">Caawimaad ma u baahan tahay?</h2><p className="mt-1 text-xs text-[var(--color-text-secondary)]">La xiriir maamulka school-kaaga. Lacagaha school-ka iyo rukumashada Guuldoon waa kala gaar.</p></div><Link to="/student/guuldoon/devices" className="flex items-center gap-2 text-sm font-semibold text-emerald-600">Hubi qalabkayga<ArrowRight size={16} /></Link></aside>
    </>}
  </main>;
}
