import { useNavigate } from 'react-router-dom';

export type Challenge = { id: string; title: string; deadline: string | null; courseId: string; total: number; done: number; right: number; chapterId: string; examId: string; source: string };

/** Teacher/Super Admin challenges for the student, each with progress and a button into the right questions. */
export function GuuldoonChallengeList({ challenges, empty }: { challenges: Challenge[]; empty?: string }) {
  const navigate = useNavigate();
  if (!challenges.length) return empty ? <p className="student-glass-card rounded-[22px] p-5 text-center text-sm text-[var(--color-text-tertiary)]">{empty}</p> : null;
  return (
    <section className="space-y-2" aria-label="Tartanada macalinka">
      <h2 className="text-sm font-black">Tartanada macalinka</h2>
      {challenges.map((challenge) => {
        const link = challenge.examId
          ? `/student/guuldoon/courses/${challenge.courseId}?tab=exams&exam=${challenge.examId}`
          : `/student/guuldoon/courses/${challenge.courseId}?chapter=${challenge.chapterId}&hub=1&tab=${challenge.source === 'past' ? 'past' : 'understand'}`;
        const percent = challenge.total ? Math.round((challenge.done / challenge.total) * 100) : 0;
        return (
          <div key={challenge.id} className="student-glass-card flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-4">
            <div className="min-w-0 flex-1">
              <b className="block text-sm" dir="auto">{challenge.title}</b>
              <span className="text-xs text-[var(--color-text-tertiary)]">{challenge.done}/{challenge.total} suaal{challenge.deadline ? ` · Dhammaad ${new Date(challenge.deadline).toLocaleDateString()}` : ''}</span>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-500/20"><div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} /></div>
            </div>
            <button type="button" onClick={() => navigate(link)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white">{challenge.done ? 'Sii wad' : 'Bilow hadda'}</button>
          </div>
        );
      })}
    </section>
  );
}
