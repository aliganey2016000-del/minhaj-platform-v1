import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, BookOpen, CheckCircle2, ChevronDown, ChevronRight, Flame, Loader2, Target, Trophy } from 'lucide-react';
import api from '../../../lib/axios';

type Chapter = { id: string; title: string; order: number; examWeight: number; mastery: number; attempts: number; questionCount: number; practiceCount: number };
type Course = { id: string; title: { en?: string; so?: string; ar?: string } | string; passMeter: number; passTarget: number; chapters: Chapter[] };
type ExamRow = { examId: string; courseId: string; year: number; totalMarks: number; durationMin: number; questionCount: number; answered: number; correct: number; earned: number; rounds: number; average: number };
type Progress = {
  studentName: string; grade: number | null; passMeter: number; passTarget: number; streak: number; answered: number; accuracy: number; average: number; attemptsCount: number;
  rank: { position: number; of: number } | null; week: { day: string; n: number }[]; courses: Course[]; exams: ExamRow[];
};
const courseTitle = (title: Course['title']) => (typeof title === 'string' ? title : title?.so || title?.en || title?.ar || 'Guulgaar');
const tone = (value: number) => (value >= 70 ? 'bg-emerald-500 text-emerald-500' : value >= 40 ? 'bg-amber-500 text-amber-500' : 'bg-rose-500 text-rose-500');
const bar = (value: number) => tone(value).split(' ')[0];
const text = (value: number) => tone(value).split(' ')[1];
const DAYS = ['Axd', 'Isn', 'Sal', 'Arb', 'Kha', 'Jim', 'Sab'];

function Ring({ value }: { value: number }) {
  return (
    <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#7af0c8 ${Math.min(100, value)}%, rgba(255,255,255,.2) 0)` }}>
      <div className="flex h-[86px] w-[86px] flex-col items-center justify-center rounded-full bg-emerald-950 text-center text-white">
        <strong className="text-2xl leading-none">{value}%</strong>
        <span className="mt-1 text-[10px] text-white/70">Pass Meter</span>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, className }: { label: string; value: string | number; icon: React.ReactNode; className: string }) {
  return (
    <article className={`rounded-2xl p-3.5 text-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-2"><span className="rounded-xl bg-white/20 p-1.5">{icon}</span><strong className="text-2xl font-black tabular-nums">{value}</strong></div>
      <p className="mt-1.5 text-xs font-semibold text-white/90">{label}</p>
    </article>
  );
}

/** Student "My Progress": every subject of the grade, chapter mastery, exams and recent activity. */
export function GuuldoonMyProgress() {
  const navigate = useNavigate();
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'courses' | 'exams'>('courses');
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    setError('');
    api.get('/guuldoon/my-progress')
      .then(({ data: response }) => setData(response.data as Progress))
      .catch((err) => setError(err.response?.data?.message || 'Horumarkaaga lama soo rari karin.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const courseNames = useMemo(() => new Map((data?.courses || []).map((course) => [course.id, courseTitle(course.title)])), [data]);
  const exams = useMemo(() => (data?.exams || []).filter((row) => filter === 'all' || row.courseId === filter).sort((a, b) => b.year - a.year), [data, filter]);
  const maxDay = Math.max(1, ...(data?.week.map((day) => day.n) || [1]));

  if (error) return <div role="alert" className="mx-auto max-w-xl p-6 text-center"><p className="font-semibold">{error}</p><button type="button" onClick={load} className="mt-3 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white">Mar kale isku day</button></div>;
  if (!data) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  const message = data.answered === 0
    ? 'Bilow cutubkaaga ugu horreeya!'
    : data.passMeter >= data.passTarget ? 'Waad gaadhay target-ka. Sii wad!' : `${data.passTarget - data.passMeter}% ayaa kuu dhiman si aad u gaadho target-ka.`;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-24 sm:p-6">
      <header><p className="text-sm font-semibold text-emerald-600">Guulgaar{data.grade ? ` · Grade ${data.grade}` : ''}</p><h1 className="mt-1 text-2xl font-black">Horumarkayga</h1></header>

      <section className="grid grid-cols-[auto_1fr] items-center gap-4 rounded-3xl bg-gradient-to-br from-emerald-700 to-sky-700 p-5 text-white shadow-lg" aria-label="Pass Meter">
        <Ring value={data.passMeter} />
        <div className="min-w-0">
          <h2 className="text-xl font-black">{data.studentName ? `Waad hormarineysaa, ${data.studentName}!` : 'Waad hormarineysaa!'}</h2>
          <p className="mt-1 text-sm text-white/90">{message}</p>
          <span className="mt-2 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-extrabold">Target: {data.passTarget}%</span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Kooban">
        <Stat label="Maalmood isku xigta" value={data.streak} icon={<Flame size={16} />} className="bg-gradient-to-br from-orange-500 to-rose-500" />
        <Stat label="Su’aalo la saxay" value={data.answered} icon={<CheckCircle2 size={16} />} className="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <Stat label={data.attemptsCount ? `Celceliska isku-dayada (${data.attemptsCount})` : 'Celceliska isku-dayada'} value={`${data.average}%`} icon={<Target size={16} />} className="bg-gradient-to-br from-sky-500 to-indigo-600" />
        <Stat label={data.rank ? `Booskaaga (${data.rank.of} arday)` : 'Booskaaga'} value={data.rank ? `#${data.rank.position}` : '-'} icon={<Trophy size={16} />} className="bg-gradient-to-br from-violet-500 to-fuchsia-600" />
      </section>

      <div role="tablist" aria-label="Horumarka" className="sticky top-0 z-10 grid grid-cols-2 gap-1.5 rounded-2xl border bg-[var(--color-surface-primary)] p-1.5 shadow-sm">
        {([['courses', 'Maadooyin', data.courses.length], ['exams', 'Imtixaanno', data.exams.length]] as const).map(([value, label, count]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={'rounded-xl px-3 py-3 text-sm font-black ' + (tab === value ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)]')}>
            {label} <span className="ml-1 rounded-full bg-black/10 px-2 py-0.5 text-xs">{count}</span>
          </button>
        ))}
      </div>

      {tab === 'courses' && (
        <div className="space-y-4">
          {data.courses.length === 0 && (
            <section className="student-glass-card rounded-[24px] p-6 text-center">
              <Award className="mx-auto text-emerald-500" size={34} />
              <h2 className="mt-2 text-lg font-black">Bilow cutubkaaga ugu horreeya</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Horumarkaaga halkan ayaa lagu arki doonaa marka aad su’aalo jawaabto.</p>
              <button type="button" onClick={() => navigate('/student/global-courses')} className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">Tag koorsooyinka</button>
            </section>
          )}
          {data.courses.map((course) => (
            <details key={course.id} className="student-glass-card group rounded-[24px]">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-black text-white">{courseTitle(course.title)[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-black" dir="auto">{courseTitle(course.title)}</span>
                  <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><span className={`block h-full ${bar(course.passMeter)}`} style={{ width: `${course.passMeter}%` }} /></span>
                </span>
                <strong className={`text-lg ${text(course.passMeter)}`}>{course.passMeter}%</strong>
                <ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-1 px-2 pb-3">
                {course.chapters.length === 0 && <p className="px-3 pb-2 text-sm text-[var(--color-text-secondary)]">Cutubyo wali lama daabicin.</p>}
                {[...course.chapters].sort((a, b) => a.mastery - b.mastery || a.order - b.order).map((chapter, position) => (
                  <button key={chapter.id} type="button" onClick={() => navigate(`/student/guuldoon/progress/${course.id}/chapters/${encodeURIComponent(chapter.id)}`)} className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left hover:bg-[var(--color-surface-tertiary)]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-tertiary)] text-xs font-black">{position + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-bold" dir="auto">{chapter.title}</span>
                      <span className="mt-1 block h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><span className={`block h-full ${bar(chapter.mastery)}`} style={{ width: `${chapter.mastery}%` }} /></span>
                    </span>
                    <strong className={`text-sm tabular-nums ${text(chapter.mastery)}`}>{chapter.mastery}%</strong>
                    <ChevronRight size={16} className="shrink-0 text-[var(--color-text-tertiary)]" />
                  </button>
                ))}
              </div>
            </details>
          ))}

          <section className="student-glass-card rounded-[24px] p-4">
            <div className="flex items-baseline justify-between"><h2 className="font-black">Toddobaadkan</h2><span className="text-xs text-[var(--color-text-tertiary)]">Su’aalo maalin kasta</span></div>
            <div className="mt-3 flex h-28 items-end gap-2">
              {data.week.map((day) => (
                <div key={day.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[11px] font-extrabold tabular-nums">{day.n}</span>
                  <span className="w-full rounded-lg bg-gradient-to-t from-emerald-500 to-sky-500" style={{ height: `${Math.max(4, (day.n / maxDay) * 70)}px` }} />
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">{DAYS[new Date(`${day.day}T12:00:00Z`).getUTCDay()]}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'exams' && (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Maado">
            {[{ id: 'all', name: 'Dhammaan' }, ...data.courses.map((course) => ({ id: course.id, name: courseTitle(course.title) }))].map((option) => (
              <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)} className={'shrink-0 rounded-full border px-4 py-2 text-xs font-extrabold ' + (filter === option.id ? 'border-emerald-600 bg-emerald-600 text-white' : '')}>{option.name}</button>
            ))}
          </div>
          <section className="student-glass-card rounded-[24px] p-4">
            <div className="flex items-baseline justify-between"><h2 className="font-black">Dhammaan imtixaannada</h2><span className="text-xs text-[var(--color-text-tertiary)]">{exams.filter((row) => row.answered > 0).length} / {exams.length} la isku dayay</span></div>
            {exams.length === 0 && <p className="mt-3 text-sm text-[var(--color-text-secondary)]">Imtixaanno wali looma daabicin.</p>}
            <div className="mt-3 space-y-2">
              {exams.map((row) => {
                const done = row.answered > 0;
                const percent = row.totalMarks ? Math.round((row.earned / row.totalMarks) * 100) : 0;
                const review = `/student/guuldoon/progress/${row.courseId}/exams/${row.examId}`;
                const start = `/student/guuldoon/courses/${row.courseId}?tab=exams&exam=${row.examId}`;
                return (
                  <article key={row.examId} className={'space-y-2.5 rounded-2xl border p-3 ' + (done ? 'border-emerald-500/30 bg-emerald-500/5' : '')}>
                    <div className="grid grid-cols-[52px_1fr_auto] items-center gap-3">
                      <strong className="text-lg">{row.year}</strong>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold" dir="auto">{courseNames.get(row.courseId)}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{done ? `${row.answered}/${row.questionCount} la jawaabay · ${row.rounds} isku-day` : `${row.questionCount} su’aalood · weli lama isku dayin`}</p>
                      </div>
                      {done ? <strong className={`text-lg tabular-nums ${text(percent)}`}>{percent}%</strong> : <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2.5 py-1 text-[11px] font-bold">Cusub</span>}
                    </div>
                    {done && <p className="text-xs font-semibold text-[var(--color-text-secondary)]">Dhibcaha: {row.earned}/{row.totalMarks} · {row.correct} saxday markii hore · Celceliska isku-dayada: {row.average}%</p>}
                    <div className="flex gap-2">
                      {done ? (
                        <>
                          <button type="button" onClick={() => navigate(review)} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white">Eeg</button>
                          <button type="button" onClick={() => navigate(start)} className="flex-1 rounded-xl border px-3 py-2.5 text-xs font-black">Dib u day</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => navigate(start)} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white">Bilow hadda</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <p className="flex items-center justify-center gap-1 text-center text-xs text-[var(--color-text-tertiary)]"><BookOpen size={12} /> Horumarkaaga waxaa lagu xisaabiyaa jawaabaha markii ugu horreysay.</p>
    </main>
  );
}
