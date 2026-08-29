import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

function useBrowserPathname() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    const history = window.history;
    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);
    history.pushState = ((...args: Parameters<History['pushState']>) => { pushState(...args); update(); }) as History['pushState'];
    history.replaceState = ((...args: Parameters<History['replaceState']>) => { replaceState(...args); update(); }) as History['replaceState'];
    window.addEventListener('popstate', update);
    return () => {
      history.pushState = pushState;
      history.replaceState = replaceState;
      window.removeEventListener('popstate', update);
    };
  }, []);
  return pathname;
}

/** Server-authoritative active-learning heartbeat for student learning pages. */
export function LearningSessionTracker() {
  const { user, isAuthenticated } = useAuth();
  const pathname = useBrowserPathname();
  const sessionRef = useRef<{ id: string; kind: 'lesson' | 'video' | 'audio' | 'pdf' | 'course' | 'general' } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'student') return;
    if (!/student\/(course|courses|learn)/i.test(pathname)) return;

    let cancelled = false;
    const sessionId = `web-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const kind = 'lesson' as const;

    const start = async () => {
      try {
        await api.post('/activity/session/start', {
          clientSessionId: sessionId,
          kind,
          resourceName: document.title,
          metadata: { path: pathname },
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
        });
      }
    };
  }, [isAuthenticated, user?.id, user?.role, pathname]);

  return null;
}

export default LearningSessionTracker;
