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

interface ActiveItem { courseId?: string; lessonId?: string; title: string; kind?: string }

let announcedItem: ActiveItem | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('learning:item', (event) => {
    announcedItem = (event as CustomEvent<ActiveItem | null>).detail || null;
  });
}

function readCurrentLesson(courseId: string): ActiveItem | null {
  if (announcedItem?.title) return announcedItem;
  const heading = document.querySelector('h2.text-lg') || document.querySelector('main h2');
  const title = heading?.textContent?.replace(/\s+/g, ' ').trim() || '';
  if (title) return { title, courseId };
  return { title: 'Course study', courseId };
}

export function LearningSessionTracker() {
  const { user, isAuthenticated } = useAuth();
  const pathname = useBrowserPathname();
  const sessionRef = useRef<{ id: string; key: string } | null>(null);
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

    const startForLesson = async (lesson: ActiveItem) => {
      if (cancelled) return;
      const key = lesson.lessonId || lesson.title;
      if (sessionRef.current?.key === key) return;
      await endCurrent();
      if (cancelled) return;

      const sessionId = `web-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      try {
        await api.post('/activity/session/start', {
          clientSessionId: sessionId,
          kind: 'lesson',
          course: lesson.courseId || courseId,
          lessonId: lesson.lessonId,
          lessonTitle: lesson.title,
          resourceName: lesson.title,
          metadata: { path: pathname, trackingVersion: 5 },
        });
        if (!cancelled) sessionRef.current = { id: sessionId, key };
      } catch (err) {
        console.error('Learning session could not be started:', err);
      }
    };

    let observedKey = '';
    const syncLesson = () => {
      const lesson = readCurrentLesson(courseId);
      if (!lesson) return;
      const key = lesson.lessonId || lesson.title;
      if (key === observedKey) return;
      observedKey = key;
      void startForLesson(lesson);
    };

    const onAnnounced = () => syncLesson();
    window.addEventListener('learning:item', onAnnounced);
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
      window.removeEventListener('learning:item', onAnnounced);
      window.clearInterval(initialTimer);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      void endCurrent();
    };
  }, [isAuthenticated, user?.id, user?.role, pathname]);

  return null;
}

export default LearningSessionTracker;
