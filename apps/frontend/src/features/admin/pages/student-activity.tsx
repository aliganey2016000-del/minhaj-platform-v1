import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../lib/axios';
import { useRealtime } from '../../../store/realtime-context';

interface RosterRow { _id: string; userId: string | null; studentId: string; name: string; online: boolean; lastSeenAt: string | null; }
interface ActivityEvent { _id: string; type: string; loginSessionId?: string; course?: { _id?: string; title?: { en?: string } } | null; lessonId?: string; lessonTitle?: string; resourceName?: string; status?: string; percent?: number; durationSeconds?: number; metadata?: Record<string, any>; createdAt: string; }
interface SessionRow { _id: string; loginSessionId?: string; kind: string; course?: string; lessonId?: string; lessonTitle?: string; resourceName?: string; startedAt: string; endedAt?: string; activeSeconds: number; idleSeconds: number; watchSeconds: number; status: string; }
interface SessionAnalytics { totalActiveSeconds: number; totalIdleSeconds: number; totalWatchSeconds: number; sessionCount: number; daily: Array<{ date: string; activeSeconds: number; watchSeconds: number }>; sessions: SessionRow[]; }
interface Analytics { avgQuizScore: number | null; learningStreakDays: number; }
interface CourseRow {
  id: string;
  title: { en?: string; so?: string; ar?: string };
  level?: string;
  category?: string;
  status: 'completed' | 'in_progress' | 'not_started';
  progressPercent: number;
  totalDurationSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  watchSeconds: number;
  sessionCount: number;
  averageScore: number | null;
  correctAnswers: number;
  totalQuestions: number;
  quizAttempts: number;
  gateQuestions: number;
  scoredUnits: number;
  quizzesPassed: number;
  lessonsCompleted: number;
  totalLessons: number;
  completedItems: number;
  totalItems: number;
  lastAccessed: string | null;
}
interface CourseAnalytics {
  totalCourses: number;
  totalDurationSeconds: number;
  totalActiveSeconds: number;
  averageScore: number | null;
  correctAnswers: number;
  totalQuestions: number;
  totalQuizAttempts: number;
  totalGateQuestions: number;
  totalScoredUnits: number;
  completedCourses: number;
  inProgressCourses: number;
  notStartedCourses: number;
  activeCourses: number;
  courses: CourseRow[];
}

const fmt = (seconds = 0) => {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const fmtShortDuration = (seconds = 0) => {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const timeOnly = (value?: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const spanSeconds = (start?: string, end?: string) => {
  if (!start) return 0;
  return Math.max(0, Math.floor(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 1000));
};
const isQuizEvent = (event: ActivityEvent) => /quiz|assessment|attempt|submission|passed|failed/i.test(event.type) || event.metadata?.score != null || event.metadata?.totalPoints != null;

/** Turns a raw event type into the icon + wording an admin reads in the session detail. */
const eventLook: Record<string, { icon: string; label: string; tone: string }> = {
  course_view: { icon: '📘', label: 'Opened course', tone: 'bg-indigo-100 text-indigo-700' },
  course_enrolled: { icon: '🎓', label: 'Enrolled in course', tone: 'bg-indigo-100 text-indigo-700' },
  lesson_view: { icon: '📖', label: 'Opened lesson', tone: 'bg-blue-100 text-blue-700' },
  page_view: { icon: '🧭', label: 'Visited page', tone: 'bg-slate-100 text-slate-600' },
  video_progress: { icon: '🎬', label: 'Watched video', tone: 'bg-purple-100 text-purple-700' },
  audio_progress: { icon: '🎧', label: 'Listened to audio', tone: 'bg-purple-100 text-purple-700' },
  pdf_view: { icon: '📄', label: 'Opened PDF', tone: 'bg-slate-100 text-slate-600' },
  download: { icon: '⬇️', label: 'Downloaded file', tone: 'bg-slate-100 text-slate-600' },
  quiz_attempt: { icon: '❓', label: 'Answered question', tone: 'bg-amber-100 text-amber-700' },
  exam_attempt: { icon: '🎯', label: 'Exam attempt', tone: 'bg-rose-100 text-rose-700' },
  assignment_submitted: { icon: '📤', label: 'Submitted assignment', tone: 'bg-emerald-100 text-emerald-700' },
  assignment_graded: { icon: '✅', label: 'Assignment graded', tone: 'bg-emerald-100 text-emerald-700' },
  certificate_earned: { icon: '🏆', label: 'Earned certificate', tone: 'bg-amber-100 text-amber-700' },
  note_created: { icon: '📝', label: 'Wrote a note', tone: 'bg-slate-100 text-slate-600' },
  bookmark_added: { icon: '🔖', label: 'Bookmarked', tone: 'bg-slate-100 text-slate-600' },
  forum_post: { icon: '💬', label: 'Posted in forum', tone: 'bg-cyan-100 text-cyan-700' },
  session_end: { icon: '⏹️', label: 'Session ended', tone: 'bg-slate-100 text-slate-600' },
};
const describeEvent = (event: ActivityEvent) => {
  const look = eventLook[event.type] || { icon: '•', label: event.type.replace(/_/g, ' '), tone: 'bg-slate-100 text-slate-600' };
  // A Stop & Check answer is a quiz_attempt too, but calling it one in the
  // timeline makes it look like a whole quiz was taken.
  if (event.type === 'quiz_attempt' && event.metadata?.source === 'interactive_gate') {
    return { ...look, icon: '🛑', label: 'Stop & Check answer' };
  }
  return look;
};
const formatPercent = (value: number | null) => value == null ? '—' : `${value}%`;
const formatLastActivity = (value?: string | null) => {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';
  return `Last activity: ${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

const courseThemes = [
  { card: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50', icon: 'bg-emerald-500 text-white', title: 'text-emerald-950 dark:text-emerald-50', sub: 'text-emerald-700/70 dark:text-emerald-300/60', track: 'bg-emerald-200/70 dark:bg-emerald-900/50', bar: 'from-emerald-600 to-emerald-400', stat: 'bg-white/60 dark:bg-black/20 border-emerald-200/70 dark:border-emerald-800/50', statLabel: 'text-emerald-700/70 dark:text-emerald-300/60', statValue: 'text-emerald-950 dark:text-emerald-50', divider: 'border-emerald-200/70 dark:border-emerald-800/50' },
  { card: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50', icon: 'bg-blue-500 text-white', title: 'text-blue-950 dark:text-blue-50', sub: 'text-blue-700/70 dark:text-blue-300/60', track: 'bg-blue-200/70 dark:bg-blue-900/50', bar: 'from-blue-600 to-blue-400', stat: 'bg-white/60 dark:bg-black/20 border-blue-200/70 dark:border-blue-800/50', statLabel: 'text-blue-700/70 dark:text-blue-300/60', statValue: 'text-blue-950 dark:text-blue-50', divider: 'border-blue-200/70 dark:border-blue-800/50' },
  { card: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50', icon: 'bg-amber-500 text-white', title: 'text-amber-950 dark:text-amber-50', sub: 'text-amber-700/70 dark:text-amber-300/60', track: 'bg-amber-200/70 dark:bg-amber-900/50', bar: 'from-amber-600 to-amber-400', stat: 'bg-white/60 dark:bg-black/20 border-amber-200/70 dark:border-amber-800/50', statLabel: 'text-amber-700/70 dark:text-amber-300/60', statValue: 'text-amber-950 dark:text-amber-50', divider: 'border-amber-200/70 dark:border-amber-800/50' },
  { card: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900/50', icon: 'bg-purple-500 text-white', title: 'text-purple-950 dark:text-purple-50', sub: 'text-purple-700/70 dark:text-purple-300/60', track: 'bg-purple-200/70 dark:bg-purple-900/50', bar: 'from-purple-600 to-purple-400', stat: 'bg-white/60 dark:bg-black/20 border-purple-200/70 dark:border-purple-800/50', statLabel: 'text-purple-700/70 dark:text-purple-300/60', statValue: 'text-purple-950 dark:text-purple-50', divider: 'border-purple-200/70 dark:border-purple-800/50' },
  { card: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50', icon: 'bg-rose-500 text-white', title: 'text-rose-950 dark:text-rose-50', sub: 'text-rose-700/70 dark:text-rose-300/60', track: 'bg-rose-200/70 dark:bg-rose-900/50', bar: 'from-rose-600 to-rose-400', stat: 'bg-white/60 dark:bg-black/20 border-rose-200/70 dark:border-rose-800/50', statLabel: 'text-rose-700/70 dark:text-rose-300/60', statValue: 'text-rose-950 dark:text-rose-50', divider: 'border-rose-200/70 dark:border-rose-800/50' },
  { card: 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-900/50', icon: 'bg-cyan-500 text-white', title: 'text-cyan-950 dark:text-cyan-50', sub: 'text-cyan-700/70 dark:text-cyan-300/60', track: 'bg-cyan-200/70 dark:bg-cyan-900/50', bar: 'from-cyan-600 to-cyan-400', stat: 'bg-white/60 dark:bg-black/20 border-cyan-200/70 dark:border-cyan-800/50', statLabel: 'text-cyan-700/70 dark:text-cyan-300/60', statValue: 'text-cyan-950 dark:text-cyan-50', divider: 'border-cyan-200/70 dark:border-cyan-800/50' },
  { card: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/50', icon: 'bg-indigo-500 text-white', title: 'text-indigo-950 dark:text-indigo-50', sub: 'text-indigo-700/70 dark:text-indigo-300/60', track: 'bg-indigo-200/70 dark:bg-indigo-900/50', bar: 'from-indigo-600 to-indigo-400', stat: 'bg-white/60 dark:bg-black/20 border-indigo-200/70 dark:border-indigo-800/50', statLabel: 'text-indigo-700/70 dark:text-indigo-300/60', statValue: 'text-indigo-950 dark:text-indigo-50', divider: 'border-indigo-200/70 dark:border-indigo-800/50' },
  { card: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/50', icon: 'bg-orange-500 text-white', title: 'text-orange-950 dark:text-orange-50', sub: 'text-orange-700/70 dark:text-orange-300/60', track: 'bg-orange-200/70 dark:bg-orange-900/50', bar: 'from-orange-600 to-orange-400', stat: 'bg-white/60 dark:bg-black/20 border-orange-200/70 dark:border-orange-800/50', statLabel: 'text-orange-700/70 dark:text-orange-300/60', statValue: 'text-orange-950 dark:text-orange-50', divider: 'border-orange-200/70 dark:border-orange-800/50' },
];


export function StudentActivity({ basePath = '/admin' }: { basePath?: string }) {
  void basePath;
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [sessions, setSessions] = useState<SessionAnalytics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [courses, setCourses] = useState<CourseAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState('last30');
  const [tab, setTab] = useState<'overview' | 'courses' | 'events'>('courses');
  const [expanded, setExpanded] = useState<string | null>(null);
  const { socket, connected } = useRealtime();
  // Set once the server confirms this client joined the selected student's
  // room — a connected socket alone does not mean the feed is authorized.
  const [liveStudentId, setLiveStudentId] = useState<string | null>(null);
  const [lastLiveAt, setLastLiveAt] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const isLive = Boolean(selected && liveStudentId === selected);

  const loadRoster = useCallback(async () => {
    try {
      const r = await api.get('/activity/roster', { params: { search: search || undefined, limit: 100 } });
      setRoster(r.data.data || []);
    } catch {
      setRoster([]);
    }
  }, [search]);

  useEffect(() => { void loadRoster(); }, [loadRoster]);

  // `silent` keeps the background refresh from flashing the whole panel back
  // to its loading state every time the poll fires.
  const loadStudent = useCallback(async (studentId: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [a, s, c, t] = await Promise.all([
        api.get(`/activity/analytics/${studentId}`),
        api.get(`/activity/session-analytics/${studentId}`),
        api.get(`/activity/course-analytics/${studentId}`),
        api.get(`/activity/timeline/${studentId}`, { params: { limit: 200 } }),
      ]);
      setAnalytics(a.data.data || null);
      setSessions(s.data.data || null);
      setCourses(c.data.data || null);
      setEvents(t.data.data || []);
      // Only on a deliberate load: collapsing an open card underneath the
      // admin every time the background poll fires would be maddening.
      if (!silent) setExpanded(null);
    } catch {
      // A blip during a background poll leaves what is on screen alone —
      // blanking a working view because one refresh failed is worse than
      // showing data a few seconds stale.
      if (!silent) {
        setAnalytics(null);
        setSessions(null);
        setCourses(null);
        setEvents([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { if (selected) void loadStudent(selected); }, [selected, loadStudent]);

  // ── Live feed ────────────────────────────────────────────────────────────
  // Ask the server for this student's activity room, then fold each pushed
  // event into the state the page already holds. The server re-checks
  // permission on join, so a room we are not entitled to simply stays silent.
  useEffect(() => {
    if (!socket || !selected) return;
    setLiveStudentId(null);
    socket.emit('activity:watch', selected);

    const onWatching = ({ studentId }: { studentId: string }) => {
      if (studentId === selectedRef.current) setLiveStudentId(studentId);
    };

    const onEvent = (event: ActivityEvent) => {
      setEvents((prev) => (prev.some((e) => e._id === event._id) ? prev : [event, ...prev]));
      setLastLiveAt(new Date().toISOString());
    };

    const onSession = (row: SessionRow) => {
      setLastLiveAt(new Date().toISOString());
      setSessions((prev) => {
        if (!prev) return prev;
        const existing = prev.sessions.findIndex((s) => s._id === row._id);
        const sessions = existing >= 0
          ? prev.sessions.map((s, i) => (i === existing ? row : s))
          : [row, ...prev.sessions];
        // Totals are sums over these rows, so recompute rather than letting
        // the header stats drift away from the list under them.
        return {
          ...prev,
          sessions,
          sessionCount: sessions.length,
          totalActiveSeconds: sessions.reduce((sum, s) => sum + (s.activeSeconds || 0), 0),
          totalIdleSeconds: sessions.reduce((sum, s) => sum + (s.idleSeconds || 0), 0),
          totalWatchSeconds: sessions.reduce((sum, s) => sum + (s.watchSeconds || 0), 0),
        };
      });
    };

    socket.on('activity:watching', onWatching);
    socket.on('activity:event', onEvent);
    socket.on('session:update', onSession);

    return () => {
      socket.emit('activity:unwatch', selected);
      socket.off('activity:watching', onWatching);
      socket.off('activity:event', onEvent);
      socket.off('session:update', onSession);
      setLiveStudentId(null);
    };
  }, [socket, selected]);

  // Roster presence: the online dots were only ever as fresh as the last full
  // page load. Admin/teacher clients join the presence room and patch rows in
  // place as students connect and disconnect.
  useEffect(() => {
    if (!socket) return;
    socket.emit('presence:watch');
    const onPresence = ({ userId, online, lastSeenAt }: { userId: string; online: boolean; lastSeenAt: string }) => {
      setRoster((prev) => prev.map((r) => (r.userId === userId ? { ...r, online, lastSeenAt } : r)));
    };
    socket.on('presence:update', onPresence);
    return () => { socket.off('presence:update', onPresence); };
  }, [socket]);

  // Fallback for when the socket never connects (blocked WebSockets, proxy in
  // the way): keep the open student's data moving on a timer instead. Skipped
  // entirely while the live feed is confirmed working.
  useEffect(() => {
    if (!selected || isLive) return;
    const timer = window.setInterval(() => { void loadStudent(selected, true); }, 30_000);
    return () => window.clearInterval(timer);
  }, [selected, isLive, loadStudent]);

  const student = useMemo(() => roster.find((x) => x._id === selected) || null, [roster, selected]);
  /**
   * Daily learning, newest day first and with the quiet days kept in.
   *
   * The old version showed the server's rows in ascending order, so today and
   * yesterday sat at the very bottom of a month-long list — the days an admin
   * opens this page to check were the ones they had to scroll past everything
   * else to reach. It also sliced by row count, not by date, so "Last 7 days"
   * really meant "the last 7 days that happen to have data" and could show
   * August in a week view.
   *
   * Days with no sessions are filled in at zero rather than omitted: an
   * absent row cannot be told apart from a day the student did not study,
   * which is the exact question being asked of this panel.
   *
   * Keys are built in UTC to match the server's own $dateToString grouping,
   * so a day always lines up with the bucket its seconds were counted into.
   */
  const visibleDaily = useMemo(() => {
    if (!sessions) return [];
    const byDate = new Map(sessions.daily.map((d) => [d.date, d]));
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const today = dayKey(new Date());

    if (range === 'all') {
      return [...sessions.daily]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .map((d) => ({ ...d, isToday: d.date === today }));
    }

    const days = range === 'last7' ? 7 : 30;
    const series: Array<{ date: string; activeSeconds: number; watchSeconds: number; isToday: boolean }> = [];
    for (let back = 0; back < days; back++) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() - back);
      const date = dayKey(day);
      const found = byDate.get(date);
      series.push({
        date,
        activeSeconds: found?.activeSeconds || 0,
        watchSeconds: found?.watchSeconds || 0,
        isToday: back === 0,
      });
    }
    return series;
  }, [sessions, range]);

  /** "Today" / "Yesterday" beat a bare date for the two rows anyone actually looks for. */
  const dayLabel = useCallback((date: string, isToday: boolean) => {
    if (isToday) return 'Today';
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (date === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
    return new Date(`${date}T00:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  }, []);

  /**
   * One card per sign-in: everything between a login and its logout, grouped
   * under the login session the student was in. The flat list this replaces
   * rendered only login and logout rows plus lesson cards, so opening a
   * course, reading a lesson and answering Stop & Check questions were all
   * recorded but never shown — the page looked like the student had done
   * nothing but sign in and out.
   */
  const sessionGroups = useMemo(() => {
    const groups = new Map<string, {
      id: string;
      number: number;
      loginAt: string | null;
      logoutAt: string | null;
      events: ActivityEvent[];
      lessons: SessionRow[];
    }>();

    const groupFor = (id: string) => {
      let group = groups.get(id);
      if (!group) {
        // Numbered in one pass below, once every group is known.
        group = { id, number: 0, loginAt: null, logoutAt: null, events: [], lessons: [] };
        groups.set(id, group);
      }
      return group;
    };

    for (const event of events) {
      if (!event.loginSessionId) continue;
      const group = groupFor(event.loginSessionId);
      if (event.type === 'login') {
        if (!group.loginAt || new Date(event.createdAt) < new Date(group.loginAt)) group.loginAt = event.createdAt;
      } else if (event.type === 'logout') {
        if (!group.logoutAt || new Date(event.createdAt) > new Date(group.logoutAt)) group.logoutAt = event.createdAt;
      } else {
        group.events.push(event);
      }
    }

    // Sign-ins recorded before the server started stamping login/logout with
    // a session id have no key to group on, so they are paired the only way
    // left: in time order, each login opening a session that the next logout
    // closes. Without this every historical card reads "Login —".
    const looseSignIns = events
      .filter((e) => !e.loginSessionId && (e.type === 'login' || e.type === 'logout'))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let open: ReturnType<typeof groupFor> | null = null;
    for (const event of looseSignIns) {
      if (event.type === 'login') {
        open = groupFor(`inferred:${event._id}`);
        open.loginAt = event.createdAt;
      } else if (open && !open.logoutAt) {
        open.logoutAt = event.createdAt;
        open = null;
      }
    }

    for (const lesson of sessions?.sessions || []) {
      if (lesson.loginSessionId) groupFor(lesson.loginSessionId).lessons.push(lesson);
    }

    const startOf = (g: { loginAt: string | null; events: ActivityEvent[]; lessons: SessionRow[] }) =>
      new Date(g.loginAt || g.events[0]?.createdAt || g.lessons[0]?.startedAt || 0).getTime();

    // Numbered oldest-first so a session's number stays put as newer ones
    // arrive, then shown newest-first.
    [...groups.values()]
      .sort((a, b) => startOf(a) - startOf(b))
      .forEach((group, index) => { group.number = index + 1; });

    const ordered = [...groups.values()].sort((a, b) => startOf(b) - startOf(a));

    // Anything logged before login sessions were stamped (or by a flow that
    // does not send the header) still belongs to whichever sign-in was open
    // at the time — dropping it would hide real work.
    const orphans = events.filter((e) => !e.loginSessionId && e.type !== 'login' && e.type !== 'logout');
    for (const orphan of orphans) {
      const at = new Date(orphan.createdAt).getTime();
      const host = ordered.find((g) => {
        const from = g.loginAt ? new Date(g.loginAt).getTime() : null;
        const to = g.logoutAt ? new Date(g.logoutAt).getTime() : null;
        return from !== null && at >= from && (to === null || at <= to);
      });
      if (host) host.events.push(orphan);
    }

    return ordered.map((group) => {
      const timeline = [
        ...group.events.map((event) => ({ kind: 'event' as const, at: event.createdAt, event })),
        ...group.lessons.map((lesson) => ({ kind: 'lesson' as const, at: lesson.startedAt, lesson })),
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

      const lastActivityAt = [
        ...group.events.map((e) => e.createdAt),
        ...group.lessons.map((l) => l.endedAt || l.startedAt),
      ].sort().pop() || null;

      // Never measured against "now" just because a logout is missing — that
      // is exactly what made abandoned sessions read as 14-hour study days.
      // A sign-in with no logout is closed at its own last recorded activity,
      // and only the newest one, for a student who is online right now, is
      // treated as still running.
      const isNewest = ordered[0]?.id === group.id;
      const ongoing = !group.logoutAt && isNewest && Boolean(student?.online);
      const endAt = group.logoutAt || (ongoing ? new Date().toISOString() : lastActivityAt);
      const durationSeconds = group.loginAt && endAt
        ? Math.max(0, Math.floor((new Date(endAt).getTime() - new Date(group.loginAt).getTime()) / 1000))
        : 0;

      const quizzes = group.events.filter(isQuizEvent);
      const correct = quizzes.filter((e) => e.status === 'passed' || e.percent === 100).length;
      const courseNames = [...new Set(
        [...group.events.map((e) => e.course?.title?.en).filter(Boolean) as string[]]
      )];

      return {
        ...group,
        timeline,
        endAt,
        endedBy: group.logoutAt ? 'logout' as const : ongoing ? 'ongoing' as const : 'inferred' as const,
        durationSeconds,
        quizCount: quizzes.length,
        correctCount: correct,
        courseNames,
        activeSeconds: group.lessons.reduce((sum, l) => sum + (l.activeSeconds || 0), 0),
        watchSeconds: group.lessons.reduce((sum, l) => sum + (l.watchSeconds || 0), 0),
      };
    });
  }, [events, sessions, student?.online]);

  const exportSessions = () => {
    if (!sessions || !student) return;
    const rows = sessions.sessions.map((s) => [
      dateTime(s.startedAt),
      dateTime(s.endedAt),
      s.loginSessionId || '',
      s.lessonTitle || s.resourceName || '',
      fmt(spanSeconds(s.startedAt, s.endedAt)),
      fmt(s.activeSeconds),
      fmt(s.watchSeconds),
      fmt(s.idleSeconds),
      s.status,
    ]);
    const csv = [['Started', 'Ended', 'Login session', 'Lesson', 'Total duration', 'Active study', 'Video watched', 'Idle', 'Status'], ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-activity-${student.studentId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Keyed off the score itself, not off standalone-quiz attempts: the backend
  // blends in Interactive Gate ("Stop & Check") answers, so a student who has
  // only ever answered in-lesson questions still has a real score to show.
  const averageScoreLabel = courses?.averageScore == null ? '—' : `${Math.round(courses.averageScore)}%`;

  return (
    <div className="p-4 sm:p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">📊 Student Activity</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Course-level learning performance from server-tracked student data.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
          <aside className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card max-h-[78vh] flex flex-col">
            <div className="p-3 border-b border-[var(--color-border-subtle)]">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student ID or name..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm" />
            </div>
            <div className="overflow-y-auto">
              {roster.map((item) => (
                <button key={item._id} type="button" onClick={() => setSelected(item._id)} className={`w-full text-left px-4 py-3 border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] ${selected === item._id ? 'bg-primary-50 dark:bg-primary-950/20' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${item.online ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <b className="truncate text-sm">{item.name || item.studentId}</b>
                  </div>
                  <span className="ml-4 text-xs text-[var(--color-text-tertiary)]">{item.online ? 'Online now' : item.lastSeenAt ? `Last seen ${dateTime(item.lastSeenAt)}` : 'Never seen'}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="space-y-5">
            {!student ? (
              <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-16 text-center">
                <div className="text-4xl">👈</div>
                <p className="mt-3 font-semibold">Select a student to view activity</p>
              </div>
            ) : loading ? (
              <div className="rounded-2xl border border-[var(--color-border-default)] p-16 text-center">Loading activity…</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">{student.name}</h2>
                    <p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId} · {student.online ? 'Online now' : 'Offline'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select value={range} onChange={(e) => setRange(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs">
                      <option value="last7">Last 7 days</option>
                      <option value="last30">Last 30 days</option>
                      <option value="all">All available</option>
                    </select>
                    <button type="button" onClick={exportSessions} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-secondary)]">Export sessions CSV</button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:gap-4">
                  <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 sm:p-5 shadow-card">
                    <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Total courses</span>
                    <p className="mt-2 text-lg sm:text-3xl font-extrabold">{courses?.totalCourses || 0}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 sm:p-5 shadow-card">
                    <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Total duration</span>
                    <p className="mt-2 text-lg sm:text-3xl font-extrabold">{fmt(courses?.totalDurationSeconds || 0)}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 sm:p-5 shadow-card">
                    <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Average score</span>
                    <div className="mt-2 flex items-center justify-between gap-1 sm:gap-3">
                      <div className="min-w-0">
                        <p className="text-lg sm:text-3xl font-extrabold">{averageScoreLabel}</p>
                        <p className="mt-1 text-[10px] sm:text-xs text-[var(--color-text-tertiary)] truncate">{courses && courses.totalQuestions > 0 ? `${courses.correctAnswers}/${courses.totalQuestions} correct` : 'No questions answered yet'}</p>
                      </div>
                      <div className="hidden sm:flex h-14 w-14 shrink-0 rounded-full border-[7px] border-primary-100 items-center justify-center text-[11px] font-bold">{courses && courses.totalQuestions > 0 ? `${courses.correctAnswers}/${courses.totalQuestions}` : '—'}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 sm:p-5 shadow-card">
                    <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Streak (days)</span>
                    <p className="mt-2 text-lg sm:text-3xl font-extrabold">{analytics?.learningStreakDays || 0} <span className="text-xs sm:text-base font-bold text-[var(--color-text-tertiary)]">day{(analytics?.learningStreakDays || 0) === 1 ? '' : 's'}</span></p>
                    <p className="mt-1 text-[10px] sm:text-xs text-[var(--color-text-tertiary)] hidden sm:block">Consecutive learning days</p>
                  </div>
                </div>

                <div className="flex max-w-full overflow-x-auto gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1 w-fit">
                  {(['overview', 'courses', 'events'] as const).map((name) => (
                    <button key={name} type="button" onClick={() => setTab(name)} className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold ${tab === name ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}>
                      {name === 'events' ? 'Activity Events' : name === 'courses' ? 'Learning by course' : 'Overview'}
                    </button>
                  ))}
                </div>

                {tab === 'overview' && (
                  <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5">
                    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                      <h3 className="font-bold">Learning summary</h3>
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Real tracked time, score and course completion.</p>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        {[['Active study', fmt(courses?.totalActiveSeconds || 0)], ['Video watched', fmt(sessions?.totalWatchSeconds || 0)], ['Sessions', String(sessions?.sessionCount || 0)], ['Streak', `${analytics?.learningStreakDays || 0}d`]].map(([label, value]) => (
                          <div key={label} className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                            <span className="text-xs text-[var(--color-text-tertiary)]">{label}</span>
                            <p className="mt-1 font-bold">{value}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-bold">Daily learning</h3>
                        <span className="text-[11px] text-[var(--color-text-tertiary)]">
                          {range === 'last7' ? 'Last 7 days' : range === 'last30' ? 'Last 30 days' : 'All available'} · newest first
                        </span>
                      </div>
                      <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-1">
                        {(() => {
                          const max = Math.max(1, ...visibleDaily.map((entry) => entry.activeSeconds));
                          return visibleDaily.length ? visibleDaily.map((item) => {
                            const empty = item.activeSeconds === 0;
                            return (
                              <div key={item.date} className={item.isToday ? 'rounded-lg bg-primary-50/60 dark:bg-primary-950/20 -mx-2 px-2 py-1.5' : ''}>
                                <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
                                  <span className={`truncate ${item.isToday ? 'font-bold text-primary-700 dark:text-primary-300' : empty ? 'text-[var(--color-text-tertiary)]' : ''}`}>
                                    {dayLabel(item.date, item.isToday)}
                                    <span className="ml-1.5 text-[10px] text-[var(--color-text-tertiary)]">{item.date}</span>
                                  </span>
                                  <b className={`shrink-0 ${empty ? 'font-normal text-[var(--color-text-tertiary)]' : ''}`}>
                                    {empty ? 'No activity' : fmt(item.activeSeconds)}
                                  </b>
                                </div>
                                <div className="h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${item.isToday ? 'bg-primary-600' : 'bg-primary-500'}`}
                                    style={{ width: `${Math.round((item.activeSeconds / max) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          }) : <p className="text-sm text-[var(--color-text-tertiary)]">No session data yet.</p>;
                        })()}
                      </div>
                    </section>
                  </div>
                )}

                {tab === 'courses' && (
                  <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
                    <div className="p-5 border-b border-[var(--color-border-subtle)]">
                      <h3 className="text-xl font-bold">Learning by course</h3>
                      <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Every enrolled course with real duration, progress, quiz performance and latest activity.</p>
                    </div>
                    <div className="p-4 sm:p-5 grid grid-cols-1 gap-4">
                      {courses?.courses.map((course, index) => {
                        const theme = courseThemes[index % courseThemes.length];
                        const title = course.title?.en || course.title?.so || course.title?.ar || 'Untitled course';
                        const statusText = course.status === 'completed' ? 'Completed' : course.status === 'in_progress' ? 'In Progress' : 'Not Started';
                        const statusClasses = course.status === 'completed' ? 'bg-emerald-500 text-white' : course.status === 'in_progress' ? 'bg-white/70 dark:bg-black/30 ' + theme.title : 'bg-white/70 dark:bg-black/30 ' + theme.sub;
                        const progressWidth = Math.min(100, Math.max(0, course.progressPercent));
                        const quizValueText = formatPercent(course.averageScore);
                        const detailOpen = expanded === course.id;
                        const metricLessons = course.status === 'not_started' ? `0 / ${course.totalLessons || 0}` : `${course.completedItems || 0} / ${course.totalItems || course.totalLessons || 0}`;
                        const metricStudy = course.status === 'not_started' ? '0m' : fmtShortDuration(course.activeSeconds);

                        return (
                          <article key={course.id} className={`rounded-2xl border p-4 sm:p-5 transition-colors ${theme.card}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 gap-3">
                                <div className={`h-10 w-10 shrink-0 rounded-xl grid place-items-center text-lg ${theme.icon}`}>📚</div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className={`text-base font-bold break-words ${theme.title}`}>{title}</h4>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses}`}>{statusText}</span>
                                  </div>
                                  <p className={`mt-0.5 text-xs ${theme.sub}`}>{course.category || 'Course'} · {course.level || 'Beginner'}</p>
                                </div>
                              </div>
                              <span className={`shrink-0 text-2xl font-extrabold leading-none ${theme.title}`}>{course.progressPercent}%</span>
                            </div>

                            <div className={`mt-3 h-2 overflow-hidden rounded-full ${theme.track}`}>
                              <div className={`h-full rounded-full bg-gradient-to-r ${theme.bar}`} style={{ width: `${progressWidth}%` }} />
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2 text-left">
                              <div className={`rounded-lg border p-2 ${theme.stat}`}>
                                <div className={`text-[9px] uppercase tracking-[0.06em] ${theme.statLabel}`}>Study time</div>
                                <div className={`mt-0.5 text-sm font-bold truncate ${theme.statValue}`}>{metricStudy}</div>
                              </div>
                              <div className={`rounded-lg border p-2 ${theme.stat}`}>
                                <div className={`text-[9px] uppercase tracking-[0.06em] ${theme.statLabel}`}>Quiz score</div>
                                <div className={`mt-0.5 text-sm font-bold truncate ${theme.statValue}`}>{quizValueText}</div>
                              </div>
                              <div className={`rounded-lg border p-2 ${theme.stat}`}>
                                <div className={`text-[9px] uppercase tracking-[0.06em] ${theme.statLabel}`}>Lessons</div>
                                <div className={`mt-0.5 text-sm font-bold truncate ${theme.statValue}`}>{metricLessons}</div>
                              </div>
                            </div>

                            <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 ${theme.divider}`}>
                              <div className={`text-xs ${theme.sub}`}>{formatLastActivity(course.lastAccessed)}</div>
                              <button type="button" onClick={() => setExpanded(detailOpen ? null : course.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-white/50 dark:hover:bg-black/20 ${theme.stat} ${theme.title}`}>
                                View details <span aria-hidden="true">→</span>
                              </button>
                            </div>

                            {detailOpen && (
                              <div className="mt-5 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Study time</div>
                                    <div className="mt-2 font-bold">{fmtShortDuration(course.activeSeconds)}</div>
                                  </div>
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Video watched</div>
                                    <div className="mt-2 font-bold">{fmt(course.watchSeconds)}</div>
                                  </div>
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Sessions</div>
                                    <div className="mt-2 font-bold">{course.sessionCount}</div>
                                  </div>
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Quiz score</div>
                                    <div className="mt-2 font-bold">{formatPercent(course.averageScore)}</div>
                                  </div>
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Quiz attempts</div>
                                    <div className="mt-2 font-bold">{course.quizAttempts || '—'}</div>
                                  </div>
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Stop &amp; Check answered</div>
                                    <div className="mt-2 font-bold">{course.gateQuestions || '—'}</div>
                                  </div>
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Correct answers</div>
                                    <div className="mt-2 font-bold">{course.totalQuestions > 0 ? `${course.correctAnswers} / ${course.totalQuestions}` : '—'}</div>
                                  </div>
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Lessons</div>
                                    <div className="mt-2 font-bold">{course.totalLessons > 0 ? `${course.lessonsCompleted || 0} / ${course.totalLessons}` : '—'}</div>
                                  </div>
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Completed items</div>
                                    <div className="mt-2 font-bold">{course.totalItems > 0 ? `${course.completedItems || 0} / ${course.totalItems}` : '—'}</div>
                                  </div>
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Passed quizzes</div>
                                    <div className="mt-2 font-bold">{course.quizzesPassed || '—'}</div>
                                  </div>
                                  <div className="rounded-xl bg-[var(--color-surface-primary)] p-3 sm:col-span-2 xl:col-span-3">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Last activity</div>
                                    <div className="mt-2 font-bold">{formatLastActivity(course.lastAccessed)}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

                {tab === 'events' && (
                  <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border-subtle)]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold">Activity Events</h3>
                        {isLive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                            </span>
                            Live
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                            <span className="h-2 w-2 rounded-full bg-slate-400" />
                            {connected ? 'Connecting…' : 'Refreshing every 30s'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        {isLive
                          ? 'Updating as this student works — new events appear on their own.'
                          : 'Click a lesson to see only what happened during that exact lesson visit.'}
                        {lastLiveAt && ` · Last update ${timeOnly(lastLiveAt)}`}
                      </p>
                    </div>
                    <div className="divide-y divide-[var(--color-border-subtle)]">
                      {sessionGroups.map((group) => {
                        const isOpen = expanded === group.id;
                        // "Logout: … (no logout)" contradicted itself. When
                        // there is no logout event the column is headed for
                        // what it actually holds instead.
                        const endHeading = group.endedBy === 'logout' ? 'Logout' : group.endedBy === 'ongoing' ? 'Status' : 'Last activity';
                        const endLabel = group.endedBy === 'ongoing'
                          ? 'Still signed in'
                          : group.endedBy === 'inferred'
                            ? dateTime(group.endAt)
                            : dateTime(group.logoutAt);
                        return (
                          <div key={group.id} className="p-4 sm:p-5">
                            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
                              <button
                                type="button"
                                onClick={() => setExpanded(isOpen ? null : group.id)}
                                className="w-full text-left p-4 sm:p-5"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-primary-600 px-3 py-1 text-[11px] font-bold text-white">Session {group.number}</span>
                                    {group.endedBy === 'ongoing' && (
                                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Active now
                                      </span>
                                    )}
                                  </div>
                                  <span className="shrink-0 text-xs font-semibold text-[var(--color-text-tertiary)]">{isOpen ? 'Hide details ↑' : 'View details ↓'}</span>
                                </div>

                                <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                                  <div>
                                    <span className="text-[var(--color-text-tertiary)]">Login</span><br />
                                    <b className="text-[13px]">{dateTime(group.loginAt)}</b>
                                  </div>
                                  <div>
                                    <span className="text-[var(--color-text-tertiary)]">{endHeading}</span><br />
                                    <b className="text-[13px]">{endLabel}</b>
                                  </div>
                                  <div>
                                    <span className="text-[var(--color-text-tertiary)]">Total duration</span><br />
                                    <b className="text-[13px]">{group.durationSeconds ? fmt(group.durationSeconds) : '—'}</b>
                                  </div>
                                  <div>
                                    <span className="text-[var(--color-text-tertiary)]">Active study</span><br />
                                    <b className="text-[13px]">{group.activeSeconds ? fmt(group.activeSeconds) : '—'}</b>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                                  {group.lessons.length > 0 && (
                                    <span className="rounded-full bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 font-semibold text-blue-700 dark:text-blue-300">📖 {group.lessons.length} lesson{group.lessons.length === 1 ? '' : 's'}</span>
                                  )}
                                  {group.quizCount > 0 && (
                                    <span className="rounded-full bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 font-semibold text-amber-700 dark:text-amber-300">❓ {group.correctCount}/{group.quizCount} correct</span>
                                  )}
                                  {group.watchSeconds > 0 && (
                                    <span className="rounded-full bg-purple-50 dark:bg-purple-950/30 px-2.5 py-1 font-semibold text-purple-700 dark:text-purple-300">🎬 {fmt(group.watchSeconds)}</span>
                                  )}
                                  {group.courseNames.slice(0, 2).map((name) => (
                                    <span key={name} className="rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 font-semibold text-[var(--color-text-secondary)]">{name}</span>
                                  ))}
                                  {!group.timeline.length && (
                                    <span className="rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 font-semibold text-[var(--color-text-tertiary)]">Signed in, no activity recorded</span>
                                  )}
                                </div>
                              </button>

                              {isOpen && (
                                <div className="border-t border-[var(--color-border-subtle)] p-4 sm:p-5">
                                  {group.timeline.length ? (
                                    <ol className="relative space-y-3 border-l-2 border-[var(--color-border-subtle)] pl-4">
                                      {group.timeline.map((row, idx) => {
                                        if (row.kind === 'lesson') {
                                          const l = row.lesson;
                                          return (
                                            <li key={`lesson-${l._id}-${idx}`} className="relative">
                                              <span className="absolute -left-[25px] flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] text-white">📖</span>
                                              <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                  <b className="text-sm break-words">{l.lessonTitle || l.resourceName || 'Lesson'}</b>
                                                  <span className="text-[11px] text-[var(--color-text-tertiary)]">{timeOnly(l.startedAt)} → {l.endedAt ? timeOnly(l.endedAt) : '…'}</span>
                                                </div>
                                                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                                  <div><span className="text-[var(--color-text-tertiary)]">Active</span><br /><b>{fmt(l.activeSeconds)}</b></div>
                                                  <div><span className="text-[var(--color-text-tertiary)]">Idle</span><br /><b>{fmt(l.idleSeconds)}</b></div>
                                                  <div><span className="text-[var(--color-text-tertiary)]">Video</span><br /><b>{fmt(l.watchSeconds)}</b></div>
                                                  <div><span className="text-[var(--color-text-tertiary)]">Status</span><br /><b className="capitalize">{l.status}</b></div>
                                                </div>
                                              </div>
                                            </li>
                                          );
                                        }

                                        const e = row.event;
                                        const look = describeEvent(e);
                                        const scored = isQuizEvent(e);
                                        return (
                                          <li key={`event-${e._id}-${idx}`} className="relative">
                                            <span className={`absolute -left-[25px] flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${look.tone}`}>{look.icon}</span>
                                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                              <div className="min-w-0">
                                                <b className="text-sm">{look.label}</b>
                                                {(e.resourceName || e.lessonTitle) && (
                                                  <span className="text-sm text-[var(--color-text-secondary)] break-words"> — {e.resourceName || e.lessonTitle}</span>
                                                )}
                                                {e.course?.title?.en && (
                                                  <span className="text-xs text-[var(--color-text-tertiary)]"> · {e.course.title.en}</span>
                                                )}
                                                {scored && e.status && (
                                                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${e.status === 'passed' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                    {e.status === 'passed' ? 'Correct' : 'Wrong'}
                                                  </span>
                                                )}
                                                {typeof e.percent === 'number' && !scored && (
                                                  <span className="ml-2 text-[11px] font-semibold text-[var(--color-text-tertiary)]">{Math.round(e.percent)}%</span>
                                                )}
                                              </div>
                                              <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">{timeOnly(e.createdAt)}</span>
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ol>
                                  ) : (
                                    <p className="text-sm text-[var(--color-text-tertiary)]">
                                      The student signed in but nothing else was recorded before this session ended.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {!sessionGroups.length && <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No activity events recorded yet.</p>}
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
