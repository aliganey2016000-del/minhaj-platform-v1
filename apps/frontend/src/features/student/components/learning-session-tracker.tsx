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

/** Server-authoritative active-learning heartbeat for the student course-learn route. */
export function LearningSessionTracker() {
  const { user, isAuthenticated } = useAuth();
  const pathname = useBrowserPathname();
  const sessionRef = useRef<{ id: string; kind: 'lesson' } | null>(null);
  const heartbeatInFlight = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'student') return;
    if (!/^\/student\/courses\/[^/]+\/learn(?:\/|$)/i.test(pathname)) return;

    let cancelled = false;
    const sessionId = `web-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const courseId = pathname.match(/^\/student\/courses\/([^/]+)\/learn/i)?.[1];

    const start = async () => {
      try {
        await api.post('/activity/session/start', {
          clientSessionId: sessionId,
          kind: 'lesson',
          course: courseId,
          lessonTitle: document.title,
          resourceName: document.title,
          metadata: { path: pathname },
        });
        if (!cancelled) sessionRef.current = { id: sessionId, kind: 'lesson' };
      } catch {
        // Tracking must never interrupt learning.
      }
    };
    void start();

    const heartbeat = async () => {
      const current = sessionRef.current;
      if (!current || cancelled || heartbeatInFlight.current) return;
      heartbeatInFlight.current = true;
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
      } finally {
        heartbeatInFlight.current = false;
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
