import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '../../../lib/axios';
import { AnswerCard, type AnswerItem } from '../../student/components/guuldoon-answer-card';

type StudentRow = { userId: string; name: string; studentId: string; state: 'done' | 'mid' | 'none'; answered: number; correct: number; accuracy: number | null; minutes: number };
type QuestionRow = { id: string; number: number; text: string; attempted: number; accuracy: number | null; right: string; spread: { answer: string; count: number; right: boolean }[] };
type Results = {
  challenge: { id: string; title: string; deadline: string | null; status: string; questions: number };
  summary: { students: number; done: number; mid: number; none: number; average: number };
  students: StudentRow[]; questions: QuestionRow[];
  reteach: { hardQuestions: string[]; weakStudents: string[] };
};
type Detail = { student: { name: string }; total: number; answered: number; right: number; wrong: number; items: AnswerItem[] };

const STATE = { done: ['Dhammeeyay', 'bg-emerald-500/15 text-emerald-600'], mid: ['Dhexda', 'bg-amber-500/15 text-amber-600'], none: ['Ma qaban', 'bg-slate-500/15'] } as const;
const tone = (value: number | null) => (value === null ? '' : value >= 70 ? 'text-emerald-600' : value >= 40 ? 'text-amber-600' : 'text-rose-500');

/** Teacher: results of one challenge (students, questions, what to re-teach). */
export function TeacherGuuldoonChallenge() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'students' | 'questions' | 'reteach'>('students');
  const [filter, setFilter] = useState<'all' | 'done' | 'mid' | 'none'>('all');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    api.get(`/guuldoon-challenges/${challengeId}/results`).then(({ data: response }) => setData(response.data as Results)).catch((err) => setError(err.response?.data?.message || 'Natiijada lama soo rari karin.'));
  }, [challengeId]);
  useEffect(() => { load(); }, [load]);

  const say = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2500); };
  const openStudent = (userId: string) => {
    setDetail(null);
    api.get(`/guuldoon-challenges/${challengeId}/students/${userId}`).then(({ data: response }) => setDetail(response.data as Detail)).catch((err) => say(err.response?.data?.message || 'Lama furi karin.'));
  };
  const remind = (userIds?: string[]) => api.post(`/guuldoon-challenges/${challengeId}/remind`, { userIds }).then(({ data: response }) => say(`Xusuusin waa loo diray ${response.data.sent} arday.`)).catch(() => say('Xusuusinta lama diri karin.'));
  const toggleStatus = () => data && api.patch(`/guuldoon-challenges/${challengeId}`, { status: data.challenge.status === 'closed' ? 'active' : 'closed' }).then(load);

  if (error) return <div role="alert" className="mx-auto max-w-xl p-6 text-center font-semibold">{error}</div>;
  if (!data) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  const { summary } = data;
  const hard = data.questions.filter((question) => data.reteach.hardQuestions.includes(question.id));
  const weak = data.students.filter((student) => data.reteach.weakStudents.includes(student.userId));
  const rows = data.students.filter((student) => filter === 'all' || student.state === filter);

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 pb-24 sm:p-6">
      <button type="button" onClick={() => navigate('/teacher/guuldoon/challenges')} className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Tartanada</button>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h1 className="text-2xl font-black" dir="auto">{data.challenge.title}</h1>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{data.challenge.questions} suaal{data.challenge.deadline ? ` · Dhammaad ${new Date(data.challenge.deadline).toLocaleString()}` : ''}{data.challenge.status === 'closed' ? ' · La xiray' : ''}</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => remind()} className="rounded-xl border px-3.5 py-2 text-xs font-black">Xusuusi kuwa aan dhammaystirin</button>
          <button type="button" onClick={toggleStatus} className="rounded-xl border px-3.5 py-2 text-xs font-black">{data.challenge.status === 'closed' ? 'Dib u fur' : 'Xir'}</button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Kooban">
        {[['Dhammeeyay', summary.done, 'text-emerald-600'], ['Dhexda ku jira', summary.mid, 'text-amber-600'], ['Weli ma bilaabin', summary.none, ''], ['Celceliska saxda', `${summary.average}%`, '']].map(([label, value, colour]) => (
          <div key={String(label)} className="student-glass-card rounded-2xl p-3.5"><strong className={'block text-2xl font-black ' + colour}>{value}</strong><span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}</span></div>
        ))}
      </section>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b">
        {([['students', 'Ardayda'], ['questions', 'Suaalaha'], ['reteach', 'U celi']] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => setTab(key)} className={'whitespace-nowrap border-b-[3px] px-4 py-2.5 text-sm font-extrabold ' + (tab === key ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-[var(--color-text-tertiary)]')}>{label}</button>
        ))}
      </div>

      {tab === 'students' && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">{([['all', 'Dhammaan'], ['done', 'Dhammeeyay'], ['mid', 'Dhexda'], ['none', 'Ma qaban']] as const).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={'rounded-full border px-3 py-1.5 text-xs font-bold ' + (filter === key ? 'border-emerald-600 bg-emerald-600 text-white' : '')}>{label}</button>
          ))}</div>
          <div className="student-glass-card overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[var(--color-text-tertiary)]"><th className="p-3">Arday</th><th className="p-3">Xaalad</th><th className="p-3">Jawaabay</th><th className="p-3">Saxda</th><th className="p-3">Daqiiqad</th><th className="p-3" /></tr></thead>
              <tbody>{rows.map((student) => (
                <tr key={student.userId} className="cursor-pointer border-t hover:bg-slate-500/5" onClick={() => student.answered ? openStudent(student.userId) : undefined}>
                  <td className="p-3 font-bold">{student.name}</td>
                  <td className="p-3"><span className={'rounded-full px-2.5 py-1 text-xs font-extrabold ' + STATE[student.state][1]}>{STATE[student.state][0]}</span></td>
                  <td className="p-3 tabular-nums">{student.answered}/{data.challenge.questions}</td>
                  <td className={'p-3 font-black tabular-nums ' + tone(student.accuracy)}>{student.accuracy === null ? '—' : `${student.accuracy}%`}</td>
                  <td className="p-3 tabular-nums">{student.answered ? student.minutes : '—'}</td>
                  <td className="p-3 text-right">{student.state !== 'done' && <button type="button" onClick={(event) => { event.stopPropagation(); remind([student.userId]); }} className="rounded-lg border px-2.5 py-1 text-xs font-bold">Xusuusi</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {detail && (
            <section className="space-y-3 rounded-2xl border border-emerald-500/40 p-4" aria-label="Jawaabaha ardayga">
              <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-black">{detail.student.name}</h2><button type="button" onClick={() => setDetail(null)} className="rounded-lg border px-3 py-1 text-xs font-bold">Xidh</button></div>
              <p className="text-xs text-[var(--color-text-tertiary)]">{detail.answered}/{detail.total} la jawaabay · {detail.right} sax · {detail.wrong} qalad</p>
              {detail.items.map((item) => <AnswerCard key={item._id} item={item} mineLabel="Jawaabtiisa" />)}
            </section>
          )}
        </section>
      )}

      {tab === 'questions' && (
        <section className="space-y-3">
          {data.questions.map((question) => (
            <article key={question.id} className="student-glass-card space-y-2 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-bold" dir="auto">Q{question.number} · {question.text}</p><b className={'shrink-0 text-xl tabular-nums ' + tone(question.accuracy)}>{question.accuracy === null ? '—' : `${question.accuracy}%`}</b></div>
              {question.spread.map((entry) => (
                <div key={entry.answer} className="flex items-center justify-between gap-2 text-xs"><span className={'min-w-0 break-words ' + (entry.right ? 'font-extrabold text-emerald-600' : '')} dir="auto">{entry.answer}{entry.right ? ' ✓' : ''}</span><b className="tabular-nums">{entry.count}</b></div>
              ))}
              {question.right && <p className="text-xs text-[var(--color-text-tertiary)]">Jawaabta saxda ah: <b className="text-emerald-600" dir="auto">{question.right}</b></p>}
              {question.attempted === 0 && <p className="text-xs text-[var(--color-text-tertiary)]">Cidina weli ma jawaabin.</p>}
            </article>
          ))}
        </section>
      )}

      {tab === 'reteach' && (
        <section className="space-y-4">
          <div className="student-glass-card space-y-3 rounded-2xl p-4">
            <h2 className="text-lg font-black">Suaalaha loo celin karo</h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">Suaalaha ka hooseeya 40% saxnaan (labo arday ugu yaraan).</p>
            {hard.length === 0 && <p className="text-sm">Suaal dhib badan weli ma muuqdo.</p>}
            {hard.map((question) => <p key={question.id} className="border-t pt-2 text-sm" dir="auto"><b>Q{question.number}</b> · {question.text} <b className="text-rose-500">{question.accuracy}%</b></p>)}
          </div>
          <div className="student-glass-card space-y-3 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-black">Ardayda u baahan dhiirigelin</h2>{weak.length > 0 && <button type="button" onClick={() => remind(weak.map((student) => student.userId))} className="rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-black text-white">Xusuusi dhammaantood</button>}</div>
            {weak.length === 0 && <p className="text-sm">Dhammaan ardayda waa hagaagsan yihiin.</p>}
            {weak.map((student) => <p key={student.userId} className="flex items-center justify-between gap-2 border-t pt-2 text-sm"><b>{student.name}</b><span className="text-xs text-[var(--color-text-tertiary)]">{student.accuracy === null ? 'Weli ma bilaabin' : `${student.accuracy}% sax`}</span></p>)}
          </div>
        </section>
      )}
      {toast && <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-lg">{toast}</div>}
    </main>
  );
}
