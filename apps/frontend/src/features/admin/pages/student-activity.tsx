import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../lib/axios';

interface RosterRow { _id: string; studentId: string; name: string; online: boolean; lastSeenAt: string | null; }
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
const normalize = (value?: string) => (value || '').trim().toLowerCase();
const spanSeconds = (start?: string, end?: string) => {
  if (!start) return 0;
  return Math.max(0, Math.floor(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 1000));
};
const isQuizEvent = (event: ActivityEvent) => /quiz|assessment|attempt|submission|passed|failed/i.test(event.type) || event.metadata?.score != null || event.metadata?.totalPoints != null;
const formatPercent = (value: number | null) => value == null ? '—' : `${value}%`;
const formatLastActivity = (value?: string | null) => {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';
  return `Last activity: ${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

function matchesSession(event: ActivityEvent, session: SessionRow) {
  if (session.loginSessionId && event.loginSessionId !== session.loginSessionId) return false;
  if (session.course && event.course?._id && session.course !== event.course._id) return false;
  if (session.lessonId && event.lessonId && session.lessonId !== event.lessonId) return false;
  const eventTitle = normalize(event.lessonTitle || event.resourceName);
  const sessionTitle = normalize(session.lessonTitle || session.resourceName);
  if (eventTitle && sessionTitle) return eventTitle === sessionTitle;
  const at = new Date(event.createdAt).getTime();
  return at >= new Date(session.startedAt).getTime() - 30000 && at <= new Date(session.endedAt || Date.now()).getTime() + 30000;
}

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

  const loadRoster = useCallback(async () => {
    try {
      const r = await api.get('/activity/roster', { params: { search: search || undefined, limit: 100 } });
      setRoster(r.data.data || []);
    } catch {
      setRoster([]);
    }
  }, [search]);

  useEffect(() => { void loadRoster(); }, [loadRoster]);

  const loadStudent = useCallback(async (studentId: string) => {
    setLoading(true);
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
      setExpanded(null);
    } catch {
      setAnalytics(null);
      setSessions(null);
      setCourses(null);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selected) void loadStudent(selected); }, [selected, loadStudent]);

  const student = useMemo(() => roster.find((x) => x._id === selected) || null, [roster, selected]);
  const visibleDaily = useMemo(() => {
    if (!sessions) return [];
    const cutoff = range === 'last7' ? 7 : range === 'last30' ? 30 : 3650;
    return sessions.daily.slice(-cutoff);
  }, [sessions, range]);

  const loginSequence = useMemo(() => {
    const map = new Map<string, number>();
    [...events].filter((e) => e.type === 'login' && e.loginSessionId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach((e) => {
        if (e.loginSessionId && !map.has(e.loginSessionId)) map.set(e.loginSessionId, map.size + 1);
      });
    [...new Set((sessions?.sessions || []).map((s) => s.loginSessionId).filter(Boolean) as string[])].forEach((id) => {
      if (!map.has(id)) map.set(id, map.size + 1);
    });
    return map;
  }, [events, sessions]);

  const lessonCards = useMemo(() => {
    if (!sessions) return [];
    return [...sessions.sessions]
      .filter((s) => s.kind === 'lesson' || s.lessonTitle || s.resourceName)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .map((session) => {
        const related = events.filter((e) => matchesSession(e, session)).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const quizzes = related.filter(isQuizEvent);
        const scores = quizzes.map((e) => {
          if (typeof e.percent === 'number') return e.percent;
          const score = Number(e.metadata?.score);
          const total = Number(e.metadata?.totalPoints);
          if (Number.isFinite(score) && Number.isFinite(total) && total > 0) return (score / total) * 100;
          return null;
        }).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

        return {
          session,
          quizzes,
          courseTitle: related.find((e) => e.course?.title?.en)?.course?.title?.en || 'Course',
          averageScore: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
          progress: related.reduce((max, e) => Math.max(max, typeof e.percent === 'number' ? e.percent : 0), 0),
          loginNumber: session.loginSessionId ? loginSequence.get(session.loginSessionId) : undefined,
        };
      });
  }, [sessions, events, loginSequence]);

  const timeline = useMemo(() => {
    const rows: Array<{ id: string; at: string; type: 'login' | 'logout' | 'lesson'; event?: ActivityEvent; card?: typeof lessonCards[number] }> = [];
    events.filter((e) => e.type === 'login' || e.type === 'logout').forEach((e) => {
      rows.push({ id: `event-${e._id}`, at: e.createdAt, type: e.type as 'login' | 'logout', event: e });
    });
    lessonCards.forEach((card) => {
      rows.push({ id: `lesson-${card.session._id}`, at: card.session.startedAt, type: 'lesson', card });
    });
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [events, lessonCards]);

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

  const averageScoreLabel = courses && courses.totalQuestions > 0 ? `${Math.round(courses.averageScore ?? 0)}%` : '—';

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

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Total courses</span>
                    <p className="mt-2 text-3xl font-extrabold">{courses?.totalCourses || 0}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Total duration</span>
                    <p className="mt-2 text-3xl font-extrabold">{fmt(courses?.totalDurationSeconds || 0)}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Average score</span>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-3xl font-extrabold">{averageScoreLabel}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{courses && courses.totalQuestions > 0 ? `${courses.correctAnswers} correct out of ${courses.totalQuestions} questions` : 'No quiz attempts'}</p>
                      </div>
                      <div className="h-14 w-14 rounded-full border-[7px] border-primary-100 flex items-center justify-center text-[11px] font-bold">{courses && courses.totalQuestions > 0 ? `${courses.correctAnswers}/${courses.totalQuestions}` : '—'}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Streak (days)</span>
                    <p className="mt-2 text-3xl font-extrabold">{analytics?.learningStreakDays || 0} <span className="text-base font-bold text-[var(--color-text-tertiary)]">day{(analytics?.learningStreakDays || 0) === 1 ? '' : 's'}</span></p>
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Consecutive learning days</p>
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
                      <h3 className="font-bold">Daily learning</h3>
                      <div className="mt-4 space-y-3">
                        {visibleDaily.length ? visibleDaily.map((item) => {
                          const max = Math.max(1, ...visibleDaily.map((entry) => entry.activeSeconds));
                          return (
                            <div key={item.date}>
                              <div className="flex justify-between text-xs mb-1">
                                <span>{item.date}</span>
                                <b>{fmt(item.activeSeconds)}</b>
                              </div>
                              <div className="h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                                <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.round((item.activeSeconds / max) * 100)}%` }} />
                              </div>
                            </div>
                          );
                        }) : <p className="text-sm text-[var(--color-text-tertiary)]">No session data yet.</p>}
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
                    <div className="divide-y divide-[var(--color-border-subtle)]">
                      {courses?.courses.map((course) => {
                        const title = course.title?.en || course.title?.so || course.title?.ar || 'Untitled course';
                        const statusText = course.status === 'completed' ? 'Completed' : course.status === 'in_progress' ? 'In Progress' : 'Not Started';
                        const statusClasses = course.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : course.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-600 border border-slate-200';
                        const progressWidth = Math.min(100, Math.max(0, course.progressPercent));
                        const quizValueText = course.totalQuestions > 0 ? formatPercent(course.averageScore) : '—';
                        const detailOpen = expanded === course.id;
                        const metricLessons = course.status === 'not_started' ? `0 / ${course.totalLessons || 0}` : `${course.completedItems || 0} / ${course.totalItems || course.totalLessons || 0}`;
                        const metricStudy = course.status === 'not_started' ? '0m' : fmtShortDuration(course.activeSeconds);

                        return (
                          <article key={course.id} className="p-5 sm:p-6 transition-colors">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="flex min-w-0 gap-4">
                                <div className="h-12 w-12 shrink-0 rounded-2xl bg-primary-50 text-primary-700 grid place-items-center text-xl">📚</div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="text-lg font-bold break-words">{title}</h4>
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses}`}>{statusText}</span>
                                  </div>
                                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{course.category || 'Course'} · {course.level || 'Beginner'}</p>
                                </div>
                              </div>
                            </div>

                            <div className="mt-5">
                              <div className="flex items-center justify-between gap-3 text-sm text-[var(--color-text-tertiary)]">
                                <span className="font-semibold text-[var(--color-text-secondary)]">Course progress</span>
                                <span className="text-3xl font-extrabold text-[var(--color-text-primary)] leading-none">{course.progressPercent}%</span>
                              </div>
                              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
                                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${progressWidth}%` }} />
                              </div>
                            </div>

                            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                              <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3">
                                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Study time</div>
                                <div className="mt-2 text-xl font-bold text-[var(--color-text-primary)]">{metricStudy}</div>
                              </div>
                              <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3">
                                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Quiz score</div>
                                <div className="mt-2 text-xl font-bold text-[var(--color-text-primary)]">{quizValueText}</div>
                                {course.totalQuestions > 0 ? <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">{course.correctAnswers} / {course.totalQuestions} correct</div> : <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">No attempts</div>}
                              </div>
                              <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3">
                                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">Lessons</div>
                                <div className="mt-2 text-xl font-bold text-[var(--color-text-primary)]">{metricLessons}</div>
                              </div>
                            </div>

                            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-4">
                              <div className="text-xs text-[var(--color-text-tertiary)]">{formatLastActivity(course.lastAccessed)}</div>
                              <button type="button" onClick={() => setExpanded(detailOpen ? null : course.id)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3.5 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]">
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
                      <h3 className="font-bold">Activity Events</h3>
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Click a lesson to see only what happened during that exact lesson visit.</p>
                    </div>
                    <div className="divide-y divide-[var(--color-border-subtle)]">
                      {timeline.map((row) => {
                        if (row.type === 'login' || row.type === 'logout') {
                          const number = row.event?.loginSessionId ? loginSequence.get(row.event.loginSessionId) : undefined;
                          return (
                            <div key={row.id} className="p-4 flex items-center gap-4">
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center ${row.type === 'login' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{row.type === 'login' ? '↪' : '↩'}</div>
                              <div>
                                <b className="text-sm capitalize">{row.type}</b>
                                <p className="text-xs text-[var(--color-text-tertiary)]">{timeOnly(row.at)} · {dateTime(row.at)}{number ? ` · Login session #${number}` : ''}</p>
                              </div>
                            </div>
                          );
                        }

                        const card = row.card!;
                        const session = card.session;
                        const isOpen = expanded === session._id;
                        return (
                          <div key={row.id} className="p-4 sm:p-5 bg-[var(--color-surface-secondary)]/40">
                            <button type="button" onClick={() => setExpanded(isOpen ? null : session._id)} className="w-full text-left rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-700">Lesson</span>
                                    {card.loginNumber && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold">Login session #{card.loginNumber}</span>}
                                  </div>
                                  <h4 className="mt-2 text-base sm:text-lg font-bold break-words">{card.courseTitle} · {session.lessonTitle || session.resourceName || 'Lesson'}</h4>
                                </div>
                                <span className="shrink-0 text-xs font-semibold text-[var(--color-text-tertiary)]">{isOpen ? 'Hide details ↑' : 'View details ↓'}</span>
                              </div>
                              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                <div><span className="text-[var(--color-text-tertiary)]">Start</span><br /><b>{timeOnly(session.startedAt)}</b></div>
                                <div><span className="text-[var(--color-text-tertiary)]">End</span><br /><b>{timeOnly(session.endedAt)}</b></div>
                                <div><span className="text-[var(--color-text-tertiary)]">Total duration</span><br /><b>{fmt(spanSeconds(session.startedAt, session.endedAt))}</b></div>
                                <div><span className="text-[var(--color-text-tertiary)]">Average score</span><br /><b>{card.averageScore == null ? '—' : `${Math.round(card.averageScore)}%`}</b></div>
                              </div>
                              {isOpen && (
                                <div className="mt-5 border-t border-[var(--color-border-subtle)] pt-5" onClick={(e) => e.stopPropagation()}>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                    <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><span>Active study</span><br /><b>{fmt(session.activeSeconds)}</b></div>
                                    <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><span>Video watched</span><br /><b>{fmt(session.watchSeconds)}</b></div>
                                    <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><span>Idle</span><br /><b>{fmt(session.idleSeconds)}</b></div>
                                    <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><span>Progress</span><br /><b>{Math.round(card.progress)}%</b></div>
                                  </div>
                                </div>
                              )}
                            </button>
                          </div>
                        );
                      })}
                      {!timeline.length && <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No activity events recorded yet.</p>}
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
