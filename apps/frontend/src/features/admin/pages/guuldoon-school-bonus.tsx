/**
 * Guuldoon school bonus ("Gunnada Iskuulka").
 * Super Admin: every school's bonus, rates and payouts.
 * School administrator (org_admin): their own school's students and bonus.
 * The server enforces access; the role checks here only choose what to show.
 */
import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

export type SchoolBonusPage = 'overview' | 'schools' | 'payouts' | 'students' | 'earnings';

type Summary = {
  schoolId: string; name: string; city: string; rate: number; usesDefaultRate: boolean; grades: number[];
  students: number; grade8Students: number; grade12Students: number; subscribers: number; verifiedSubscriptions: number;
  grossUsd: number; bonusUsd: number; paidOutUsd: number; pendingUsd: number;
};
type SchoolsData = {
  price: number; defaultRate: number; maxRate: number; schools: Summary[];
  totals: { students: number; verifiedSubscriptions: number; grossUsd: number; bonusUsd: number; pendingUsd: number };
};
type PayoutRow = { _id: string; amount: number; note?: string; paidAt: string; school?: { _id: string; name: string } };
type StudentRow = { id: string; studentId: string; name: string; grade: number; status: string; startsAt: string | null; expiresAt: string | null; requestedAt: string };
type MineData = { price: number; summary: Summary; students: StudentRow[]; studentsTotal: number; payouts: PayoutRow[] };
type Meta = { page: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean; total: number };

const usd = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const day = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-GB') : '-');
const errorText = (error: unknown, fallback: string) => (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

function useApi<T>(path: string, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(params || {});
  useEffect(() => {
    let live = true;
    api.get(path, { params: JSON.parse(key) as Record<string, unknown> })
      .then(({ data: body }) => { if (live) { setData(body.data as T); setMeta((body.meta as Meta) || null); setError(''); } })
      .catch((err: unknown) => { if (live) setError(errorText(err, 'Unable to load data.')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [path, key, tick]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, meta, error, loading, reload };
}

function Kpi({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <article className={`rounded-2xl border p-5 ${strong ? 'border-primary-600 bg-primary-600 text-white' : 'bg-[var(--color-surface-primary)]'}`}>
      <p className={`text-sm ${strong ? 'text-white/80' : 'text-[var(--color-text-secondary)]'}`}>{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className={`mt-1 text-xs ${strong ? 'text-white/80' : 'text-[var(--color-text-tertiary)]'}`}>{hint}</p>}
    </article>
  );
}

function Table({ head, children }: { head: { label: string; right?: boolean }[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-[var(--color-surface-primary)]">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
            {head.map((cell) => <th key={cell.label} className={`whitespace-nowrap px-4 py-3 font-semibold ${cell.right ? 'text-right' : ''}`}>{cell.label}</th>)}
          </tr>
        </thead>
        <tbody className="[&>tr:not(:last-child)]:border-b">{children}</tbody>
      </table>
    </div>
  );
}

function Notice({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'ok' }) {
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${tone === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300'}`}>{children}</p>;
}

/* ───────────── Super Admin ───────────── */

function SuperOverview() {
  const { data, error, loading } = useApi<SchoolsData>('/guuldoon-school-bonus/schools');
  if (error) return <Notice>{error}</Notice>;
  if (loading || !data) return <p>Loading...</p>;
  const { totals, schools } = data;
  const max = Math.max(1, ...schools.map((school) => school.verifiedSubscriptions));
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Ardayda Guuldoon" value={String(totals.students)} hint="Active, fasalka iskuulka doortay" />
        <Kpi label="Subscription la xaqiijiyey" value={String(totals.verifiedSubscriptions)} hint={`${usd(data.price)} subscription kasta`} />
        <Kpi label="Lacagta la qaaday" value={usd(totals.grossUsd)} />
        <Kpi label="Gunnada iskuullada" value={usd(totals.bonusUsd)} hint={`${usd(totals.pendingUsd)} weli lama bixin`} />
        <Kpi strong label="Kuu hadhay" value={usd(totals.grossUsd - totals.bonusUsd)} hint="Ka hor kharashka lacag-qaadista" />
      </section>
      <section className="space-y-3 rounded-2xl border bg-[var(--color-surface-primary)] p-5">
        <h2 className="font-semibold">Subscription la xaqiijiyey, iskuul iskuul</h2>
        {schools.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">Wax iskuul ah ma jiro.</p>}
        {schools.map((school) => (
          <div key={school.schoolId} className="grid grid-cols-[minmax(110px,220px)_1fr_56px] items-center gap-3 text-sm">
            <span className="truncate">{school.name}</span>
            <span className="h-3 overflow-hidden rounded-full bg-primary-100 dark:bg-primary-950/40"><span className="block h-full rounded-full bg-primary-600" style={{ width: `${(school.verifiedSubscriptions / max) * 100}%` }} /></span>
            <span className="text-right tabular-nums">{school.verifiedSubscriptions}</span>
          </div>
        ))}
      </section>
    </>
  );
}

function RateCell({ school, maxRate, onSaved }: { school: Summary; maxRate: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(school.rate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setValue(String(school.rate)), [school.rate]);
  const save = async (rate: number | null) => {
    setBusy(true); setError('');
    try { await api.patch(`/guuldoon-school-bonus/schools/${school.schoolId}/rate`, { rate }); onSaved(); }
    catch (err: unknown) { setError(errorText(err, 'Unable to save the rate.')); }
    finally { setBusy(false); }
  };
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= maxRate;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label className="sr-only" htmlFor={`rate-${school.schoolId}`}>Gunno % - {school.name}</label>
      <input id={`rate-${school.schoolId}`} type="number" min={0} max={maxRate} step="0.5" value={value} onChange={(event) => setValue(event.target.value)} className="w-20 rounded-lg border bg-transparent px-2 py-1 text-right tabular-nums" />
      <span>%</span>
      <button type="button" disabled={busy || !valid || parsed === school.rate} onClick={() => void save(parsed)} className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">Keydi</button>
      {!school.usesDefaultRate && <button type="button" disabled={busy} onClick={() => void save(null)} className="text-xs font-semibold text-primary-600 disabled:opacity-40">Caadi</button>}
      {error && <span role="alert" className="w-full text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}

const GUULDOON_GRADES = [8, 12];
const gradeBreakdown = (school: Summary) => school.grades.map((grade) => `G${grade}: ${grade === 8 ? school.grade8Students : school.grade12Students}`).join(' · ');

/**
 * Which grades the school uses Guuldoon for, as checkboxes: tick the grades the school wants,
 * leave the others unticked. Students and the bonus count only the ticked grades.
 * Guuldoon is available for Grade 8 and Grade 12, so "all grades" means both.
 */
function GradesCell({ school, onSaved }: { school: Summary; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allSelected = GUULDOON_GRADES.every((grade) => school.grades.includes(grade));
  const save = async (grades: number[]) => {
    if (grades.length === 0) { setError('Dooro ugu yaraan hal fasal.'); return; }
    setBusy(true); setError('');
    try { await api.patch(`/guuldoon-school-bonus/schools/${school.schoolId}/grades`, { grades }); onSaved(); }
    catch (err: unknown) { setError(errorText(err, 'Unable to save the grades.')); }
    finally { setBusy(false); }
  };
  const toggle = (grade: number) => void save(GUULDOON_GRADES.filter((item) => (item === grade ? !school.grades.includes(grade) : school.grades.includes(item))));
  const box = 'h-4 w-4 accent-primary-600';
  return (
    <fieldset disabled={busy} className="flex flex-col items-end gap-1.5">
      <legend className="sr-only">Fasalada - {school.name}</legend>
      <span className="font-medium tabular-nums">{school.students}</span>
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input type="checkbox" className={box} checked={allSelected} disabled={allSelected || busy} onChange={() => void save([...GUULDOON_GRADES])} />
        Dhammaan fasalada
      </label>
      {GUULDOON_GRADES.map((grade) => (
        <label key={grade} className="flex items-center gap-2 text-xs">
          <input type="checkbox" className={box} checked={school.grades.includes(grade)} onChange={() => toggle(grade)} />
          Grade {grade}
        </label>
      ))}
      <span className="text-xs text-[var(--color-text-tertiary)]">{gradeBreakdown(school)}</span>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </fieldset>
  );
}

function Schools() {
  const { data, error, loading, reload } = useApi<SchoolsData>('/guuldoon-school-bonus/schools');
  if (error) return <Notice>{error}</Notice>;
  if (loading || !data) return <p>Loading...</p>;
  return (
    <>
      <p className="text-sm text-[var(--color-text-secondary)]">Gunnada caadiga ah waa <b>{data.defaultRate}%</b> ee {usd(data.price)} subscription kasta. Iskuul kasta rate gaar ah ayaad u dejin kartaa.</p>
      <Table head={[{ label: 'Iskuulka' }, { label: 'Arday', right: true }, { label: 'Subscription', right: true }, { label: 'Lacagta', right: true }, { label: 'Gunno %', right: true }, { label: 'Gunno', right: true }, { label: 'Sugaya', right: true }]}>
        {data.schools.map((school) => (
          <tr key={school.schoolId}>
            <td className="px-4 py-3"><p className="font-medium">{school.name}</p>{school.city && <p className="text-xs text-[var(--color-text-tertiary)]">{school.city}</p>}</td>
            <td className="px-4 py-3"><GradesCell school={school} onSaved={reload} /></td>
            <td className="px-4 py-3 text-right tabular-nums">{school.verifiedSubscriptions}</td>
            <td className="px-4 py-3 text-right tabular-nums">{usd(school.grossUsd)}</td>
            <td className="px-4 py-3"><RateCell school={school} maxRate={data.maxRate} onSaved={reload} /></td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums">{usd(school.bonusUsd)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{usd(school.pendingUsd)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function Payouts() {
  const schools = useApi<SchoolsData>('/guuldoon-school-bonus/schools');
  const history = useApi<PayoutRow[]>('/guuldoon-school-bonus/payouts');
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  if (schools.error || history.error) return <Notice>{schools.error || history.error}</Notice>;
  if (!schools.data || !history.data) return <p>Loading...</p>;
  const due = schools.data.schools.filter((school) => school.pendingUsd > 0);
  const startPayout = (school: Summary) => { setOpen(school.schoolId); setAmount(String(school.pendingUsd)); setNote(''); setError(''); setDone(''); };
  const submit = async (event: React.FormEvent, school: Summary) => {
    event.preventDefault();
    if (!window.confirm(`Ma xaqiijisay inaad ${usd(Number(amount))} u bixisay ${school.name}?`)) return;
    setBusy(true); setError('');
    try {
      await api.post('/guuldoon-school-bonus/payouts', { schoolId: school.schoolId, amount: Number(amount), note });
      setOpen(null); setDone(`${usd(Number(amount))} waa la diiwaangeliyey ${school.name}.`);
      schools.reload(); history.reload();
    } catch (err: unknown) { setError(errorText(err, 'Unable to record the payout.')); }
    finally { setBusy(false); }
  };
  return (
    <>
      {done && <Notice tone="ok">{done}</Notice>}
      <section className="space-y-3">
        <h2 className="font-semibold">Sugaya bixin</h2>
        {due.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">Wax sugaya bixin ma jiraan.</p> : (
          <Table head={[{ label: 'Iskuulka' }, { label: 'Gunno', right: true }, { label: 'La bixiyey', right: true }, { label: 'Hadhay', right: true }, { label: '' }]}>
            {due.flatMap((school) => [
              <tr key={school.schoolId}>
                <td className="px-4 py-3 font-medium">{school.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{usd(school.bonusUsd)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{usd(school.paidOutUsd)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{usd(school.pendingUsd)}</td>
                <td className="px-4 py-3 text-right"><button type="button" onClick={() => startPayout(school)} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white">Diiwaangeli bixin</button></td>
              </tr>,
              open === school.schoolId ? (
                <tr key={`${school.schoolId}-form`}>
                  <td colSpan={5} className="bg-[var(--color-surface-secondary)] px-4 py-4">
                    <form onSubmit={(event) => void submit(event, school)} className="flex flex-wrap items-end gap-3">
                      <label className="grid gap-1 text-xs text-[var(--color-text-secondary)]">Lacagta (USD)
                        <input type="number" min="0.01" max={school.pendingUsd} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className="w-32 rounded-lg border bg-transparent px-2 py-1.5 text-sm" />
                      </label>
                      <label className="grid gap-1 text-xs text-[var(--color-text-secondary)]">Xusuus (ikhtiyaari)
                        <input type="text" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="tus. EVC Plus, bilaha 9-10" className="w-64 rounded-lg border bg-transparent px-2 py-1.5 text-sm" />
                      </label>
                      <button type="submit" disabled={busy} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Xaqiiji</button>
                      <button type="button" onClick={() => setOpen(null)} className="px-2 py-2 text-sm font-semibold text-primary-600">Jooji</button>
                      {error && <p role="alert" className="w-full text-sm text-red-600">{error}</p>}
                    </form>
                  </td>
                </tr>
              ) : null,
            ])}
          </Table>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Taariikhda bixinta</h2>
        {history.data.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">Weli wax lama bixin.</p> : (
          <Table head={[{ label: 'Taariikh' }, { label: 'Iskuulka' }, { label: 'Xusuus' }, { label: 'Lacag', right: true }]}>
            {history.data.map((row) => (
              <tr key={row._id}>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{day(row.paidAt)}</td>
                <td className="px-4 py-3">{row.school?.name || '-'}</td>
                <td className="px-4 py-3 text-[var(--color-text-secondary)]">{row.note || '-'}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{usd(row.amount)}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </>
  );
}

/* ───────────── School administrator ───────────── */

function MineOverview({ data }: { data: MineData }) {
  const { summary } = data;
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label={summary.grades.length === 2 ? 'Ardayda Grade 8 & 12' : `Ardayda Grade ${summary.grades[0]}`} value={String(summary.students)} hint={`${gradeBreakdown(summary)} · ${summary.subscribers} ayaa subscription leh`} />
      <Kpi label="Subscription la xaqiijiyey" value={String(summary.verifiedSubscriptions)} hint={`${usd(summary.grossUsd)} wadarta`} />
      <Kpi label={`Gunnadaada (${summary.rate}%)`} value={usd(summary.bonusUsd)} hint={`${usd(summary.paidOutUsd)} la bixiyey`} />
      <Kpi strong label="Sugaya bixin" value={usd(summary.pendingUsd)} hint="Waxaa laguu soo diraa Super Admin-ka" />
    </section>
  );
}

function MineStudents({ data, meta, page, setPage }: { data: MineData; meta: Meta | null; page: number; setPage: (page: number) => void }) {
  const label = (status: string) => (status === 'approved' ? 'La xaqiijiyey' : 'Sugaya xaqiijin');
  return (
    <section className="space-y-3">
      <p className="text-sm text-[var(--color-text-secondary)]">{data.studentsTotal} arday/subscription. Subscription-ada la xaqiijiyey oo keliya ayaa gunno leh.</p>
      {data.students.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">Weli arday subscription ma samaysan.</p> : (
        <Table head={[{ label: 'Ardayga' }, { label: 'Student ID' }, { label: 'Fasalka' }, { label: 'Xaalad' }, { label: 'Bilaabmay' }, { label: 'Dhacaya' }]}>
          {data.students.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3 tabular-nums">{row.studentId || '-'}</td>
              <td className="px-4 py-3">Fasalka {row.grade}</td>
              <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.status === 'approved' ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}>{label(row.status)}</span></td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{day(row.startsAt)}</td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{day(row.expiresAt)}</td>
            </tr>
          ))}
        </Table>
      )}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button type="button" disabled={!meta.hasPrevPage} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Hore</button>
          <span>{meta.page} / {meta.totalPages}</span>
          <button type="button" disabled={!meta.hasNextPage} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Xiga</button>
        </div>
      )}
    </section>
  );
}

function MineEarnings({ data }: { data: MineData }) {
  const { summary } = data;
  return (
    <>
      <section className="rounded-2xl border bg-[var(--color-surface-primary)] p-5">
        <h2 className="font-semibold">Sida gunnadaada loo xisaabiyo</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          <b>{summary.verifiedSubscriptions}</b> subscription &times; <b>{usd(data.price)}</b> &times; <b>{summary.rate}%</b> = <b className="text-primary-600">{usd(summary.bonusUsd)}</b>
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Taariikhda bixintaada</h2>
        {data.payouts.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">Weli wax lagu ma bixin.</p> : (
          <Table head={[{ label: 'Taariikh' }, { label: 'Xusuus' }, { label: 'Lacag', right: true }]}>
            {data.payouts.map((row) => (
              <tr key={row._id}>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{day(row.paidAt)}</td>
                <td className="px-4 py-3 text-[var(--color-text-secondary)]">{row.note || '-'}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{usd(row.amount)}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </>
  );
}

function Mine({ page }: { page: SchoolBonusPage }) {
  const [studentPage, setStudentPage] = useState(1);
  const { data, meta, error, loading } = useApi<MineData>('/guuldoon-school-bonus/mine', { page: studentPage });
  if (error) return <Notice>{error}</Notice>;
  if (loading || !data) return <p>Loading...</p>;
  if (page === 'students') return <MineStudents data={data} meta={meta} page={studentPage} setPage={setStudentPage} />;
  if (page === 'earnings') return <MineEarnings data={data} />;
  return <MineOverview data={data} />;
}

/* ───────────── Page shell ───────────── */

const TITLES: Record<SchoolBonusPage, [string, string]> = {
  overview: ['Guudmar', 'Gunnada iskuulada ka helaan ardaydooda subscription-ka Guuldoon.'],
  schools: ['Iskuullada', 'Gunno % iyo xogta iskuul kasta. Cell-ka ardayda ayaa leh checkbox-yo: calaamadee fasalada iskuulku rabo, kuwa kale ha jirin; ardayda active ah iyo gunnada waxaa laga xisaabinayaa fasalada la calaamadeeyey oo keliya.'],
  payouts: ['Bixinta', 'Gunnada sugaysa in iskuullada la siiyo iyo taariikhda bixinta.'],
  students: ['Ardayda', 'Ardayda iskuulkaaga ee Guuldoon isticmaalaya.'],
  earnings: ['Gunnada', 'Sida gunnadaada loo xisaabiyo iyo wixii laguu bixiyey.'],
};

export function GuuldoonSchoolBonus({ page }: { page: SchoolBonusPage }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p className="p-6">Loading...</p>;
  const isSuper = user?.role === 'admin';
  const isSchool = user?.role === 'org_admin';
  const allowed = (isSuper && ['overview', 'schools', 'payouts'].includes(page)) || (isSchool && ['overview', 'students', 'earnings'].includes(page));
  if (!allowed) return <p role="alert" className="p-6">You do not have access to this page.</p>;
  const [title, subtitle] = TITLES[page];
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-semibold text-primary-600">Guuldoon &middot; Gunnada Iskuulka</p>
        <h1 className="mt-1 text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
      </header>
      {isSuper && page === 'overview' && <SuperOverview />}
      {isSuper && page === 'schools' && <Schools />}
      {isSuper && page === 'payouts' && <Payouts />}
      {isSchool && <Mine page={page} />}
    </main>
  );
}
