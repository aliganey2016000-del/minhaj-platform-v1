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

function readCurrentLesson() {
  const heading = document.querySelector('h2.text-lg') || document.querySelector('main h2');
  const title = heading?.textContent?.replace(/\s+/g, ' ').trim() || '';
  return title ? { title } : null;
}

/** Server-authoritative learning tracker. One learning card/session is created
 * for each lesson visit, even when the student stays inside the same login. */
export function LearningSessionTracker() {
  const { user, isAuthenticated } = useAuth();
  const pathname = useBrowserPathname();
  const sessionRef = useRef<{ id: string; title: string } | null>(null);
  const heartbeatInFlight = useRef(false);
  const lastVideoPositionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'student') return;
    if (!/^\/student\/courses\/[^/]+\/learn(?:\/|$)/i.test(pathname)) return;

    let cancelled = false;
    const courseId = pathname.match(/^\/student\/courses\/([^/]+)\/learn/i)?.[1];
    if (!courseId) return;

    const endCurrent = async () => {
      const current = sessionRef.current;
      if (!current) return;
      sessionRef.current = null;
      lastVideoPositionRef.current = null;
      try {
        const video = document.querySelector('video') as HTMLVideoElement | null;
        await api.post('/activity/session/end', {
          clientSessionId: current.id,
          active: document.visibilityState === 'visible' && (!video || !video.paused),
          mediaPlaying: document.visibilityState === 'visible' && !!video && !video.paused && !video.ended,
          playbackDeltaSeconds: 0,
        });
      } catch {
        // Tracking must never interrupt learning.
      }
    };

    const startForLesson = async (lesson: { title: string }) => {
      if (cancelled) return;
      if (sessionRef.current?.title === lesson.title) return;
      await endCurrent();
      if (cancelled) return;

      const sessionId = `web-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      try {
        await api.post('/activity/session/start', {
          clientSessionId: sessionId,
          kind: 'lesson',
          course: courseId,
          lessonTitle: lesson.title,
          resourceName: lesson.title,
          metadata: { path: pathname, trackingVersion: 3 },
        });
        if (!cancelled) sessionRef.current = { id: sessionId, title: lesson.title };
      } catch {
        // Tracking must never interrupt learning.
      }
    };

    let observedTitle = '';
    const syncLesson = () => {
      const lesson = readCurrentLesson();
      if (!lesson || lesson.title === observedTitle) return;
      observedTitle = lesson.title;
      void startForLesson(lesson);
    };

    // The course page changes the active lesson without changing the URL.
    // Watching the rendered lesson heading makes every transition a separate
    // server session/card without requiring a logout.
    const observer = new MutationObserver(syncLesson);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    const initialTimer = window.setInterval(syncLesson, 500);
    syncLesson();

    const heartbeat = async () => {
      const current = sessionRef.current;
      if (!current || cancelled || heartbeatInFlight.current) return;
      heartbeatInFlight.current = true;
      const video = document.querySelector('video') as HTMLVideoElement | null;
      const visible = document.visibilityState === 'visible';
      const playing = !!video && !video.paused && !video.ended;
      let playbackDelta = 0;

      if (video && playing) {
        const position = Math.max(0, video.currentTime || 0);
        const previous = lastVideoPositionRef.current;
        playbackDelta = previous == null ? 0 : Math.min(20, Math.max(0, position - previous));
        lastVideoPositionRef.current = position;
      } else if (video) {
        lastVideoPositionRef.current = Math.max(0, video.currentTime || 0);
      }

      try {
        await api.post('/activity/session/heartbeat', {
          clientSessionId: current.id,
          active: visible && (!video || playing),
          mediaPlaying: visible && playing,
          mediaPositionSeconds: video ? Math.floor(video.currentTime) : undefined,
          playbackDeltaSeconds: Math.floor(playbackDelta),
        });
      } catch {
        // Tracking must never interrupt learning.
      } finally {
        heartbeatInFlight.current = false;
      }
    };

    const timer = window.setInterval(heartbeat, 20_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastVideoPositionRef.current = null;
        void heartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearInterval(initialTimer);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      void endCurrent();
    };
  }, [isAuthenticated, user?.id, user?.role, pathname]);

  return null;
}

export default LearningSessionTracker;
