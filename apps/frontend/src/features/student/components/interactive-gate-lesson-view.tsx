/**
 * Interactive Gate Lesson View — "Stop and Check" delivery mode.
 *
 * Shows one content block at a time. Each block stays open for a minimum
 * read time before "Next" activates; if the block has a Stop & Check
 * question, the student must answer it correctly (server-graded) before the
 * next block reveals. Progress is resumed from the server on mount so a
 * reload can't be used to skip ahead.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../../../lib/axios';
import type { LessonItem } from '../../admin/pages/course-builder.types';

type Phase = 'loading' | 'reading' | 'ready' | 'question_open' | 'question_retry' | 'cleared';

interface InteractiveGateLessonViewProps {
  lesson: LessonItem;
  courseId: string;
  onGateCleared: () => void;
}

export function InteractiveGateLessonView({ lesson, courseId, onGateCleared }: InteractiveGateLessonViewProps) {
  const blocks = lesson.contentBlocks || [];
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [retryExplanation, setRetryExplanation] = useState('');

  // Resume from server — never trust client state as the source of truth
  // for how far a student has actually progressed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/courses/${courseId}/lessons/${lesson._id}/gate`);
        if (cancelled) return;
        const progress = data.data;
        if (progress.gateCompleted) {
          setPhase('cleared');
          onGateCleared();
        } else {
          setCurrentBlockIndex(Math.min(progress.unlockedBlockIndex || 0, blocks.length - 1));
          setPhase('reading');
        }
      } catch {
        if (!cancelled) setPhase('reading'); // fall back to starting at block 0
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson._id]);

  // Countdown timer for the current block's minimum read time.
  useEffect(() => {
    if (phase !== 'reading') return;
    const block = blocks[currentBlockIndex];
    if (!block) return;
    setSecondsRemaining(block.minReadSeconds || 30);
    const id = setInterval(() => {
      setSecondsRemaining((s) => {
        if (s <= 1) {
          clearInterval(id);
          setPhase('ready');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [currentBlockIndex, phase, blocks]);

  if (blocks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border-default)] p-6 text-center text-sm text-[var(--color-text-tertiary)]">
        This lesson has no content blocks yet.
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="flex justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  if (phase === 'cleared') {
    return (
      <div className="rounded-2xl bg-green-50 dark:bg-green-950/20 border-2 border-green-300 dark:border-green-700 p-6 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="text-sm font-bold text-green-700 dark:text-green-300">You've cleared every gate in this lesson.</p>
      </div>
    );
  }

  const block = blocks[currentBlockIndex];
  const totalBlocks = blocks.length;
  const isLastBlock = currentBlockIndex === totalBlocks - 1;

  const handleNext = () => {
    setRetryExplanation('');
    setSelectedAnswer(null);
    if (block.question) setPhase('question_open');
    else void submitAnswer(true); // no question — advancing alone clears this block
  };

  const submitAnswer = async (advanceOnly = false) => {
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(
        `/courses/${courseId}/lessons/${lesson._id}/gate/blocks/${currentBlockIndex}/answer`,
        { answer: advanceOnly ? true : selectedAnswer }
      );
      if (data.data.correct) {
        setSelectedAnswer(null);
        setRetryExplanation('');
        if (data.data.gateCompleted) {
          setPhase('cleared');
          onGateCleared();
        } else {
          setCurrentBlockIndex((i) => i + 1);
          setPhase('reading');
        }
      } else {
        setRetryExplanation(data.data.explanation || '');
        setPhase('question_retry');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Something went wrong — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Progress dots */}
      <div className="flex items-center gap-1.5">
        {blocks.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < currentBlockIndex ? 'bg-green-500' : i === currentBlockIndex ? 'bg-primary-600' : 'bg-[var(--color-surface-tertiary)]'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-[var(--color-text-tertiary)]">Block {currentBlockIndex + 1} of {totalBlocks}</p>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentBlockIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 lg:p-5 space-y-4"
        >
          {block.title && (
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">{block.title}</h3>
          )}
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-[var(--color-text-primary)] [&_p]:mb-3 [&_p]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: block.content }}
          />

          {(phase === 'reading' || phase === 'ready') && (
            <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-subtle)]">
              {phase === 'reading' ? (
                <span className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  Keep reading — Next unlocks in {secondsRemaining}s
                </span>
              ) : <span />}
              <button
                type="button"
                onClick={handleNext}
                disabled={phase === 'reading'}
                className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                {block.question ? 'Next → Question' : isLastBlock ? 'Finish' : 'Next'}
              </button>
            </div>
          )}

          {(phase === 'question_open' || phase === 'question_retry') && block.question && (
            <div className="rounded-xl bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] p-4 space-y-3">
              <p className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                <span>🛑</span> Stop &amp; Check
              </p>
              <p className="text-sm text-[var(--color-text-primary)]">{block.question.question}</p>

              {phase === 'question_retry' && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 space-y-1">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">Not quite — review the paragraph above and try again.</p>
                  {retryExplanation && (
                    <p className="text-xs text-red-600/90 dark:text-red-400/90"><span className="font-semibold">Hint:</span> {retryExplanation}</p>
                  )}
                </div>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}

              {block.question.type === 'mcq' ? (
                <div className="space-y-2">
                  {(block.question.options || []).map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedAnswer(i)}
                      className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                        selectedAnswer === i
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300'
                          : 'border-[var(--color-border-default)] hover:bg-[var(--color-surface-tertiary)]'
                      }`}
                    >
                      {String.fromCharCode(65 + i)}. {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-3">
                  {[true, false].map((val) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => setSelectedAnswer(val)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                        selectedAnswer === val
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300'
                          : 'border-[var(--color-border-default)] hover:bg-[var(--color-surface-tertiary)]'
                      }`}
                    >
                      {val ? 'True' : 'False'}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => submitAnswer(false)}
                disabled={selectedAnswer === null || submitting}
                className="w-full rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? 'Checking...' : 'Submit Answer'}
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
