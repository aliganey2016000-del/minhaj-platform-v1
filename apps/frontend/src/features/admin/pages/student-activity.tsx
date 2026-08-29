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

interface EventRow {
  _id: string;
  type: string;
  course?: { _id?: string; title?: { en?: string } };
  lessonTitle?: string;
  resourceName?: string;
  status?: string;
  percent?: number;
  metadata?: { score?: number; totalPoints?: number };
  createdAt: string;
}

interface SessionRow {
  _id: string;
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
  byKind: Array<{
    kind: string;
    activeSeconds: number;
    watchSeconds: number;
    sessions: number;
  }>;
  daily: Array<{
    date: string;
    activeSeconds: number;
    watchSeconds: number;
  }>;
  sessions: SessionRow[];
}

interface Analytics {
  avgQuizScore: number | null;
  learningStreakDays: number;
}

interface QuizSummary {
  key: string;
  lessonTitle: string;
  courseTitle: string;
  attempts: number;
  avgPoints: number | null;
  avgTotalPoints: number | null;
  avgPercent: number | null;
  startedAt: string;
  endedAt: string;
  status: string;
}

const fmt = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  if (minutes < 60) return `${minutes}m ${safe % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const dateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

const day = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');

const isAssessmentEvent = (event: EventRow) =>
  Boolean(event.lessonTitle || event.resourceName) &&
  Boolean(
    event.metadata?.score != null ||
      event.metadata?.totalPoints != null ||
      event.percent != null ||
      /quiz|assessment|attempt|submission|passed|failed/i.test(event.type),
  );

const avg = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function StudentActivity({ basePath = '/admin' }: { basePath?: string }) {
  void basePath;

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [sessions, setSessions] = useState<SessionAnalytics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState('last30');
  const [tab, setTab] = useState<'overview' | 'sessions' | 'events'>('overview');
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    try {
      const response = await api.get('/activity/roster', {
        params: { search: search || undefined, limit: 100 },
      });
      setRoster(response.data.data || []);
    } catch {
      setRoster([]);
    }
  }, [search]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const loadStudent = useCallback(async (studentId: string) => {
    setLoading(true);
    try {
      const [analyticsResponse, sessionResponse, timelineResponse] = await Promise.all([
        api.get(`/activity/analytics/${studentId}`),
        api.get(`/activity/session-analytics/${studentId}`),
        api.get(`/activity/timeline/${studentId}`, { params: { limit: 100 } }),
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

  useEffect(() => {
    if (selected) void loadStudent(selected);
  }, [selected, loadStudent]);

  const student = useMemo(
    () => roster.find((item) => item._id === selected) || null,
    [roster, selected],
  );

  const visibleDaily = useMemo(() => {
    if (!sessions) return [];
    const cutoff = range === 'last7' ? 7 : range === 'last30' ? 30 : 3650;
    return sessions.daily.slice(-cutoff);
  }, [sessions, range]);

  const quizSummaries = useMemo<QuizSummary[]>(() => {
    const groups = new Map<string, EventRow[]>();

    for (const event of events) {
      if (!isAssessmentEvent(event)) continue;

      const lessonTitle = event.lessonTitle || event.resourceName || 'Unnamed lesson';
      const courseId = event.course?._id || event.course?.title?.en || 'general';
      const key = `${courseId}::${lessonTitle.trim().toLowerCase()}`;

      const group = groups.get(key) || [];
      group.push(event);
      groups.set(key, group);
    }

    return Array.from(groups.entries())
      .map(([key, group]) => {
        const ordered = [...group].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        const pointValues = ordered
          .map((event) => event.metadata?.score)
          .filter((value): value is number => typeof value === 'number');
        const totalValues = ordered
          .map((event) => event.metadata?.totalPoints)
          .filter((value): value is number => typeof value === 'number');
        const percentValues = ordered
          .map((event) => event.percent)
          .filter((value): value is number => typeof value === 'number');

        const latest = ordered[ordered.length - 1];

        return {
          key,
          lessonTitle: latest.lessonTitle || latest.resourceName || 'Unnamed lesson',
          courseTitle: latest.course?.title?.en || 'General activity',
          attempts: ordered.length,
          avgPoints: avg(pointValues),
          avgTotalPoints: avg(totalValues),
          avgPercent: avg(percentValues),
          startedAt: ordered[0].createdAt,
          endedAt: latest.createdAt,
          status: latest.status || 'Recorded',
        };
      })
      .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
  }, [events]);

  const nonAssessmentEvents = useMemo(
    () => events.filter((event) => !isAssessmentEvent(event)),
    [events],
  );

  const exportSessions = () => {
    if (!sessions || !student) return;

    const rows = sessions.sessions.map((session) => [
      day(session.startedAt),
      dateTime(session.startedAt),
      dateTime(session.endedAt),
      session.kind,
      session.lessonTitle || session.resourceName || '',
      fmt(session.activeSeconds),
      fmt(session.watchSeconds),
      fmt(session.idleSeconds),
      session.status,
    ]);

    const csv = [
      ['Date', 'Started', 'Ended', 'Type', 'Lesson', 'Active study', 'Media watched', 'Idle', 'Status'],
      ...rows,
    ]
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
    ['Active study', fmt(sessions?.totalActiveSeconds), 'The authoritative study clock'],
    ['Video/audio watched', fmt(sessions?.totalWatchSeconds), 'Actual media playback'],
    ['Idle', fmt(sessions?.totalIdleSeconds), 'Inactive/gap time'],
    ['Sessions', String(sessions?.sessionCount || 0), 'Learning sessions'],
    ['Quiz score', analytics?.avgQuizScore != null ? `${Math.round(analytics.avgQuizScore)}%` : '—', 'Average quiz score'],
    ['Streak', `${analytics?.learningStreakDays || 0}d`, 'Consecutive learning days'],
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">
            📊 Student Activity
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
            Authoritative learning sessions, active study time, media watch time, idle time, and learning events.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
          <aside className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card max-h-[78vh] flex flex-col">
            <div className="p-3 border-b border-[var(--color-border-subtle)]">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search student ID or name..."
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm"
              />
            </div>
            <div className="overflow-y-auto">
              {roster.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => setSelected(item._id)}
                  className={`w-full text-left px-4 py-3 border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] ${
                    selected === item._id ? 'bg-primary-50 dark:bg-primary-950/20' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${item.online ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <b className="truncate text-sm">{item.name || item.studentId}</b>
                  </div>
                  <span className="ml-4 text-xs text-[var(--color-text-tertiary)]">
                    {item.online
                      ? 'Online now'
                      : item.lastSeenAt
                        ? `Last seen ${dateTime(item.lastSeenAt)}`
                        : 'Never seen'}
                  </span>
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
              <div className="rounded-2xl border border-[var(--color-border-default)] p-16 text-center">
                Loading activity…
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">{student.name}</h2>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {student.studentId} · {student.online ? 'Online now' : 'Offline'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={range}
                      onChange={(event) => setRange(event.target.value)}
                      className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs"
                    >
                      <option value="last7">Last 7 days</option>
                      <option value="last30">Last 30 days</option>
                      <option value="all">All available</option>
                    </select>
                    <button
                      type="button"
                      onClick={exportSessions}
                      className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-secondary)]"
                    >
                      Export sessions CSV
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {summaryCards.map(([label, value, hint]) => (
                    <div
                      key={label}
                      title={hint}
                      className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                        {label}
                      </span>
                      <p className="mt-1 text-xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex max-w-full overflow-x-auto gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1 w-fit">
                  <button type="button" onClick={() => setTab('overview')} className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold ${tab === 'overview' ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}>
                    Overview
                  </button>
                  <button type="button" onClick={() => setTab('sessions')} className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold ${tab === 'sessions' ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}>
                    Learning sessions
                  </button>
                  <button type="button" onClick={() => setTab('events')} className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold ${tab === 'events' ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}>
                    Activity events
                  </button>
                </div>

                {tab === 'overview' && (
                  <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5">
                    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                      <h3 className="font-bold">Daily learning</h3>
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        Active study vs media watch time. These values do not sum event durations.
                      </p>
                      <div className="mt-5 space-y-3">
                        {visibleDaily.length ? (
                          visibleDaily.map((item) => {
                            const max = Math.max(1, ...visibleDaily.map((entry) => entry.activeSeconds));
                            const percent = Math.round((item.activeSeconds / max) * 100);
                            return (
                              <div key={item.date}>
                                <div className="flex justify-between text-xs mb-1">
                                  <span>{item.date}</span>
                                  <b>{fmt(item.activeSeconds)}</b>
                                </div>
                                <div className="h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                                  <div className="h-full rounded-full bg-primary-500" style={{ width: `${percent}%` }} />
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-sm text-[var(--color-text-tertiary)]">No session data yet.</p>
                        )}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                      <h3 className="font-bold">By learning type</h3>
                      <div className="mt-4 space-y-3">
                        {sessions?.byKind.map((item) => (
                          <div key={item.kind} className="flex items-center justify-between rounded-xl bg-[var(--color-surface-secondary)] p-3">
                            <div>
                              <b className="capitalize text-sm">{item.kind}</b>
                              <p className="text-xs text-[var(--color-text-tertiary)]">
                                {item.sessions} session{item.sessions === 1 ? '' : 's'}
                              </p>
                            </div>
                            <div className="text-right">
                              <b>{fmt(item.activeSeconds)}</b>
                              <p className="text-[10px] text-[var(--color-text-tertiary)]">watch {fmt(item.watchSeconds)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}

                {tab === 'sessions' && (
                  <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border-subtle)]">
                      <h3 className="font-bold">Learning sessions</h3>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        One row = one server-tracked learning session. Duration is never inferred from unrelated events.
                      </p>
                    </div>

                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[var(--color-surface-secondary)] text-left text-xs">
                            <th className="p-3">Started</th>
                            <th className="p-3">Lesson/resource</th>
                            <th className="p-3">Active study</th>
                            <th className="p-3">Watched</th>
                            <th className="p-3">Idle</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)]">
                          {sessions?.sessions.map((session) => (
                            <tr key={session._id}>
                              <td className="p-3 whitespace-nowrap">{dateTime(session.startedAt)}</td>
                              <td className="p-3">
                                <b>{session.lessonTitle || session.resourceName || 'Learning session'}</b>
                                <div className="text-[10px] capitalize text-[var(--color-text-tertiary)]">{session.kind}</div>
                              </td>
                              <td className="p-3 font-semibold">{fmt(session.activeSeconds)}</td>
                              <td className="p-3">{fmt(session.watchSeconds)}</td>
                              <td className="p-3">{fmt(session.idleSeconds)}</td>
                              <td className="p-3 capitalize">{session.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="md:hidden divide-y divide-[var(--color-border-subtle)]">
                      {sessions?.sessions.map((session) => (
                        <button
                          key={session._id}
                          type="button"
                          onClick={() => setExpanded(expanded === session._id ? null : session._id)}
                          className="w-full text-left p-4"
                        >
                          <div className="font-semibold break-words">
                            {session.lessonTitle || session.resourceName || 'Learning session'}
                          </div>
                          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                            {dateTime(session.startedAt)} · <span className="capitalize">{session.status}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <span>Active<br /><b>{fmt(session.activeSeconds)}</b></span>
                            <span>Watched<br /><b>{fmt(session.watchSeconds)}</b></span>
                            <span>Idle<br /><b>{fmt(session.idleSeconds)}</b></span>
                          </div>
                          {expanded === session._id && (
                            <div className="mt-3 rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs">
                              <div>Started: <b>{dateTime(session.startedAt)}</b></div>
                              <div>Ended: <b>{dateTime(session.endedAt)}</b></div>
                              <div>Type: <b className="capitalize">{session.kind}</b></div>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>

                    {!sessions?.sessions.length && (
                      <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">
                        No learning sessions recorded yet.
                      </p>
                    )}
                  </section>
                )}

                {tab === 'events' && (
                  <div className="space-y-5">
                    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
                      <div className="p-4 border-b border-[var(--color-border-subtle)]">
                        <h3 className="font-bold">Lesson quiz results</h3>
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                          One row per lesson. Multiple quiz attempts are consolidated into one row with average points, score, start, and end.
                        </p>
                      </div>

                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-[var(--color-surface-secondary)] text-left text-xs">
                              <th className="p-3">Lesson</th>
                              <th className="p-3">Attempts</th>
                              <th className="p-3">Avg points</th>
                              <th className="p-3">Avg score</th>
                              <th className="p-3">Start</th>
                              <th className="p-3">End</th>
                              <th className="p-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--color-border-subtle)]">
                            {quizSummaries.map((summary) => (
                              <tr key={summary.key}>
                                <td className="p-3 min-w-[220px]">
                                  <b className="break-words">{summary.lessonTitle}</b>
                                  <div className="text-[10px] text-[var(--color-text-tertiary)]">{summary.courseTitle}</div>
                                </td>
                                <td className="p-3">{summary.attempts}</td>
                                <td className="p-3 font-semibold">
                                  {summary.avgPoints != null
                                    ? `${summary.avgPoints.toFixed(1)}${summary.avgTotalPoints != null ? ` / ${summary.avgTotalPoints.toFixed(1)}` : ''}`
                                    : '—'}
                                </td>
                                <td className="p-3">
                                  {summary.avgPercent != null ? `${Math.round(summary.avgPercent)}%` : '—'}
                                </td>
                                <td className="p-3 whitespace-nowrap">{dateTime(summary.startedAt)}</td>
                                <td className="p-3 whitespace-nowrap">{dateTime(summary.endedAt)}</td>
                                <td className="p-3 capitalize">{summary.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="md:hidden divide-y divide-[var(--color-border-subtle)]">
                        {quizSummaries.map((summary) => (
                          <div key={summary.key} className="p-4">
                            <div className="font-semibold break-words">{summary.lessonTitle}</div>
                            <div className="text-xs text-[var(--color-text-tertiary)] mt-1">{summary.courseTitle}</div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                              <span>Attempts<br /><b>{summary.attempts}</b></span>
                              <span>Avg points<br /><b>{summary.avgPoints != null ? `${summary.avgPoints.toFixed(1)}${summary.avgTotalPoints != null ? ` / ${summary.avgTotalPoints.toFixed(1)}` : ''}` : '—'}</b></span>
                              <span>Avg score<br /><b>{summary.avgPercent != null ? `${Math.round(summary.avgPercent)}%` : '—'}</b></span>
                              <span>Status<br /><b className="capitalize">{summary.status}</b></span>
                            </div>
                            <div className="mt-3 text-xs text-[var(--color-text-tertiary)]">
                              Start: <b>{dateTime(summary.startedAt)}</b><br />
                              End: <b>{dateTime(summary.endedAt)}</b>
                            </div>
                          </div>
                        ))}
                      </div>

                      {!quizSummaries.length && (
                        <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">
                          No lesson quiz results recorded yet.
                        </p>
                      )}
                    </section>

                    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
                      <div className="p-4 border-b border-[var(--color-border-subtle)]">
                        <h3 className="font-bold">Other activity</h3>
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                          Audit/activity stream only. Event duration is intentionally not used as study time.
                        </p>
                      </div>
                      <div className="divide-y divide-[var(--color-border-subtle)]">
                        {nonAssessmentEvents.map((event) => (
                          <div key={event._id} className="p-4 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <b className="text-sm break-words">
                                {event.lessonTitle || event.resourceName || event.type.replace(/_/g, ' ')}
                              </b>
                              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                                {event.course?.title?.en || 'General activity'} · {dateTime(event.createdAt)}
                              </p>
                            </div>
                            <div className="shrink-0 text-right text-xs">
                              <span className="capitalize">{event.status || 'recorded'}</span>
                              {event.percent != null && <p>{event.percent}%</p>}
                            </div>
                          </div>
                        ))}
                        {!nonAssessmentEvents.length && (
                          <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">
                            No other events recorded.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
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
