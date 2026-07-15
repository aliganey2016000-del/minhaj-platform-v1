/**
 * Custom React Hooks for Video Gating
 * Provides reusable logic for managing video progress and gating state
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface VideoGatingConfig {
  enabled: boolean;
  checkpoints?: number[];
  minWatchPercentToUnlock?: number;
}

export interface VideoProgress {
  currentTime: number;
  duration: number;
  percentWatched: number;
  isPlaying: boolean;
  isLocked: boolean;
  reachedCheckpoints: Set<number>;
}

/**
 * Hook to manage video progress and gating state
 * Tracks watching progress, prevents forward seeking, and triggers checkpoints
 */
export function useVideoGating(
  gatingConfig?: VideoGatingConfig,
  onCheckpointReached?: (checkpoint: number) => void,
  onSeekAttempted?: (attemptedTime: number, maxAllowedTime: number) => void,
  onUnlocked?: () => void
) {
  const [progress, setProgress] = useState<VideoProgress>({
    currentTime: 0,
    duration: 0,
    percentWatched: 0,
    isPlaying: false,
    isLocked: gatingConfig?.enabled ?? true,
    reachedCheckpoints: new Set(),
  });

  const lastTimeRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const updateProgress = useCallback(
    (currentTime: number, duration: number) => {
      if (duration === 0) return;

      const percentWatched = (currentTime / duration) * 100;
      setProgress((prev) => {
        if (gatingConfig?.enabled) {
          // Check for checkpoints
          if (gatingConfig.checkpoints) {
            gatingConfig.checkpoints.forEach((checkpoint) => {
              if (
                percentWatched >= checkpoint &&
                !prev.reachedCheckpoints.has(checkpoint)
              ) {
                const newCheckpoints = new Set(prev.reachedCheckpoints);
                newCheckpoints.add(checkpoint);
                setProgress((p) => ({ ...p, reachedCheckpoints: newCheckpoints }));
                onCheckpointReached?.(checkpoint);
              }
            });
          }

          // Check if unlocked
          const minWatch = gatingConfig.minWatchPercentToUnlock ?? 95;
          if (percentWatched >= minWatch && prev.isLocked) {
            onUnlocked?.();
            return {
              ...prev,
              currentTime,
              duration,
              percentWatched,
              isLocked: false,
            };
          }
        }

        return {
          ...prev,
          currentTime,
          duration,
          percentWatched,
          isLocked:
            !!gatingConfig?.enabled &&
            percentWatched < (gatingConfig?.minWatchPercentToUnlock ?? 95),
        };
      });

      lastTimeRef.current = currentTime;
    },
    [
      gatingConfig?.enabled,
      gatingConfig?.checkpoints,
      gatingConfig?.minWatchPercentToUnlock,
      onCheckpointReached,
      onUnlocked,
    ]
  );

  const handleSeek = useCallback(
    (newTime: number): boolean => {
      if (!gatingConfig?.enabled || !videoRef.current) {
        return true; // Allow seek
      }

      const maxAllowedTime = progress.duration * (progress.percentWatched / 100);
      const allowedBuffer = maxAllowedTime * 1.05; // 5% buffer

      if (newTime > allowedBuffer) {
        onSeekAttempted?.(newTime, allowedBuffer);
        return false; // Prevent seek
      }

      return true; // Allow seek
    },
    [
      gatingConfig?.enabled,
      progress.duration,
      progress.percentWatched,
      onSeekAttempted,
    ]
  );

  const reset = useCallback(() => {
    setProgress({
      currentTime: 0,
      duration: 0,
      percentWatched: 0,
      isPlaying: false,
      isLocked: gatingConfig?.enabled ?? true,
      reachedCheckpoints: new Set(),
    });
    lastTimeRef.current = 0;
  }, [gatingConfig?.enabled]);

  return {
    progress,
    updateProgress,
    handleSeek,
    reset,
    videoRef,
  };
}

/**
 * Hook to manage checkpoint notifications
 * Shows notifications at specific watching milestones
 */
export function useCheckpointNotifications(
  checkpoints?: number[]
): (checkpoint: number) => string {
  const notificationMap: Record<number, string> = {
    33: '👏 You have watched 1/3 of the video. Keep going!',
    50: '🎯 Halfway there! You\'re doing great!',
    66: '🔥 You are 2/3 through the video. Almost there!',
    75: '⭐ You\'re 3/4 through the video. Great progress!',
    95: '🎉 You have reached 95% of the video. Click "Continue Lesson" to proceed!',
    100: '✅ Video completed! You can now proceed.',
  };

  const getNotification = useCallback(
    (checkpoint: number): string => {
      return notificationMap[checkpoint] || `📺 You have watched ${checkpoint}% of the video.`;
    },
    []
  );

  return getNotification;
}

/**
 * Hook to persist video gating settings
 * Saves and retrieves video gating configuration from localStorage
 */
export function useVideoGatingPreferences(courseId: string) {
  const storageKey = `video-gating-${courseId}`;

  const savePreferences = useCallback(
    (settings: VideoGatingConfig) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(settings));
      } catch (err) {
        console.error('Failed to save video gating preferences:', err);
      }
    },
    [storageKey]
  );

  const loadPreferences = useCallback((): VideoGatingConfig | null => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch (err) {
      console.error('Failed to load video gating preferences:', err);
      return null;
    }
  }, [storageKey]);

  const clearPreferences = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.error('Failed to clear video gating preferences:', err);
    }
  }, [storageKey]);

  return {
    savePreferences,
    loadPreferences,
    clearPreferences,
  };
}

/**
 * Hook to track student viewing progress
 * Sends progress updates to backend
 */
export function useProgressTracker(
  lessonId: string,
  onProgressUpdate?: (progress: number) => Promise<void>
) {
  const progressUpdateTimeoutRef = useRef<NodeJS.Timeout>();
  const lastProgressRef = useRef(0);

  const trackProgress = useCallback(
    async (percentWatched: number) => {
      // Debounce progress updates (update every 5% or 10 seconds)
      if (
        Math.abs(percentWatched - lastProgressRef.current) < 5 &&
        percentWatched < 95
      ) {
        return;
      }

      lastProgressRef.current = percentWatched;

      if (progressUpdateTimeoutRef.current) {
        clearTimeout(progressUpdateTimeoutRef.current);
      }

      progressUpdateTimeoutRef.current = setTimeout(async () => {
        try {
          await onProgressUpdate?.(percentWatched);
        } catch (err) {
          console.error('Failed to track progress:', err);
        }
      }, 500);
    },
    [onProgressUpdate]
  );

  const cleanup = useCallback(() => {
    if (progressUpdateTimeoutRef.current) {
      clearTimeout(progressUpdateTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { trackProgress, cleanup };
}

/**
 * Hook to format time display in video player
 */
export function useTimeFormatter() {
  const formatTime = useCallback((seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return { formatTime };
}

/**
 * Hook to validate video gating configuration
 */
export function useVideoGatingValidator() {
  const validateCheckpoints = useCallback((checkpoints: number[]): boolean => {
    if (checkpoints.length === 0) return false;
    return checkpoints.every((c) => c > 0 && c <= 100 && Number.isInteger(c));
  }, []);

  const validateMinWatch = useCallback((minWatch: number): boolean => {
    return minWatch > 0 && minWatch <= 100 && Number.isInteger(minWatch);
  }, []);

  const validateConfig = useCallback(
    (config: VideoGatingConfig): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];

      if (config.enabled) {
        if (
          !config.checkpoints ||
          !validateCheckpoints(config.checkpoints)
        ) {
          errors.push('Invalid checkpoints. Must be numbers between 1-100.');
        }

        if (
          !config.minWatchPercentToUnlock ||
          !validateMinWatch(config.minWatchPercentToUnlock)
        ) {
          errors.push('Invalid minimum watch percentage. Must be between 1-100.');
        }

        if (
          config.checkpoints &&
          config.minWatchPercentToUnlock &&
          !config.checkpoints.includes(config.minWatchPercentToUnlock)
        ) {
          // Optional: ensure the unlock threshold is in the checkpoints array
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    },
    [validateCheckpoints, validateMinWatch]
  );

  return {
    validateCheckpoints,
    validateMinWatch,
    validateConfig,
  };
}
