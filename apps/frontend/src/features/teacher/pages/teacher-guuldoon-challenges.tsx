import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, Check, ChevronRight, GraduationCap, Loader2, Plus, School, Trophy, Users, X } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { getTeacherGuulgaarSnapshot, saveTeacherGuulgaarSnapshot } from '../../../lib/teacher-guulgaar-offline';
import { GuuldoonQuestionPicker } from '../components/guuldoon-question-picker';

type Chapter = { id: string; number: number; title: string; understand: number; past: number };
type Exam = { id: string; year: number; questions: number; durationMin: number; totalMarks: number };
type CourseOption = { id: string; title: string; grade: number; language: 'so' | 'en' | 'ar'; chapters: Chapter[]; exams: Exam[] };
type Option = { courses: CourseOption[]; classes: { id: string; title: string; grade: number; school: string }[]; platformWide: boolean };
type Row = { id: string; title: string; status: string; deadline: string | null; questions: number; students: number; done: number; started: number };

const field = 'w-full rounded-2xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm font-semibold outline-none transition focus:border-emerald-500';

function Step({ n, title, hint, tone, children }: { n: number; title: string; hint?: string; tone: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm">
      <header className={'flex items-center gap-3 px-4 py-3.5 text-white sm:px-5 ' + tone}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/25 text-sm font-black">{n}</span>
        <div className="min-w-0"><h3 className="text-base font-black sm:text-lg">{title}</h3>{hint && <p className="text-xs text-white/85">{hint}</p>}</div>
      </header>
      <div className="space-y-3 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Ring({ value, tone }: { value: number; tone: string }) {
  const r = 22; const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14 shrink-0 -rotate-90" aria-hidden>
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-slate-500/20" />
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} className={tone} />
    </svg>
  );
}

/** Teacher / Super Admin: challenges list and the form to open a new one. */
export function TeacherGuuldoonChallenges() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = useLocation().pathname.startsWith('/admin') ? '/admin' : '/teacher';
  const [rows, setRows] = useState<Row[] | null>(null);
  const [options, setOptions] = useState<Option | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>(['understand']);
  const [examIds, setExamIds] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [allSchools, setAllSchools] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [picker, setPicker] = useState<{ key: string; title: string; chapterId?: string; examId?: string; source?: 'understand' | 'past' } | null>(null);
  const [count, setCount] = useState<{ questions: number; tooMany: boolean; max: number } | null>(null);

  const load = useCallback(() => {
    const userId = user?.id || '';
    void getTeacherGuulgaarSnapshot<Row[]>(userId, 'challenges').then((snapshot) => {
      if (snapshot) setRows(snapshot.value);
    });
    if (!navigator.onLine) {
      setRows((current) => current ?? []);
      return;
    }
    api.get('/guuldoon-challenges')
      .then(({ data }) => {
        setRows(data.data as Row[]);
        setError('');
        void saveTeacherGuulgaarSnapshot(userId, 'challenges', data.data as Row[]);
      })
      .catch((err) => {
        if (!rows) setError(err.response?.data?.message || 'Tartannada lama soo rari karin. Connect online once to prepare offline data.');
      });
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open || options) return;
    api.get('/guuldoon-challenges/options').then(({ data }) => setOptions(data.data as Option)).catch((err) => setError(err.response?.data?.message || 'Doorashooyinka lama helin.'));
  }, [open, options]);

  const course = useMemo(() => options?.courses.find((item) => item.id === courseId), [options, courseId]);
  const classes = useMemo(() => (options?.classes || []).filter((item) => !course || item.grade === course.grade), [options, course]);
  const bySchool = useMemo(() => {
    const groups = new Map<string, Option['classes']>();
    for (const item of classes) groups.set(item.school, [...(groups.get(item.school) || []), item]);
    return [...groups.entries()];
  }, [classes]);
  const toggle = (list: string[], set: (value: string[]) => void, id: string) => set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const pickCourse = (id: string) => { setCourseId(id); setChapterIds([]); setExamIds([]); setClassIds([]); setAllSchools(false); setCount(null); setPicks({}); setPicker(null); };
  const pickedIds = useMemo(() => [...new Set(Object.values(picks).flat())], [picks]);
  const pickedIn = (prefix: string) => Object.entries(picks).filter(([key]) => key.startsWith(prefix)).reduce((sum, [, ids]) => sum + ids.length, 0);
  const hasMaterial = (chapterIds.length > 0 && sources.length > 0) || examIds.length > 0 || pickedIds.length > 0;

  // Exact question count for the current selection.
  useEffect(() => {
    if (!courseId || !hasMaterial) { setCount(null); return undefined; }
    const handle = window.setTimeout(() => {
      api.post('/guuldoon-challenges/preview', { courseId, chapterIds, sources, examIds, questionIds: pickedIds }).then(({ data }) => setCount(data.data)).catch(() => setCount(null));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [courseId, chapterIds, sources, examIds, pickedIds, hasMaterial]);

  const ready = !!title.trim() && !!courseId && hasMaterial && (allSchools || classIds.length > 0) && !count?.tooMany;
  const submit = async () => {
    setError(''); setSaving(true);
    try {
      const { data } = await api.post('/guuldoon-challenges', {
        title, courseId, chapterIds, sources: chapterIds.length ? sources : [], examIds, questionIds: pickedIds,
        classIds: allSchools ? undefined : classIds, allSchools: allSchools || undefined,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
      });
      navigate(`${base}/guuldoon/challenges/${data.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Tartanka lama abuuri karin.');
    } finally { setSaving(false); }
  };

  const active = rows?.filter((row) => row.status === 'active').length || 0;
  const rtl = course?.language === 'ar' ? 'rtl' : 'ltr';

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 pb-32 sm:p-6">
      <header className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-indigo-600 via-emerald-600 to-sky-600 p-5 text-white shadow-xl sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.18em] text-white/85"><Trophy size={15} />Guulgaar</p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">Tartanada</h1>
            <p className="mt-1.5 max-w-md text-sm text-white/90">Ardayda u fur tartan suaalo ah, kadibna ka daawo natiijada qof walba.</p>
          </div>
          <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-emerald-700 shadow-lg transition hover:scale-[1.02]">
            {open ? <><X size={17} />Xidh foomka</> : <><Plus size={17} />Tartan cusub</>}
          </button>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:max-w-sm">
          <div className="rounded-2xl bg-white/15 p-3 backdrop-blur"><strong className="block text-2xl font-black">{active}</strong><span className="text-xs text-white/85">Tartan furan</span></div>
          <div className="rounded-2xl bg-white/15 p-3 backdrop-blur"><strong className="block text-2xl font-black">{rows?.length ?? 0}</strong><span className="text-xs text-white/85">Wadarta tartanada</span></div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-2xl bg-rose-500/10 p-3.5 text-sm font-bold text-rose-500">{error}</p>}

      {open && (
        <div className="space-y-4">
          {!options && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-emerald-500" /></div>}
          {options && (
            <>
              <Step n={1} title="Magaca tartanka" tone="bg-gradient-to-r from-indigo-600 to-indigo-500">
                <input className={field} value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="Tusaale: Cutubka 3aad · Dhaqdhaqaaqa" aria-label="Magaca tartanka" dir="auto" />
              </Step>

              <Step n={2} title="Maaddada" hint="Dooro buugga tartanku ka yimaado" tone="bg-gradient-to-r from-emerald-600 to-teal-500">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {options.courses.map((item) => (
                    <button key={item.id} type="button" aria-pressed={courseId === item.id} onClick={() => pickCourse(item.id)}
                      className={'flex min-h-[64px] items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition ' + (courseId === item.id ? 'border-emerald-500 bg-emerald-500/10 shadow-md' : 'border-[var(--color-border-subtle)] hover:border-emerald-500/40')}>
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-sky-500 text-white"><GraduationCap size={22} /></span>
                      <span className="min-w-0 flex-1"><b className="block truncate text-sm" dir="auto">{item.title}</b><span className="text-xs text-[var(--color-text-tertiary)]">Grade {item.grade}</span></span>
                      {courseId === item.id && <Check size={18} className="shrink-0 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              </Step>

              {course && (
                <>
                  <Step n={3} title="Cutubyada" hint="Magacyada waxay u qoran yihiin sida buugga" tone="bg-gradient-to-r from-sky-600 to-cyan-500">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-full bg-[var(--color-surface-tertiary)] p-1 text-xs font-extrabold" role="group" aria-label="Nooca su'aalaha">
                        {([['understand', 'Fahamka cutubka'], ['past', 'Imtixaanadii hore']] as const).map(([key, label]) => (
                          <button key={key} type="button" aria-pressed={sources.includes(key)} onClick={() => toggle(sources, setSources, key)}
                            className={'rounded-full px-3.5 py-2 transition ' + (sources.includes(key) ? 'bg-sky-600 text-white shadow' : 'text-[var(--color-text-secondary)]')}>{label}</button>
                        ))}
                      </div>
                      <button type="button" onClick={() => setChapterIds(chapterIds.length === course.chapters.length ? [] : course.chapters.map((chapter) => chapter.id))} className="ml-auto rounded-full border px-3.5 py-2 text-xs font-extrabold">
                        {chapterIds.length === course.chapters.length ? 'Ka saar dhammaan' : 'Dooro dhammaan'}
                      </button>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {course.chapters.map((chapter) => {
                        const on = chapterIds.includes(chapter.id);
                        const partial = pickedIn(`chapter:${chapter.id}:`);
                        return (
                          <div key={chapter.id} className={'flex flex-col rounded-2xl border-2 transition ' + (on ? 'border-sky-500 bg-sky-500/10 shadow-md' : partial ? 'border-sky-400/60 bg-sky-500/5' : 'border-[var(--color-border-subtle)] hover:border-sky-500/40')}>
                            <button type="button" aria-pressed={on} onClick={() => toggle(chapterIds, setChapterIds, chapter.id)} className="flex min-h-[76px] flex-1 items-start gap-3 p-3 text-left">
                              <span className={'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ' + (on ? 'bg-sky-600 text-white' : 'bg-sky-500/15 text-sky-600')}>{on ? <Check size={17} /> : chapter.number}</span>
                              <span className="min-w-0 flex-1">
                                <b className="block break-words text-sm leading-5" dir={rtl}>{chapter.title}</b>
                                <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
                                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-600">Fahan {chapter.understand}</span>
                                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600">Imtixaan {chapter.past}</span>
                                </span>
                              </span>
                            </button>
                            {!on && (
                              <button type="button" onClick={() => setPicker({ key: `chapter:${chapter.id}:${sources.includes('past') && !sources.includes('understand') ? 'past' : 'understand'}`, title: chapter.title, chapterId: chapter.id, source: sources.includes('past') && !sources.includes('understand') ? 'past' : 'understand' })}
                                className="mx-3 mb-3 min-h-[40px] rounded-xl border border-sky-500/50 bg-sky-500/10 px-3 text-xs font-extrabold text-sky-700">
                                {partial ? `${partial} su’aal la doortay · wax ka beddel` : 'Dooro qaar kamid ah'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Step>

                  {course.exams.length > 0 && (
                    <Step n={4} title="Imtixaannada (ikhtiyaari)" hint="Dhan ama dooro qaar kamid ah" tone="bg-gradient-to-r from-amber-500 to-orange-500">
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                        {course.exams.map((exam) => {
                          const on = examIds.includes(exam.id);
                          const partial = pickedIn(`exam:${exam.id}`);
                          return (
                            <div key={exam.id} className={'flex flex-col rounded-2xl border-2 transition ' + (on ? 'border-amber-500 bg-amber-500/10 shadow-md' : partial ? 'border-amber-400/60 bg-amber-500/5' : 'border-[var(--color-border-subtle)] hover:border-amber-500/40')}>
                              <button type="button" aria-pressed={on} onClick={() => toggle(examIds, setExamIds, exam.id)} className="p-3 text-left">
                                <div className="flex items-center justify-between"><strong className="text-2xl font-black">{exam.year}</strong>{on && <Check size={17} className="text-amber-600" />}</div>
                                <p className="mt-1 text-[11px] font-bold text-[var(--color-text-secondary)]">{exam.questions} suaal</p>
                                <p className="text-[11px] text-[var(--color-text-tertiary)]">{exam.durationMin} daq · {exam.totalMarks} dhibcood</p>
                              </button>
                              {!on && (
                                <button type="button" onClick={() => setPicker({ key: `exam:${exam.id}`, title: `Imtixaanka ${exam.year}`, examId: exam.id })}
                                  className="mx-3 mb-3 min-h-[40px] rounded-xl border border-amber-500/50 bg-amber-500/10 px-2 text-xs font-extrabold text-amber-700">
                                  {partial ? `${partial} la doortay` : 'Dooro qaar'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </Step>
                  )}

                  <Step n={5} title="Fasallada" hint={options.platformWide ? 'Iskuul kasta ama dhammaan' : 'Fasallada iskuulkaaga'} tone="bg-gradient-to-r from-fuchsia-600 to-pink-500">
                    {options.platformWide && (
                      <label className={'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 transition ' + (allSchools ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-[var(--color-border-subtle)]')}>
                        <input type="checkbox" className="h-5 w-5 accent-fuchsia-600" checked={allSchools} onChange={(event) => setAllSchools(event.target.checked)} />
                        <span><b className="block text-sm">Dhammaan iskuullada</b><span className="text-xs text-[var(--color-text-tertiary)]">Fasal kasta oo Grade {course.grade} ah, iskuul kasta</span></span>
                        <Users size={20} className="ml-auto shrink-0 text-fuchsia-500" />
                      </label>
                    )}
                    {classes.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)]">Fasal Grade {course.grade} ah ma jiro.</p>}
                    {!allSchools && bySchool.map(([schoolName, list]) => (
                      <div key={schoolName || 'own'} className="space-y-2">
                        {schoolName && <p className="flex items-center gap-1.5 text-xs font-extrabold text-[var(--color-text-secondary)]"><School size={14} />{schoolName}</p>}
                        <div className="flex flex-wrap gap-2">{list.map((item) => (
                          <button key={item.id} type="button" aria-pressed={classIds.includes(item.id)} onClick={() => toggle(classIds, setClassIds, item.id)}
                            className={'min-h-[44px] rounded-full border-2 px-4 text-sm font-extrabold transition ' + (classIds.includes(item.id) ? 'border-fuchsia-500 bg-fuchsia-600 text-white' : 'border-[var(--color-border-subtle)] hover:border-fuchsia-500/40')}>{item.title}</button>
                        ))}</div>
                      </div>
                    ))}
                  </Step>

                  <Step n={6} title="Dhammaadka" hint="Ikhtiyaari" tone="bg-gradient-to-r from-rose-500 to-red-500">
                    <label className="flex items-center gap-3"><CalendarClock size={20} className="shrink-0 text-rose-500" />
                      <input type="datetime-local" className={field} value={deadline} onChange={(event) => setDeadline(event.target.value)} aria-label="Dhammaadka" /></label>
                  </Step>
                </>
              )}
            </>
          )}
        </div>
      )}

      {rows && rows.length === 0 && !open && (
        <section className="rounded-[26px] border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 p-8 text-center"><Trophy className="mx-auto mb-2 text-emerald-500" size={34} /><p className="font-black">Weli tartan ma furin</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Riix “Tartan cusub” si aad u bilowdo.</p></section>
      )}
      {!rows && !error && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-emerald-500" size={30} /></div>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {rows?.map((row) => {
          const percent = row.students ? Math.round((row.done / row.students) * 100) : 0;
          const expired = !!row.deadline && new Date(row.deadline).getTime() < Date.now();
          const closed = row.status === 'closed';
          const tone = closed ? 'stroke-slate-400' : expired ? 'stroke-rose-500' : 'stroke-emerald-500';
          return (
            <li key={row.id}>
              <button type="button" onClick={() => navigate(`${base}/guuldoon/challenges/${row.id}`)}
                className="group flex w-full items-center gap-4 rounded-[24px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative shrink-0"><Ring value={percent} tone={tone} /><span className="absolute inset-0 grid place-items-center text-[11px] font-black">{percent}%</span></div>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-base" dir="auto">{row.title}</b>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{row.questions} suaal · {row.students} arday</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-extrabold">
                    <span className={'rounded-full px-2 py-0.5 ' + (closed ? 'bg-slate-500/15' : expired ? 'bg-rose-500/15 text-rose-500' : 'bg-emerald-500/15 text-emerald-600')}>{closed ? 'La xiray' : expired ? 'Waqtigii wuu dhammaaday' : 'Furan'}</span>
                    {row.deadline && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600">{new Date(row.deadline).toLocaleDateString()}</span>}
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-600">{row.done}/{row.students} dhammeeyay</span>
                  </div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-[var(--color-text-tertiary)] transition group-hover:translate-x-0.5" />
              </button>
            </li>
          );
        })}
      </ul>

      {picker && course && (
        <GuuldoonQuestionPicker courseId={course.id} chapterId={picker.chapterId} examId={picker.examId} source={picker.source} title={picker.title} rtl={rtl}
          onSourceChange={picker.chapterId ? (next) => setPicker({ ...picker, source: next, key: `chapter:${picker.chapterId}:${next}` }) : undefined}
          selected={picks[picker.key] || []} onChange={(ids) => setPicks((current) => ({ ...current, [picker.key]: ids }))} onClose={() => setPicker(null)} />
      )}

      {open && options && course && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:left-[var(--sidebar-width,0px)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <b className={'block text-lg font-black ' + (count?.tooMany ? 'text-rose-500' : 'text-emerald-600')}>{count ? `${count.questions}${count.tooMany ? '+' : ''} suaal` : 'Dooro waxa lagu daro'}</b>
              <span className="text-xs text-[var(--color-text-tertiary)]">{count?.tooMany ? `Ugu badnaan ${count.max} suaal` : allSchools ? 'Dhammaan iskuullada' : `${classIds.length} fasal`}</span>
            </div>
            <button type="button" disabled={!ready || saving} onClick={() => void submit()} className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-sky-600 px-6 text-sm font-black text-white shadow-lg disabled:opacity-50">
              {saving && <Loader2 size={16} className="animate-spin" />}Bilow tartanka
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
