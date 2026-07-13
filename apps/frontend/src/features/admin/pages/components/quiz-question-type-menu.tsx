/**
 * QuestionTypeMenu — the visual "Add Question" selector. Replaces the old
 * behavior of silently defaulting every new question to plain MCQ with a
 * gamified picker across five interactive question mechanics.
 */

import type { QuestionType } from '../course-builder.types';

interface QuestionTypeOption {
  type: QuestionType;
  icon: string;
  title: string;
  description: string;
  accent: string; // Tailwind classes for the icon badge
}

const QUESTION_TYPES: QuestionTypeOption[] = [
  {
    type: 'mcq',
    icon: '📝',
    title: 'Multiple Choice',
    description: 'Pick the one right answer from a list.',
    accent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
  {
    type: 'true_false',
    icon: '✅',
    title: 'True or False',
    description: 'A quick yes-or-no challenge.',
    accent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  {
    type: 'matching',
    icon: '🔗',
    title: 'Matching Pairs',
    description: 'Match each item with its partner — like a memory game.',
    accent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  },
  {
    type: 'ordering',
    icon: '🔢',
    title: 'Put in Order',
    description: 'Drag the steps into the correct sequence.',
    accent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  {
    type: 'picture_choice',
    icon: '🖼️',
    title: 'Picture Choice',
    description: 'Tap the picture that answers the question.',
    accent: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  },
  {
    type: 'swipe_sort',
    icon: '👉',
    title: 'Swipe Sort',
    description: 'Swipe each card left or right — Tinder-style sorting.',
    accent: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  },
  {
    type: 'listen_write',
    icon: '🎧',
    title: 'Listen & Write',
    description: 'Play a sound clip, then type what you heard.',
    accent: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  },
  {
    type: 'fill_blank',
    icon: '🕳️',
    title: 'Fill in the Blank',
    description: 'Drag the right word from a word bank into each gap.',
    accent: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  },
  {
    type: 'word_scramble',
    icon: '🔀',
    title: 'Word Scramble',
    description: 'Unscramble the shuffled letters to spell the word.',
    accent: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  },
  {
    type: 'sentence_build',
    icon: '🧩',
    title: 'Sentence Build',
    description: 'Drag word chips into the right order to build the sentence.',
    accent: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
  },
];

interface QuestionTypeMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: QuestionType) => void;
}

export function QuestionTypeMenu({ isOpen, onClose, onSelect }: QuestionTypeMenuProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[85vh] rounded-2xl bg-[var(--color-surface-primary)] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-5 py-4 flex-shrink-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-[var(--color-text-primary)]">
            <span className="text-xl">🎮</span> Choose a Question Type
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto">
          {QUESTION_TYPES.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => onSelect(opt.type)}
              className="group flex items-start gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 text-left hover:border-primary-400 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xl ${opt.accent} group-hover:scale-110 transition-transform`}>
                {opt.icon}
              </span>
              <span>
                <span className="block text-sm font-bold text-[var(--color-text-primary)]">{opt.title}</span>
                <span className="block text-xs text-[var(--color-text-tertiary)] mt-0.5">{opt.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default QuestionTypeMenu;
