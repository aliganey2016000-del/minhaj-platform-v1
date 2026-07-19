/**
 * Content Block Editor — authors the paragraph-by-paragraph "Content Blocks"
 * used by a lesson's "Interactive Gate" delivery mode. Each block is a
 * chunk of rich text plus an optional Stop & Check question (MCQ or
 * True/False) that the student must answer correctly before the next block
 * unlocks. Mirrors the local-array-state + inline add/remove pattern already
 * used for attachments/quiz questions elsewhere in the Course Builder.
 */

import { useState } from 'react';
import {
  ArrowUp, ArrowDown, Trash2, PenLine, Sparkles, Loader2, CheckCircle2,
  RefreshCw, Pencil, Plus, X, AlertCircle, CircleCheck,
} from 'lucide-react';
import type { ContentBlock, ContentBlockQuestion } from '../course-builder.types';
import { RichTextEditor } from './rich-text-editor';
import api from '../../../../lib/axios';

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

export function emptyManualQuestion(): ContentBlockQuestion {
  return { type: 'mcq', question: '', options: ['', ''], correctOptionIndex: 0, explanation: '', aiGenerated: false };
}

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
  const setQuestion = (question: ContentBlockQuestion | undefined) => onChange({ question });

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

      <div className="border-t border-[var(--color-border-subtle)] pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Stop &amp; Check Question (optional)</span>
          {block.question && (
            <button type="button" onClick={() => setQuestion(undefined)} className="text-xs text-red-500 hover:text-red-700">
              Remove question
            </button>
          )}
        </div>

        <QuestionBuilder blockContent={block.content} question={block.question} onChange={setQuestion} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Builder — mode toggle + Manual form + AI generator flow
// ---------------------------------------------------------------------------

type QuestionMode = 'manual' | 'ai';
type AiPhase = 'idle' | 'loading' | 'preview' | 'error';

function QuestionBuilder({
  blockContent, question, onChange,
}: {
  blockContent: string;
  question: ContentBlockQuestion | undefined;
  onChange: (q: ContentBlockQuestion | undefined) => void;
}) {
  const [questionMode, setQuestionMode] = useState<QuestionMode | null>(
    question ? (question.aiGenerated ? 'ai' : 'manual') : null
  );
  const [aiPhase, setAiPhase] = useState<AiPhase>('idle');
  const [aiDraft, setAiDraft] = useState<ContentBlockQuestion | null>(null);
  const [aiError, setAiError] = useState('');
  const [editingCommitted, setEditingCommitted] = useState(false);

  const hasBlockText = plainText(blockContent).length > 0;

  const runGenerate = async () => {
    setAiPhase('loading');
    setAiError('');
    try {
      const { data } = await api.post('/ai/generate-stop-check-question', { blockText: plainText(blockContent) });
      setAiDraft(data.data.question);
      setAiPhase('preview');
    } catch (err: any) {
      setAiError(err.response?.data?.message || 'Failed to generate a question. Please try again.');
      setAiPhase('error');
    }
  };

  const keepDraft = () => {
    if (!aiDraft) return;
    onChange(aiDraft);
    setEditingCommitted(false);
  };

  const editDraft = () => {
    if (!aiDraft) return;
    onChange(aiDraft);
    setEditingCommitted(true);
  };

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
          onClick={() => setQuestionMode('ai')}
          className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-violet-300 dark:border-violet-800 bg-gradient-to-b from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 px-4 py-4 text-center hover:border-violet-500 transition-colors"
        >
          <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">AI Generator</span>
        </button>
      </div>
    );
  }

  // ── AI mode, no committed question yet: idle / loading / preview / error ──
  if (questionMode === 'ai' && !question) {
    return (
      <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-gradient-to-b from-violet-50/50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/20 p-4 space-y-3">
        {aiPhase === 'idle' && (
          <div className="text-center space-y-2">
            <button
              type="button"
              onClick={runGenerate}
              disabled={!hasBlockText}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="h-4 w-4" /> Analyze &amp; Generate Question
            </button>
            {!hasBlockText && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Please write some paragraph content first so AI can analyze it.
              </p>
            )}
            <p>
              <button type="button" onClick={() => setQuestionMode(null)} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:underline">
                ← Back to options
              </button>
            </p>
          </div>
        )}

        {aiPhase === 'loading' && (
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-violet-600 dark:text-violet-400" />
            <p className="text-xs text-[var(--color-text-secondary)]">AI is analyzing the block content and generating a question...</p>
            <div className="w-full space-y-1.5 pt-1">
              <div className="h-2.5 w-3/4 mx-auto rounded bg-violet-200/70 dark:bg-violet-800/40 animate-pulse" />
              <div className="h-2.5 w-1/2 mx-auto rounded bg-violet-200/70 dark:bg-violet-800/40 animate-pulse" />
            </div>
          </div>
        )}

        {aiPhase === 'error' && (
          <div className="text-center space-y-2">
            <p className="flex items-center justify-center gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {aiError}
            </p>
            <button
              type="button"
              onClick={runGenerate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-surface-tertiary)] transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Try Again
            </button>
          </div>
        )}

        {aiPhase === 'preview' && aiDraft && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
              <Sparkles className="h-3.5 w-3.5" /> Generated question — review before adding
            </div>
            <QuestionPreviewCard draft={aiDraft} />
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button type="button" onClick={editDraft} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs font-semibold hover:bg-[var(--color-surface-tertiary)] transition-colors">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button type="button" onClick={keepDraft} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-2 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">
                <CheckCircle2 className="h-3.5 w-3.5" /> Keep
              </button>
              <button type="button" onClick={runGenerate} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs font-semibold hover:bg-[var(--color-surface-tertiary)] transition-colors">
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Question committed (manual, or AI "Keep"/"Edit") ──
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
// ---------------------------------------------------------------------------

function QuestionPreviewCard({ draft }: { draft: ContentBlockQuestion }) {
  return (
    <div className="rounded-lg bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] p-3 space-y-2">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{draft.question || <em className="text-[var(--color-text-tertiary)]">(no question text)</em>}</p>
      {draft.type === 'mcq' ? (
        <div className="space-y-1">
          {(draft.options || []).map((opt, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs rounded-md px-2 py-1 ${i === draft.correctOptionIndex ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-medium' : 'text-[var(--color-text-secondary)]'}`}>
              {i === draft.correctOptionIndex ? <CircleCheck className="h-3.5 w-3.5 shrink-0" /> : <span className="h-3.5 w-3.5 shrink-0" />}
              {String.fromCharCode(65 + i)}. {opt || <em>(empty)</em>}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 text-xs">
          <span className={`rounded-md px-2 py-1 ${draft.correctAnswer === true ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-medium' : 'text-[var(--color-text-secondary)]'}`}>True</span>
          <span className={`rounded-md px-2 py-1 ${draft.correctAnswer === false ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-medium' : 'text-[var(--color-text-secondary)]'}`}>False</span>
        </div>
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
// ---------------------------------------------------------------------------

export function ManualQuestionForm({
  question, onChange, isAiGenerated,
}: {
  question: ContentBlockQuestion;
  onChange: (q: ContentBlockQuestion) => void;
  isAiGenerated?: boolean;
}) {
  const ic = 'w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs';

  const addOption = () => {
    const options = [...(question.options || [])];
    if (options.length >= MAX_OPTIONS) return;
    onChange({ ...question, options: [...options, ''] });
  };

  const removeOption = (i: number) => {
    const options = [...(question.options || [])];
    if (options.length <= MIN_OPTIONS) return;
    options.splice(i, 1);
    const correctOptionIndex = question.correctOptionIndex === i
      ? 0
      : question.correctOptionIndex! > i ? question.correctOptionIndex! - 1 : question.correctOptionIndex;
    onChange({ ...question, options, correctOptionIndex });
  };

  return (
    <div className="space-y-2.5 rounded-lg bg-[var(--color-surface-secondary)] p-3">
      {isAiGenerated && (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
          <Sparkles className="h-2.5 w-2.5" /> AI-generated — review before saving
        </span>
      )}

      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Question Text</label>
        <textarea
          className={`${ic} resize-none`}
          rows={2}
          placeholder="What should the student answer?"
          value={question.question}
          onChange={(e) => onChange({ ...question, question: e.target.value })}
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Question Type</label>
        <select
          className={ic}
          value={question.type}
          onChange={(e) => {
            if (e.target.value === 'mcq') {
              onChange({ ...question, type: 'mcq', options: question.options?.length ? question.options : ['', ''], correctOptionIndex: 0 });
            } else {
              onChange({ ...question, type: 'true_false', correctAnswer: true });
            }
          }}
        >
          <option value="mcq">Multiple Choice</option>
          <option value="true_false">True / False</option>
        </select>
      </div>

      {question.type === 'mcq' ? (
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Options — mark the correct one</label>
          <div className="space-y-1.5">
            {(question.options || ['', '']).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={question.correctOptionIndex === i}
                  onChange={() => onChange({ ...question, correctOptionIndex: i })}
                  title="Mark as correct answer"
                />
                <input
                  className={ic}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  value={opt}
                  onChange={(e) => {
                    const options = [...(question.options || ['', ''])];
                    options[i] = e.target.value;
                    onChange({ ...question, options });
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  disabled={(question.options?.length || 0) <= MIN_OPTIONS}
                  className="shrink-0 rounded p-1 text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Remove option"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          {(question.options?.length || 0) < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add option
            </button>
          )}
        </div>
      ) : (
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Correct Answer</label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input type="radio" checked={question.correctAnswer === true} onChange={() => onChange({ ...question, correctAnswer: true })} />
              True
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="radio" checked={question.correctAnswer === false} onChange={() => onChange({ ...question, correctAnswer: false })} />
              False
            </label>
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Explanation / Feedback (optional)</label>
        <textarea
          className={`${ic} resize-none`}
          rows={2}
          placeholder="Shown to the student if they answer incorrectly..."
          value={question.explanation || ''}
          onChange={(e) => onChange({ ...question, explanation: e.target.value })}
        />
      </div>
    </div>
  );
}
