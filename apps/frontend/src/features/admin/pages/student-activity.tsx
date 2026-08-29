import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../lib/axios';

interface RosterRow { _id: string; studentId: string; name: string; email?: string; online: boolean; lastSeenAt: string | null; }
interface EventRow { _id: string; type: string; course?: { _id?: string; title?: { en?: string } }; lessonTitle?: string; resourceName?: string; status?: string; percent?: number; metadata?: { score?: number; totalPoints?: number }; createdAt: string; }
interface SessionRow { _id: string; kind: string; course?: string; lessonId?: string; lessonTitle?: string; resourceName?: string; startedAt: string; endedAt?: string; activeSeconds: number; idleSeconds: number; watchSeconds: number; status: string; }
interface SessionAnalytics { totalActiveSeconds: number; totalIdleSeconds: number; totalWatchSeconds: number; sessionCount: number; byKind: { kind: string; activeSeconds: number; watchSeconds: number; sessions: number }[]; daily: { date: string; activeSeconds: number; watchSeconds: number }[]; sessions: SessionRow[]; }
interface Analytics { totalStudyTimeSeconds: number; avgQuizScore: number | null; avgVideoCompletion: number | null; learningStreakDays: number; quizAttempts: number; quizzesPassed: number; courseProgress: { course: string; completedLessons: number; totalItems: number }[]; }

const fmt = (s = 0) => { if (s < 60) return `${s}s`; const m = Math.floor(s / 60); if (m < 60) return `${m}m ${s % 60}s`; const h = Math.floor(m / 60); return `${h}h ${m % 60}m`; };
const dateTime = (v?: string) => v ? new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const day = (v?: string) => v ? new Date(v).toLocaleDateString() : '—';

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
    try { const r = await api.get('/activity/roster', { params: { search: search || undefined, limit: 100 } }); setRoster(r.data.data || []); }
    catch { setRoster([]); }
  }, [search]);
  useEffect(() => { void loadRoster(); }, [loadRoster]);

  const loadStudent = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [a, s, t] = await Promise.all([
        api.get(`/activity/analytics/${id}`),
        api.get(`/activity/session-analytics/${id}`),
        api.get(`/activity/timeline/${id}`, { params: { limit: 100 } }),
      ]);
      setAnalytics(a.data.data || null); setSessions(s.data.data || null); setEvents(t.data.data || []);
    } catch { setAnalytics(null); setSessions(null); setEvents([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (selected) void loadStudent(selected); }, [selected, loadStudent]);

  const student = useMemo(() => roster.find((x) => x._id === selected) || null, [roster, selected]);
  const visibleDaily = useMemo(() => {
    if (!sessions) return [];
    const cutoff = range === 'last7' ? 7 : range === 'last30' ? 30 : range === 'all' ? 3650 : 1;
    return sessions.daily.slice(-cutoff);
  }, [sessions, range]);

  const exportSessions = () => {
    if (!sessions || !student) return;
    const rows = sessions.sessions.map((s) => [day(s.startedAt), dateTime(s.startedAt), dateTime(s.endedAt), s.kind, s.lessonTitle || s.resourceName || '', fmt(s.activeSeconds), fmt(s.watchSeconds), fmt(s.idleSeconds), s.status]);
    const csv = [['Date', 'Started', 'Ended', 'Type', 'Lesson', 'Active study', 'Media watched', 'Idle', 'Status'], ...rows]
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `student-activity-${student.studentId}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <div className="p-6 lg:p-10 pt-20 lg:pt-10">
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <header><h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">📊 Student Activity</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Authoritative learning sessions, active study time, media watch time, idle time, and learning events.</p></header>
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
        <aside className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card max-h-[78vh] flex flex-col">
          <div className="p-3 border-b border-[var(--color-border-subtle)]"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student ID or name..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm" /></div>
          <div className="overflow-y-auto">{roster.map((s) => <button key={s._id} onClick={() => setSelected(s._id)} className={`w-full text-left px-4 py-3 border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] ${selected === s._id ? 'bg-primary-50 dark:bg-primary-950/20' : ''}`}><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${s.online ? 'bg-green-500' : 'bg-gray-400'}`} /><b className="truncate text-sm">{s.name || s.studentId}</b></div><span className="ml-4 text-xs text-[var(--color-text-tertiary)]">{s.online ? 'Online now' : s.lastSeenAt ? `Last seen ${dateTime(s.lastSeenAt)}` : 'Never seen'}</span></button>)}</div>
        </aside>

        <main className="space-y-5">
          {!student ? <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-16 text-center"><div className="text-4xl">👈</div><p className="mt-3 font-semibold">Select a student to view activity</p></div> : loading ? <div className="rounded-2xl border border-[var(--color-border-default)] p-16 text-center">Loading activity…</div> : <>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{student.name}</h2><p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId} · {student.online ? 'Online now' : 'Offline'}</p></div><div className="flex gap-2"><select value={range} onChange={(e) => setRange(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs"><option value="last7">Last 7 days</option><option value="last30">Last 30 days</option><option value="all">All available</option></select><button onClick={exportSessions} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-secondary)]">Export sessions CSV</button></div></div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {[['Active study', fmt(sessions?.totalActiveSeconds), 'The authoritative study clock'], ['Video/audio watched', fmt(sessions?.totalWatchSeconds), 'Actual media playback'], ['Idle', fmt(sessions?.totalIdleSeconds), 'Inactive/gap time'], ['Sessions', String(sessions?.sessionCount || 0), 'Learning sessions'], ['Quiz score', analytics?.avgQuizScore != null ? `${analytics.avgQuizScore}%` : '—', 'Average'], ['Streak', `${analytics?.learningStreakDays || 0}d`, 'Consecutive learning days']].map(([label, value, hint]) => <div key={label} title={hint} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card"><span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</span><p className="mt-1 text-xl font-bold">{value}</p></div>)}
            </div>

            <div className="flex gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1 w-fit"><button onClick={() => setTab('overview')} className={`rounded-lg px-4 py-2 text-xs font-semibold ${tab === 'overview' ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}>Overview</button><button onClick={() => setTab('sessions')} className={`rounded-lg px-4 py-2 text-xs font-semibold ${tab === 'sessions' ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}>Learning sessions</button><button onClick={() => setTab('events')} className={`rounded-lg px-4 py-2 text-xs font-semibold ${tab === 'events' ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}>Activity events</button></div>

            {tab === 'overview' && <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5">
              <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card"><h3 className="font-bold">Daily learning</h3><p className="text-xs text-[var(--color-text-tertiary)] mt-1">Active study vs media watch time. These values do not sum event durations.</p><div className="mt-5 space-y-3">{visibleDaily.length ? visibleDaily.map((d) => { const max = Math.max(1, ...visibleDaily.map((x) => x.activeSeconds)); const pct = Math.round((d.activeSeconds / max) * 100); return <div key={d.date}><div className="flex justify-between text-xs mb-1"><span>{d.date}</span><b>{fmt(d.activeSeconds)}</b></div><div className="h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden"><div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} /></div></div> }) : <p className="text-sm text-[var(--color-text-tertiary)]">No session data yet.</p>}</div></section>
              <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card"><h3 className="font-bold">By learning type</h3><div className="mt-4 space-y-3">{sessions?.byKind.map((k) => <div key={k.kind} className="flex items-center justify-between rounded-xl bg-[var(--color-surface-secondary)] p-3"><div><b className="capitalize text-sm">{k.kind}</b><p className="text-xs text-[var(--color-text-tertiary)]">{k.sessions} session{k.sessions === 1 ? '' : 's'}</p></div><div className="text-right"><b>{fmt(k.activeSeconds)}</b><p className="text-[10px] text-[var(--color-text-tertiary)]">watch {fmt(k.watchSeconds)}</p></div></div>)}</div></section>
            </div>}

            {tab === 'sessions' && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden"><div className="p-4 border-b border-[var(--color-border-subtle)]"><h3 className="font-bold">Learning sessions</h3><p className="text-xs text-[var(--color-text-tertiary)]">One row = one server-tracked learning session. Duration is never inferred from unrelated events.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-[var(--color-surface-secondary)] text-left text-xs"><th className="p-3">Started</th><th className="p-3">Lesson/resource</th><th className="p-3">Active study</th><th className="p-3">Watched</th><th className="p-3">Idle</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{sessions?.sessions.map((s) => <><tr key={s._id} onClick={() => setExpanded(expanded === s._id ? null : s._id)} className="cursor-pointer hover:bg-[var(--color-surface-secondary)]"><td className="p-3 whitespace-nowrap">{dateTime(s.startedAt)}</td><td className="p-3"><b>{s.lessonTitle || s.resourceName || 'Learning session'}</b><div className="text-[10px] capitalize text-[var(--color-text-tertiary)]">{s.kind}</div></td><td className="p-3 font-semibold">{fmt(s.activeSeconds)}</td><td className="p-3">{fmt(s.watchSeconds)}</td><td className="p-3">{fmt(s.idleSeconds)}</td><td className="p-3 capitalize">{s.status}</td></tr>{expanded === s._id && <tr key={`${s._id}-detail`}><td colSpan={6} className="p-4 bg-[var(--color-surface-secondary)] text-xs"><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><span>Started<br/><b>{dateTime(s.startedAt)}</b></span><span>Ended<br/><b>{dateTime(s.endedAt)}</b></span><span>Active<br/><b>{fmt(s.activeSeconds)}</b></span><span>Idle<br/><b>{fmt(s.idleSeconds)}</b></span></div></td></tr>}</>)}</tbody></table></div>{!sessions?.sessions.length && <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No learning sessions recorded yet.</p>}</section>}

            {tab === 'events' && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden"><div className="p-4 border-b border-[var(--color-border-subtle)]"><h3 className="font-bold">Activity events</h3><p className="text-xs text-[var(--color-text-tertiary)]">Audit/activity stream only. Event duration is intentionally not used as study time.</p></div><div className="divide-y divide-[var(--color-border-subtle)]">{events.map((e) => <div key={e._id} className="p-4 flex items-start justify-between gap-4"><div><b className="text-sm">{e.lessonTitle || e.resourceName || e.type.replace(/_/g, ' ')}</b><p className="text-xs text-[var(--color-text-tertiary)] mt-1">{e.course?.title?.en || 'General activity'} · {dateTime(e.createdAt)}</p></div><div className="text-right text-xs"><span className="capitalize">{e.status || 'recorded'}</span>{e.percent != null && <p>{e.percent}%</p>}</div></div>)}{!events.length && <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No events recorded.</p>}</div></section>}
          </>}
        </main>
      </div>
    </div>;
}

export default StudentActivity;
