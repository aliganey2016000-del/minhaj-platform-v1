import type { QuizQuestion } from '../../features/admin/pages/course-builder.types';
import { normalizeQuestion } from '../../features/admin/pages/course-builder.types';

const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  mcq: { icon: '📝', label: 'Multiple Choice', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  true_false: { icon: '✅', label: 'True or False', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  matching: { icon: '🔗', label: 'Matching Pairs', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  ordering: { icon: '🔢', label: 'Put in Order', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  picture_choice: { icon: '🖼️', label: 'Picture Choice', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
  swipe_sort: { icon: '👉', label: 'Swipe Sort', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  listen_write: { icon: '🎧', label: 'Listen & Write', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  fill_blank: { icon: '🕳️', label: 'Fill in the Blank', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
  word_scramble: { icon: '🔀', label: 'Word Scramble', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  sentence_build: { icon: '🧩', label: 'Sentence Build', color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300' },
  short_answer: { icon: '✍️', label: 'Short Answer', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
};

export function QuestionPreview({ question, index }: { question: QuizQuestion; index: number }) {
  const q = normalizeQuestion(question);
  const meta = TYPE_META[q.type] || TYPE_META.mcq;
  const anyQ = q as any;
  const options = anyQ.options ?? [];
  const pairs = anyQ.pairs ?? [];
  const items = anyQ.items ?? [];
  const choices = anyQ.choices ?? [];
  const cards = anyQ.cards ?? [];
  const blanks = anyQ.blanks ?? [];
  const distractors = anyQ.distractors ?? [];
  const words = anyQ.words ?? [];
  const answer = anyQ.answer ?? '';
  const correctText = anyQ.correctText ?? '';
  const textTemplate = anyQ.textTemplate ?? '';
  const leftLabel = anyQ.leftLabel ?? 'Left';
  const rightLabel = anyQ.rightLabel ?? 'Right';
  const correctIndex = anyQ.correctIndex ?? -1;
  const correctAnswers = Array.isArray(anyQ.correctAnswers) ? anyQ.correctAnswers : [];

  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-[var(--color-text-primary)] flex-1">{index + 1}. {q.question}</p>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>{meta.icon} {meta.label}</span>
      </div>

      {q.type === 'mcq' && <div className="space-y-2">{options.map((opt: string, oIdx: number) => <div key={oIdx} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${oIdx === correctIndex ? 'border-green-400 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300' : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)]'}`}><span>{oIdx === correctIndex ? '✓' : String.fromCharCode(65 + oIdx)}</span><span>{opt}</span>{oIdx === correctIndex && <span className="ml-auto text-xs font-semibold">Correct</span>}</div>)}</div>}
      {q.type === 'true_false' && <div className="grid grid-cols-2 gap-3">{[true, false].map((val) => <div key={String(val)} className={`rounded-lg border-2 px-4 py-3 text-sm font-bold text-center ${q.correctAnswer === val ? 'border-green-400 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300' : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)]'}`}>{val ? '✅ True' : '❌ False'}{q.correctAnswer === val && ' — Correct'}</div>)}</div>}
      {q.type === 'matching' && <div className="space-y-2">{pairs.map((pair: any, pIdx: number) => <div key={pIdx} className="flex items-center gap-2 text-sm"><span className="flex-1 rounded-lg border px-3 py-2">{pair.left}</span><span>↔</span><span className="flex-1 rounded-lg border px-3 py-2">{pair.right}</span></div>)}</div>}
      {q.type === 'ordering' && <ol className="space-y-2">{items.map((item: string, iIdx: number) => <li key={iIdx} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">{iIdx + 1}. {item}</li>)}</ol>}
      {q.type === 'picture_choice' && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{choices.map((choice: any, cIdx: number) => <div key={cIdx} className={`rounded-lg border-2 overflow-hidden ${cIdx === q.correctIndex ? 'border-green-400' : 'border-[var(--color-border-default)]'}`}><div className="aspect-square bg-[var(--color-surface-tertiary)]">{choice.image && <img src={choice.image} alt={choice.label || ''} className="w-full h-full object-cover" />}</div>{choice.label && <p className="text-xs text-center py-1">{choice.label}</p>}</div>)}</div>}
      {q.type === 'swipe_sort' && <div className="space-y-2"><div className="flex justify-between text-xs font-semibold"><span>⬅ {leftLabel}</span><span>{rightLabel} ➡</span></div>{cards.map((card: any, cIdx: number) => <div key={cIdx} className="rounded-lg border px-3 py-2 text-sm">{card.text} — {card.correctSide}</div>)}</div>}
      {q.type === 'listen_write' && <div className="space-y-2">{q.audioUrl && <audio controls src={q.audioUrl} className="w-full h-9" />}<div className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm">Correct answer: <strong>{correctText}</strong></div>{q.hint && <p className="text-xs italic">💡 {q.hint}</p>}</div>}
      {q.type === 'fill_blank' && <div className="space-y-2"><p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm">{textTemplate.split('___').map((part: string, i: number) => <span key={i}>{part}{i < blanks.length && <span className="mx-1 rounded bg-teal-500 px-2 py-0.5 text-xs font-bold text-white">{blanks[i]}</span>}</span>)}</p>{distractors.length > 0 && <div className="flex flex-wrap gap-1.5">{[...blanks, ...distractors].map((word: string, i: number) => <span key={i} className="rounded-full border px-2.5 py-1 text-xs">{word}</span>)}</div>}</div>}
      {q.type === 'word_scramble' && <div className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm">Correct spelling: <strong>{answer}</strong>{q.hint && <span className="ml-3 text-xs">💡 {q.hint}</span>}</div>}
      {q.type === 'sentence_build' && <div className="space-y-2"><div className="flex flex-wrap gap-1.5">{words.map((word: string, i: number) => <span key={i} className="rounded-full border border-lime-300 bg-lime-50 px-2.5 py-1 text-xs">{i + 1}. {word}</span>)}</div>{distractors.length > 0 && <div className="flex flex-wrap gap-1.5">{distractors.map((word: string, i: number) => <span key={i} className="rounded-full border border-dashed px-2.5 py-1 text-xs">{word}</span>)}</div>}</div>}
      {q.type === 'short_answer' && <div className="space-y-2"><div className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-sm text-violet-800"><span className="font-semibold">Accepted answer(s):</span> {correctAnswers.join(' / ')}</div><p className="text-xs text-[var(--color-text-tertiary)]">Students enter a short text response. Matching is case-insensitive and whitespace-normalized.</p></div>}

      {q.explanation && <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200"><p className="text-xs text-blue-700"><span className="font-semibold">💡 Explanation:</span> {q.explanation}</p></div>}
    </div>
  );
}
export default QuestionPreview;
