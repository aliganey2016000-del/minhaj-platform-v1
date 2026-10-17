import { useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, Loader2, XCircle } from 'lucide-react';
import api from '../../../lib/axios';
import { optionText } from '../lib-option-label';

type SimilarQuestion = { _id: string; type: string; textSo?: string; textEn?: string; options?: string[]; marks?: number };
export type AnswerFeedbackData = {
  marked: boolean; correct: boolean | null; message?: string; answerStatus?: string; correctIndex?: number;
  answerDisplay?: string; explanation?: string; explainerAudioUrl?: string;
  bookRef?: { pageFrom?: number; pageTo?: number } | null; similar?: SimilarQuestion[];
};

/** A similar question the student can answer right here. It is practice only, so it never counts toward the Pass Meter. */
function PracticeQuestion({ question }: { question: SimilarQuestion }) {
  const [picked, setPicked] = useState<number | string | undefined>();
  const [result, setResult] = useState<AnswerFeedbackData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (picked === undefined || busy) return;
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/guuldoon/questions/${question._id}/answer`, { answer: picked, retry: true });
      setResult(data.data as AnswerFeedbackData);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Jawaabta lama gudbin karin.');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3.5 sm:p-4">
      <p className="whitespace-pre-line break-words text-sm font-bold leading-6" dir="auto">{question.textSo || question.textEn}</p>
      {question.type === 'mcq' && question.options ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options.map((option, index) => {
            const isRight = result?.correctIndex === index;
            const isWrongPick = !!result && picked === index && !isRight;
            return (
              <button key={index} type="button" disabled={!!result} onClick={() => setPicked(index)}
                className={'min-h-[44px] rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ' +
                  (isRight ? 'border-emerald-500 bg-emerald-500/15' : isWrongPick ? 'border-red-500 bg-red-500/10' : picked === index ? 'border-emerald-500 bg-emerald-500/10' : 'border-[var(--color-border-subtle)]')}>
                {String.fromCharCode(65 + index)}. {optionText(option)}
              </button>
            );
          })}
        </div>
      ) : (
        <textarea disabled={!!result} rows={3} value={String(picked ?? '')} onChange={(event) => setPicked(event.target.value)} placeholder="Ku qor jawaabtaada..."
          className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent p-3 text-sm outline-none focus:border-emerald-500" />
      )}
      {error && <p role="alert" className="text-xs font-semibold text-red-500">{error}</p>}
      {!result ? (
        <button type="button" disabled={busy || picked === undefined || picked === ''} onClick={() => void submit()}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-50 sm:w-auto">
          {busy && <Loader2 size={15} className="animate-spin" />}Hubi jawaabta
        </button>
      ) : (
        <div className={'rounded-xl p-3 text-sm ' + (result.correct ? 'bg-emerald-500/10' : 'bg-red-500/10')}>
          <p className="flex items-center gap-1.5 font-black">{result.correct ? <><CheckCircle2 size={16} className="text-emerald-600" />Sax, hambalyo!</> : <><XCircle size={16} className="text-red-500" />Khalad</>}</p>
          {!result.correct && result.answerDisplay && <p className="mt-1.5 break-words" dir="auto"><span className="text-xs text-[var(--color-text-tertiary)]">Jawaabta saxda ah: </span><b className="text-emerald-600">{result.answerDisplay}</b></p>}
          {result.explanation && <p className="mt-1.5 text-xs leading-5">{result.explanation}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * What the student sees after answering: the result, the right answer, a short
 * explanation with the book page, and similar questions to practise on.
 * Layout is one column on a phone and two on wider screens.
 */
export function AnswerFeedback({ feedback, mineText, onNext, hasNext }: { feedback: AnswerFeedbackData; mineText: string; onNext?: () => void; hasNext?: boolean }) {
  const [showPractice, setShowPractice] = useState(false);
  const similar = (feedback.similar || []).slice(0, 2);
  const unmarked = !feedback.marked;
  const wrong = feedback.marked && feedback.correct === false;
  const tone = unmarked ? 'border-amber-500/30 bg-amber-500/10' : wrong ? 'border-red-500/30 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10';

  return (
    <section className={'mt-5 space-y-4 rounded-2xl border p-4 sm:p-5 ' + tone} aria-live="polite">
      <header className="flex items-center gap-2.5">
        {unmarked ? null : wrong ? <XCircle className="shrink-0 text-red-500" size={26} /> : <CheckCircle2 className="shrink-0 text-emerald-600" size={26} />}
        <h4 className="text-lg font-black sm:text-xl">{unmarked ? feedback.message || 'Jawaab la xaqiijin doonaa' : wrong ? 'Khalad' : 'Sax, hambalyo!'}</h4>
      </header>

      {wrong && feedback.answerDisplay && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-[var(--color-surface-primary)] p-3"><span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Jawaabtaada</span><b className="mt-0.5 block whitespace-pre-line break-words text-sm text-red-500" dir="auto">{mineText || '—'}</b></div>
          <div className="rounded-xl bg-[var(--color-surface-primary)] p-3"><span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Jawaabta saxda ah</span><b className="mt-0.5 block whitespace-pre-line break-words text-sm text-emerald-600" dir="auto">{feedback.answerDisplay}</b></div>
        </div>
      )}

      {feedback.explanation && (
        <div className="rounded-xl bg-[var(--color-surface-primary)] p-3.5">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Sharax</span>
          <p className="mt-1 whitespace-pre-line text-sm leading-6">{feedback.explanation}</p>
        </div>
      )}
      {feedback.explainerAudioUrl && <audio controls preload="none" className="w-full" src={feedback.explainerAudioUrl} />}
      {feedback.bookRef?.pageFrom && (
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]"><BookOpen size={14} />Buugga: bogga {feedback.bookRef.pageFrom}{feedback.bookRef.pageTo && feedback.bookRef.pageTo !== feedback.bookRef.pageFrom ? `–${feedback.bookRef.pageTo}` : ''}</p>
      )}
      {unmarked && <p className="text-xs text-amber-600">{feedback.answerStatus === 'verified' ? 'Su’aashan auto-marking ma leh; qiimeynta macallinka ayaa loo baahan yahay.' : 'Natiijadan laguma darin Pass Meter-ka ilaa answer key-ga la xaqiijiyo.'}</p>}

      {wrong && similar.length > 0 && (
        <div className="space-y-3">
          <button type="button" aria-expanded={showPractice} onClick={() => setShowPractice((value) => !value)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-emerald-600/40 bg-emerald-600/10 px-4 text-sm font-black text-emerald-700">
            <span>Isku day su'aal la mid ah</span><ChevronDown size={18} className={'transition ' + (showPractice ? 'rotate-180' : '')} />
          </button>
          {showPractice && <div className="space-y-3">{similar.map((item) => <PracticeQuestion key={item._id} question={item} />)}<p className="text-[11px] text-[var(--color-text-tertiary)]">Tababar ayay tahay, Pass Meter-ka kuma darsamayso.</p></div>}
        </div>
      )}

      {hasNext && onNext && (
        <button type="button" onClick={onNext} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-black text-white sm:w-auto">Xiga <ArrowRight size={16} /></button>
      )}
    </section>
  );
}
