import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../lib/axios';

interface RosterRow {
  _id: string;
  studentId: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
}

interface ActivityEvent {
  _id: string;
  type: string;
  loginSessionId?: string;
  course?: { _id?: string; title?: { en?: string } } | null;
  lessonTitle?: string;
  resourceName?: string;
  status?: string;
  createdAt: string;
}

interface SessionRow {
  _id: string;
  loginSessionId?: string;
  kind: string;
  lessonTitle?: string;
  resourceName?: string;
  startedAt: string;
  endedAt?: string;
  activeSeconds: number;
  idleSeconds: number;
  watchSeconds: number;
  status: string;
}

interface SessionAnalytics {
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  totalWatchSeconds: number;
  sessionCount: number;
  daily: Array<{ date: string; activeSeconds: number; watchSeconds: number }>;
  sessions: SessionRow[];
}

interface Analytics {
  avgQuizScore: number | null;
  learningStreakDays: number;
}

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
  completedCourses: number;
  inProgressCourses: number;
  notStartedCourses: number;
  activeCourses: number;
  courses: CourseRow[];
}

const fmt = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  if (minutes < 60) return `${minutes}m ${safe % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

const timeOnly = (value?: string | null) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  : '—';

function spanSeconds(start?: string, end?: string) {
  if (!start) return 0;
  const finish = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, Math.floor((finish - new Date(start).getTime()) / 1000));
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
      const response = await api.get('/activity/roster', { params: { search: search || undefined, limit: 100 } });
      setRoster(response.data.data || []);
    } catch {
      setRoster([]);
    }
  }, [search]);

  useEffect(() => { void loadRoster(); }, [loadRoster]);

  const loadStudent = useCallback(async (studentId: string) => {
    setLoading(true);
    try {
      const [analyticsResponse, sessionResponse, courseResponse, timelineResponse] = await Promise.all([
        api.get(`/activity/analytics/${studentId}`),
        api.get(`/activity/session-analytics/${studentId}`),
        api.get(`/activity/course-analytics/${studentId}`),
        api.get(`/activity/timeline/${studentId}`, { params: { limit: 200 } }),
      ]);
      setAnalytics(analyticsResponse.data.data || null);
      setSessions(sessionResponse.data.data || null);
      setCourses(courseResponse.data.data || null);
      setEvents(timelineResponse.data.data || []);
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

  const student = useMemo(() => roster.find((item) => item._id === selected) || null, [roster, selected]);

  const visibleDaily = useMemo(() => {
    if (!sessions) return [];
    const cutoff = range === 'last7' ? 7 : range === 'last30' ? 30 : 3650;
    return sessions.daily.slice(-cutoff);
  }, [sessions, range]);

  const loginSequence = useMemo(() => {
    const map = new Map<string, number>();
    [...events]
      .filter((event) => event.type === 'login' && event.loginSessionId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach((event) => {
        if (event.loginSessionId && !map.has(event.loginSessionId)) map.set(event.loginSessionId, map.size + 1);
      });
    return map;
  }, [events]);

  const exportSessions = () => {
    if (!sessions || !student) return;
    const rows = sessions.sessions.map((session) => [
      dateTime(session.startedAt), dateTime(session.endedAt), session.loginSessionId || '',
      session.lessonTitle || session.resourceName || '', fmt(spanSeconds(session.startedAt, session.endedAt)),
      fmt(session.activeSeconds), fmt(session.watchSeconds), fmt(session.idleSeconds), session.status,
    ]);
    const csv = [['Started', 'Ended', 'Login session', 'Lesson', 'Total duration', 'Active study', 'Video watched', 'Idle', 'Status'], ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `student-activity-${student.studentId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const summaryCards = courses ? [
    ['Total courses', String(courses.totalCourses)],
    ['Total duration', fmt(courses.totalDurationSeconds)],
    ['Average score', courses.averageScore != null ? `${courses.averageScore}%` : '—'],
    ['Completed', String(courses.completedCourses)],
    ['In progress', String(courses.inProgressCourses)],
    ['Not started', String(courses.notStartedCourses)],
  ] : [];

  const statusMeta = {
    completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    in_progress: { label: 'In Progress', cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
    not_started: { label: 'Not Started', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  } as const;

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
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student ID or name..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm" />
            </div>
            <div className="overflow-y-auto">
              {roster.map((item) => (
                <button key={item._id} type="button" onClick={() => setSelected(item._id)} className={`w-full text-left px-4 py-3 border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] ${selected === item._id ? 'bg-primary-50 dark:bg-primary-950/20' : ''}`}>
                  <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${item.online ? 'bg-green-500' : 'bg-gray-400'}`} /><b className="truncate text-sm">{item.name || item.studentId}</b></div>
                  <span className="ml-4 text-xs text-[var(--color-text-tertiary)]">{item.online ? 'Online now' : item.lastSeenAt ? `Last seen ${dateTime(item.lastSeenAt)}` : 'Never seen'}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="space-y-5">
            {!student ? (
              <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-16 text-center"><div className="text-4xl">👈</div><p className="mt-3 font-semibold">Select a student to view activity</p></div>
            ) : loading ? (
              <div className="rounded-2xl border border-[var(--color-border-default)] p-16 text-center">Loading activity…</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="text-xl font-bold">{student.name}</h2><p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId} · {student.online ? 'Online now' : 'Offline'}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <select value={range} onChange={(event) => setRange(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs"><option value="last7">Last 7 days</option><option value="last30">Last 30 days</option><option value="all">All available</option></select>
                    <button type="button" onClick={exportSessions} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-secondary)]">Export sessions CSV</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {summaryCards.map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card"><span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</span><p className="mt-1 text-xl font-bold">{value}</p></div>)}
                </div>

                <div className="flex max-w-full overflow-x-auto gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1 w-fit">
                  {(['overview', 'courses', 'events'] as const).map((name) => <button key={name} type="button" onClick={() => setTab(name)} className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold ${tab === name ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}>{name === 'events' ? 'Activity Events' : name === 'courses' ? 'Learning by course' : 'Overview'}</button>)}
                </div>

                {tab === 'overview' && (
                  <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5">
                    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                      <h3 className="font-bold">Learning summary</h3><p className="text-xs text-[var(--color-text-tertiary)] mt-1">Real tracked time, score and course completion.</p>
                      <div className="mt-5 grid grid-cols-2 gap-3">{[
                        ['Active study', fmt(courses?.totalActiveSeconds)], ['Video watched', fmt(sessions?.totalWatchSeconds)],
                        ['Sessions', String(sessions?.sessionCount || 0)], ['Streak', `${analytics?.learningStreakDays || 0}d`],
                      ].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--color-surface-secondary)] p-4"><span className="text-xs text-[var(--color-text-tertiary)]">{label}</span><p className="mt-1 font-bold">{value}</p></div>)}</div>
                    </section>
                    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card"><h3 className="font-bold">Daily learning</h3><div className="mt-4 space-y-3">{visibleDaily.length ? visibleDaily.map((item) => { const max = Math.max(1, ...visibleDaily.map((entry) => entry.activeSeconds)); return <div key={item.date}><div className="flex justify-between text-xs mb-1"><span>{item.date}</span><b>{fmt(item.activeSeconds)}</b></div><div className="h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden"><div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.round((item.activeSeconds / max) * 100)}%` }} /></div></div>; }) : <p className="text-sm text-[var(--color-text-tertiary)]">No session data yet.</p>}</div></section>
                  </div>
                )}

                {tab === 'courses' && (
                  <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
                    <div className="p-5 border-b border-[var(--color-border-subtle)]"><h3 className="text-xl font-bold">Learning by course</h3><p className="text-sm text-[var(--color-text-tertiary)] mt-1">Every enrolled course with real duration, progress, quiz performance and latest activity.</p></div>
                    <div className="divide-y divide-[var(--color-border-subtle)]">
                      {courses?.courses.map((course) => {
                        const meta = statusMeta[course.status];
                        const title = course.title?.en || course.title?.so || course.title?.ar || 'Untitled course';
                        return <article key={course.id} className="p-5 sm:p-6 hover:bg-[var(--color-surface-secondary)]/50 transition-colors">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex min-w-0 gap-4">
                              <div className="h-12 w-12 shrink-0 rounded-2xl bg-primary-50 text-primary-700 grid place-items-center text-xl">📚</div>
                              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="text-lg font-bold break-words">{title}</h4><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span></div><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{course.category || 'Course'} · {course.level || 'Level not set'}</p></div>
                            </div>
                            <div className="text-right"><div className="text-2xl font-extrabold">{course.averageScore != null ? `${course.averageScore}%` : '—'}</div><span className="text-[10px] text-[var(--color-text-tertiary)]">Average score</span></div>
                          </div>

                          <div className="mt-5"><div className="flex justify-between text-xs mb-2"><span className="font-semibold">Course progress</span><b>{course.progressPercent}%</b></div><div className="h-2.5 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden"><div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, course.progressPercent))}%` }} /></div></div>

                          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[['Total duration', fmt(course.totalDurationSeconds)], ['Study time', fmt(course.activeSeconds)], ['Video watched', fmt(course.watchSeconds)], ['Lessons', `${course.lessonsCompleted}/${course.totalLessons || '—'}`], ['Quiz attempts', String(course.quizAttempts)], ['Sessions', String(course.sessionCount)]].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><span className="block text-[10px] uppercase font-bold tracking-wide text-[var(--color-text-tertiary)]">{label}</span><b className="block mt-1 text-sm">{value}</b></div>)}
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-text-tertiary)]"><span>Completed items: <b className="text-[var(--color-text-primary)]">{course.completedItems}/{course.totalItems || '—'}</b></span><span>Passed quizzes: <b className="text-[var(--color-text-primary)]">{course.quizzesPassed}</b></span><span>Last activity: <b className="text-[var(--color-text-primary)]">{dateTime(course.lastAccessed)}</b></span></div>
                        </article>;
                      })}
                      {!courses?.courses.length && <p className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No enrolled courses found for this student.</p>}
                    </div>
                  </section>
                )}

                {tab === 'events' && (
                  <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
                    <div className="p-5 border-b border-[var(--color-border-subtle)]"><h3 className="font-bold">Activity Events</h3><p className="text-xs text-[var(--color-text-tertiary)] mt-1">Server-recorded events and learning sessions.</p></div>
                    <div className="divide-y divide-[var(--color-border-subtle)]">
                      {events.map((event) => <div key={event._id} className="p-4 flex items-start gap-3"><div className="h-9 w-9 shrink-0 rounded-full bg-primary-50 text-primary-700 grid place-items-center">•</div><div className="min-w-0"><b className="text-sm capitalize">{event.type.replace(/_/g, ' ')}</b><p className="text-xs text-[var(--color-text-tertiary)]">{dateTime(event.createdAt)}{event.course?.title?.en ? ` · ${event.course.title.en}` : ''}{event.lessonTitle ? ` · ${event.lessonTitle}` : ''}</p></div></div>)}
                      {!events.length && <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No activity events recorded yet.</p>}
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

export default StudentActivity;
