import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

type Period = 'week' | 'month' | 'all';
type StudentRow = { rank: number; name: string; school: string | null; points: number; streak: number; isMe: boolean };
type SchoolRow = { rank: number; school: string; students: number; score: number };
type Me = { rank: number; points: number; streak: number; behind: number; showName: boolean };
type StudentBoard = { entries: StudentRow[]; me: Me | null; totalRanked: number; scoring: { perQuestion: number; streakPerDay: number; streakMaxDays: number; dailyCap: number } };
type SchoolBoard = { entries: SchoolRow[]; minStudents: number };

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Toddobaad' },
  { value: 'month', label: 'Bil' },
  { value: 'all', label: 'Guud' },
];
const AVATAR_COLORS = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-pink-500'];
const num = (value: number) => value.toLocaleString('en-US');
const errorText = (error: unknown, fallback: string) => (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

function colorFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function initials(name: string, school: boolean) {
  const words = name.replace(/^(Iskuulka|School)\s+/i, '').split(/\s+/).filter(Boolean);
  if (school) return (words[0] || '?').charAt(0).toUpperCase();
  return ((words[0] || '?').charAt(0) + (words[1] ? words[1].charAt(0) : '')).toUpperCase();
}

function Avatar({ name, school = false, size = 'md' }: { name: string; school?: boolean; size?: 'md' | 'lg' | 'xl' }) {
  const dim = size === 'xl' ? 'h-16 w-16 text-2xl' : size === 'lg' ? 'h-12 w-12 text-lg' : 'h-10 w-10 text-base';
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center font-bold text-white ${dim} ${school ? 'rounded-xl' : 'rounded-full'} ${colorFor(name)}`}>{initials(name, school)}</span>;
}

function Segments<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-2xl bg-white/20 p-1">
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}
          className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${value === option.value ? 'bg-white text-teal-800 shadow' : 'text-white hover:bg-white/10'}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Podium({ rows, school }: { rows: { name: string; sub: string | null; value: number }[]; school: boolean }) {
  const slots = [
    { idx: 1, label: '#2', ring: 'border-t-slate-400', badge: 'bg-slate-400 text-white', size: 'lg' as const },
    { idx: 0, label: '#1', ring: 'border-t-amber-400', badge: 'bg-amber-400 text-amber-950', size: 'xl' as const },
    { idx: 2, label: '#3', ring: 'border-t-orange-400', badge: 'bg-orange-400 text-white', size: 'lg' as const },
  ];
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
      {slots.map(({ idx, label, ring, badge, size }) => {
        const row = rows[idx];
        if (!row) return <div key={label} />;
        return (
          <div key={label} className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl border-t-4 bg-[var(--color-surface-primary)] px-2 py-3 text-center shadow-sm ${ring} ${idx === 0 ? 'pb-5 pt-5' : ''}`}>
            {idx === 0 && <span aria-hidden="true" className="text-2xl leading-none">👑</span>}
            <Avatar name={row.name} school={school} size={size} />
            <span className={`rounded-full px-3 text-xs font-bold ${badge}`}>{label}</span>
            <p className="w-full break-words text-sm font-bold">{row.name}</p>
            <p className="text-lg font-extrabold tabular-nums text-teal-700 dark:text-teal-300">{num(row.value)}</p>
            {row.sub && <p className="w-full break-words text-xs text-[var(--color-text-secondary)]">{row.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}

function RankList({ rows, max, school }: { rows: { rank: number; name: string; sub: string; value: number; streak?: number; me?: boolean }[]; max: number; school: boolean }) {
  return (
    <ol className="space-y-2">
      {rows.map((row) => (
        <li key={`${row.rank}-${row.name}`} className={`grid grid-cols-[1.75rem_2.5rem_1fr_auto] items-center gap-3 rounded-2xl border p-3 shadow-sm ${row.me ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'bg-[var(--color-surface-primary)]'}`}>
          <span className="text-center font-extrabold tabular-nums text-[var(--color-text-tertiary)]">{row.rank}</span>
          <Avatar name={row.name} school={school} />
          <div className="min-w-0">
            <p className="break-words font-bold">{row.name}{row.me && <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">Adiga</span>}</p>
            <p className="break-words text-xs text-[var(--color-text-secondary)]">{row.sub}{!!row.streak && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">🔥 {row.streak}</span>}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500" style={{ width: `${Math.max(2, Math.round((row.value / (max || 1)) * 100))}%` }} /></div>
          </div>
          <p className="text-right text-lg font-extrabold tabular-nums">{num(row.value)}</p>
        </li>
      ))}
    </ol>
  );
}

/** National Guuldoon leaderboard: students and schools, per grade and period. */
export function GuuldoonLeaderboard() {
  const { user, isLoading } = useAuth();
  const isStudent = user?.role === 'student';
  const [view, setView] = useState<'students' | 'schools'>('students');
  const [grade, setGrade] = useState<'12' | '8'>('12');
  const [period, setPeriod] = useState<Period>('week');
  const [students, setStudents] = useState<StudentBoard | null>(null);
  const [schools, setSchools] = useState<SchoolBoard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    let live = true;
    setLoading(true);
    const params = { grade, period };
    const request = view === 'students'
      ? api.get('/guuldoon-leaderboard/students', { params }).then(({ data }) => { if (live) setStudents(data.data as StudentBoard); })
      : api.get('/guuldoon-leaderboard/schools', { params }).then(({ data }) => { if (live) setSchools(data.data as SchoolBoard); });
    request.then(() => { if (live) setError(''); })
      .catch((err: unknown) => { if (live) setError(errorText(err, 'Ma soo raran karo tartanka.')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [view, grade, period]);
  useEffect(() => load(), [load]);

  const toggleName = async (showName: boolean) => {
    setSaving(true);
    try { await api.patch('/guuldoon-leaderboard/me/visibility', { showName }); load(); }
    catch (err) { setError(errorText(err, 'Ma keydin karo doorashada.')); }
    finally { setSaving(false); }
  };

  if (isLoading) return <p className="p-6">Loading...</p>;
  if (!user || !['student', 'teacher', 'org_admin', 'admin'].includes(user.role)) return <p role="alert" className="p-6">You do not have access to this page.</p>;

  const studentRows = students?.entries || [];
  const schoolRows = schools?.entries || [];
  const podiumRows = view === 'students'
    ? studentRows.map((row) => ({ name: row.name, sub: row.school, value: row.points }))
    : schoolRows.map((row) => ({ name: row.school, sub: `${row.students} arday`, value: row.score }));
  const rest = view === 'students'
    ? studentRows.slice(3).map((row) => ({ rank: row.rank, name: row.name, sub: row.school || 'Iskuul qarsoon', value: row.points, streak: row.streak, me: row.isMe }))
    : schoolRows.slice(3).map((row) => ({ rank: row.rank, name: row.school, sub: `${row.students} arday · celcelis`, value: row.score }));
  const max = podiumRows[0]?.value || 1;
  const me = students?.me;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-28 sm:p-6 sm:pb-28">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-sky-600 to-emerald-500 p-5 text-white shadow-lg sm:p-7">
        <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/15" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-amber-300/40" />
        <div className="relative">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">🏆 Guulgaar Tartanka</h1>
          <p className="mt-1 max-w-md text-sm text-white/90">Ardayda iyo iskuullada ugu horreeya dalka oo dhan.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Segments label="Nooca" value={view} onChange={setView} options={[{ value: 'students', label: 'Arday' }, { value: 'schools', label: 'Iskuullo' }]} />
            <Segments label="Fasalka" value={grade} onChange={setGrade} options={[{ value: '12', label: 'Grade 12' }, { value: '8', label: 'Grade 8' }]} />
            <div className="sm:col-span-2"><Segments label="Muddada" value={period} onChange={setPeriod} options={PERIODS} /></div>
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && !error && <p className="text-center text-sm text-[var(--color-text-secondary)]">Loading...</p>}

      {!loading && !error && podiumRows.length === 0 && (
        <p className="rounded-2xl border bg-[var(--color-surface-primary)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
          {view === 'schools' ? `Wali iskuul ma gaadhin ${schools?.minStudents ?? 3} arday oo subscription leh fasalkan.` : 'Wali ma jiraan dhibco muddadan. Ku bilow su’aalo Guulgaar.'}
        </p>
      )}
      {!error && podiumRows.length > 0 && (
        <>
          <Podium rows={podiumRows} school={view === 'schools'} />
          {rest.length > 0 && <RankList rows={rest} max={max} school={view === 'schools'} />}
        </>
      )}

      {isStudent && (
        <label className="flex items-start gap-3 rounded-2xl border-2 border-dashed p-3 text-sm text-[var(--color-text-secondary)]">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" disabled={saving || !me} checked={!!me?.showName} onChange={(event) => void toggleName(event.target.checked)} />
          <span><b>Ogolaansho:</b> muuji magaca koowaad, xarafka dambe iyo iskuulkayga. Haddii la damiyo, waxaa lagu muujiyaa &ldquo;Arday #...&rdquo;.</span>
        </label>
      )}
      <p className="text-center text-xs text-[var(--color-text-tertiary)]">
        {students?.scoring ? `Dhibcaha: ${students.scoring.perQuestion} dhibcood su’aal kasta oo markii ugu horreysay si sax ah looga jawaabo, ugu badnaan ${students.scoring.dailyCap} maalintii.` : 'Dhibcaha waxay ka yimaadaan su’aalaha Guulgaar ee si sax ah looga jawaabay markii ugu horreysay.'}
      </p>

      {isStudent && view === 'students' && me && me.rank > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-r from-teal-700 to-sky-600 px-4 py-3 text-white shadow-lg" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
            <span>Booskaaga <b className="ml-1 rounded-xl bg-white px-3 py-0.5 text-xl text-teal-800">#{me.rank}</b></span>
            <span className="text-sm">{num(me.points)} dhibcood{me.streak > 0 ? ` · 🔥 ${me.streak} maalmood` : ''}{me.behind > 0 ? ` · ${num(me.behind)} ka hooseysaa kan ka sarreeya` : ' · waxaad ku jirtaa kaalinta koowaad'}</span>
          </div>
        </div>
      )}
    </main>
  );
}
