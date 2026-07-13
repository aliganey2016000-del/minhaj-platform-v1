/**
 * Single source of truth for quiz question type metadata (icon, label,
 * color, canonical display order). Used by the type selector menu, the
 * per-type authoring editors, the read-only preview, the grouped-by-type
 * display in the Quiz Editor, and the AI Quiz Generator modal.
 */

import type { QuestionType } from './course-builder.types';

export interface QuestionTypeMeta {
  icon: string;
  label: string;
  /** Tailwind classes for a light "badge" background + text color. */
  color: string;
}

export const QUESTION_TYPE_META: Record<QuestionType, QuestionTypeMeta> = {
  mcq: { icon: '📝', label: 'Multiple Choice', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  true_false: { icon: '✅', label: 'True or False', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  matching: { icon: '🔗', label: 'Matching Pairs', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  ordering: { icon: '🔢', label: 'Put in Order', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  picture_choice: { icon: '🖼️', label: 'Picture Choice', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' },
  swipe_sort: { icon: '👉', label: 'Swipe Sort', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  listen_write: { icon: '🎧', label: 'Listen & Write', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
  fill_blank: { icon: '🕳️', label: 'Fill in the Blank', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
  word_scramble: { icon: '🔀', label: 'Word Scramble', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  sentence_build: { icon: '🧩', label: 'Sentence Build', color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300' },
};

/** Canonical, stable display order — used anywhere types are grouped or listed. */
export const QUESTION_TYPE_ORDER: QuestionType[] = [
  'mcq',
  'true_false',
  'matching',
  'ordering',
  'picture_choice',
  'swipe_sort',
  'listen_write',
  'fill_blank',
  'word_scramble',
  'sentence_build',
];
