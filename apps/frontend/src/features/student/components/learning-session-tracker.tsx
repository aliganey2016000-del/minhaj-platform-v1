import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

/** Server-authoritative active-learning heartbeat for student learning pages. */
export function LearningSessionTracker() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const sessionRef = useRef<{ id: string; kind: 'lesson' | 'video' | 'audio' | 'pdf' | 'course' | 'general' } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'student') return;
    const path = location.pathname;
    if (!/student\/(course|courses|learn)/i.test(path)) return;

    let cancelled = false;
    const sessionId = `web-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const kind = 'lesson' as const;

    const start = async () => {
      try {
        await api.post('/activity/session/start', {
          clientSessionId: sessionId,
          kind,
          resourceName: document.title,
          metadata: { path },
        });
        if (!cancelled) sessionRef.current = { id: sessionId, kind };
      } catch {
        // Tracking must never interrupt learning.
      }
    };
    void start();

    const heartbeat = async () => {
      const current = sessionRef.current;
      if (!current || cancelled) return;
      const video = document.querySelector('video') as HTMLVideoElement | null;
      const visible = document.visibilityState === 'visible';
      const playing = !!video && !video.paused && !video.ended;
      try {
        await api.post('/activity/session/heartbeat', {
          clientSessionId: current.id,
          active: visible && (!video || playing),
          mediaPlaying: visible && playing,
          mediaPositionSeconds: video ? Math.floor(video.currentTime) : undefined,
          playbackDeltaSeconds: video && playing ? 20 : 0,
        });
      } catch {
        // Tracking must never interrupt learning.
      }
    };

    const timer = window.setInterval(heartbeat, 20_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void heartbeat(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      const current = sessionRef.current;
      sessionRef.current = null;
      if (current) {
        const video = document.querySelector('video') as HTMLVideoElement | null;
        void api.post('/activity/session/end', {
          clientSessionId: current.id,
          active: document.visibilityState === 'visible' && (!video || !video.paused),
          mediaPlaying: document.visibilityState === 'visible' && !!video && !video.paused && !video.ended,
          playbackDeltaSeconds: video && !video.paused ? 0 : undefined,
        });
      }
    };
  }, [isAuthenticated, user?.id, user?.role, location.pathname]);

  return null;
}

export default LearningSessionTracker;
