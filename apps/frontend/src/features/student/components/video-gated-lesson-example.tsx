/**
 * Example: Video-Gated Lesson in Student Course Learn Page
 * Shows how to integrate the VideoGatedPlayer component with actual lesson content
 */

import { useEffect, useState } from 'react';
import { VideoGatedPlayer } from '../../shared/components/video-gated-player';
import { useVideoGating, useCheckpointNotifications, useProgressTracker, useTimeFormatter } from '../../shared/hooks/useVideoGating';
import api from '../../../lib/axios';

interface VideoLessonProps {
  courseId: string;
  lessonId: string;
  videoUrl: string;
  lessonTitle: string;
  lessonDescription?: string;
  onContinue?: () => void;
}

/**
 * Example integration showing how to use VideoGatedPlayer in a lesson view
 */
export function VideoGatedLessonExample({
  courseId,
  lessonId,
  videoUrl,
  lessonTitle,
  lessonDescription,
  onContinue,
}: VideoLessonProps) {
  const [gatingSettings, setGatingSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const getNotification = useCheckpointNotifications();
  const { trackProgress } = useProgressTracker(lessonId, async (progress: number) => {
    // Send progress update to backend
    await api.post(`/lessons/${lessonId}/progress`, { percentWatched: progress });
  });
  const { formatTime } = useTimeFormatter();

  // Load video gating settings from backend
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.get(`/courses/${courseId}/video-gating`);
        setGatingSettings(response.data);
      } catch (err) {
        console.log('No video gating settings found (optional feature)');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [courseId]);

  const handleCheckpointReached = (checkpoint: number) => {
    const message = getNotification(checkpoint);
    console.log('Checkpoint reached:', message);
    // You can show a toast notification here
    // toast.success(message);
  };

  const handleSeekAttempted = (attemptedTime: number, maxAllowedTime: number) => {
    console.warn(`Cannot seek to ${formatTime(attemptedTime)}. Maximum allowed: ${formatTime(maxAllowedTime)}`);
    // toast.error('You cannot skip ahead to unwatched content');
  };

  const handleUnlocked = () => {
    console.log('Video fully watched - lesson unlocked!');
    // toast.success('Video complete! You can now continue to the next lesson.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <VideoGatedPlayer
        videoUrl={videoUrl}
        title={lessonTitle}
        description={lessonDescription}
        gatingConfig={{
          enabled: gatingSettings?.enabled ?? true,
          checkpoints: gatingSettings?.checkpoints ?? [33, 66, 95],
          minWatchPercentToUnlock: gatingSettings?.minWatchPercentToUnlock ?? 95,
        }}
        onProgressChange={trackProgress}
        onCheckpointReached={handleCheckpointReached}
        onSeekAttempted={handleSeekAttempted}
        onUnlocked={handleUnlocked}
        className="mt-4"
      />

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Lesson Content */}
      <div className="bg-[var(--color-surface-primary)] rounded-xl p-6 space-y-4">
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{lessonTitle}</h2>
        {lessonDescription && (
          <p className="text-[var(--color-text-secondary)]">{lessonDescription}</p>
        )}

        {/* Additional lesson materials, attachments, etc. */}
        <div className="pt-4 border-t border-[var(--color-border-default)]">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">
            📚 Additional Resources
          </h3>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Downloads and resources will appear here once available.
          </p>
        </div>
      </div>
    </div>
  );
}

export default VideoGatedLessonExample;
