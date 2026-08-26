/**
 * Bulk Stop & Check AI Generator — runs the same "type + count" question
 * generator as StopCheckAiGeneratorModal, but across every content block in
 * the lesson in one action, instead of one block at a time. Exists for the
 * exact gap reported: importing an interactive lesson brings in the
 * paragraph blocks but not their questions, and generating them one block
 * at a time for a long lesson is tedious.
 *
 * Each block is sent to AI separately (its own paragraph text only, never
 * mixed with another block's), sequentially — not in parallel — so progress
 * can be shown and one slow/failed block doesn't waste concurrent AI calls
 * for the rest. A block with no paragraph text yet is skipped, not failed.
 */

import { useState } from 'react';
import api from '../../../../lib/axios';
import { generateTempId } from '../course-builder.api';
import { normalizeQuestion, getBlockQuestions } from '../course-builder.types';
import { QUESTION_TYPE_META, QUESTION_TYPE_ORDER } from '../quiz-question-meta';
import type { ContentBlock, ContentBlockQuestion, QuestionType } from '../course-builder.types';

interface BulkStopCheckAiGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  blocks: ContentBlock[];
  onGenerated: (blocks: ContentBlock[]) => void;
}

const DEFAULT_COUNT = 3;

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function blockLabel(block: ContentBlock, index: number): string {
  return block.title?.trim() || `Content Block ${index + 1}`;
}

export function BulkStopCheckAiGeneratorModal({ isOpen, onClose, blocks, onGenerated }: BulkStopCheckAiGeneratorModalProps) {
  const [customInstructions, setCustomInstructions] = useState('');
  const [counts, setCounts] = useState<Partial<Record<QuestionType, number>>>({ mcq: DEFAULT_COUNT });
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');

  const totalQuestions = Object.values(counts).reduce((sum, c) => sum + (c || 0), 0);
  const eligibleIndices = blocks.map((_, i) => i).filter((i) => plainText(blocks[i].content).length > 0);

  if (!isOpen) return null;

  const closeUnlessBusy = () => {
    if (!generating) onClose();
  };

  const toggleType = (type: QuestionType) => {
    setCounts((prev) => {
      const next = { ...prev };
      if (type in next) delete next[type];
      else next[type] = DEFAULT_COUNT;
      return next;
    });
  };

  const updateCount = (type: QuestionType, count: number) => {
    setCounts((prev) => ({ ...prev, [type]: Math.max(1, Math.min(20, count || 1)) }));
  };

  const handleGenerate = async () => {
    setError('');

    if (eligibleIndices.length === 0) {
      setError('None of the content blocks have paragraph text yet — write the blocks first, then generate questions.');
      return;
    }

    const questionCounts = Object.entries(counts)
      .filter(([, count]) => (count || 0) > 0)
      .map(([type, count]) => ({ type, count }));

    if (questionCounts.length === 0) {
      setError('Check at least one question type and set how many to generate per block.');
      return;
    }

    setGenerating(true);
    const updated = [...blocks];
    const failed: string[] = [];

    for (let n = 0; n < eligibleIndices.length; n++) {
      const idx = eligibleIndices[n];
      const label = blockLabel(blocks[idx], idx);
      setProgress({ current: n + 1, total: eligibleIndices.length, label });
      try {
        const { data } = await api.post('/ai/generate-quiz', {
          mode: 'topic',
          rawText: plainText(blocks[idx].content),
          customInstructions,
          questionCounts,
        });
        const generated: ContentBlockQuestion[] = (data.data.questions || []).map((q: any) => ({
          ...normalizeQuestion({ ...q, _id: generateTempId() }),
          aiGenerated: true,
        }));
        const existing = getBlockQuestions(updated[idx]);
        updated[idx] = { ...updated[idx], questions: [...existing, ...generated], question: undefined };
      } catch (err: any) {
        failed.push(`${label}: ${err.response?.data?.message || 'failed to generate'}`);
      }
    }

    onGenerated(updated);
    setGenerating(false);
    setProgress(null);

    if (failed.length > 0) {
      setError(`Generated questions for ${eligibleIndices.length - failed.length} of ${eligibleIndices.length} block(s). Some failed: ${failed.join('; ')}`);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={closeUnlessBusy}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-5 py-4 flex-shrink-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-[var(--color-text-primary)]">
            <span className="text-xl">🪄</span> Generate Questions for All Blocks
          </h3>
          <button
            type="button"
            onClick={closeUnlessBusy}
            disabled={generating}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ✕
          </button>
        </div>

        {generating ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-5">
            <div className="relative h-14 w-14">
              <div className="absolute inset-0 rounded-full border-4 border-violet-100 dark:border-violet-900/40" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-600 animate-spin" />
            </div>
            {progress && (
              <>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] max-w-sm">
                  ✨ Block {progress.current} of {progress.total}: "{progress.label}"
                </p>
                <div className="w-full max-w-xs h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                  <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                </div>
              </>
            )}
            <p className="text-xs text-[var(--color-text-tertiary)]">Each block is analyzed separately — this can take a while for a long lesson.</p>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {error && (
              <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <p className="text-xs text-[var(--color-text-tertiary)]">
              Generates questions for every content block that already has paragraph text — {eligibleIndices.length} of {blocks.length} block{blocks.length === 1 ? '' : 's'} qualify. Each block's questions are generated only from that block's own text, never mixed with another block's. Blocks that already have questions get these added alongside them, not replaced.
            </p>

            {/* Custom AI Instructions */}
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Custom AI Instructions (optional)</label>
              <textarea
                rows={2}
                className="w-full resize-y rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm"
                placeholder='e.g. "Keep it friendly for 8-year-olds" — applied to every block'
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
              />
            </div>

            {/* Question Type Selector & Count Matrix — applies per block */}
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5 block">
                Question Types & Counts (per block)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {QUESTION_TYPE_ORDER.map((type) => {
                  const meta = QUESTION_TYPE_META[type];
                  const checked = type in counts;
                  return (
                    <div
                      key={type}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                        checked ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'
                      }`}
                    >
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => toggleType(type)} className="accent-primary-600 flex-shrink-0" />
                        <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.color}`}>{meta.icon}</span>
                        <span className="text-sm text-[var(--color-text-primary)] truncate">{meta.label}</span>
                      </label>
                      {checked && (
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={counts[type]}
                          onChange={(e) => updateCount(type, parseInt(e.target.value, 10))}
                          className="w-14 flex-shrink-0 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs text-center"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {totalQuestions > 0 && (
                <p className="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                  {totalQuestions} question{totalQuestions === 1 ? '' : 's'} per block × {eligibleIndices.length} block{eligibleIndices.length === 1 ? '' : 's'} = {totalQuestions * eligibleIndices.length} question{totalQuestions * eligibleIndices.length === 1 ? '' : 's'} total.
                </p>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={eligibleIndices.length === 0}
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-violet-700 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🪄 Generate for All Blocks
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BulkStopCheckAiGeneratorModal;
