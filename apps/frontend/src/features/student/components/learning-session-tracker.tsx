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

const LEARN_ROUTE = /^\/student\/courses\/[^/]+\/learn(?:\/|$)/i;

/**
 * Readable names for the student screens, so a session reads "Assignments"
 * rather than a URL. Anything unlisted falls back to its last path segment.
 */
const PAGE_NAMES: Record<string, string> = {
  dashboard: 'Dashboard',
  courses: 'My Courses',
  available: 'Browse Courses',
  assignments: 'Assignments',
  downloads: 'Downloads',
  exams: 'Exams',
  attendance: 'Attendance',
  certificates: 'Certificates',
  bookmarks: 'Bookmarks',
  notifications: 'Notifications',
  profile: 'Profile',
  settings: 'Settings',
  schedule: 'My Schedule',
  payments: 'Payments',
  analytics: 'My Progress',
  quiz: 'Quiz',
  'ai-tutor': 'AI Tutor',
};

function readablePageName(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean).slice(1); // drop "student"
  if (!segments.length) return 'Dashboard';
  // Prefer the deepest segment that names a screen rather than an id, so
  // /student/courses/<id> reads "My Courses" and /student/exams/<id>/review
  // reads "Exams" instead of a bare object id.
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const named = PAGE_NAMES[segments[index].toLowerCase()];
    if (named) return named;
  }
  const last = segments[segments.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/[-_]/g, ' ');
}

/**
 * Posts while the page is being torn down. A normal axios call is abandoned
 * the moment the tab closes, which is exactly when the tail of a visit would
 * otherwise be lost; `keepalive` lets the browser finish the request after the
 * document is gone. Mirrors the auth headers the axios instance adds.
 */
function sendOnUnload(path: string, body: unknown): void {
  const token = localStorage.getItem('accessToken');
  const loginSessionId = localStorage.getItem('loginSessionId');
  try {
    void fetch(`/api/v1${path}`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(loginSessionId ? { 'X-Login-Session-Id': loginSessionId } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // A keepalive fetch can throw synchronously mid-unload in some browsers.
  }
}

interface ActiveItem { courseId?: string; lessonId?: string; title: string; kind?: string }

let announcedItem: ActiveItem | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('learning:item', (event) => {
    announcedItem = (event as CustomEvent<ActiveItem | null>).detail || null;
  });
}

/**
 * Falls back to a generic course-study item when the lesson page has not yet
 * announced its active item and the DOM heading is unavailable. The previous
 * implementation returned null here, so the timer never started at all on a
 * valid learning route even though the student was actively studying.
 */
function readCurrentLesson(courseId: string): ActiveItem | null {
  if (announcedItem?.title) return announcedItem;
  const heading = document.querySelector('h2.text-lg') || document.querySelector('main h2');
  const title = heading?.textContent?.replace(/\s+/g, ' ').trim() || '';
  if (title) return { title, courseId };
  return { title: 'Course study', courseId };
}

/** Server-authoritative learning tracker. One learning card/session is created
 * for each lesson visit, even when the student stays inside the same login. */
export function LearningSessionTracker() {
  const { user, isAuthenticated } = useAuth();
  const pathname = useBrowserPathname();
  const sessionRef = useRef<{ id: string; key: string } | null>(null);
  const heartbeatInFlight = useRef(false);
  const lastVideoPositionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'student') return;
    if (!LEARN_ROUTE.test(pathname)) return;

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

  /**
   * Every other student screen. Lesson pages are handled above — tracking them
   * here too would count the same minutes twice — but everything else (the
   * dashboard, assignments, the schedule, a quiz) had no timer at all, which
   * is why a sign-in spent anywhere but inside a lesson reported no study time
   * and its day read "Time not recorded".
   */
  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'student') return;
    if (!pathname.startsWith('/student')) return;
    if (LEARN_ROUTE.test(pathname)) return;

    const enteredAt = new Date();
    const title = readablePageName(pathname);
    const clientSessionId = `web-page-${user.id}-${enteredAt.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
    let startPromise: Promise<void> | null = null;
    let started = false;
    let finished = false;

    // A redirect or an instantly-abandoned click is not a visit. Waiting a
    // moment before opening a session keeps those out of the record entirely;
    // the cost is under-counting a real visit by this much, which is the safe
    // direction to be wrong in for a report of how long a student studied.
    const startTimer = window.setTimeout(() => {
      startPromise = api
        .post('/activity/session/start', {
          clientSessionId,
          kind: 'page',
          resourceName: title,
          metadata: { path: pathname, trackingVersion: 6 },
        })
        .then(() => { started = true; })
        .catch(() => { /* Tracking must never interrupt learning. */ });
    }, 2000);

    const heartbeat = async () => {
      if (!started || finished) return;
      try {
        await api.post('/activity/session/heartbeat', {
          clientSessionId,
          active: document.visibilityState === 'visible',
        });
      } catch {
        // Tracking must never interrupt learning.
      }
    };
    const timer = window.setInterval(heartbeat, 20_000);

    const finish = (unloading: boolean) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(startTimer);
      const leftAt = new Date();
      const endBody = { clientSessionId, active: document.visibilityState === 'visible' };
      // The visit itself is worth recording even when the session never
      // opened (a sub-2s bounce, or a failed start): the event carries the
      // real span on its own.
      const visit = {
        type: 'page_view',
        resourceName: title,
        startedAt: enteredAt.toISOString(),
        endedAt: leftAt.toISOString(),
        metadata: { path: pathname },
      };
      const worthLogging = leftAt.getTime() - enteredAt.getTime() >= 1000;

      if (unloading) {
        if (started) sendOnUnload('/activity/session/end', endBody);
        if (worthLogging) sendOnUnload('/activity/event', visit);
        return;
      }
      // The start request may still be in flight when a fast navigation ends
      // the visit; ending only once it settles avoids leaving the session open
      // for the stale-session sweeper to close later.
      void (startPromise || Promise.resolve()).then(() => {
        if (started) api.post('/activity/session/end', endBody).catch(() => {});
      });
      if (worthLogging) api.post('/activity/event', visit).catch(() => {});
    };

    const onPageHide = () => finish(true);
    // A backgrounded tab gets its timers throttled, so the last active slice
    // is banked the moment the page is hidden rather than 20s later.
    const onVisibility = () => { void heartbeat(); };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      finish(false);
    };
  }, [isAuthenticated, user?.id, user?.role, pathname]);

  return null;
}

export default LearningSessionTracker;
