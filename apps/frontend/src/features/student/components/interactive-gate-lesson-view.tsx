/**
 * Interactive Gate Lesson View — "Stop and Check" delivery mode.
 *
 * Two independent gating systems, both rendered together:
 *  1. Video checkpoints — if the lesson has a self-hosted video and
 *     `videoCheckpoints`, playback pauses at each checkpoint's percentage
 *     mark until its question is answered correctly. Forward seeking past
 *     the furthest-watched point is blocked when `blockForwardSeeking` is
 *     set. (YouTube/Vimeo embeds render but aren't checkpoint-gated — that
 *     needs each platform's JS player SDK, not plain <video> events.)
 *  2. Content blocks — shows one paragraph block at a time. Each stays open
 *     for a minimum read time before "Next" activates; if the block has a
 *     Stop & Check question, the student must answer it correctly before
 *     the next block reveals.
 *
 * Both resume from the server on mount so a reload can't be used to skip
 * ahead of either gate.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../../../lib/axios';
import type { LessonItem } from '../../admin/pages/course-builder.types';
import { getBlockQuestions } from '../../admin/pages/course-builder.types';
import { checkGateAnswerOffline } from '../../../lib/offline-gate';
import { getGateProgress, patchGateProgress, queueAction, queueVideoProgress } from '../../../lib/offline-store';
import { sanitizeHtml } from '../../../lib/sanitize-html';

type Phase = 'loading' | 'reading' | 'ready' | 'question_open' | 'question_retry' | 'cleared';

interface InteractiveGateLessonViewProps {
  lesson: LessonItem;
  courseId: string;
  onGateCleared: () => void;
}

// ---------------------------------------------------------------------------
// Video embed detection (duplicated from student-course-learn.tsx — small,
// pure, and already duplicated per-file elsewhere in this codebase).
// ---------------------------------------------------------------------------
function extractVideoEmbed(url: string): { type: 'youtube' | 'vimeo' | 'direct' | null; id: string } {
  if (!url) return { type: null, id: '' };
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return { type: 'youtube', id: ytMatch[1] };
  const vmMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vmMatch) return { type: 'vimeo', id: vmMatch[1] };
  if (/\.(mp4|webm|ogg|mov|mkv|avi)(\?.*)?$/i.test(url)) return { type: 'direct', id: url };
  return { type: null, id: '' };
}

const YOUTUBE_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';
const VIMEO_PLAYER_API_SRC = 'https://player.vimeo.com/api/player.js';

function loadYouTubeIframeAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = window as any;
    if (win.YT?.Player) {
      resolve();
      return;
    }

    if (document.getElementById('youtube-iframe-api')) {
      const interval = window.setInterval(() => {
        if (win.YT?.Player) {
          window.clearInterval(interval);
          resolve();
        }
      }, 50);
      return;
    }

    const tag = document.createElement('script');
    tag.id = 'youtube-iframe-api';
    tag.src = YOUTUBE_IFRAME_API_SRC;
    tag.async = true;
    tag.onerror = () => reject(new Error('Failed to load YouTube IFrame API'));
    win.onYouTubeIframeAPIReady = () => resolve();
    document.body.appendChild(tag);
  });
}

function loadVimeoPlayerAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = window as any;
    if (win.Vimeo?.Player) {
      resolve();
      return;
    }

    if (document.getElementById('vimeo-player-api')) {
      const interval = window.setInterval(() => {
        if (win.Vimeo?.Player) {
          window.clearInterval(interval);
          resolve();
        }
      }, 50);
      return;
    }

    const tag = document.createElement('script');
    tag.id = 'vimeo-player-api';
    tag.src = VIMEO_PLAYER_API_SRC;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Failed to load Vimeo Player API'));
    document.body.appendChild(tag);
  });
}

export function InteractiveGateLessonView({ lesson, courseId, onGateCleared }: InteractiveGateLessonViewProps) {
  const blocks = lesson.contentBlocks || [];
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  // Which of the current block's (possibly several) Stop & Check questions
  // is being shown — always reset to 0 when the block itself changes.
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [retryExplanation, setRetryExplanation] = useState('');
  const [answerCache, setAnswerCache] = useState<Record<number, number | boolean | null>>({});
  const [phaseCache, setPhaseCache] = useState<Record<number, Phase>>({});

  const restoreBlockState = (index: number, fallbackPhase: Phase = 'reading') => {
    setCurrentBlockIndex(index);
    setCurrentQuestionIndex(0);
    const cachedPhase = phaseCache[index] ?? fallbackPhase;
    setPhase(cachedPhase);
    const cachedAnswer = answerCache[index];
    setSelectedAnswer(cachedAnswer !== undefined ? cachedAnswer : null);
  };

  useEffect(() => {
    setPhaseCache((prev) => {
      if (prev[currentBlockIndex] === phase) return prev;
      return { ...prev, [currentBlockIndex]: phase };
    });
  }, [currentBlockIndex, phase]);

  // Video checkpoint progress, resumed from the same server call as block progress.
  const [maxTimeWatched, setMaxTimeWatched] = useState(0);
  const [clearedCheckpoints, setClearedCheckpoints] = useState<Set<number>>(new Set());

  // Resume from server — never trust client state as the source of truth for
  // how far a student has actually progressed. Falls back to the local
  // IndexedDB mirror (kept in sync by every offline answer/progress update)
  // when there's no connection or the request fails, so the gate keeps
  // working — and keeps remembering where the student got to — offline.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let progress: {
        maxTimeWatched?: number;
        clearedCheckpoints?: number[];
        unlockedBlockIndex?: number;
        gateCompleted?: boolean;
      } | null = null;

      if (navigator.onLine) {
        try {
          const { data } = await api.get(`/courses/${courseId}/lessons/${lesson._id}/gate`);
          progress = data.data;
          // Refresh the local mirror so a later offline session (or a
          // reload right after the connection drops) resumes from here.
          if (progress) {
            void patchGateProgress(lesson._id, courseId, {
              unlockedBlockIndex: progress.unlockedBlockIndex || 0,
              gateCompleted: !!progress.gateCompleted,
              maxTimeWatched: progress.maxTimeWatched || 0,
              clearedCheckpoints: progress.clearedCheckpoints || [],
            });
          }
        } catch {
          // fall through to the local mirror below
        }
      }

      if (!progress) {
        const local = await getGateProgress(lesson._id);
        if (local) {
          progress = {
            maxTimeWatched: local.maxTimeWatched,
            clearedCheckpoints: local.clearedCheckpoints,
            unlockedBlockIndex: local.unlockedBlockIndex,
            gateCompleted: local.gateCompleted,
          };
        }
      }

      if (cancelled) return;

      if (!progress) {
        setPhase(blocks.length === 0 ? 'cleared' : 'reading');
        return;
      }

      setMaxTimeWatched(progress.maxTimeWatched || 0);
      setClearedCheckpoints(new Set<number>(progress.clearedCheckpoints || []));
      if (blocks.length === 0) {
        setPhase('cleared'); // no text blocks to gate — video (if any) still gates itself
      } else if (progress.gateCompleted) {
        restoreBlockState(0, 'reading');
        onGateCleared();
      } else {
        const restoredIndex = Math.min(progress.unlockedBlockIndex || 0, blocks.length - 1);
        restoreBlockState(restoredIndex, 'reading');
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

  const video = extractVideoEmbed(lesson.videoUrl || '');
  const hasVideo = video.type !== null;

  const videoPlayer = hasVideo && (
    <LessonVideoPlayer
      lesson={lesson}
      courseId={courseId}
      video={video}
      maxTimeWatched={maxTimeWatched}
      setMaxTimeWatched={setMaxTimeWatched}
      clearedCheckpoints={clearedCheckpoints}
      setClearedCheckpoints={setClearedCheckpoints}
    />
  );

  if (phase === 'loading') {
    return (
      <div className="space-y-4">
        {videoPlayer}
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
        </div>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="space-y-4">
        {videoPlayer}
        {!hasVideo && (
          <div className="rounded-xl border border-dashed border-[var(--color-border-default)] p-6 text-center text-sm text-[var(--color-text-tertiary)]">
            This lesson has no content blocks yet.
          </div>
        )}
      </div>
    );
  }

  if (phase === 'cleared') {
    return (
      <div className="space-y-4">
        {videoPlayer}
        <div className="rounded-2xl bg-green-50 dark:bg-green-950/20 border-2 border-green-300 dark:border-green-700 p-6 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-sm font-bold text-green-700 dark:text-green-300">You've cleared every gate in this lesson.</p>
        </div>
      </div>
    );
  }

  const block = blocks[currentBlockIndex];
  const blockQuestions = getBlockQuestions(block);
  const activeQuestion = blockQuestions[currentQuestionIndex];
  const totalBlocks = blocks.length;
  const isLastBlock = currentBlockIndex === totalBlocks - 1;

  const handleNext = () => {
    setRetryExplanation('');
    if (blockQuestions.length > 0) {
      setCurrentQuestionIndex(0);
      setSelectedAnswer(answerCache[currentBlockIndex] ?? null);
      setPhase('question_open');
      setPhaseCache((prev) => ({ ...prev, [currentBlockIndex]: 'question_open' }));
    } else {
      setSelectedAnswer(null);
      void submitAnswer(true); // no question — advancing alone clears this block
    }
  };

  const goToPreviousBlock = () => {
    if (currentBlockIndex === 0) return;
    restoreBlockState(currentBlockIndex - 1, 'reading');
  };

  const goToNextBlock = () => {
    if (currentBlockIndex >= totalBlocks - 1) return;
    restoreBlockState(currentBlockIndex + 1, 'reading');
  };

  const persistCurrentAnswer = (value: number | boolean | null, nextPhase: Phase) => {
    setAnswerCache((prev) => ({ ...prev, [currentBlockIndex]: value }));
    setSelectedAnswer(value);
    setPhaseCache((prev) => ({ ...prev, [currentBlockIndex]: nextPhase }));
    setPhase(nextPhase);
  };

  const submitAnswer = async (advanceOnly = false) => {
    setSubmitting(true);
    setError('');
    const answerToSubmit = advanceOnly ? true : selectedAnswer;
    const url = `/courses/${courseId}/lessons/${lesson._id}/gate/blocks/${currentBlockIndex}/answer`;
    const isLastBlock = currentBlockIndex === blocks.length - 1;

    // Offline: grade locally against the answer's hash (the plaintext
    // answer is never shipped to the client — see stripGateAnswers on the
    // backend), advance the gate locally, and queue the real grading call
    // for whenever the connection returns. A wrong offline attempt is never
    // sent anywhere — there's nothing useful the server could do with it
    // while unreachable, and no hint/explanation is available offline
    // anyway (also stripped, for the same spoiler-prevention reason).
    const isLastQuestionInBlock = currentQuestionIndex >= blockQuestions.length - 1;

    if (!navigator.onLine) {
      try {
        const correct = activeQuestion
          ? await checkGateAnswerOffline(lesson._id, 'block', `${currentBlockIndex}.${currentQuestionIndex}`, answerToSubmit, activeQuestion.answerHash)
          : true;

        if (correct) {
          setRetryExplanation('');
          if (!isLastQuestionInBlock) {
            // More questions remain in this block — stay on it, move to the next one.
            setAnswerCache((prev) => ({ ...prev, [currentBlockIndex]: null }));
            setSelectedAnswer(null);
            setCurrentQuestionIndex((i) => i + 1);
            return;
          }
          setAnswerCache((prev) => ({ ...prev, [currentBlockIndex]: null }));
          setSelectedAnswer(null);
          await queueAction({ type: 'gate-block-answer', url, body: { answer: answerToSubmit, questionIndex: currentQuestionIndex } });
          await patchGateProgress(lesson._id, courseId, {
            unlockedBlockIndex: currentBlockIndex + 1,
            gateCompleted: isLastBlock,
          });
          if (isLastBlock) {
            setPhase('cleared');
            onGateCleared();
          } else {
            setCurrentBlockIndex((i) => i + 1);
            setCurrentQuestionIndex(0);
            setPhase('reading');
          }
        } else {
          setRetryExplanation('');
          setPhase('question_retry');
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const { data } = await api.post(url, { answer: answerToSubmit, questionIndex: currentQuestionIndex });
      if (data.data.correct) {
        setSelectedAnswer(null);
        setRetryExplanation('');
        if (!data.data.blockCleared) {
          // Correct, but more questions remain in this block — advance to the next one.
          setCurrentQuestionIndex((i) => i + 1);
          setPhase('question_open');
          return;
        }
        await patchGateProgress(lesson._id, courseId, {
          unlockedBlockIndex: data.data.unlockedBlockIndex,
          gateCompleted: data.data.gateCompleted,
        });
        if (data.data.gateCompleted) {
          setPhase('cleared');
          onGateCleared();
        } else {
          setCurrentBlockIndex((i) => i + 1);
          setCurrentQuestionIndex(0);
          setPhase('reading');
        }
      } else {
        setRetryExplanation(data.data.explanation || '');
        persistCurrentAnswer(answerToSubmit, 'question_retry');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Something went wrong — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {videoPlayer}

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
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.content) }}
          />

          {(phase === 'reading' || phase === 'ready') && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goToPreviousBlock}
                  disabled={currentBlockIndex === 0}
                  className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  ← Previous
                </button>
                {phase === 'reading' ? (
                  <span className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    Keep reading — Next unlocks in {secondsRemaining}s
                  </span>
                ) : <span />}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goToNextBlock}
                  disabled={currentBlockIndex >= totalBlocks - 1}
                  className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Next →
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={phase === 'reading'}
                  className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {blockQuestions.length > 0 ? 'Next → Question' : isLastBlock ? 'Finish' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {(phase === 'question_open' || phase === 'question_retry') && activeQuestion && (
            <div className="rounded-xl bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] p-4 space-y-3">
              <p className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                <span>🛑</span> Stop &amp; Check{blockQuestions.length > 1 ? ` (${currentQuestionIndex + 1} of ${blockQuestions.length})` : ''}
              </p>
              <p className="text-sm text-[var(--color-text-primary)]">{activeQuestion.question}</p>

              {phase === 'question_retry' && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 space-y-1">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">Not quite — review the paragraph above and try again.</p>
                  {retryExplanation && (
                    <p className="text-xs text-red-600/90 dark:text-red-400/90"><span className="font-semibold">Hint:</span> {retryExplanation}</p>
                  )}
                </div>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}

              {activeQuestion.type === 'mcq' ? (
                <div className="space-y-2">
                  {(activeQuestion.options || []).map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => persistCurrentAnswer(i, phase === 'question_retry' ? 'question_retry' : 'question_open')}
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
                      onClick={() => persistCurrentAnswer(val, phase === 'question_retry' ? 'question_retry' : 'question_open')}
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

// ===========================================================================
// Video Player — checkpoint gating for self-hosted (direct) video; and
// YouTube/Vimeo embeds using their player SDKs to enforce checkpoint pauses.
// ===========================================================================

const SEEK_TOLERANCE_SECONDS = 0.75; // avoid fighting the browser's own micro-seeks
const PROGRESS_SYNC_INTERVAL_SECONDS = 5; // throttle how often we tell the server maxTimeWatched

function LessonVideoPlayer({
  lesson, courseId, video, maxTimeWatched, setMaxTimeWatched, clearedCheckpoints, setClearedCheckpoints,
}: {
  lesson: LessonItem;
  courseId: string;
  video: { type: 'youtube' | 'vimeo' | 'direct' | null; id: string };
  maxTimeWatched: number;
  setMaxTimeWatched: (t: number) => void;
  clearedCheckpoints: Set<number>;
  setClearedCheckpoints: (s: Set<number>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const pollingRef = useRef<number | null>(null);
  const maxTimeRef = useRef(maxTimeWatched);
  const lastSyncedRef = useRef(0);
  // The YouTube/Vimeo polling loop is wired up once inside a mount-only
  // effect (see below) — the setInterval callback it registers keeps
  // calling the exact closure that existed at that moment forever, so any
  // state that changes AFTER mount (sdkDuration arriving async from the
  // player SDK, clearedCheckpoints updating after a correct answer) must
  // be read through a ref, not the closed-over value, or the poll loop
  // never sees the update.
  const clearedCheckpointsRef = useRef(clearedCheckpoints);
  useEffect(() => { clearedCheckpointsRef.current = clearedCheckpoints; }, [clearedCheckpoints]);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [embedReady, setEmbedReady] = useState(false);

  const [activeCheckpointIndex, setActiveCheckpointIndex] = useState<number | null>(null);
  const activeCheckpointIndexRef = useRef<number | null>(null);
  useEffect(() => { activeCheckpointIndexRef.current = activeCheckpointIndex; }, [activeCheckpointIndex]);
  const [checkpointAnswer, setCheckpointAnswer] = useState<number | boolean | null>(null);
  const [checkpointSubmitting, setCheckpointSubmitting] = useState(false);
  const [checkpointWarning, setCheckpointWarning] = useState('');
  const [checkpointError, setCheckpointError] = useState('');

  const checkpoints = lesson.videoCheckpoints || [];
  // The player SDK's own reported duration is the source of truth — the
  // admin-entered `lesson.videoDuration` is only a fallback for the brief
  // window before the player is ready. Relying solely on the manually
  // typed field meant a forgotten/blank value (0) silently disabled every
  // checkpoint, since percentages had nothing to map to.
  const [sdkDuration, setSdkDuration] = useState(0);
  const videoDuration = sdkDuration || lesson.videoDuration || 0;
  const videoDurationRef = useRef(videoDuration);
  useEffect(() => { videoDurationRef.current = videoDuration; }, [videoDuration]);

  useEffect(() => { maxTimeRef.current = maxTimeWatched; }, [maxTimeWatched]);

  const syncProgress = (t: number) => {
    if (t - lastSyncedRef.current < PROGRESS_SYNC_INTERVAL_SECONDS) return;
    lastSyncedRef.current = t;
    const url = `/courses/${courseId}/lessons/${lesson._id}/gate/video-progress`;
    // This is pacing state, not a graded gate (see the backend comment on
    // updateVideoProgress) — while offline it's enough to keep the local
    // mirror fresh (so a reload resumes from here) and queue a single
    // best-effort sync for reconnect; no local grading needed.
    if (!navigator.onLine) {
      void patchGateProgress(lesson._id, courseId, { maxTimeWatched: t });
      void queueVideoProgress(lesson._id, url, t);
      return;
    }
    api.post(url, { currentTime: t })
      .then(() => { void patchGateProgress(lesson._id, courseId, { maxTimeWatched: t }); })
      .catch(() => {});
  };

  const getEmbedCurrentTime = async (): Promise<number> => {
    if (!playerRef.current) return 0;
    if (video.type === 'youtube') {
      return playerRef.current.getCurrentTime();
    }
    if (video.type === 'vimeo') {
      return playerRef.current.getCurrentTime();
    }
    return 0;
  };

  const seekEmbed = async (seconds: number) => {
    if (!playerRef.current) return;
    if (video.type === 'youtube') {
      playerRef.current.seekTo(seconds, true);
    } else if (video.type === 'vimeo') {
      await playerRef.current.setCurrentTime(seconds);
    }
  };

  const playEmbed = () => {
    if (!playerRef.current) return;
    if (video.type === 'youtube') {
      playerRef.current.playVideo();
    } else if (video.type === 'vimeo') {
      playerRef.current.play();
    }
  };

  const pauseEmbed = () => {
    if (!playerRef.current) return;
    if (video.type === 'youtube') {
      playerRef.current.pauseVideo();
    } else if (video.type === 'vimeo') {
      playerRef.current.pause();
    }
  };

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || activeCheckpointIndex !== null) return;
    const t = el.currentTime;

    if (t > maxTimeRef.current) {
      maxTimeRef.current = t;
      setMaxTimeWatched(t);
      syncProgress(t);
    }

    if (videoDuration <= 0) return;
    for (let i = 0; i < checkpoints.length; i++) {
      if (clearedCheckpoints.has(i)) continue;
      const targetSeconds = (checkpoints[i].percentage / 100) * videoDuration;
      if (t >= targetSeconds) {
        el.pause();
        setActiveCheckpointIndex(i);
        setCheckpointAnswer(null);
        setCheckpointWarning('');
        setCheckpointError('');
        break;
      }
    }
  };

  const handleSeeked = () => {
    const el = videoRef.current;
    if (!el || !lesson.blockForwardSeeking) return;
    if (el.currentTime > maxTimeRef.current + SEEK_TOLERANCE_SECONDS) {
      el.currentTime = maxTimeRef.current;
    }
  };

  const handlePlay = () => {
    if (activeCheckpointIndex !== null) {
      videoRef.current?.pause();
    }
  };

  const updateEmbedProgress = async () => {
    // This whole function is captured ONCE by the setInterval created in
    // startEmbedPolling, itself only ever invoked from the mount-time
    // useEffect below — so every plain state/const read in here (as
    // opposed to a ref) is frozen at its mount-time value forever. Every
    // value that can change after mount must come from a ref.
    if (!playerRef.current || activeCheckpointIndexRef.current !== null) return;

    const t = await getEmbedCurrentTime();
    // Compare against the PREVIOUS max before updating it — updating
    // maxTimeRef to `t` first (as this used to) makes `t > maxTimeRef +
    // tolerance` compare `t` against itself, so a forward scrub could
    // never be detected. This is the only forward-seek signal YouTube's
    // IFrame API gives us (it has no native onSeek event), so this poll
    // is the sole enforcement point for YouTube embeds.
    const previousMax = maxTimeRef.current;
    if (t > previousMax) {
      maxTimeRef.current = t;
      setMaxTimeWatched(t);
      syncProgress(t);
    }

    if (lesson.blockForwardSeeking && t > previousMax + SEEK_TOLERANCE_SECONDS) {
      await seekEmbed(previousMax);
      maxTimeRef.current = previousMax;
      return;
    }

    const currentDuration = videoDurationRef.current;
    if (currentDuration <= 0) return;
    for (let i = 0; i < checkpoints.length; i++) {
      if (clearedCheckpointsRef.current.has(i)) continue;
      const targetSeconds = (checkpoints[i].percentage / 100) * currentDuration;
      if (t >= targetSeconds) {
        pauseEmbed();
        setActiveCheckpointIndex(i);
        setCheckpointAnswer(null);
        setCheckpointWarning('');
        setCheckpointError('');
        break;
      }
    }
  };

  const startEmbedPolling = () => {
    if (pollingRef.current !== null) return;
    pollingRef.current = window.setInterval(() => {
      void updateEmbedProgress();
    }, 500);
  };

  const stopEmbedPolling = () => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const initYouTubePlayer = async () => {
    try {
      await loadYouTubeIframeAPI();
      if (!playerContainerRef.current) return;
      playerRef.current?.destroy?.();
      playerRef.current = new (window as any).YT.Player(playerContainerRef.current, {
        height: '100%',
        width: '100%',
        videoId: video.id,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          disablekb: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: async () => {
            setEmbedReady(true);
            const d = playerRef.current.getDuration?.();
            if (typeof d === 'number' && d > 0) setSdkDuration(d);
            if (maxTimeRef.current > 0) {
              playerRef.current.seekTo(maxTimeRef.current, true);
            }
            startEmbedPolling();
          },
          onStateChange: (event: any) => {
            if (event.data === 1 && activeCheckpointIndexRef.current !== null) {
              playerRef.current.pauseVideo();
            }
            if (event.data === 1) {
              startEmbedPolling();
            }
            if (event.data === 2 || event.data === 0) {
              stopEmbedPolling();
            }
          },
          onError: () => {
            setEmbedFailed(true);
          },
        },
      });
    } catch {
      setEmbedFailed(true);
    }
  };

  const initVimeoPlayer = async () => {
    try {
      await loadVimeoPlayerAPI();
      if (!playerContainerRef.current) return;
      playerRef.current?.destroy?.();
      playerRef.current = new (window as any).Vimeo.Player(playerContainerRef.current, {
        id: Number(video.id),
        width: '100%',
        controls: true,
        autopause: true,
      });
      playerRef.current.on('loaded', async () => {
        setEmbedReady(true);
        try {
          const d = await playerRef.current.getDuration();
          if (typeof d === 'number' && d > 0) setSdkDuration(d);
        } catch { /* fall back to lesson.videoDuration */ }
        if (maxTimeRef.current > 0) {
          await playerRef.current.setCurrentTime(maxTimeRef.current);
        }
        startEmbedPolling();
      });
      playerRef.current.on('play', () => {
        if (activeCheckpointIndexRef.current !== null) {
          playerRef.current.pause();
        } else {
          startEmbedPolling();
        }
      });
      playerRef.current.on('pause', stopEmbedPolling);
      playerRef.current.on('seeked', async () => {
        if (!lesson.blockForwardSeeking) return;
        const t = await getEmbedCurrentTime();
        if (t > maxTimeRef.current + SEEK_TOLERANCE_SECONDS) {
          await seekEmbed(maxTimeRef.current);
        }
      });
      playerRef.current.on('timeupdate', async ({ seconds }: { seconds: number }) => {
        if (!playerRef.current || activeCheckpointIndexRef.current !== null) return;
        const previousMax = maxTimeRef.current;
        if (seconds > previousMax) {
          maxTimeRef.current = seconds;
          setMaxTimeWatched(seconds);
          syncProgress(seconds);
        }

        if (lesson.blockForwardSeeking && seconds > previousMax + SEEK_TOLERANCE_SECONDS) {
          await seekEmbed(previousMax);
          maxTimeRef.current = previousMax;
          return;
        }

        const currentDuration = videoDurationRef.current;
        if (currentDuration <= 0) return;
        for (let i = 0; i < checkpoints.length; i++) {
          if (clearedCheckpointsRef.current.has(i)) continue;
          const targetSeconds = (checkpoints[i].percentage / 100) * currentDuration;
          if (seconds >= targetSeconds) {
            playerRef.current.pause();
            setActiveCheckpointIndex(i);
            setCheckpointAnswer(null);
            setCheckpointWarning('');
            setCheckpointError('');
            break;
          }
        }
      });
    } catch {
      setEmbedFailed(true);
    }
  };

  useEffect(() => {
    if (video.type === 'youtube') {
      void initYouTubePlayer();
    } else if (video.type === 'vimeo') {
      void initVimeoPlayer();
    }

    return () => {
      stopEmbedPolling();
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.type, video.id]);

  useEffect(() => {
    if (activeCheckpointIndex === null) return;
    if (video.type === 'direct') {
      videoRef.current?.pause();
    } else {
      pauseEmbed();
    }
  }, [activeCheckpointIndex, video.type]);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    if (videoRef.current.duration > 0) setSdkDuration(videoRef.current.duration);
    if (maxTimeRef.current > 0) {
      videoRef.current.currentTime = maxTimeRef.current;
    }
  };

  const submitCheckpointAnswer = async () => {
    if (activeCheckpointIndex === null || checkpointAnswer === null) return;
    setCheckpointSubmitting(true);
    setCheckpointError('');
    const url = `/courses/${courseId}/lessons/${lesson._id}/gate/checkpoints/${activeCheckpointIndex}/answer`;
    const checkpoint = checkpoints[activeCheckpointIndex];

    const unlock = () => {
      setActiveCheckpointIndex(null);
      setCheckpointAnswer(null);
      setCheckpointWarning('');
      if (video.type === 'direct') {
        videoRef.current?.play();
      } else {
        playEmbed();
      }
    };

    if (!navigator.onLine) {
      try {
        const correct = await checkGateAnswerOffline(
          lesson._id, 'checkpoint', activeCheckpointIndex, checkpointAnswer, checkpoint?.question?.answerHash
        );
        if (correct) {
          const nextCleared = new Set(clearedCheckpoints).add(activeCheckpointIndex);
          setClearedCheckpoints(nextCleared);
          await queueAction({ type: 'gate-checkpoint-answer', url, body: { answer: checkpointAnswer } });
          await patchGateProgress(lesson._id, courseId, { clearedCheckpoints: [...nextCleared] });
          unlock();
        } else {
          setCheckpointWarning(
            'Incorrect answer. Please rewind, re-watch the section, and try answering again to unlock the rest of the video.'
          );
        }
      } finally {
        setCheckpointSubmitting(false);
      }
      return;
    }

    try {
      const { data } = await api.post(url, { answer: checkpointAnswer });
      if (data.data.correct) {
        const nextCleared = new Set<number>(data.data.clearedCheckpoints || []);
        setClearedCheckpoints(nextCleared);
        await patchGateProgress(lesson._id, courseId, { clearedCheckpoints: [...nextCleared] });
        unlock();
      } else {
        setCheckpointWarning(
          'Incorrect answer. Please rewind, re-watch the section, and try answering again to unlock the rest of the video.'
        );
      }
    } catch (err: any) {
      setCheckpointError(err.response?.data?.message || 'Something went wrong — please try again.');
    } finally {
      setCheckpointSubmitting(false);
    }
  };

  const activeCheckpoint = activeCheckpointIndex !== null ? checkpoints[activeCheckpointIndex] : null;

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      {video.type === 'youtube' && !embedFailed && (
        <div ref={playerContainerRef} className="absolute inset-0 w-full h-full" />
      )}

      {video.type === 'vimeo' && !embedFailed && (
        <div ref={playerContainerRef} className="absolute inset-0 w-full h-full" />
      )}

      {video.type === 'direct' && (
        <video
          ref={videoRef}
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          className="absolute inset-0 w-full h-full"
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={async () => {
            if (activeCheckpointIndex !== null) return;
            handleTimeUpdate();
          }}
          onSeeked={() => {
            if (activeCheckpointIndex !== null) return;
            handleSeeked();
          }}
          onPlay={handlePlay}
        >
          <source src={video.id} />
          <p className="text-white p-4 text-sm text-center">Your browser does not support the video tag.</p>
        </video>
      )}

      {embedFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-white p-4 text-center">
          <p>
            Video playback is unavailable. Please refresh the page or contact support if this persists.
          </p>
        </div>
      )}

      {/* ── Checkpoint Overlay ── */}
      {activeCheckpoint && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] p-5 space-y-3 shadow-2xl">
            <p className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              <span>🛑</span> Checkpoint — {activeCheckpoint.percentage}%
            </p>
            <p className="text-sm text-[var(--color-text-primary)]">{activeCheckpoint.question.question}</p>

            {checkpointWarning && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
                <p className="text-xs font-medium text-red-600 dark:text-red-400">{checkpointWarning}</p>
              </div>
            )}
            {checkpointError && <p className="text-xs text-red-500">{checkpointError}</p>}

            {activeCheckpoint.question.type === 'mcq' ? (
              <div className="space-y-2">
                {(activeCheckpoint.question.options || []).map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCheckpointAnswer(i)}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                      checkpointAnswer === i
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
                    onClick={() => setCheckpointAnswer(val)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      checkpointAnswer === val
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
              onClick={submitCheckpointAnswer}
              disabled={checkpointAnswer === null || checkpointSubmitting}
              className="w-full rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {checkpointSubmitting ? 'Checking...' : 'Submit Answer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
