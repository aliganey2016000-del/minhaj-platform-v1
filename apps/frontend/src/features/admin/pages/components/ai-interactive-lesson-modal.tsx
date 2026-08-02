/**
 * AI Interactive Lesson Modal — generates a full set of Interactive Gate
 * Content Blocks (each with its own Stop & Check question(s)) in one pass,
 * matching the "AI Generate" / "Paste Content" split the admin asked for:
 *
 * 1. AI Generate — composes fresh lesson content from the lesson's Title,
 *    already broken into the requested number of blocks with questions.
 * 2. Paste Content — the admin pastes their own text, then chooses whether
 *    the AI should paraphrase/polish it first, or preserve it exactly as
 *    pasted and just split + question it as-is.
 *
 * Both paths let the admin set how many blocks to produce, how many
 * questions per block (1-3), and the question type mix (Mixed / MCQ only /
 * True-False only).
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, ClipboardPaste, Loader2, AlertCircle } from 'lucide-react';
import api from '../../../../lib/axios';
import { generateTempId } from '../course-builder.api';
import type { ContentBlock, ContentBlockQuestion } from '../course-builder.types';

interface AiInteractiveLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessonTitle: string;
  defaultMinReadSeconds: number;
  onGenerated: (blocks: ContentBlock[]) => void;
}

type SourceTab = 'generate' | 'paste';
type QuestionTypeChoice = 'mixed' | 'mcq' | 'true_false';

interface RawBlock {
  title?: string;
  content: string;
  questions?: ContentBlockQuestion[];
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1 block">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(Math.max(Number(e.target.value) || min, min), max))}
        className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs"
      />
    </div>
  );
}

function QuestionTypeField({ value, onChange }: { value: QuestionTypeChoice; onChange: (v: QuestionTypeChoice) => void }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1 block">Question Type</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as QuestionTypeChoice)}
        className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs"
      >
        <option value="mixed">Mixed (AI decides)</option>
        <option value="mcq">Multiple Choice only</option>
        <option value="true_false">True / False only</option>
      </select>
    </div>
  );
}

export function AiInteractiveLessonModal({ isOpen, onClose, lessonTitle, defaultMinReadSeconds, onGenerated }: AiInteractiveLessonModalProps) {
  const [tab, setTab] = useState<SourceTab>('generate');
  const [pasteText, setPasteText] = useState('');
  const [paraphrase, setParaphrase] = useState(true);
  const [blockCount, setBlockCount] = useState(4);
  const [questionsPerBlock, setQuestionsPerBlock] = useState(1);
  const [questionType, setQuestionType] = useState<QuestionTypeChoice>('mixed');
  const [generating, setGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTab('generate');
      setPasteText('');
      setParaphrase(true);
      setBlockCount(4);
      setQuestionsPerBlock(1);
      setQuestionType('mixed');
      setError('');
      setGenerating(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generating) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, generating, onClose]);

  if (!isOpen) return null;

  const closeUnlessBusy = () => {
    if (!generating) onClose();
  };

  const runGenerate = async (body: Record<string, unknown>, statusText: string) => {
    setError('');
    setStatusMessage(statusText);
    setGenerating(true);
    try {
      const { data } = await api.post('/ai/generate-interactive-lesson', {
        ...body,
        blockCount,
        questionsPerBlock,
        questionType,
      });
      const rawBlocks: RawBlock[] = data.data.blocks || [];
      if (rawBlocks.length === 0) {
        setError('AI did not return any content blocks. Please try again.');
        return;
      }
      const blocks: ContentBlock[] = rawBlocks.map((b, i) => ({
        _id: generateTempId(),
        order: i,
        title: b.title || undefined,
        content: b.content,
        minReadSeconds: defaultMinReadSeconds,
        questions: b.questions || [],
      }));
      onGenerated(blocks);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate the lesson. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const generateFromTitle = () =>
    runGenerate(
      { source: 'title', title: lessonTitle },
      '✨ DeepSeek is composing your interactive lesson from the title...'
    );

  const generateFromPaste = () =>
    runGenerate(
      { source: 'paste', pasteText, paraphrase },
      paraphrase
        ? '✨ DeepSeek is paraphrasing your text and building interactive blocks...'
        : '✨ DeepSeek is splitting your text into interactive blocks...'
    );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={closeUnlessBusy}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-5 py-4">
            <h3 className="flex items-center gap-2 text-base font-bold text-[var(--color-text-primary)]">
              <span className="text-xl">✨</span> AI Interactive Lesson Generator
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

          <div className="p-5">
            {generating ? (
              <div className="flex flex-col items-center justify-center gap-4 py-14 text-center">
                <div className="relative h-14 w-14">
                  <div className="absolute inset-0 rounded-full border-4 border-violet-100 dark:border-violet-900/40" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-600 animate-spin" />
                </div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] max-w-sm">{statusMessage}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">This can take up to a minute for longer lessons.</p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
                  </div>
                )}

                {/* Source tabs */}
                <div className="inline-flex rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-1 mb-4">
                  <button
                    type="button"
                    onClick={() => setTab('generate')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      tab === 'generate' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> AI Generate
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('paste')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      tab === 'paste' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" /> Paste Content
                  </button>
                </div>

                {tab === 'generate' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      DeepSeek writes a full interactive lesson on this topic, already broken into blocks with a check question after each one.
                    </p>
                    <div className="rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)] px-3 py-2 text-xs text-[var(--color-text-secondary)] truncate">
                      {lessonTitle?.trim() ? `Topic: “${lessonTitle}”` : 'No title set yet — enter a Title above first.'}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="Paste your lesson text, notes, or transcript here..."
                      rows={6}
                      className="w-full resize-none rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1 block">How should the text be used?</label>
                      <div className="flex gap-2 rounded-xl border border-[var(--color-border-default)] p-1">
                        <button
                          type="button"
                          onClick={() => setParaphrase(true)}
                          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            paraphrase ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
                          }`}
                        >
                          ✨ Paraphrase &amp; Polish
                        </button>
                        <button
                          type="button"
                          onClick={() => setParaphrase(false)}
                          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            !paraphrase ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
                          }`}
                        >
                          📋 Use As-Is
                        </button>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                        {paraphrase
                          ? 'AI rewrites your text in clearer, more polished language before splitting it into blocks.'
                          : 'Your original wording is preserved exactly — it is only split into blocks and questioned, never rewritten.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Shared block/question settings */}
                <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-dashed border-[var(--color-border-default)] p-3">
                  <NumberField label="Number of Blocks" value={blockCount} onChange={setBlockCount} min={2} max={12} />
                  <NumberField label="Questions per Block" value={questionsPerBlock} onChange={setQuestionsPerBlock} min={1} max={3} />
                  <QuestionTypeField value={questionType} onChange={setQuestionType} />
                </div>

                <button
                  type="button"
                  onClick={tab === 'generate' ? generateFromTitle : generateFromPaste}
                  disabled={tab === 'generate' ? !lessonTitle?.trim() : !pasteText.trim()}
                  className="mt-4 w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2.5 text-xs font-semibold text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {tab === 'generate' ? 'Generate Interactive Lesson' : 'Generate Blocks from Pasted Text'}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default AiInteractiveLessonModal;
