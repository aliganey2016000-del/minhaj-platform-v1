/**
 * QuestionPreview — read-only "review" rendering of any quiz question type.
 * Shared between the admin Course Preview page and the student course-learn
 * page, both of which show a question with its correct answer revealed
 * (neither is a live take-the-quiz flow yet).
 */

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
};

export function QuestionPreview({ question, index }: { question: QuizQuestion; index: number }) {
  const q = normalizeQuestion(question);
  const meta = TYPE_META[q.type] || TYPE_META.mcq;

  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-[var(--color-text-primary)] flex-1">
          {index + 1}. {q.question}
        </p>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {q.type === 'mcq' && (
        <div className="space-y-2">
          {q.options.map((opt, oIdx) => (
            <div
              key={oIdx}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                oIdx === q.correctIndex
                  ? 'border-green-400 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300'
                  : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)]'
              }`}
            >
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs flex-shrink-0 ${
                oIdx === q.correctIndex ? 'border-green-500 bg-green-500 text-white' : 'border-[var(--color-border-default)]'
              }`}>
                {oIdx === q.correctIndex ? '✓' : String.fromCharCode(65 + oIdx)}
              </span>
              <span>{opt}</span>
              {oIdx === q.correctIndex && <span className="ml-auto text-xs text-green-600 dark:text-green-400 font-semibold">Correct</span>}
            </div>
          ))}
        </div>
      )}

      {q.type === 'true_false' && (
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((val) => (
            <div
              key={String(val)}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-bold ${
                q.correctAnswer === val
                  ? 'border-green-400 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300'
                  : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)]'
              }`}
            >
              <span className="text-lg">{val ? '✅' : '❌'}</span>
              {val ? 'True' : 'False'}
              {q.correctAnswer === val && <span className="text-xs font-semibold">— Correct</span>}
            </div>
          ))}
        </div>
      )}

      {q.type === 'matching' && (
        <div className="space-y-2">
          {q.pairs.map((pair, pIdx) => (
            <div key={pIdx} className="flex items-center gap-2 text-sm">
              <span className="flex-1 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 px-3 py-2 text-purple-700 dark:text-purple-300 font-medium truncate">
                {pair.left}
              </span>
              <span className="text-purple-400 flex-shrink-0">↔</span>
              <span className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-[var(--color-text-secondary)] truncate">
                {pair.right}
              </span>
            </div>
          ))}
        </div>
      )}

      {q.type === 'ordering' && (
        <ol className="space-y-2">
          {q.items.map((item, iIdx) => (
            <li key={iIdx} className="flex items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">
                {iIdx + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
      )}

      {q.type === 'picture_choice' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {q.choices.map((choice, cIdx) => (
            <div
              key={cIdx}
              className={`relative rounded-lg border-2 overflow-hidden ${
                cIdx === q.correctIndex ? 'border-green-400' : 'border-[var(--color-border-default)]'
              }`}
            >
              <div className="aspect-square bg-[var(--color-surface-tertiary)] flex items-center justify-center">
                {choice.image ? (
                  <img src={choice.image} alt={choice.label || `Choice ${cIdx + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl opacity-30">🖼️</span>
                )}
              </div>
              {choice.label && (
                <p className="text-xs text-center py-1 text-[var(--color-text-secondary)] truncate px-1">{choice.label}</p>
              )}
              {cIdx === q.correctIndex && (
                <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-xs">✓</span>
              )}
            </div>
          ))}
        </div>
      )}

      {q.type === 'swipe_sort' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-semibold text-[var(--color-text-tertiary)] px-1">
            <span>⬅ {q.leftLabel}</span>
            <span>{q.rightLabel} ➡</span>
          </div>
          {q.cards.map((card, cIdx) => (
            <div
              key={cIdx}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                card.correctSide === 'left'
                  ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/20 justify-start text-rose-700 dark:text-rose-300'
                  : 'border-rose-300 bg-rose-50 dark:bg-rose-950/20 justify-end text-rose-700 dark:text-rose-300 flex-row-reverse'
              }`}
            >
              <span className="text-xs">{card.correctSide === 'left' ? '⬅' : '➡'}</span>
              <span>{card.text}</span>
            </div>
          ))}
        </div>
      )}

      {q.type === 'listen_write' && (
        <div className="space-y-2">
          {q.audioUrl && <audio controls src={q.audioUrl} className="w-full h-9" />}
          <div className="flex items-center gap-3 rounded-lg border border-cyan-300 bg-cyan-50 dark:bg-cyan-950/20 px-3 py-2 text-sm text-cyan-700 dark:text-cyan-300">
            <span className="w-5 h-5 rounded-full border-2 border-cyan-500 bg-cyan-500 text-white flex items-center justify-center text-xs flex-shrink-0">✓</span>
            <span className="font-medium">{q.correctText}</span>
            <span className="ml-auto text-xs font-semibold">Correct answer</span>
          </div>
          {q.hint && <p className="text-xs text-[var(--color-text-tertiary)] italic">💡 Hint: {q.hint}</p>}
        </div>
      )}

      {q.type === 'fill_blank' && (
        <div className="space-y-2">
          <p className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/20 px-3 py-2 text-sm text-teal-800 dark:text-teal-200 leading-relaxed">
            {q.textTemplate.split('___').map((part, i) => (
              <span key={i}>
                {part}
                {i < q.blanks.length && (
                  <span className="inline-block mx-1 rounded-md bg-teal-500 px-2 py-0.5 text-xs font-bold text-white">{q.blanks[i]}</span>
                )}
              </span>
            ))}
          </p>
          {q.distractors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...q.blanks, ...q.distractors].map((word, wIdx) => (
                <span key={wIdx} className="rounded-full border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]">
                  {word}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {q.type === 'word_scramble' && (
        <div className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 px-3 py-2 text-sm text-orange-700 dark:text-orange-300">
          <span className="w-5 h-5 rounded-full border-2 border-orange-500 bg-orange-500 text-white flex items-center justify-center text-xs flex-shrink-0">✓</span>
          <span className="font-mono font-bold tracking-widest">{q.answer.toUpperCase()}</span>
          <span className="ml-auto text-xs font-semibold">Correct spelling</span>
        </div>
      )}
      {q.type === 'word_scramble' && q.hint && (
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)] italic">💡 Hint: {q.hint}</p>
      )}

      {q.type === 'sentence_build' && (
        <div className="space-y-2">
          <ol className="flex flex-wrap gap-1.5">
            {q.words.map((word, wIdx) => (
              <li key={wIdx} className="flex items-center gap-1 rounded-full border border-lime-300 dark:border-lime-800 bg-lime-50 dark:bg-lime-950/20 px-2.5 py-1 text-xs font-medium text-lime-700 dark:text-lime-300">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-lime-500 text-white text-[9px] font-bold">{wIdx + 1}</span>
                {word}
              </li>
            ))}
          </ol>
          {q.distractors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {q.distractors.map((word, dIdx) => (
                <span key={dIdx} className="rounded-full border border-dashed border-[var(--color-border-default)] px-2.5 py-1 text-xs text-[var(--color-text-tertiary)]">
                  {word}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {q.explanation && (
        <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <span className="font-semibold">💡 Explanation:</span> {q.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

export default QuestionPreview;
