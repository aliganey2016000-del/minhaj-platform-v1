/**
 * Quiz Editor — form for building a quiz with interactive question types
 * (MCQ, True/False, Matching Pairs, Ordering, Picture Choice, Swipe Sort,
 * Listen & Write, Fill in the Blank, Word Scramble, Sentence Build).
 *
 * Questions are always displayed grouped by type — each group gets a mini
 * header showing the type, question count, and total points — regardless
 * of whether they were added manually or by the AI Quiz Generator.
 */

import { useState } from 'react';
import type { Chapter, QuizItem, QuizQuestion, QuestionType } from '../course-builder.types';
import { normalizeQuestion } from '../course-builder.types';
import { generateTempId } from '../course-builder.api';
import { QUESTION_TYPE_META, QUESTION_TYPE_ORDER } from '../quiz-question-meta';
import { QuestionEditor } from './quiz-question-editor';
import { QuestionTypeMenu } from './quiz-question-type-menu';
import { AiQuizGeneratorModal } from './ai-quiz-generator-modal';

interface QuizEditorProps {
  quiz: QuizItem;
  onSave: (updated: QuizItem) => void;
  onCancel: () => void;
  /** HTML id to put on the <form>, so an external button (e.g. a page header) can submit it via `form={formId}`. */
  formId?: string;
  /** Hide the built-in Cancel/Save Quiz footer — use when a parent page renders those actions itself. */
  hideActions?: boolean;
  /** All chapters in the course, so the AI Quiz Generator's "from course content" option can offer a chapter/lesson picker. */
  chapters?: Chapter[];
}

/** Groups questions by type in canonical order, keeping each question's original array index for edit/remove callbacks. */
function groupQuestionsByType(questions: QuizQuestion[]) {
  const byType = new Map<QuestionType, { question: QuizQuestion; flatIndex: number }[]>();
  questions.forEach((q, flatIndex) => {
    const list = byType.get(q.type) || [];
    list.push({ question: q, flatIndex });
    byType.set(q.type, list);
  });
  return QUESTION_TYPE_ORDER
    .filter((type) => byType.has(type))
    .map((type) => {
      const items = byType.get(type)!;
      const totalPoints = items.reduce((sum, { question }) => sum + (question.points || 1), 0);
      return { type, items, totalPoints };
    });
}

function QuestionGroupHeader({ type, count, totalPoints }: { type: QuestionType; count: number; totalPoints: number }) {
  const meta = QUESTION_TYPE_META[type];
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2 mb-2 border-b-2 border-[var(--color-border-default)]">
      <h5 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)]">
        <span className="text-base">{meta.icon}</span> {meta.label}
      </h5>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
          {count} Question{count === 1 ? '' : 's'}
        </span>
        <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
          {totalPoints} Point{totalPoints === 1 ? '' : 's'} Total
        </span>
      </div>
    </div>
  );
}

function createQuestion(type: QuestionType): QuizQuestion {
  const base = { _id: generateTempId(), question: '', explanation: '', points: 1 };
  switch (type) {
    case 'true_false':
      return { ...base, type, correctAnswer: true };
    case 'matching':
      return { ...base, type, pairs: [{ left: '', right: '' }, { left: '', right: '' }] };
    case 'ordering':
      return { ...base, type, items: ['', ''] };
    case 'picture_choice':
      return { ...base, type, choices: [{ image: '', label: '' }, { image: '', label: '' }], correctIndex: 0 };
    case 'swipe_sort':
      return {
        ...base,
        type,
        leftLabel: 'Halal',
        rightLabel: 'Haram',
        cards: [{ text: '', correctSide: 'left' }, { text: '', correctSide: 'right' }],
      };
    case 'listen_write':
      return { ...base, type, audioUrl: '', correctText: '', hint: '' };
    case 'fill_blank':
      return { ...base, type, textTemplate: '', blanks: [], distractors: [] };
    case 'word_scramble':
      return { ...base, type, answer: '', hint: '' };
    case 'sentence_build':
      return { ...base, type, words: ['', ''], distractors: [] };
    case 'mcq':
    default:
      return { ...base, type: 'mcq', options: ['', ''], correctIndex: 0 };
  }
}

function isQuestionValid(q: QuizQuestion): boolean {
  if (!q.question.trim()) return false;
  switch (q.type) {
    case 'mcq':
      return q.options.length >= 2 && q.options.every((o) => o.trim());
    case 'true_false':
      return true;
    case 'matching':
      return q.pairs.length >= 2 && q.pairs.every((p) => p.left.trim() && p.right.trim());
    case 'ordering':
      return q.items.length >= 2 && q.items.every((i) => i.trim());
    case 'picture_choice':
      return q.choices.length >= 2 && q.choices.every((c) => c.image.trim());
    case 'swipe_sort':
      return Boolean(q.leftLabel.trim() && q.rightLabel.trim() && q.cards.length >= 2 && q.cards.every((c) => c.text.trim()));
    case 'listen_write':
      return !!(q.audioUrl.trim() && q.correctText.trim());
    case 'fill_blank':
      return q.blanks.length > 0 && q.blanks.every((b) => b.trim());
    case 'word_scramble':
      return !!q.answer.trim();
    case 'sentence_build':
      return q.words.length >= 2 && q.words.every((w) => w.trim());
    default:
      return false;
  }
}

export function QuizEditor({ quiz, onSave, onCancel, formId, hideActions, chapters = [] }: QuizEditorProps) {
  const [form, setForm] = useState({
    title: quiz.title || '',
    description: quiz.description || '',
    passingScore: quiz.passingScore ?? 60,
    timeLimit: quiz.timeLimit ?? 0,
    duration: quiz.duration || 0,
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>((quiz.questions || []).map(normalizeQuestion));
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const addQuestion = (type: QuestionType) => {
    setQuestions((prev) => [...prev, createQuestion(type)]);
    setTypeMenuOpen(false);
  };

  const addGeneratedQuestions = (generated: QuizQuestion[]) => {
    setQuestions((prev) => [...prev, ...generated]);
  };

  const updateQuestion = (idx: number, updated: QuizQuestion) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? updated : q)));
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const groupedQuestions = groupQuestionsByType(questions);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questions.every(isQuestionValid)) {
      alert('Please fill in every question completely (at least 2 options/pairs/steps/choices where applicable).');
      return;
    }
    onSave({
      ...quiz,
      title: form.title,
      description: form.description,
      passingScore: Number(form.passingScore),
      timeLimit: Number(form.timeLimit),
      duration: Number(form.duration),
      questions,
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5 p-4 border border-[var(--color-border-default)] rounded-xl bg-[var(--color-surface-secondary)]">
      <h4 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
        <span>❓</span> Edit Quiz
      </h4>

      {/* Quiz metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Title *</label>
          <input className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.title} onChange={(e) => update('title', e.target.value)} required />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Duration (min)</label>
          <input type="number" min={0} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.duration} onChange={(e) => update('duration', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Passing Score (%)</label>
          <input type="number" min={0} max={100} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.passingScore} onChange={(e) => update('passingScore', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Time Limit (min, 0=unlimited)</label>
          <input type="number" min={0} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.timeLimit} onChange={(e) => update('timeLimit', Number(e.target.value))} />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Description</label>
        <textarea rows={2} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm resize-y" value={form.description} onChange={(e) => update('description', e.target.value)} />
      </div>

      {/* Questions */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Questions ({questions.length})</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAiModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-violet-700 hover:to-indigo-700 transition-all"
            >
              <span>✨</span> AI Quiz Generator
            </button>
            <button
              type="button"
              onClick={() => setTypeMenuOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary-600 to-primary-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-primary-700 hover:to-primary-600 transition-all"
            >
              <span>🎮</span> Add Question
            </button>
          </div>
        </div>

        {questions.length === 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)] py-4 text-center border border-dashed border-[var(--color-border-default)] rounded-lg">
            No questions yet. Click "Add Question" to choose an interactive question type, or use the AI Quiz Generator.
          </p>
        )}

        <div className="space-y-5">
          {groupedQuestions.map((group) => (
            <div key={group.type}>
              <QuestionGroupHeader type={group.type} count={group.items.length} totalPoints={group.totalPoints} />
              <div className="space-y-3">
                {group.items.map(({ question, flatIndex }, localIdx) => (
                  <QuestionEditor
                    key={question._id || flatIndex}
                    question={question}
                    index={localIdx}
                    onChange={(updated) => updateQuestion(flatIndex, updated)}
                    onRemove={() => removeQuestion(flatIndex)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <QuestionTypeMenu isOpen={typeMenuOpen} onClose={() => setTypeMenuOpen(false)} onSelect={addQuestion} />
        <AiQuizGeneratorModal
          isOpen={aiModalOpen}
          onClose={() => setAiModalOpen(false)}
          chapters={chapters}
          onGenerated={addGeneratedQuestions}
        />
      </div>

      {/* Actions */}
      {!hideActions && (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">
            Cancel
          </button>
          <button type="submit" className="flex-1 rounded-lg bg-primary-600 text-white px-4 py-2 text-xs font-semibold hover:bg-primary-700 transition-colors">
            Save Quiz
          </button>
        </div>
      )}
    </form>
  );
}

export default QuizEditor;
