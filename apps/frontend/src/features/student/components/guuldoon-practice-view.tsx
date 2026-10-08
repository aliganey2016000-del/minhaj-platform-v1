
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import type { GuuldoonChapterSummary, GuuldoonPracticeQuestion } from './guuldoon-chapters-types';
import { GuuldoonFormulaText } from './guuldoon-lesson-reader';
import { yearChip } from './guuldoon-chapters-types';

export function GuuldoonYearQuestions({
  chapter,
  questions,
  loading,
  selectedYear,
  onBack,
  onYear,
  onAnswer,
}: {
  chapter: GuuldoonChapterSummary;
  questions: GuuldoonPracticeQuestion[];
  loading: boolean;
  selectedYear: number | null;
  onBack: () => void;
  onYear: (year: number) => void;
  onAnswer: (index: number) => void;
}) {
  return (
    <section className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-tertiary)] hover:text-emerald-500"><ArrowLeft size={15} /> Cutubyada</button>
      <div className="student-glass-card rounded-[26px] p-5 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Su’aalaha sanad kasta</p>
        <h2 className="mt-1 text-2xl font-black">{chapter.title}</h2>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {chapter.yearCounts.map(item => (
            <button
              key={item.year}
              onClick={() => onYear(item.year)}
              className={'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-black ' + (selectedYear === item.year ? 'border-emerald-400 bg-emerald-500 text-white' : yearChip(item.count))}
            >
              {item.year} · {item.count}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-[var(--color-text-tertiary)]">Su’aalaha waa la soo rarayaa...</p>
      ) : (
        <div className="space-y-3">
          {questions.map((question, index) => (
            <article key={question._id} className="student-glass-card rounded-2xl p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-500">{question.examYear} · Su’aal {question.number}</span>
                <span className="rounded-full bg-slate-500/10 px-2.5 py-1">{question.marks} dhibcood</span>
                <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-500">{question.type.toUpperCase()}</span>
                {(question.figureUrl || question.figureFiles?.length) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-sky-500"><ImageIcon className="h-3 w-3" /> Sawir leh</span>
                )}
              </div>
              <p dir={question.direction === 'rtl' || question.language === 'ar' ? 'rtl' : 'auto'} className="mt-3 line-clamp-3 text-sm font-semibold leading-6">
                <GuuldoonFormulaText text={question.textSo} />
              </p>
              <button onClick={() => onAnswer(index)} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white">Ka jawaab</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function GuuldoonPracticeView({
  chapter,
  questions,
  loading,
  questionIndex,
  setQuestionIndex,
  answers,
  setAnswers,
  feedback,
  answering,
  onSubmit,
  onBack,
  onBookPage,
}: {
  chapter: GuuldoonChapterSummary;
  questions: GuuldoonPracticeQuestion[];
  loading: boolean;
  questionIndex: number;
  setQuestionIndex: (index: number | ((current: number) => number)) => void;
  answers: Record<string, unknown>;
  setAnswers: (updater: (current: Record<string, unknown>) => Record<string, unknown>) => void;
  feedback: Record<string, any>;
  answering: boolean;
  onSubmit: (question: GuuldoonPracticeQuestion) => void;
  onBack: () => void;
  onBookPage: (question: GuuldoonPracticeQuestion) => void;
}) {
  const question = questions[questionIndex];
  return (
    <section className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-tertiary)] hover:text-emerald-500"><ArrowLeft size={15} /> Cutubyada</button>
      <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-500">Tababar</p><h2 className="mt-1 text-lg font-black">{chapter.title}</h2></div>
      {loading ? (
        <p className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">Tababarka waa la soo rarayaa...</p>
      ) : !question ? (
        <div className="student-glass-card rounded-2xl p-8 text-center">Cutubkan wali su’aalo published ah ma laha.</div>
      ) : (
        <article className="student-glass-card rounded-[28px] p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black">
            <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-emerald-500">{question.examYear || '—'} · Su’aal {question.number} · {question.marks} dhibcood</span>
            <span className="rounded-full bg-violet-500/10 px-3 py-1.5 text-violet-500">{question.type.toUpperCase()}</span>
          </div>

          <h3 dir={question.direction === 'rtl' || question.language === 'ar' ? 'rtl' : 'auto'} className="mt-5 text-lg font-black leading-8">
            <GuuldoonFormulaText text={question.textSo} />
          </h3>
          {(question.figureFiles?.length ? question.figureFiles : question.figureUrl ? [question.figureUrl] : []).map((figure, index) => (
            <img key={figure + index} src={figure} alt="" className="mt-4 max-h-80 rounded-xl object-contain" />
          ))}

          {question.type === 'mcq' && question.options?.length ? (
            <div className="mt-5 grid gap-3">
              {question.options.map((option, index) => (
                <button
                  key={index}
                  disabled={!!feedback[question._id]}
                  onClick={() => setAnswers(current => ({ ...current, [question._id]: index }))}
                  className={'rounded-2xl border p-4 text-left text-sm font-semibold transition ' + (answers[question._id] === index ? 'border-emerald-400 bg-emerald-400/10' : 'border-[var(--color-border-subtle)] hover:border-emerald-400/35')}
                >
                  {String.fromCharCode(65 + index)}. {option}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              disabled={!!feedback[question._id]}
              value={String(answers[question._id] ?? '')}
              onChange={event => setAnswers(current => ({ ...current, [question._id]: event.target.value }))}
              rows={5}
              placeholder="Ku qor jawaabtaada..."
              className="mt-5 w-full rounded-2xl border border-[var(--color-border-default)] bg-transparent p-4 text-sm outline-none focus:border-emerald-400"
            />
          )}

          {!feedback[question._id] ? (
            <button disabled={answering || answers[question._id] === undefined} onClick={() => onSubmit(question)} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
              {answering ? 'Waa la gudbinayaa...' : 'Gudbi jawaabta'}
            </button>
          ) : (
            <div className={'mt-5 rounded-2xl border p-4 ' + (feedback[question._id].marked ? feedback[question._id].correct ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-rose-400/30 bg-rose-400/10' : 'border-amber-400/30 bg-amber-400/10')}>
              <p className="font-black">{feedback[question._id].marked ? feedback[question._id].correct ? '✓ Sax' : '✕ Khalad' : 'Jawaab la xaqiijin doonaa'}</p>
              {!feedback[question._id].marked && <p className="mt-1 text-xs font-semibold text-amber-500">Jawaabtan Pass Meter-ka laguma darin.</p>}
              {feedback[question._id].explanation && (
                <div className="mt-3 rounded-xl bg-[var(--color-surface-primary)]/70 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--color-text-tertiary)]">{feedback[question._id].marked ? 'Sharaxaad' : 'Sharaxaad qabyo'}</p>
                  <p className="mt-1 text-sm leading-6">{feedback[question._id].explanation}</p>
                </div>
              )}
              {feedback[question._id].explainerAudioUrl && <audio controls preload="none" className="mt-3 w-full" src={feedback[question._id].explainerAudioUrl} />}
              {question.bookRef?.pageFrom && (
                <button onClick={() => onBookPage(question)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-2 text-xs font-black text-emerald-500">
                  <BookOpen className="h-4 w-4" /> Bogga buugga {question.bookRef.pageFrom}
                </button>
              )}
              {feedback[question._id].marked && feedback[question._id].correct === false && (
                <p className="mt-2 text-[11px] font-semibold text-rose-500">Qaladkan waxaa si toos ah loogu daray Leitner: 1, 2, 4, 7, 14 maalmood.</p>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-5">
            <button disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => Math.max(0, index - 1))} className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Hore</button>
            <span className="text-xs text-[var(--color-text-tertiary)]">{questionIndex + 1} / {questions.length}</span>
            <button disabled={questionIndex >= questions.length - 1} onClick={() => setQuestionIndex(index => Math.min(questions.length - 1, index + 1))} className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold disabled:opacity-40">Xiga <ChevronRight className="h-4 w-4" /></button>
          </div>
        </article>
      )}
    </section>
  );
}
