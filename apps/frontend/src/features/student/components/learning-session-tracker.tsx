import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

/**
 * Global student activity tracker. It deliberately measures elapsed active
 * time server-side rather than sending arbitrary duration totals from the
 * browser. A 20s heartbeat is short enough for accurate totals while being
 * cheap enough for mobile clients.
 */
export function LearningSessionTracker() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const sessionRef = useRef<{ id: string; kind: 'lesson' | 'video' | 'audio' | 'pdf' | 'course' | 'general'; video?: HTMLVideoElement } | null>(null);
  const lastPathRef = useRef('');

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'student') return;

    const path = location.pathname;
    const isLearningArea = /student\/(course|courses|learn)/i.test(path);
    if (!isLearningArea) return;

    let cancelled = false;
    const sessionId = `web-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const kind = /video/i.test(path) ? 'video' : 'lesson';
    lastPathRef.current = path;

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
      current.video = video || undefined;
      const visible = document.visibilityState === 'visible';
      const playing = !!video && !video.paused && !video.ended;
      try {
        await api.post('/activity/session/heartbeat', {
          clientSessionId: current.id,
          active: visible && (!video || playing),
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
        void api.post('/activity/session/end', { clientSessionId: current.id, active: document.visibilityState === 'visible' });
      }
    };
  }, [isAuthenticated, user?.id, user?.role, location.pathname]);

  return null;
}

export default LearningSessionTracker;
