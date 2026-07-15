/**
 * Video-Gated Player Component
 * Implements HTML5 video player with watching restrictions for gated lessons:
 * - Block forward seeking to prevent skipping unwatched content
 * - Show alerts at 33%, 66%, and 95% progress
 * - Disable "Continue Lesson" button until 95% watched
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface VideoGatingConfig {
  enabled: boolean;
  checkpoints?: number[]; // e.g., [33, 66, 95] for percentage points
  minWatchPercentToUnlock?: number; // default 95
}

interface VideoGatedPlayerProps {
  videoUrl: string;
  title?: string;
  description?: string;
  gatingConfig?: VideoGatingConfig;
  onProgressChange?: (percentWatched: number) => void;
  onUnlocked?: () => void;
  onCheckpointReached?: (checkpoint: number) => void;
  onSeekAttempted?: (attemptedTime: number, maxAllowedTime: number) => void;
  className?: string;
}

export function VideoGatedPlayer({
  videoUrl,
  title,
  description,
  gatingConfig = {
    enabled: true,
    checkpoints: [33, 66, 95],
    minWatchPercentToUnlock: 95,
  },
  onProgressChange,
  onUnlocked,
  onCheckpointReached,
  onSeekAttempted,
  className = '',
}: VideoGatedPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [percentWatched, setPercentWatched] = useState(0);
  const [isLocked, setIsLocked] = useState(gatingConfig.enabled ?? true);
  const [reachedCheckpoints, setReachedCheckpoints] = useState<Set<number>>(new Set());
  const [showForwardSeekWarning, setShowForwardSeekWarning] = useState(false);
  const [maxAllowedTime, setMaxAllowedTime] = useState(0);
  const lastTimeRef = useRef(0);

  // Update max allowed time based on watched percentage
  useEffect(() => {
    if (!gatingConfig.enabled || duration === 0) return;
    
    const maxTime = duration * (percentWatched / 100);
    setMaxAllowedTime(maxTime);
  }, [percentWatched, duration, gatingConfig.enabled]);

  // Handle metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  // Handle time update
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;

    const current = videoRef.current.currentTime;
    setCurrentTime(current);

    if (duration > 0) {
      const percent = (current / duration) * 100;
      setPercentWatched(percent);
      onProgressChange?.(percent);

      // Check for checkpoint milestones
      if (gatingConfig.checkpoints) {
        gatingConfig.checkpoints.forEach((checkpoint) => {
          if (percent >= checkpoint && !reachedCheckpoints.has(checkpoint)) {
            setReachedCheckpoints((prev) => new Set(prev).add(checkpoint));
            onCheckpointReached?.(checkpoint);

            // Show alert based on checkpoint reached
            if (checkpoint === 33) {
              showNotification('You have watched 1/3 of the video. Keep going! 👏');
            } else if (checkpoint === 66) {
              showNotification('You are 2/3 through the video. Almost there! 🎯');
            } else if (checkpoint === 95) {
              showNotification('You have reached 95% of the video. Click "Continue Lesson" to proceed! 🎉');
              setIsLocked(false);
              onUnlocked?.();
            }
          }
        });
      }

      // Check if fully watched
      if (percent >= (gatingConfig.minWatchPercentToUnlock ?? 95) && isLocked) {
        setIsLocked(false);
        onUnlocked?.();
      }
    }

    lastTimeRef.current = current;
  }, [
    duration,
    gatingConfig.checkpoints,
    gatingConfig.minWatchPercentToUnlock,
    reachedCheckpoints,
    isLocked,
    onProgressChange,
    onCheckpointReached,
    onUnlocked,
  ]);

  // Handle seeking (prevent forward seeking)
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!gatingConfig.enabled || !videoRef.current) {
        videoRef.current?.setAttribute('data-was-seeking', 'false');
        return;
      }

      const newTime = parseFloat(e.target.value);
      const maxAllowedTimeForSeeking = (duration * (percentWatched / 100)) * 1.05; // 5% buffer

      if (newTime > maxAllowedTimeForSeeking) {
        // Attempt to seek forward to unwatched content
        setShowForwardSeekWarning(true);
        onSeekAttempted?.(newTime, maxAllowedTimeForSeeking);
        e.target.value = lastTimeRef.current.toString();

        // Reset the warning after 3 seconds
        setTimeout(() => setShowForwardSeekWarning(false), 3000);
        return;
      }

      videoRef.current.currentTime = newTime;
      lastTimeRef.current = newTime;
    },
    [gatingConfig.enabled, duration, percentWatched, onSeekAttempted]
  );

  // Prevent browser-level seeking
  const handleLoadStart = useCallback(() => {
    if (gatingConfig.enabled && videoRef.current) {
      videoRef.current.addEventListener('seeking', handleSeekingBlock);
    }
  }, [gatingConfig.enabled]);

  const handleSeekingBlock = useCallback(() => {
    if (!gatingConfig.enabled || !videoRef.current) return;

    const newTime = videoRef.current.currentTime;
    const maxAllowedTimeForSeeking = (duration * (percentWatched / 100)) * 1.05; // 5% buffer

    if (newTime > maxAllowedTimeForSeeking) {
      videoRef.current.currentTime = lastTimeRef.current;
      setShowForwardSeekWarning(true);
      onSeekAttempted?.(newTime, maxAllowedTimeForSeeking);
      setTimeout(() => setShowForwardSeekWarning(false), 3000);
    }
  }, [gatingConfig.enabled, duration, percentWatched, onSeekAttempted]);

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('seeking', handleSeekingBlock);
      }
    };
  }, [handleSeekingBlock]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.addEventListener('loadstart', handleLoadStart);
      return () => {
        videoRef.current?.removeEventListener('loadstart', handleLoadStart);
      };
    }
  }, [handleLoadStart]);

  // Format time for display
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const showNotification = (message: string) => {
    // Using browser alert for simplicity
    // In production, use a toast notification library
    console.log('📌 Checkpoint:', message);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Video Player Container */}
      <div className="relative w-full bg-black rounded-xl overflow-hidden shadow-lg">
        <video
          ref={videoRef}
          src={videoUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className="w-full h-auto"
          controls={false}
        />

        {/* Custom Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 space-y-3">
          {/* Forward Seek Warning */}
          {showForwardSeekWarning && gatingConfig.enabled && (
            <div className="bg-red-500/90 text-white text-sm px-3 py-2 rounded-lg font-semibold animate-pulse">
              ⚠️ You cannot skip ahead to unwatched content. Watch the video sequentially.
            </div>
          )}

          {/* Progress Bar */}
          <div className="space-y-1">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              disabled={!videoUrl}
              className="w-full h-1 bg-gray-600 rounded-full appearance-none cursor-pointer accent-primary-500"
              style={{
                background: `linear-gradient(to right, rgb(var(--color-primary-500)) 0%, rgb(var(--color-primary-500)) ${
                  duration > 0 ? (currentTime / duration) * 100 : 0
                }%, rgb(107, 114, 128) ${duration > 0 ? (currentTime / duration) * 100 : 0}%, rgb(107, 114, 128) 100%)`,
              }}
            />
            <div className="flex justify-between text-xs text-gray-300 px-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Watched Percentage */}
          <div className="text-xs text-gray-300 text-center">
            {gatingConfig.enabled && (
              <span>
                📺 Video Progress: <strong>{Math.round(percentWatched)}%</strong>
              </span>
            )}
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-between text-white">
            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current[isPlaying ? 'pause' : 'play']();
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            >
              <span className="text-lg">{isPlaying ? '⏸️' : '▶️'}</span>
              <span className="text-sm">{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <div className="text-sm font-semibold">
              {gatingConfig.enabled ? (
                isLocked ? (
                  <span className="text-yellow-300">🔒 Locked - Watch more to unlock</span>
                ) : (
                  <span className="text-emerald-300">✅ Unlocked - Ready to continue</span>
                )
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Video Info */}
      {title && (
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{title}</h3>
          {description && (
            <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
          )}
        </div>
      )}

      {/* Checkpoint Indicators */}
      {gatingConfig.enabled && gatingConfig.checkpoints && (
        <div className="bg-[var(--color-surface-tertiary)] rounded-xl p-4">
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
            📍 Viewing Checkpoints
          </h4>
          <div className="space-y-2">
            {gatingConfig.checkpoints.map((checkpoint) => (
              <div key={checkpoint} className="flex items-center gap-2">
                <span className="text-lg">
                  {reachedCheckpoints.has(checkpoint) ? '✅' : '⭕'}
                </span>
                <span className="text-sm text-[var(--color-text-secondary)]">
                  Reach {checkpoint}% of video
                </span>
                {reachedCheckpoints.has(checkpoint) && (
                  <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Completed
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Continue Button - Disabled until unlocked */}
      <button
        disabled={gatingConfig.enabled && isLocked}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all ${
          gatingConfig.enabled && isLocked
            ? 'bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed opacity-50'
            : 'bg-primary-600 text-white hover:bg-primary-700 active:scale-95'
        }`}
      >
        {gatingConfig.enabled && isLocked
          ? `📺 Continue Lesson (Watch ${(gatingConfig.minWatchPercentToUnlock ?? 95) - Math.round(percentWatched)}% more)`
          : '✅ Continue Lesson'}
      </button>

      {/* Debug Info (for development) */}
      {process.env.NODE_ENV === 'development' && gatingConfig.enabled && (
        <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400 space-y-1 font-mono">
          <div>Duration: {formatTime(duration)}</div>
          <div>Current: {formatTime(currentTime)}</div>
          <div>Watched: {Math.round(percentWatched)}%</div>
          <div>Status: {isLocked ? '🔒 Locked' : '✅ Unlocked'}</div>
          <div>Max Seek: {formatTime((duration * (percentWatched / 100)) * 1.05)}</div>
        </div>
      )}
    </div>
  );
}
