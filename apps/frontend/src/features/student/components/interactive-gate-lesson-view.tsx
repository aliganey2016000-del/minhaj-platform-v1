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

export function InteractiveGateLessonView({ lesson, courseId, onGateCleared }: InteractiveGateLessonViewProps) {
  const blocks = lesson.contentBlocks || [];
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [retryExplanation, setRetryExplanation] = useState('');

  // Video checkpoint progress, resumed from the same server call as block progress.
  const [maxTimeWatched, setMaxTimeWatched] = useState(0);
  const [clearedCheckpoints, setClearedCheckpoints] = useState<Set<number>>(new Set());

  // Resume from server — never trust client state as the source of truth
  // for how far a student has actually progressed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/courses/${courseId}/lessons/${lesson._id}/gate`);
        if (cancelled) return;
        const progress = data.data;
        setMaxTimeWatched(progress.maxTimeWatched || 0);
        setClearedCheckpoints(new Set<number>(progress.clearedCheckpoints || []));
        if (blocks.length === 0) {
          setPhase('cleared'); // no text blocks to gate — video (if any) still gates itself
        } else if (progress.gateCompleted) {
          setPhase('cleared');
          onGateCleared();
        } else {
          setCurrentBlockIndex(Math.min(progress.unlockedBlockIndex || 0, blocks.length - 1));
          setPhase('reading');
        }
      } catch {
        if (!cancelled) setPhase(blocks.length === 0 ? 'cleared' : 'reading');
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

// ===========================================================================
// Video Player — checkpoint gating for self-hosted (direct) video; plain
// embed for YouTube/Vimeo (their iframes can't be driven by <video> events).
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
  const maxTimeRef = useRef(maxTimeWatched);
  const lastSyncedRef = useRef(0);
  const [embedFailed, setEmbedFailed] = useState(false);

  const [activeCheckpointIndex, setActiveCheckpointIndex] = useState<number | null>(null);
  const [checkpointAnswer, setCheckpointAnswer] = useState<number | boolean | null>(null);
  const [checkpointSubmitting, setCheckpointSubmitting] = useState(false);
  const [checkpointWarning, setCheckpointWarning] = useState('');
  const [checkpointError, setCheckpointError] = useState('');

  const checkpoints = lesson.videoCheckpoints || [];
  const videoDuration = lesson.videoDuration || 0;

  useEffect(() => { maxTimeRef.current = maxTimeWatched; }, [maxTimeWatched]);

  // Seek the player to where the student left off, once its metadata is ready.
  const handleLoadedMetadata = () => {
    if (videoRef.current && maxTimeRef.current > 0) {
      videoRef.current.currentTime = maxTimeRef.current;
    }
  };

  const syncProgress = (t: number) => {
    if (t - lastSyncedRef.current < PROGRESS_SYNC_INTERVAL_SECONDS) return;
    lastSyncedRef.current = t;
    api.post(`/courses/${courseId}/lessons/${lesson._id}/gate/video-progress`, { currentTime: t }).catch(() => {});
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

  // "Block Forward Seeking" — reset any scrub that lands past the furthest
  // continuously-watched point.
  const handleSeeked = () => {
    const el = videoRef.current;
    if (!el || !lesson.blockForwardSeeking) return;
    if (el.currentTime > maxTimeRef.current + SEEK_TOLERANCE_SECONDS) {
      el.currentTime = maxTimeRef.current;
    }
  };

  // Guard against resuming playback (e.g. via keyboard shortcuts) while a
  // checkpoint question is unresolved.
  const handlePlay = () => {
    if (activeCheckpointIndex !== null) {
      videoRef.current?.pause();
    }
  };

  const submitCheckpointAnswer = async () => {
    if (activeCheckpointIndex === null || checkpointAnswer === null) return;
    setCheckpointSubmitting(true);
    setCheckpointError('');
    try {
      const { data } = await api.post(
        `/courses/${courseId}/lessons/${lesson._id}/gate/checkpoints/${activeCheckpointIndex}/answer`,
        { answer: checkpointAnswer }
      );
      if (data.data.correct) {
        setClearedCheckpoints(new Set(data.data.clearedCheckpoints || []));
        setActiveCheckpointIndex(null);
        setCheckpointAnswer(null);
        setCheckpointWarning('');
        videoRef.current?.play();
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
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0&modestbranding=1&controls=1&showinfo=0&iv_load_policy=3`}
          title="Course Video"
          className="absolute inset-0 w-full h-full"
          allow="autoplay; fullscreen"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
          onError={() => setEmbedFailed(true)}
        />
      )}

      {video.type === 'vimeo' && !embedFailed && (
        <iframe
          src={`https://player.vimeo.com/video/${video.id}?title=0&byline=0&portrait=0&dnt=1`}
          title="Course Video"
          className="absolute inset-0 w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
          onError={() => setEmbedFailed(true)}
        />
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
          onTimeUpdate={handleTimeUpdate}
          onSeeked={handleSeeked}
          onPlay={handlePlay}
        >
          <source src={video.id} />
          <p className="text-white p-4 text-sm text-center">Your browser does not support the video tag.</p>
        </video>
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
