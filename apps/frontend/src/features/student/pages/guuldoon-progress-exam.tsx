import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import api from '../../../lib/axios';
import { AnswerCard, type AnswerItem } from '../components/guuldoon-answer-card';

type Review = {
  exam: { id: string; year: number; kind: string; totalMarks: number; durationMin: number };
  questionCount: number; earned: number; rounds: number; answered: number; right: number; wrong: number; attempts: number; average: number; items: AnswerItem[];
};

/** Full page: one past exam reviewed (score, average of all attempts, each answered question). Retake from here. */
export function GuuldoonProgressExam() {
  const { courseId, examId } = useParams<{ courseId: string; examId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Review | null>(null);
  const [course, setCourse] = useState('');
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!courseId || !examId) return undefined;
    let live = true;
    Promise.all([api.get(`/guuldoon/courses/${courseId}/exams/${examId}/my-answers`), api.get('/guuldoon/my-progress')])
      .then(([review, progress]) => {
        if (!live) return;
        setData(review.data.data as Review);
        const found = (progress.data.data.courses as { id: string; title: { en?: string; so?: string; ar?: string } | string }[]).find((item) => item.id === courseId);
        setCourse(typeof found?.title === 'string' ? found.title : found?.title?.so || found?.title?.en || found?.title?.ar || 'Guulgaar');
      })
      .catch((err) => { if (live) setError(err.response?.data?.message || 'Imtixaanka lama soo rari karin.'); });
    return () => { live = false; };
  }, [courseId, examId]);

  const retake = () => navigate(`/student/guuldoon/courses/${courseId}?tab=exams&exam=${examId}`);
  const percent = data && data.exam.totalMarks ? Math.round((data.earned / data.exam.totalMarks) * 100) : 0;
  const items = (data?.items || []).filter((item) => !onlyWrong || item.correct === false);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-24 sm:p-6">
      <button type="button" onClick={() => navigate('/student/guuldoon/performance')} className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Horumarkayga</button>
      {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-500">{error}</p>}
      {!data && !error && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-emerald-500" size={30} /></div>}
      {data && (
        <>
          <header className="rounded-3xl bg-gradient-to-br from-emerald-700 to-sky-700 p-5 text-white shadow-lg">
            <p className="text-xs font-bold text-white/80" dir="auto">{course}</p>
            <h1 className="mt-1 text-2xl font-black">Imtixaanka {data.exam.year}</h1>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/15 p-2.5"><strong className="block text-xl">{data.earned}/{data.exam.totalMarks}</strong><span className="text-[11px] text-white/80">Dhibcaha ({percent}%)</span></div>
              <div className="rounded-2xl bg-white/15 p-2.5"><strong className="block text-xl">{data.average}%</strong><span className="text-[11px] text-white/80">Celceliska isku-dayada</span></div>
              <div className="rounded-2xl bg-white/15 p-2.5"><strong className="block text-xl">{data.rounds || 0}</strong><span className="text-[11px] text-white/80">Isku-day</span></div>
            </div>
          </header>

          <section className="grid grid-cols-3 gap-2 text-center">
            {[['La jawaabay', `${data.answered}/${data.questionCount}`, ''], ['Saxday', data.right, 'text-emerald-600'], ['Qaladay', data.wrong, 'text-rose-500']].map(([label, value, colour]) => (
              <div key={String(label)} className="rounded-2xl bg-[var(--color-surface-tertiary)] p-2.5"><strong className={`block text-lg ${colour}`}>{value}</strong><span className="text-[10px] font-semibold text-[var(--color-text-tertiary)]">{label}</span></div>
            ))}
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={retake} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white"><RotateCcw size={15} />{data.answered ? 'Dib u day imtixaankan' : 'Bilow imtixaankan'}</button>
            {data.wrong > 0 && <button type="button" aria-pressed={onlyWrong} onClick={() => setOnlyWrong(!onlyWrong)} className="rounded-full border px-4 py-2 text-xs font-bold">{onlyWrong ? 'Muuji dhammaan' : 'Qaladaadka oo keliya'}</button>}
          </div>
          {data.answered < data.questionCount && data.answered > 0 && <p className="text-xs text-[var(--color-text-secondary)]">{data.questionCount - data.answered} su’aalood weli lama jawaabin. Dib u day si aad u dhammaystirto.</p>}

          <div className="space-y-3">{items.map((item) => <AnswerCard key={item._id} item={item} onRetry={retake} />)}</div>
        </>
      )}
    </main>
  );
}
