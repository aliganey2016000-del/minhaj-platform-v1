import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../lib/axios';

interface RosterRow {
  _id: string;
  studentId: string;
  name: string;
  email?: string;
  online: boolean;
  lastSeenAt: string | null;
}

interface ActivityEvent {
  _id: string;
  type: string;
  loginSessionId?: string;
  course?: { _id?: string; title?: { en?: string } };
  lessonId?: string;
  lessonTitle?: string;
  resourceName?: string;
  status?: string;
  percent?: number;
  durationSeconds?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

interface SessionRow {
  _id: string;
  loginSessionId?: string;
  kind: string;
  course?: string;
  lessonId?: string;
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
  byKind: Array<{ kind: string; activeSeconds: number; watchSeconds: number; sessions: number }>;
  daily: Array<{ date: string; activeSeconds: number; watchSeconds: number }>;
  sessions: SessionRow[];
}

interface Analytics {
  avgQuizScore: number | null;
  learningStreakDays: number;
}

const fmt = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  if (minutes < 60) return `${minutes}m ${safe % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const dateTime = (value?: string) => value
  ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

const timeOnly = (value?: string) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  : '—';

const normalize = (value?: string) => (value || '').trim().toLowerCase();

function spanSeconds(start?: string, end?: string) {
  if (!start) return 0;
  const finish = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, Math.floor((finish - new Date(start).getTime()) / 1000));
}

function eventInterval(event: ActivityEvent) {
  const start = event.metadata?.startTime || event.metadata?.startedAt || event.createdAt;
  const end = event.metadata?.endTime || event.metadata?.endedAt || (
    event.durationSeconds ? new Date(new Date(event.createdAt).getTime() + event.durationSeconds * 1000).toISOString() : event.createdAt
  );
  return { start: String(start), end: String(end) };
}

function isQuizEvent(event: ActivityEvent) {
  return /quiz|assessment|attempt|submission|passed|failed/i.test(event.type)
    || event.metadata?.score != null
    || event.metadata?.totalPoints != null;
}

function matchesSession(event: ActivityEvent, session: SessionRow) {
  if (session.loginSessionId && event.loginSessionId && session.loginSessionId !== event.loginSessionId) return false;
  if (session.course && event.course?._id && session.course !== event.course._id) return false;
  if (session.lessonId && event.lessonId) return session.lessonId === event.lessonId;
  const eventTitle = normalize(event.lessonTitle || event.resourceName);
  const sessionTitle = normalize(session.lessonTitle || session.resourceName);
  if (eventTitle && sessionTitle) return eventTitle === sessionTitle;
  const at = new Date(event.createdAt).getTime();
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt || Date.now()).getTime();
  return at >= start - 30000 && at <= end + 30000;
}

export function StudentActivity({ basePath = '/admin' }: { basePath?: string }) {
  void basePath;
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [sessions, setSessions] = useState<SessionAnalytics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState('last30');
  const [tab, setTab] = useState<'overview' | 'sessions' | 'events'>('overview');
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
      const [analyticsResponse, sessionResponse, timelineResponse] = await Promise.all([
        api.get(`/activity/analytics/${studentId}`),
        api.get(`/activity/session-analytics/${studentId}`),
        api.get(`/activity/timeline/${studentId}`, { params: { limit: 200 } }),
      ]);
      setAnalytics(analyticsResponse.data.data || null);
      setSessions(sessionResponse.data.data || null);
      setEvents(timelineResponse.data.data || []);
    } catch {
      setAnalytics(null);
      setSessions(null);
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
    const ordered = [...events]
      .filter((event) => event.type === 'login' && event.loginSessionId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    ordered.forEach((event) => {
      if (event.loginSessionId && !map.has(event.loginSessionId)) map.set(event.loginSessionId, map.size + 1);
    });
    const sessionIds = [...new Set((sessions?.sessions || []).map((session) => session.loginSessionId).filter(Boolean) as string[])];
    sessionIds.sort((a, b) => {
      const sa = sessions?.sessions.find((s) => s.loginSessionId === a)?.startedAt || '';
      const sb = sessions?.sessions.find((s) => s.loginSessionId === b)?.startedAt || '';
      return new Date(sa).getTime() - new Date(sb).getTime();
    });
    sessionIds.forEach((id) => { if (!map.has(id)) map.set(id, map.size + 1); });
    return map;
  }, [events, sessions]);

  const lessonCards = useMemo(() => {
    if (!sessions) return [];
    return [...sessions.sessions]
      .filter((session) => session.kind === 'lesson' || session.lessonTitle || session.resourceName)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .map((session) => {
        const related = events
          .filter((event) => matchesSession(event, session))
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const quizzes = related.filter(isQuizEvent);
        const videos = related.filter((event) => /video|audio/i.test(event.type));
        const courseTitle = related.find((event) => event.course?.title?.en)?.course?.title?.en || 'Course';
        return {
          session,
          related,
          quizzes,
          videos,
          courseTitle,
          loginNumber: session.loginSessionId ? loginSequence.get(session.loginSessionId) : undefined,
        };
      });
  }, [sessions, events, loginSequence]);

  const timeline = useMemo(() => {
    const rows: Array<{ id: string; at: string; type: 'login' | 'logout' | 'lesson'; event?: ActivityEvent; card?: typeof lessonCards[number] }> = [];
    events.filter((event) => event.type === 'login' || event.type === 'logout').forEach((event) => {
      rows.push({ id: `event-${event._id}`, at: event.createdAt, type: event.type as 'login' | 'logout', event });
    });
    lessonCards.forEach((card) => rows.push({ id: `lesson-${card.session._id}`, at: card.session.startedAt, type: 'lesson', card }));
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [events, lessonCards]);

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

  const summaryCards = [
    ['Active study', fmt(sessions?.totalActiveSeconds), 'Server-measured study time'],
    ['Video/audio watched', fmt(sessions?.totalWatchSeconds), 'Actual media playback'],
    ['Idle', fmt(sessions?.totalIdleSeconds), 'Inactive/gap time'],
    ['Sessions', String(sessions?.sessionCount || 0), 'Lesson visits tracked'],
    ['Quiz score', analytics?.avgQuizScore != null ? `${Math.round(analytics.avgQuizScore)}%` : '—', 'Average quiz score'],
    ['Streak', `${analytics?.learningStreakDays || 0}d`, 'Consecutive learning days'],
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">📊 Student Activity</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
            Chronological login activity with one complete card for every lesson visit.
          </p>
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
                    <select value={range} onChange={(event) => setRange(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs">
                      <option value="last7">Last 7 days</option><option value="last30">Last 30 days</option><option value="all">All available</option>
                    </select>
                    <button type="button" onClick={exportSessions} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-secondary)]">Export sessions CSV</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {summaryCards.map(([label, value, hint]) => <div key={label} title={hint} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card"><span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</span><p className="mt-1 text-xl font-bold">{value}</p></div>)}
                </div>

                <div className="flex max-w-full overflow-x-auto gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1 w-fit">
                  {(['overview', 'sessions', 'events'] as const).map((name) => <button key={name} type="button" onClick={() => setTab(name)} className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold ${tab === name ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}>{name === 'events' ? 'Activity Events' : name === 'sessions' ? 'Learning sessions' : 'Overview'}</button>)}
                </div>

                {tab === 'overview' && (
                  <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5">
                    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                      <h3 className="font-bold">Daily learning</h3><p className="text-xs text-[var(--color-text-tertiary)] mt-1">Active study vs media watch time.</p>
                      <div className="mt-5 space-y-3">{visibleDaily.length ? visibleDaily.map((item) => { const max = Math.max(1, ...visibleDaily.map((entry) => entry.activeSeconds)); const percent = Math.round((item.activeSeconds / max) * 100); return <div key={item.date}><div className="flex justify-between text-xs mb-1"><span>{item.date}</span><b>{fmt(item.activeSeconds)}</b></div><div className="h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden"><div className="h-full rounded-full bg-primary-500" style={{ width: `${percent}%` }} /></div></div>; }) : <p className="text-sm text-[var(--color-text-tertiary)]">No session data yet.</p>}</div>
                    </section>
                    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card"><h3 className="font-bold">By learning type</h3><div className="mt-4 space-y-3">{sessions?.byKind.map((item) => <div key={item.kind} className="flex items-center justify-between rounded-xl bg-[var(--color-surface-secondary)] p-3"><div><b className="capitalize text-sm">{item.kind}</b><p className="text-xs text-[var(--color-text-tertiary)]">{item.sessions} session{item.sessions === 1 ? '' : 's'}</p></div><div className="text-right"><b>{fmt(item.activeSeconds)}</b><p className="text-[10px] text-[var(--color-text-tertiary)]">watch {fmt(item.watchSeconds)}</p></div></div>)}</div></section>
                  </div>
                )}

                {tab === 'sessions' && (
                  <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border-subtle)]"><h3 className="font-bold">Learning sessions</h3><p className="text-xs text-[var(--color-text-tertiary)]">Each lesson visit is an independent server-tracked session.</p></div>
                    <div className="divide-y divide-[var(--color-border-subtle)]">{sessions?.sessions.map((session) => <button key={session._id} type="button" onClick={() => setExpanded(expanded === session._id ? null : session._id)} className="w-full text-left p-4 hover:bg-[var(--color-surface-secondary)]"><div className="flex flex-wrap items-start justify-between gap-2"><div><b>{session.lessonTitle || session.resourceName || 'Learning session'}</b><div className="text-xs text-[var(--color-text-tertiary)] mt-1">{dateTime(session.startedAt)} · {session.status}</div></div><span className="text-xs font-semibold">Total {fmt(spanSeconds(session.startedAt, session.endedAt))}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span>Active<br /><b>{fmt(session.activeSeconds)}</b></span><span>Video<br /><b>{fmt(session.watchSeconds)}</b></span><span>Idle<br /><b>{fmt(session.idleSeconds)}</b></span></div>{expanded === session._id && <div className="mt-3 rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs"><div>Login session: <b>{session.loginSessionId ? `#${loginSequence.get(session.loginSessionId) || '—'}` : 'Legacy'}</b></div><div>Started: <b>{dateTime(session.startedAt)}</b></div><div>Ended: <b>{dateTime(session.endedAt)}</b></div></div>}</button>)}</div>
                    {!sessions?.sessions.length && <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No learning sessions recorded yet.</p>}
                  </section>
                )}

                {tab === 'events' && (
                  <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border-subtle)]"><h3 className="font-bold">Activity Events</h3><p className="text-xs text-[var(--color-text-tertiary)] mt-1">Chronological order. Login/logout rows stay separate, and every lesson visit gets its own complete card.</p></div>
                    <div className="divide-y divide-[var(--color-border-subtle)]">
                      {timeline.map((row) => {
                        if (row.type === 'login' || row.type === 'logout') {
                          const number = row.event?.loginSessionId ? loginSequence.get(row.event.loginSessionId) : undefined;
                          return <div key={row.id} className="p-4 flex items-center gap-4"><div className={`h-9 w-9 rounded-full flex items-center justify-center ${row.type === 'login' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{row.type === 'login' ? '↪' : '↩'}</div><div><b className="text-sm capitalize">{row.type}</b><p className="text-xs text-[var(--color-text-tertiary)]">{timeOnly(row.at)} · {dateTime(row.at)}{number ? ` · Login session #${number}` : ''}</p></div></div>;
                        }

                        const card = row.card!;
                        const session = card.session;
                        return <div key={row.id} className="p-4 sm:p-5 bg-[var(--color-surface-secondary)]/40">
                          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-700">Lesson</span>{card.loginNumber && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold">Login session #{card.loginNumber}</span>}</div><h4 className="mt-2 text-lg font-bold break-words">{session.lessonTitle || session.resourceName || 'Learning session'}</h4><p className="text-xs text-[var(--color-text-tertiary)]">{card.courseTitle}</p></div>
                              <div className="text-right text-xs"><div>Started <b>{timeOnly(session.startedAt)}</b></div><div>Ended <b>{timeOnly(session.endedAt)}</b></div><div className="mt-1 font-bold">Total {fmt(spanSeconds(session.startedAt, session.endedAt))}</div></div>
                            </div>

                            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><span>Active study</span><br /><b>{fmt(session.activeSeconds)}</b></div><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><span>Video/audio</span><br /><b>{fmt(session.watchSeconds)}</b></div><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><span>Idle</span><br /><b>{fmt(session.idleSeconds)}</b></div><div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><span>Status</span><br /><b className="capitalize">{session.status}</b></div></div>

                            <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
                              <div className="rounded-xl border border-[var(--color-border-subtle)] p-4"><h5 className="font-bold text-sm">Study interval</h5><p className="mt-2 text-xs">{dateTime(session.startedAt)}</p><p className="text-xs">→ {dateTime(session.endedAt)}</p><p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Active: {fmt(session.activeSeconds)} · Idle: {fmt(session.idleSeconds)}</p></div>
                              <div className="rounded-xl border border-[var(--color-border-subtle)] p-4"><h5 className="font-bold text-sm">Video / audio intervals</h5>{card.videos.length ? <div className="mt-2 space-y-2">{card.videos.map((event) => { const interval = eventInterval(event); return <div key={event._id} className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-xs"><div>{timeOnly(interval.start)} → {timeOnly(interval.end)}</div><b>{event.type.replace(/_/g, ' ')}</b>{event.percent != null ? ` · ${Math.round(event.percent)}%` : ''}</div>; })}</div> : <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">No video interval event recorded.</p>}</div>
                              <div className="rounded-xl border border-[var(--color-border-subtle)] p-4"><h5 className="font-bold text-sm">Quiz / assessment</h5>{card.quizzes.length ? <div className="mt-2 space-y-2">{card.quizzes.map((event, index) => { const interval = eventInterval(event); const score = typeof event.metadata?.score === 'number' ? event.metadata.score : undefined; const total = typeof event.metadata?.totalPoints === 'number' ? event.metadata.totalPoints : undefined; const percent = typeof event.percent === 'number' ? event.percent : (score != null && total ? (score / total) * 100 : undefined); return <div key={event._id} className="rounded-lg bg-[var(--color-surface-secondary)] p-2 text-xs"><div className="font-semibold">Attempt {index + 1}</div><div>{timeOnly(interval.start)} → {timeOnly(interval.end)}</div><div className="mt-1">Score: <b>{score != null ? `${score}${total != null ? ` / ${total}` : ''}` : percent != null ? `${Math.round(percent)}%` : '—'}</b></div><div>Status: <b className="capitalize">{event.status || 'recorded'}</b></div></div>; })}</div> : <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">No quiz/assessment attempts recorded.</p>}</div>
                            </div>

                            <div className="mt-4 text-xs text-[var(--color-text-tertiary)]">Quiz attempts: <b className="text-[var(--color-text-primary)]">{card.quizzes.length}</b> · Video watched: <b className="text-[var(--color-text-primary)]">{fmt(session.watchSeconds)}</b></div>
                          </div>
                        </div>;
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

export default StudentActivity;
