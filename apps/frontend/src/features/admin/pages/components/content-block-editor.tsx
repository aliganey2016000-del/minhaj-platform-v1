/**
 * Content Block Editor — authors the paragraph-by-paragraph "Content Blocks"
 * used by a lesson's "Interactive Gate" delivery mode. Each block is a
 * chunk of rich text plus an optional Stop & Check question supporting all
 * 10 question types from the main quiz engine (MCQ, True/False, Matching,
 * Ordering, Picture Choice, Swipe Sort, Listen & Write, Fill in the Blanks,
 * Word Scramble, Sentence Build).
 * Mirrors the local-array-state + inline add/remove pattern already used for
 * attachments/quiz questions elsewhere in the Course Builder.
 */

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, ArrowDown, Trash2, PenLine, Sparkles,
  Pencil, Plus, X, CircleCheck,
} from 'lucide-react';
import type { ContentBlock, ContentBlockQuestion, QuestionType } from '../course-builder.types';
import { normalizeQuestion, getBlockQuestions } from '../course-builder.types';
import { QUESTION_TYPE_META, QUESTION_TYPE_ORDER } from '../quiz-question-meta';
import { RichTextEditor } from './rich-text-editor';
import { StopCheckAiGeneratorModal } from './stop-check-ai-generator-modal';

interface ContentBlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  defaultMinReadSeconds: number;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

function emptyBlock(order: number, defaultMinReadSeconds: number): ContentBlock {
  return { order, content: '', minReadSeconds: defaultMinReadSeconds };
}

/** Create a fresh Stop & Check question — defaults to MCQ with 2 empty options. */
export function emptyManualQuestion(): ContentBlockQuestion {
  return {
    ...normalizeQuestion({ type: 'mcq' }),
    aiGenerated: false,
  };
}

export function ContentBlockEditor({ blocks, onChange, defaultMinReadSeconds }: ContentBlockEditorProps) {
  const addBlock = () => {
    onChange([...blocks, emptyBlock(blocks.length, defaultMinReadSeconds)]);
  };

  const updateBlock = (idx: number, patch: Partial<ContentBlock>) => {
    onChange(blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };

  const removeBlock = (idx: number) => {
    onChange(blocks.filter((_, i) => i !== idx).map((b, i) => ({ ...b, order: i })));
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next.map((b, i) => ({ ...b, order: i })));
  };

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => (
        <BlockCard
          key={idx}
          block={block}
          index={idx}
          isFirst={idx === 0}
          isLast={idx === blocks.length - 1}
          onChange={(patch) => updateBlock(idx, patch)}
          onRemove={() => removeBlock(idx)}
          onMove={(dir) => moveBlock(idx, dir)}
        />
      ))}

      <button
        type="button"
        onClick={addBlock}
        className="w-full rounded-lg border border-dashed border-[var(--color-border-default)] px-4 py-2.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
      >
        + Add Content Block
      </button>

      {blocks.length === 0 && (
        <p className="text-xs text-[var(--color-text-tertiary)] text-center py-2">
          No content blocks yet — add one to start breaking this lesson into gated steps.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block Card
// ---------------------------------------------------------------------------

function BlockCard({
  block, index, isFirst, isLast, onChange, onRemove, onMove,
}: {
  block: ContentBlock;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<ContentBlock>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const questions = getBlockQuestions(block);

  // Every write goes through `questions` (array) from now on — clearing the
  // legacy singular `question` field so a block never ends up with both a
  // stale single question AND a questions array disagreeing with each other.
  const setQuestions = (next: ContentBlockQuestion[]) => onChange({ questions: next, question: undefined });

  const updateQuestionAt = (idx: number, question: ContentBlockQuestion | undefined) => {
    if (!question) setQuestions(questions.filter((_, i) => i !== idx));
    else setQuestions(questions.map((q, i) => (i === idx ? question : q)));
  };

  const addQuestion = (question: ContentBlockQuestion) => setQuestions([...questions, question]);

  // A single append for a whole AI-generated batch — calling `addQuestion`
  // once per generated question in a loop would fire several synchronous
  // `setQuestions` calls that each close over the same pre-update `questions`
  // snapshot, so only the last one would "win" and the rest would be lost.
  const addQuestions = (newOnes: ContentBlockQuestion[]) => setQuestions([...questions, ...newOnes]);

  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[var(--color-text-primary)]">Content Block {index + 1}</span>
        <div className="flex items-center gap-1">
          <button type="button" disabled={isFirst} onClick={() => onMove(-1)} className="rounded p-1 disabled:opacity-30 hover:bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]" title="Move up">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" disabled={isLast} onClick={() => onMove(1)} className="rounded p-1 disabled:opacity-30 hover:bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]" title="Move down">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onRemove} className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Remove block">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Block Title (optional)</label>
        <input
          className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs"
          placeholder="e.g. The Fall of the Dervish State"
          value={block.title || ''}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </div>

      <RichTextEditor
        value={block.content}
        onChange={(html) => onChange({ content: html })}
        placeholder="Write this block's paragraph..."
      />

      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Minimum read time (seconds)</label>
        <input
          type="number"
          min={5}
          max={600}
          className="w-28 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs"
          value={block.minReadSeconds}
          onChange={(e) => onChange({ minReadSeconds: Number(e.target.value) })}
        />
      </div>

      <div className="border-t border-[var(--color-border-subtle)] pt-3 space-y-3">
        <span className="text-xs font-semibold text-[var(--color-text-secondary)] block">
          Stop & Check Questions (optional — add as many as you like)
        </span>

        {questions.map((question, qi) => (
          <div key={qi} className="rounded-xl border border-[var(--color-border-default)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-text-primary)]">Question {qi + 1}</span>
              <button type="button" onClick={() => updateQuestionAt(qi, undefined)} className="text-xs text-red-500 hover:text-red-700">
                Remove question
              </button>
            </div>
            <QuestionBuilder blockContent={block.content} question={question} onChange={(q) => updateQuestionAt(qi, q)} />
          </div>
        ))}

        <NewQuestionComposer blockContent={block.content} onAdd={addQuestion} onAddMany={addQuestions} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Question Composer — a QuestionBuilder over purely local draft state;
// "Add Question to Block" commits it into the parent's questions array and
// resets, so the picker is ready again immediately for the next question.
// ---------------------------------------------------------------------------

function NewQuestionComposer({ blockContent, onAdd, onAddMany }: {
  blockContent: string;
  onAdd: (q: ContentBlockQuestion) => void;
  onAddMany: (qs: ContentBlockQuestion[]) => void;
}) {
  const [draft, setDraft] = useState<ContentBlockQuestion | undefined>(undefined);
  const [showAiModal, setShowAiModal] = useState(false);

  const commit = () => {
    if (!draft) return;
    onAdd(draft);
    setDraft(undefined);
  };

  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border-default)] p-3 space-y-2">
      <QuestionBuilder blockContent={blockContent} question={draft} onChange={setDraft} onOpenAiGenerator={() => setShowAiModal(true)} />
      {draft && (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={commit} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Question to Block
          </button>
          <button type="button" onClick={() => setDraft(undefined)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
            Cancel
          </button>
        </div>
      )}
      <StopCheckAiGeneratorModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        blockContent={blockContent}
        onGenerated={onAddMany}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Builder — mode toggle + Manual form + AI generator flow
// ---------------------------------------------------------------------------

type QuestionMode = 'manual' | 'ai';

function QuestionBuilder({
  blockContent, question, onChange, onOpenAiGenerator,
}: {
  blockContent: string;
  question: ContentBlockQuestion | undefined;
  onChange: (q: ContentBlockQuestion | undefined) => void;
  /** Opens the batch AI generator (type + count matrix) instead of a single inline question. */
  onOpenAiGenerator?: () => void;
}) {
  const [questionMode, setQuestionMode] = useState<QuestionMode | null>(
    question ? (question.aiGenerated ? 'ai' : 'manual') : null
  );
  const [editingCommitted, setEditingCommitted] = useState(false);

  // "Remove question" clears `question` in the parent, but this component's
  // own `questionMode` ('manual'/'ai') is local state that otherwise never
  // resets — leaving it stuck on the old mode falls through every branch
  // below into `return null`, hiding the Add Manually/AI Generator picker.
  const prevQuestionRef = useRef(question);
  useEffect(() => {
    if (prevQuestionRef.current && !question) {
      setQuestionMode(null);
      setEditingCommitted(false);
    }
    prevQuestionRef.current = question;
  }, [question]);

  // ── No question yet: show the mode chooser ──
  if (!question && questionMode === null) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setQuestionMode('manual'); onChange(emptyManualQuestion()); }}
          className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-4 text-center hover:border-primary-400 hover:bg-[var(--color-surface-tertiary)] transition-colors"
        >
          <PenLine className="h-5 w-5 text-[var(--color-text-secondary)]" />
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Add Manually</span>
        </button>
        <button
          type="button"
          onClick={onOpenAiGenerator}
          disabled={!onOpenAiGenerator}
          className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-violet-300 dark:border-violet-800 bg-gradient-to-b from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 px-4 py-4 text-center hover:border-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">AI Generator</span>
        </button>
      </div>
    );
  }

  // ── Question committed (manual, or AI-generated) ──
  if (question) {
    // AI "Keep" (not editing): compact summary, matching a settled/accepted state.
    if (question.aiGenerated && !editingCommitted) {
      return (
        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
            <Sparkles className="h-3 w-3" /> AI-generated
          </div>
          <QuestionPreviewCard draft={question} />
          <button
            type="button"
            onClick={() => setEditingCommitted(true)}
            className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:underline"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit this question
          </button>
        </div>
      );
    }

    return <ManualQuestionForm question={question} onChange={onChange} isAiGenerated={question.aiGenerated} />;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Read-only preview card for an AI draft (or a kept AI question, collapsed)
// Supports all 10 question types.
// ---------------------------------------------------------------------------

function QuestionPreviewCard({ draft }: { draft: ContentBlockQuestion }) {
  const meta = QUESTION_TYPE_META[draft.type] || QUESTION_TYPE_META.mcq;

  return (
    <div className="rounded-lg bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
          {meta.icon} {meta.label}
        </span>
      </div>
      <p className="text-sm font-medium text-[var(--color-text-primary)]">
        {draft.question || <em className="text-[var(--color-text-tertiary)]">(no question text)</em>}
      </p>

      {draft.type === 'mcq' ? (
        <div className="space-y-1">
          {(draft.options || []).map((opt, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs rounded-md px-2 py-1 ${i === draft.correctIndex ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-medium' : 'text-[var(--color-text-secondary)]'}`}>
              {i === draft.correctIndex ? <CircleCheck className="h-3.5 w-3.5 shrink-0" /> : <span className="h-3.5 w-3.5 shrink-0" />}
              {String.fromCharCode(65 + i)}. {opt || <em>(empty)</em>}
            </div>
          ))}
        </div>
      ) : draft.type === 'true_false' ? (
        <div className="flex gap-2 text-xs">
          <span className={`rounded-md px-2 py-1 ${draft.correctAnswer === true ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-medium' : 'text-[var(--color-text-secondary)]'}`}>True</span>
          <span className={`rounded-md px-2 py-1 ${draft.correctAnswer === false ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-medium' : 'text-[var(--color-text-secondary)]'}`}>False</span>
        </div>
      ) : draft.type === 'matching' ? (
        <div className="text-xs text-[var(--color-text-secondary)]">
          {(draft.pairs || []).map((p, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              <span>{p.left}</span> <span>↔</span> <span>{p.right}</span>
            </div>
          ))}
          {(!draft.pairs || draft.pairs.length === 0) && <em>(no pairs)</em>}
        </div>
      ) : draft.type === 'ordering' ? (
        <div className="text-xs text-[var(--color-text-secondary)]">
          {(draft.items || []).map((item, i) => (
            <span key={i} className="inline-block mr-2 mb-1 rounded bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5">{i + 1}. {item}</span>
          ))}
        </div>
      ) : draft.type === 'picture_choice' ? (
        <div className="text-xs text-[var(--color-text-secondary)]">
          {(draft.choices || []).length} choice{((draft.choices || []).length !== 1) ? 's' : ''} — correct: #{draft.correctIndex + 1}
        </div>
      ) : draft.type === 'swipe_sort' ? (
        <div className="text-xs text-[var(--color-text-secondary)]">
          {draft.leftLabel || 'Left'} / {draft.rightLabel || 'Right'} — {(draft.cards || []).length} card{((draft.cards || []).length !== 1) ? 's' : ''}
        </div>
      ) : draft.type === 'listen_write' ? (
        <div className="text-xs text-[var(--color-text-secondary)]">
          {draft.audioUrl ? '🔊 Audio attached' : 'No audio URL'} — answer: {draft.correctText || '(empty)'}
        </div>
      ) : draft.type === 'fill_blank' ? (
        <div className="text-xs text-[var(--color-text-secondary)]">
          {draft.blanks?.length || 0} blank{((draft.blanks?.length || 0) !== 1) ? 's' : ''} — {draft.distractors?.length || 0} distractor{((draft.distractors?.length || 0) !== 1) ? 's' : ''}
        </div>
      ) : draft.type === 'word_scramble' ? (
        <div className="text-xs text-[var(--color-text-secondary)]">
          Answer: {draft.answer || '(empty)'}{draft.hint ? ` — Hint: ${draft.hint}` : ''}
        </div>
      ) : draft.type === 'sentence_build' ? (
        <div className="text-xs text-[var(--color-text-secondary)]">
          Word bank: {(draft.words || []).length} word{((draft.words || []).length !== 1) ? 's' : ''} — {draft.distractors?.length || 0} distractor{((draft.distractors?.length || 0) !== 1) ? 's' : ''}
        </div>
      ) : (
        <div className="text-xs text-[var(--color-text-secondary)] italic">Unknown type: {(draft as any).type}</div>
      )}

      {draft.explanation && (
        <p className="text-[11px] text-[var(--color-text-tertiary)] border-t border-[var(--color-border-subtle)] pt-1.5">
          <span className="font-semibold">Explanation:</span> {draft.explanation}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual question form — full editable form for both "Add Manually" and
// AI drafts that have been accepted into edit mode.
// Supports all 10 quiz question types with dynamically swapped sub-forms.
// ---------------------------------------------------------------------------

export function ManualQuestionForm({
  question, onChange, isAiGenerated,
}: {
  question: ContentBlockQuestion;
  onChange: (q: ContentBlockQuestion) => void;
  isAiGenerated?: boolean;
}) {
  const ic = 'w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs';
  const meta = QUESTION_TYPE_META[question.type] || QUESTION_TYPE_META.mcq;

  /**
   * Switches the question type, preserving common fields (question text,
   * explanation, aiGenerated) and resetting the type-specific payloads
   * to safe defaults for the new type.
   */
  const handleTypeChange = (newType: string) => {
    const t = newType as QuestionType;
    const base = { ...normalizeQuestion({ type: t }), aiGenerated: question.aiGenerated, explanation: question.explanation };
    // Transfer the question text from the old question, but nothing else
    onChange({ ...base, question: question.question } as ContentBlockQuestion);
  };

  const updateQuestion = (patch: Partial<ContentBlockQuestion>) => onChange({ ...question, ...patch } as ContentBlockQuestion);

  return (
    <div className="space-y-2.5 rounded-lg bg-[var(--color-surface-secondary)] p-3">
      {isAiGenerated && (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
          <Sparkles className="h-2.5 w-2.5" /> AI-generated — review before saving
        </span>
      )}

      {/* ── Question Text (shared) ── */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Question Text</label>
        <textarea
          className={`${ic} resize-none`}
          rows={2}
          placeholder="What should the student answer?"
          value={question.question}
          onChange={(e) => updateQuestion({ question: e.target.value })}
        />
      </div>

      {/* ── Question Type Selector (all 10 types) ── */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Question Type</label>
        <select className={ic} value={question.type} onChange={(e) => handleTypeChange(e.target.value)}>
          {QUESTION_TYPE_ORDER.map((t) => {
            const m = QUESTION_TYPE_META[t];
            return (
              <option key={t} value={t}>
                {m.icon} {m.label}
              </option>
            );
          })}
        </select>
        <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {/* ================================================================ */}
      {/* Type-specific sub-forms                                               */}
      {/* ================================================================ */}

      {/* ── MCQ ── */}
      {question.type === 'mcq' && <McqFields question={question} onChange={updateQuestion} ic={ic} />}

      {/* ── True/False ── */}
      {question.type === 'true_false' && <TrueFalseFields question={question} onChange={updateQuestion} />}

      {/* ── Matching Pairs ── */}
      {question.type === 'matching' && <MatchingPairsFields question={question} onChange={updateQuestion} ic={ic} />}

      {/* ── Ordering ── */}
      {question.type === 'ordering' && <OrderingFields question={question} onChange={updateQuestion} ic={ic} />}

      {/* ── Picture Choice ── */}
      {question.type === 'picture_choice' && <PictureChoiceFields question={question} onChange={updateQuestion} ic={ic} />}

      {/* ── Swipe Sort ── */}
      {question.type === 'swipe_sort' && <SwipeSortFields question={question} onChange={updateQuestion} ic={ic} />}

      {/* ── Listen & Write ── */}
      {question.type === 'listen_write' && <ListenWriteFields question={question} onChange={updateQuestion} ic={ic} />}

      {/* ── Fill in the Blanks ── */}
      {question.type === 'fill_blank' && <FillBlankFields question={question} onChange={updateQuestion} ic={ic} />}

      {/* ── Word Scramble ── */}
      {question.type === 'word_scramble' && <WordScrambleFields question={question} updateQuestion={updateQuestion} ic={ic} />}

      {/* ── Sentence Build ── */}
      {question.type === 'sentence_build' && <SentenceBuildFields question={question} onChange={updateQuestion} ic={ic} />}

      {/* ── Explanation (shared) ── */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Explanation / Feedback (optional)</label>
        <textarea
          className={`${ic} resize-none`}
          rows={2}
          placeholder="Shown to the student if they answer incorrectly..."
          value={question.explanation || ''}
          onChange={(e) => updateQuestion({ explanation: e.target.value })}
        />
      </div>
    </div>
  );
}

// ===========================================================================
// Type-Specific Sub-Forms
// ===========================================================================

function McqFields({
  question, onChange, ic,
}: {
  question: Extract<ContentBlockQuestion, { type: 'mcq' }>;
  onChange: (q: Partial<ContentBlockQuestion>) => void;
  ic: string;
}) {
  const addOption = () => {
    if ((question.options?.length || 0) >= MAX_OPTIONS) return;
    onChange({ options: [...(question.options || []), ''] });
  };

  const removeOption = (i: number) => {
    if ((question.options?.length || 0) <= MIN_OPTIONS) return;
    const options = [...question.options];
    options.splice(i, 1);
    const correctIndex = question.correctIndex === i ? 0 : question.correctIndex > i ? question.correctIndex - 1 : question.correctIndex;
    onChange({ options, correctIndex });
  };

  return (
    <div>
      <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Options — mark the correct one</label>
      <div className="space-y-1.5">
        {(question.options || ['', '']).map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              checked={question.correctIndex === i}
              onChange={() => onChange({ correctIndex: i })}
              title="Mark as correct answer"
            />
            <input
              className={ic}
              placeholder={`Option ${String.fromCharCode(65 + i)}`}
              value={opt}
              onChange={(e) => {
                const options = [...question.options];
                options[i] = e.target.value;
                onChange({ options });
              }}
            />
            <button
              type="button"
              onClick={() => removeOption(i)}
              disabled={question.options.length <= MIN_OPTIONS}
              className="shrink-0 rounded p-1 text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Remove option"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {question.options.length < MAX_OPTIONS && (
        <button type="button" onClick={addOption} className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
          <Plus className="h-3.5 w-3.5" /> Add option
        </button>
      )}
    </div>
  );
}

function TrueFalseFields({
  question, onChange,
}: {
  question: Extract<ContentBlockQuestion, { type: 'true_false' }>;
  onChange: (q: Partial<ContentBlockQuestion>) => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Correct Answer</label>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="radio" checked={question.correctAnswer === true} onChange={() => onChange({ correctAnswer: true })} />
          True
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="radio" checked={question.correctAnswer === false} onChange={() => onChange({ correctAnswer: false })} />
          False
        </label>
      </div>
    </div>
  );
}

function MatchingPairsFields({
  question, onChange, ic,
}: {
  question: Extract<ContentBlockQuestion, { type: 'matching' }>;
  onChange: (q: Partial<ContentBlockQuestion>) => void;
  ic: string;
}) {
  const pairs = question.pairs || [];
  const addPair = () => onChange({ pairs: [...pairs, { left: '', right: '' }] });
  const removePair = (i: number) => onChange({ pairs: pairs.filter((_, idx) => idx !== i) });
  const updatePair = (i: number, side: 'left' | 'right', val: string) => {
    const next = [...pairs];
    next[i] = { ...next[i], [side]: val };
    onChange({ pairs: next });
  };

  return (
    <div>
      <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Matching Pairs (left ↔ right)</label>
      <div className="space-y-1.5">
        {pairs.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input className={ic} placeholder="Left (e.g. Arabic word)" value={p.left} onChange={(e) => updatePair(i, 'left', e.target.value)} />
            <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">↔</span>
            <input className={ic} placeholder="Right (e.g. English meaning)" value={p.right} onChange={(e) => updatePair(i, 'right', e.target.value)} />
            <button type="button" onClick={() => removePair(i)} className="shrink-0 rounded p-1 text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addPair} className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
        <Plus className="h-3.5 w-3.5" /> Add pair
      </button>
    </div>
  );
}

function OrderingFields({
  question, onChange, ic,
}: {
  question: Extract<ContentBlockQuestion, { type: 'ordering' }>;
  onChange: (q: Partial<ContentBlockQuestion>) => void;
  ic: string;
}) {
  const items = question.items || [];
  const addItem = () => onChange({ items: [...items, ''] });
  const removeItem = (i: number) => onChange({ items: items.filter((_, idx) => idx !== i) });

  return (
    <div>
      <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Items in correct order (shuffled for student)</label>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 h-5 shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
            <input className={ic} placeholder={`Item ${i + 1}`} value={item} onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange({ items: next });
            }} />
            <button type="button" onClick={() => removeItem(i)} className="shrink-0 rounded p-1 text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addItem} className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
        <Plus className="h-3.5 w-3.5" /> Add item
      </button>
    </div>
  );
}

function PictureChoiceFields({
  question, onChange, ic,
}: {
  question: Extract<ContentBlockQuestion, { type: 'picture_choice' }>;
  onChange: (q: Partial<ContentBlockQuestion>) => void;
  ic: string;
}) {
  const choices = question.choices || [];
  const addChoice = () => onChange({ choices: [...choices, { image: '', label: '' }] });
  const removeChoice = (i: number) => {
    const next = choices.filter((_, idx) => idx !== i);
    onChange({ choices: next, correctIndex: Math.min(question.correctIndex, next.length - 1) });
  };
  const updateChoice = (i: number, field: 'image' | 'label', val: string) => {
    const next = [...choices];
    next[i] = { ...next[i], [field]: val };
    onChange({ choices: next });
  };

  return (
    <div>
      <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Picture choices — mark the correct one</label>
      <div className="space-y-2">
        {choices.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <input type="radio" checked={question.correctIndex === i} onChange={() => onChange({ correctIndex: i })} title="Mark as correct" className="mt-2" />
            <div className="flex-1 space-y-1.5">
              <input className={ic} placeholder={`Image URL ${i + 1}`} value={c.image} onChange={(e) => updateChoice(i, 'image', e.target.value)} />
              <input className={ic} placeholder="Label (optional)" value={c.label || ''} onChange={(e) => updateChoice(i, 'label', e.target.value)} />
            </div>
            <button type="button" onClick={() => removeChoice(i)} className="shrink-0 mt-2 rounded p-1 text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addChoice} className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
        <Plus className="h-3.5 w-3.5" /> Add choice
      </button>
    </div>
  );
}

function SwipeSortFields({
  question, onChange, ic,
}: {
  question: Extract<ContentBlockQuestion, { type: 'swipe_sort' }>;
  onChange: (q: Partial<ContentBlockQuestion>) => void;
  ic: string;
}) {
  const cards = question.cards || [];
  const addCard = () => onChange({ cards: [...cards, { text: '', correctSide: 'left' as const }] });
  const removeCard = (i: number) => onChange({ cards: cards.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[11px] font-semibold text-[var(--color-text-secondary)] block mb-0.5">Left bucket label</label>
          <input className={ic} value={question.leftLabel || ''} onChange={(e) => onChange({ leftLabel: e.target.value })} placeholder="e.g. Halal" />
        </div>
        <div className="flex-1">
          <label className="text-[11px] font-semibold text-[var(--color-text-secondary)] block mb-0.5">Right bucket label</label>
          <input className={ic} value={question.rightLabel || ''} onChange={(e) => onChange({ rightLabel: e.target.value })} placeholder="e.g. Haram" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Cards</label>
        <div className="space-y-1.5">
          {cards.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={c.correctSide} onChange={(e) => {
                const next = [...cards];
                next[i] = { ...next[i], correctSide: e.target.value as 'left' | 'right' };
                onChange({ cards: next });
              }} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-[10px] shrink-0">
                <option value="left">{question.leftLabel || 'Left'}</option>
                <option value="right">{question.rightLabel || 'Right'}</option>
              </select>
              <input className={ic} placeholder="Card text" value={c.text} onChange={(e) => {
                const next = [...cards];
                next[i] = { ...next[i], text: e.target.value };
                onChange({ cards: next });
              }} />
              <button type="button" onClick={() => removeCard(i)} className="shrink-0 rounded p-1 text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addCard} className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
          <Plus className="h-3.5 w-3.5" /> Add card
        </button>
      </div>
    </div>
  );
}

function ListenWriteFields({
  question, onChange, ic,
}: {
  question: Extract<ContentBlockQuestion, { type: 'listen_write' }>;
  onChange: (q: Partial<ContentBlockQuestion>) => void;
  ic: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Audio URL</label>
        <input className={ic} value={question.audioUrl || ''} onChange={(e) => onChange({ audioUrl: e.target.value })} placeholder="https://example.com/audio.mp3" />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Correct Text (what the student should type)</label>
        <input className={ic} value={question.correctText || ''} onChange={(e) => onChange({ correctText: e.target.value })} placeholder="The exact phrase..." />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Hint (optional)</label>
        <input className={ic} value={question.hint || ''} onChange={(e) => onChange({ hint: e.target.value })} placeholder="e.g. It starts with..." />
      </div>
    </div>
  );
}

function FillBlankFields({
  question, onChange, ic,
}: {
  question: Extract<ContentBlockQuestion, { type: 'fill_blank' }>;
  onChange: (q: Partial<ContentBlockQuestion>) => void;
  ic: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Sentence Template (use ___ for each blank)</label>
        <textarea className={`${ic} resize-none`} rows={3} value={question.textTemplate || ''} onChange={(e) => onChange({ textTemplate: e.target.value })} placeholder="The ___ is a place of ___ for Muslims." />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Correct Blanks (in order, comma-separated)</label>
        <input className={ic} value={(question.blanks || []).join(', ')} onChange={(e) => onChange({ blanks: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="mosque, worship" />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Distractor words (comma-separated)</label>
        <input className={ic} value={(question.distractors || []).join(', ')} onChange={(e) => onChange({ distractors: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="school, market, garden" />
      </div>
    </div>
  );
}

function WordScrambleFields({
  question, updateQuestion, ic,
}: {
  question: Extract<ContentBlockQuestion, { type: 'word_scramble' }>;
  updateQuestion: (q: Partial<ContentBlockQuestion>) => void;
  ic: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Correct Answer (the unscrambled word)</label>
        <input className={ic} value={question.answer || ''} onChange={(e) => updateQuestion({ answer: e.target.value })} placeholder="e.g. Ramadan" />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Hint (optional)</label>
        <input className={ic} value={question.hint || ''} onChange={(e) => updateQuestion({ hint: e.target.value })} placeholder="e.g. The month of fasting" />
      </div>
    </div>
  );
}

function SentenceBuildFields({
  question, onChange, ic,
}: {
  question: Extract<ContentBlockQuestion, { type: 'sentence_build' }>;
  onChange: (q: Partial<ContentBlockQuestion>) => void;
  ic: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Correct Words (in order, comma-separated)</label>
        <input className={ic} value={(question.words || []).join(', ')} onChange={(e) => onChange({ words: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="The, mosque, is, beautiful" />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Distractor words (comma-separated)</label>
        <input className={ic} value={(question.distractors || []).join(', ')} onChange={(e) => onChange({ distractors: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="school, garden, big" />
      </div>
    </div>
  );
}