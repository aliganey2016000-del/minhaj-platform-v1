import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '../../../lib/axios';
import { AnswerCard, type AnswerItem } from '../components/guuldoon-answer-card';

type Answers = { answered: number; right: number; wrong: number; attempts: number; average: number; items: AnswerItem[] };
type Chapter = { id: string; title: string; mastery: number; examWeight: number };
type Course = { id: string; title: { en?: string; so?: string; ar?: string } | string; chapters: Chapter[] };

const courseTitle = (title: Course['title'] | undefined) => (typeof title === 'string' ? title : title?.so || title?.en || title?.ar || 'Guulgaar');
const barColor = (value: number) => (value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-rose-500');

/** Full page: every question the student answered in one chapter, with the verdict and the right answer. */
export function GuuldoonProgressChapter() {
  const { courseId, chapterId } = useParams<{ courseId: string; chapterId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'understand' | 'past'>('understand');
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [data, setData] = useState<Record<'understand' | 'past', Answers> | null>(null);
  const [meta, setMeta] = useState<{ course: Course; chapter: Chapter } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!courseId || !chapterId) return undefined;
    let live = true;
    const load = (kind: 'understand' | 'past') => api.get(`/guuldoon/courses/${courseId}/chapters/${encodeURIComponent(chapterId)}/my-answers`, { params: { kind } }).then(({ data: response }) => response.data as Answers);
    Promise.all([load('understand'), load('past'), api.get('/guuldoon/my-progress')])
      .then(([understand, past, progress]) => {
        if (!live) return;
        setData({ understand, past });
        const course = (progress.data.data.courses as Course[]).find((item) => item.id === courseId);
        const chapter = course?.chapters.find((item) => item.id === chapterId);
        if (course && chapter) setMeta({ course, chapter });
        if (!understand.answered && past.answered) setTab('past');
      })
      .catch((err) => { if (live) setError(err.response?.data?.message || 'Su’aalaha lama soo rari karin.'); });
    return () => { live = false; };
  }, [courseId, chapterId]);

  const current = data?.[tab];
  const items = useMemo(() => (current?.items || []).filter((item) => !onlyWrong || item.correct === false), [current, onlyWrong]);
  const practice = () => navigate(`/student/guuldoon/courses/${courseId}?chapter=${encodeURIComponent(chapterId || '')}&hub=1&tab=${tab}`);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-24 sm:p-6">
      <button type="button" onClick={() => navigate('/student/guuldoon/performance')} className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Horumarkayga</button>
      {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-500">{error}</p>}
      {!data && !error && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-emerald-500" size={30} /></div>}
      {data && (
        <>
          <header className="student-glass-card rounded-[24px] p-4">
            <p className="text-xs font-bold text-[var(--color-text-tertiary)]">{courseTitle(meta?.course.title)}</p>
            <h1 className="mt-1 text-2xl font-black" dir="auto">{meta?.chapter.title || 'Cutub'}</h1>
            {meta && (
              <div className="mt-3">
                <div className="flex items-baseline justify-between"><span className="text-xs font-bold text-[var(--color-text-tertiary)]">Xirfaddaada cutubkan</span><strong>{meta.chapter.mastery}%</strong></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full ${barColor(meta.chapter.mastery)}`} style={{ width: `${meta.chapter.mastery}%` }} /></div>
              </div>
            )}
          </header>

          <div role="tablist" className="grid grid-cols-2 gap-1.5 rounded-2xl border bg-[var(--color-surface-primary)] p-1.5">
            {([['understand', 'Fahamka cutubka'], ['past', 'Imtixaannadii hore']] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={'rounded-xl px-2 py-3 text-sm font-black ' + (tab === value ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)]')}>
                {label} <span className="text-xs opacity-80">({data[value].answered})</span>
              </button>
            ))}
          </div>

          {current && (
            <>
              <section className="grid grid-cols-4 gap-2 text-center">
                {[['La jawaabay', current.answered, ''], ['Saxday', current.right, 'text-emerald-600'], ['Qaladay', current.wrong, 'text-rose-500'], ['Celcelis', `${current.average}%`, '']].map(([label, value, colour]) => (
                  <div key={String(label)} className="rounded-2xl bg-[var(--color-surface-tertiary)] p-2.5"><strong className={`block text-lg ${colour}`}>{value}</strong><span className="text-[10px] font-semibold text-[var(--color-text-tertiary)]">{label}</span></div>
                ))}
              </section>
              <p className="text-xs text-[var(--color-text-secondary)]">Celceliska isku-dayada: {current.average}% ({current.attempts} isku-day oo dhan).</p>
              {current.wrong > 0 && <button type="button" aria-pressed={onlyWrong} onClick={() => setOnlyWrong(!onlyWrong)} className="rounded-full border px-4 py-1.5 text-xs font-bold">{onlyWrong ? 'Muuji dhammaan' : 'Qaladaadka oo keliya'}</button>}
              {current.answered === 0 && (
                <section className="student-glass-card rounded-[24px] p-6 text-center">
                  <p className="font-semibold">Weli su’aalo kama jawaabin qaybtan.</p>
                  <button type="button" onClick={practice} className="mt-3 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">Bilow hadda</button>
                </section>
              )}
              <div className="space-y-3">{items.map((item) => <AnswerCard key={item._id} item={item} onRetry={practice} />)}</div>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => navigate(`/student/guuldoon/courses/${courseId}?chapter=${encodeURIComponent(chapterId || '')}`)} className="rounded-xl border px-3 py-3 text-sm font-black">Akhri cutubka</button>
            <button type="button" onClick={practice} className="rounded-xl bg-emerald-600 px-3 py-3 text-sm font-black text-white">Tababar</button>
          </div>
        </>
      )}
    </main>
  );
}
