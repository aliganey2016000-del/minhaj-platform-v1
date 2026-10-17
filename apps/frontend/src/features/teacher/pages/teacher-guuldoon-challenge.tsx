import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BellRing, CalendarClock, CheckCircle2, Loader2, Lock, Unlock } from 'lucide-react';
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

const STATE = { done: ['Dhammeeyay', 'bg-emerald-500/15 text-emerald-600'], mid: ['Dhexda', 'bg-amber-500/15 text-amber-600'], none: ['Ma qaban', 'bg-slate-500/15 text-slate-500'] } as const;
const bar = (value: number | null) => (value === null ? 'bg-slate-400' : value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-rose-500');
const tone = (value: number | null) => (value === null ? '' : value >= 70 ? 'text-emerald-600' : value >= 40 ? 'text-amber-600' : 'text-rose-500');

/** Teacher: results of one challenge (students, questions, what to re-teach). */
export function TeacherGuuldoonChallenge() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();
  const base = useLocation().pathname.startsWith('/admin') ? '/admin' : '/teacher';
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
    <main className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6">
      <button type="button" onClick={() => navigate(`${base}/guuldoon/challenges`)} className="inline-flex min-h-[40px] items-center gap-2 text-xs font-bold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Tartanada</button>

      <header className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-indigo-600 via-emerald-600 to-sky-600 p-5 text-white shadow-xl sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black sm:text-3xl" dir="auto">{data.challenge.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-white/90">
              <span>{data.challenge.questions} suaal</span>
              {data.challenge.deadline && <span className="inline-flex items-center gap-1"><CalendarClock size={13} />{new Date(data.challenge.deadline).toLocaleString()}</span>}
              <span className="rounded-full bg-white/20 px-2.5 py-0.5">{data.challenge.status === 'closed' ? 'La xiray' : 'Furan'}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => remind()} className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-4 text-xs font-black text-emerald-700 shadow"><BellRing size={15} />Xusuusi kuwa aan dhammaystirin</button>
            <button type="button" onClick={toggleStatus} className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/20 px-4 text-xs font-black text-white">{data.challenge.status === 'closed' ? <><Unlock size={15} />Dib u fur</> : <><Lock size={15} />Xir</>}</button>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Kooban">
          {[['Dhammeeyay', summary.done, 'from-emerald-400/40 to-emerald-500/20'], ['Dhexda ku jira', summary.mid, 'from-amber-300/40 to-amber-500/20'], ['Weli ma bilaabin', summary.none, 'from-slate-300/40 to-slate-500/20'], ['Celceliska saxda', `${summary.average}%`, 'from-sky-300/40 to-indigo-400/20']].map(([label, value, tint]) => (
            <div key={String(label)} className={'rounded-2xl bg-gradient-to-br p-3.5 backdrop-blur ' + tint}><strong className="block text-3xl font-black">{value}</strong><span className="text-xs font-semibold text-white/90">{label}</span></div>
          ))}
        </div>
      </header>

      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--color-surface-tertiary)] p-1">
        {([['students', 'Ardayda'], ['questions', 'Suaalaha'], ['reteach', 'U celi']] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => setTab(key)} className={'min-h-[44px] rounded-xl px-3 text-sm font-extrabold transition ' + (tab === key ? 'bg-emerald-600 text-white shadow' : 'text-[var(--color-text-secondary)]')}>{label}</button>
        ))}
      </div>

      {tab === 'students' && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">{([['all', 'Dhammaan'], ['done', 'Dhammeeyay'], ['mid', 'Dhexda'], ['none', 'Ma qaban']] as const).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={'min-h-[40px] rounded-full border-2 px-4 text-xs font-extrabold ' + (filter === key ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-[var(--color-border-subtle)]')}>{label}</button>
          ))}</div>
          <ul className="grid gap-2.5 md:grid-cols-2">
            {rows.map((student) => (
              <li key={student.userId}>
                <div role="button" tabIndex={0} onClick={() => student.answered && openStudent(student.userId)} onKeyDown={(event) => { if (event.key === 'Enter' && student.answered) openStudent(student.userId); }}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3.5 shadow-sm transition hover:shadow-md">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 text-sm font-black text-white">{student.name.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><b className="truncate text-sm">{student.name}</b><span className={'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ' + STATE[student.state][1]}>{STATE[student.state][0]}</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-500/20"><div className={'h-full ' + bar(student.accuracy)} style={{ width: `${student.accuracy ?? 0}%` }} /></div>
                    <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{student.answered}/{data.challenge.questions} jawaabay · <b className={tone(student.accuracy)}>{student.accuracy === null ? '—' : `${student.accuracy}% sax`}</b>{student.answered ? ` · ${student.minutes} daq` : ''}</p>
                  </div>
                  {student.state !== 'done' && <button type="button" aria-label={`Xusuusi ${student.name}`} onClick={(event) => { event.stopPropagation(); remind([student.userId]); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600"><BellRing size={16} /></button>}
                </div>
              </li>
            ))}
          </ul>
          {detail && (
            <section className="space-y-3 rounded-[24px] border-2 border-emerald-500/50 bg-emerald-500/5 p-4" aria-label="Jawaabaha ardayga">
              <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-black">{detail.student.name}</h2><button type="button" onClick={() => setDetail(null)} className="min-h-[40px] rounded-xl border px-4 text-xs font-bold">Xidh</button></div>
              <p className="flex flex-wrap gap-2 text-xs font-extrabold"><span className="rounded-full bg-slate-500/15 px-2.5 py-1">{detail.answered}/{detail.total} la jawaabay</span><span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-600">{detail.right} sax</span><span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-500">{detail.wrong} qalad</span></p>
              {detail.items.map((item) => <AnswerCard key={item._id} item={item} mineLabel="Jawaabtiisa" />)}
            </section>
          )}
        </section>
      )}

      {tab === 'questions' && (
        <section className="grid gap-3 md:grid-cols-2">
          {data.questions.map((question) => (
            <article key={question.id} className="space-y-3 rounded-[22px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-bold leading-6" dir="auto"><span className="mr-1.5 rounded-lg bg-indigo-500/15 px-2 py-0.5 text-xs font-black text-indigo-600">Q{question.number}</span>{question.text}</p>
                <b className={'shrink-0 text-2xl font-black tabular-nums ' + tone(question.accuracy)}>{question.accuracy === null ? '—' : `${question.accuracy}%`}</b>
              </div>
              <div className="space-y-1.5">
                {question.spread.map((entry) => (
                  <div key={entry.answer} className={'flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs ' + (entry.right ? 'bg-emerald-500/15 font-extrabold text-emerald-700' : 'bg-slate-500/10')}>
                    <span className="min-w-0 break-words" dir="auto">{entry.right && <CheckCircle2 size={13} className="mr-1 inline" />}{entry.answer}</span><b className="tabular-nums">{entry.count}</b>
                  </div>
                ))}
              </div>
              {question.right && <p className="text-xs text-[var(--color-text-tertiary)]">Jawaabta saxda ah: <b className="text-emerald-600" dir="auto">{question.right}</b></p>}
              {question.attempted === 0 && <p className="text-xs text-[var(--color-text-tertiary)]">Cidina weli ma jawaabin.</p>}
            </article>
          ))}
        </section>
      )}

      {tab === 'reteach' && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-[24px] bg-gradient-to-br from-rose-500/15 to-orange-500/10 p-4 sm:p-5">
            <h2 className="text-lg font-black">Suaalaha loo celin karo</h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">Suaalaha ka hooseeya 40% saxnaan (labo arday ugu yaraan).</p>
            {hard.length === 0 && <p className="text-sm">Suaal dhib badan weli ma muuqdo.</p>}
            {hard.map((question) => <p key={question.id} className="rounded-xl bg-[var(--color-surface-primary)] p-3 text-sm" dir="auto"><b className="text-indigo-600">Q{question.number}</b> · {question.text} <b className="text-rose-500">{question.accuracy}%</b></p>)}
          </div>
          <div className="space-y-3 rounded-[24px] bg-gradient-to-br from-amber-500/15 to-emerald-500/10 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-black">Ardayda u baahan dhiirigelin</h2>{weak.length > 0 && <button type="button" onClick={() => remind(weak.map((student) => student.userId))} className="min-h-[44px] rounded-xl bg-emerald-700 px-4 text-xs font-black text-white">Xusuusi dhammaantood</button>}</div>
            {weak.length === 0 && <p className="text-sm">Dhammaan ardayda waa hagaagsan yihiin.</p>}
            {weak.map((student) => <p key={student.userId} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--color-surface-primary)] p-3 text-sm"><b className="truncate">{student.name}</b><span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">{student.accuracy === null ? 'Weli ma bilaabin' : `${student.accuracy}% sax`}</span></p>)}
          </div>
        </section>
      )}
      {toast && <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-lg">{toast}</div>}
    </main>
  );
}
