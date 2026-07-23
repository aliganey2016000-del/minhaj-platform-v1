/**
 * Student Activity Tracking & Analytics — roster with live online/offline
 * status, a per-student chronological timeline, analytics summary, and
 * CSV/Excel export. Shared between the Admin and Teacher portals (teacher
 * sees only students enrolled in their own courses — enforced server-side).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import api from '../../../lib/axios';

interface RosterRow {
  _id: string;
  studentId: string;
  name: string;
  email?: string;
  school?: string;
  online: boolean;
  lastSeenAt: string | null;
  lastActivityAt: string | null;
  lastActivityType: string | null;
  avgQuizScore: number | null;
  quizAttempts: number;
}

interface TimelineEvent {
  _id: string;
  type: string;
  course?: { title?: { en?: string } };
  lessonId?: string;
  resourceName?: string;
  status?: string;
  durationSeconds?: number;
  percent?: number;
  device?: string;
  browser?: string;
  os?: string;
  ip?: string;
  createdAt: string;
}

interface CourseOption { _id: string; title?: { en?: string }; }

interface Analytics {
  totalStudyTimeSeconds: number;
  dailyStudyTime: { date: string; seconds: number }[];
  courseProgress: { course: string; status: string; completedLessons: number; totalItems: number; lastAccessed: string }[];
  avgQuizScore: number | null;
  quizAttempts: number;
  quizzesPassed: number;
  avgVideoCompletion: number | null;
  learningStreakDays: number;
  lastActivity: { type: string; at: string; resourceName?: string } | null;
  online: boolean;
}

const DATE_PRESETS = [
  { value: '', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
];

const ACTIVITY_TYPES = [
  '', 'login', 'logout', 'session_end', 'page_view', 'course_view', 'course_enrolled',
  'lesson_view', 'video_progress', 'pdf_view', 'audio_progress', 'download',
  'quiz_attempt', 'exam_attempt', 'assignment_submitted', 'assignment_graded',
  'certificate_earned', 'note_created', 'bookmark_added', 'forum_post',
  'message_sent', 'notification_viewed',
];

/** Start time isn't stored separately — it's derived from End (createdAt) minus Duration, so a point event (no duration) shows the same Start/End. */
function computeStart(createdAt: string, durationSeconds?: number): Date {
  const end = new Date(createdAt);
  if (!durationSeconds) return end;
  return new Date(end.getTime() - durationSeconds * 1000);
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface StudentActivityProps {
  basePath?: string;
}

export function StudentActivity({ basePath = '/admin' }: StudentActivityProps) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<RosterRow | null>(null);

  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Filters (apply to the selected student's timeline)
  const [datePreset, setDatePreset] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([]);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    api.get('/courses', { params: { limit: 200 } })
      .then(({ data }) => setCourseOptions(data.data || []))
      .catch(() => setCourseOptions([]));
  }, []);

  const fetchRoster = useCallback(async () => {
    setRosterLoading(true);
    try {
      const { data } = await api.get('/activity/roster', { params: { search: search || undefined, limit: 100 } });
      setRoster(data.data || []);
    } catch {
      setRoster([]);
    } finally {
      setRosterLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchRoster(); }, [fetchRoster]);

  // Live presence updates
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    const socket = io({ path: '/socket.io', auth: { token } });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('presence:watch'));
    // Roster rows are keyed by Student._id, not User._id, so a presence
    // event (which only carries userId) can't be matched to a row directly —
    // just refetch the roster, which is cheap and correct.
    socket.on('presence:update', () => { void fetchRoster(); });
    return () => { socket.disconnect(); socketRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTimelineAndAnalytics = useCallback(async (student: RosterRow) => {
    setTimelineLoading(true);
    try {
      const params: any = { limit: 100 };
      if (datePreset && datePreset !== 'custom') params.datePreset = datePreset;
      if (datePreset === 'custom') { if (dateFrom) params.dateFrom = dateFrom; if (dateTo) params.dateTo = dateTo; }
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (courseFilter) params.course = courseFilter;
      if (timelineSearch) params.search = timelineSearch;

      const [timelineRes, analyticsRes] = await Promise.all([
        api.get(`/activity/timeline/${student._id}`, { params }),
        api.get(`/activity/analytics/${student._id}`),
      ]);
      setTimeline(timelineRes.data.data || []);
      setAnalytics(analyticsRes.data.data);
    } catch {
      setTimeline([]);
      setAnalytics(null);
    } finally {
      setTimelineLoading(false);
    }
  }, [datePreset, dateFrom, dateTo, typeFilter, statusFilter, courseFilter, timelineSearch]);

  useEffect(() => {
    if (selectedStudent) fetchTimelineAndAnalytics(selectedStudent);
  }, [selectedStudent, fetchTimelineAndAnalytics]);

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!selectedStudent) return;
    try {
      const token = localStorage.getItem('accessToken') || '';
      const params = new URLSearchParams();
      params.set('format', format);
      if (datePreset && datePreset !== 'custom') params.set('datePreset', datePreset);
      if (datePreset === 'custom') { if (dateFrom) params.set('dateFrom', dateFrom); if (dateTo) params.set('dateTo', dateTo); }
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (courseFilter) params.set('course', courseFilter);

      const response = await fetch(`${api.defaults.baseURL}/activity/export/${selectedStudent._id}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `activity-${selectedStudent.name.replace(/\s+/g, '')}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // best-effort — no toast infra imported here to keep this page self-contained
    }
  };

  void basePath;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">📊 Student Activity</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Real-time presence, learning activity timeline, and analytics.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
          {/* ── Roster ── */}
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden flex flex-col max-h-[75vh]">
            <div className="p-3 border-b border-[var(--color-border-subtle)]">
              <input
                type="text"
                placeholder="Search by student ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {rosterLoading ? (
                <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>
              ) : roster.length === 0 ? (
                <p className="text-center text-sm text-[var(--color-text-tertiary)] py-10">No students found.</p>
              ) : (
                roster.map((s) => (
                  <button
                    key={s._id}
                    onClick={() => setSelectedStudent(s)}
                    className={`w-full text-left px-4 py-3 border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-tertiary)] transition-colors ${selectedStudent?._id === s._id ? 'bg-primary-50 dark:bg-primary-950/20' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${s.online ? 'bg-green-500' : 'bg-[var(--color-border-default)]'}`} />
                      <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{s.name || s.studentId}</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 ml-4">
                      {s.online ? 'Online now' : `Last seen ${formatRelative(s.lastSeenAt)}`}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Detail Pane ── */}
          <div className="space-y-5">
            {!selectedStudent ? (
              <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card">
                <p className="text-4xl mb-4">👈</p>
                <p className="text-lg font-semibold text-[var(--color-text-primary)]">Select a student to view their activity</p>
              </div>
            ) : (
              <>
                {/* Analytics summary */}
                {analytics && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
                      <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase">Total Study Time</span>
                      <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1">{formatDuration(analytics.totalStudyTimeSeconds)}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
                      <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase">Avg Quiz Score</span>
                      <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1">{analytics.avgQuizScore != null ? `${analytics.avgQuizScore}%` : '—'}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
                      <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase">Video Completion</span>
                      <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1">{analytics.avgVideoCompletion != null ? `${analytics.avgVideoCompletion}%` : '—'}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
                      <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase">Streak</span>
                      <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1">🔥 {analytics.learningStreakDays}d</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
                      <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase">Status</span>
                      <p className={`text-xl font-bold mt-1 ${analytics.online ? 'text-green-600' : 'text-[var(--color-text-tertiary)]'}`}>{analytics.online ? '🟢 Online' : '⚪ Offline'}</p>
                    </div>
                  </div>
                )}

                {/* Course progress */}
                {analytics && analytics.courseProgress.length > 0 && (
                  <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
                    <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">Course Progress</h3>
                    <div className="space-y-2">
                      {analytics.courseProgress.map((c, i) => {
                        const pct = c.totalItems > 0 ? Math.round((c.completedLessons / c.totalItems) * 100) : 0;
                        return (
                          <div key={i}>
                            <div className="flex justify-between text-xs mb-1"><span className="font-medium text-[var(--color-text-primary)]">{c.course}</span><span className="text-[var(--color-text-tertiary)]">{pct}%</span></div>
                            <div className="h-2 w-full rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden"><div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Filters */}
                <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card flex flex-wrap gap-2 items-center">
                  <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs">
                    {DATE_PRESETS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  {datePreset === 'custom' && (
                    <>
                      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs" />
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs" />
                    </>
                  )}
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs">
                    <option value="">All Activity Types</option>
                    {ACTIVITY_TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs">
                    <option value="">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="in_progress">In Progress</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                  </select>
                  <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs">
                    <option value="">All Courses</option>
                    {courseOptions.map((c) => <option key={c._id} value={c._id}>{c.title?.en || c._id}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="Search by lesson/resource name..."
                    value={timelineSearch}
                    onChange={(e) => setTimelineSearch(e.target.value)}
                    className="flex-1 min-w-[150px] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs"
                  />
                  <div className="flex gap-2 ml-auto">
                    <button onClick={() => handleExport('csv')} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-tertiary)] transition-colors">⬇ CSV</button>
                    <button onClick={() => handleExport('xlsx')} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-tertiary)] transition-colors">⬇ Excel</button>
                  </div>
                </div>

                {/* Timeline */}
                <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
                  {timelineLoading ? (
                    <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>
                  ) : timeline.length === 0 ? (
                    <p className="text-center text-sm text-[var(--color-text-tertiary)] py-10">No activity recorded for this range.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Resource</th>
                            <th className="text-left px-4 py-2.5 font-semibold hidden md:table-cell">Course</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                            <th className="text-left px-4 py-2.5 font-semibold hidden lg:table-cell">Start</th>
                            <th className="text-left px-4 py-2.5 font-semibold hidden lg:table-cell">End</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Duration</th>
                            <th className="text-left px-4 py-2.5 font-semibold hidden xl:table-cell">Progress</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)]">
                          {timeline.map((e) => {
                            const end = new Date(e.createdAt);
                            const start = computeStart(e.createdAt, e.durationSeconds);
                            return (
                              <tr key={e._id} className="hover:bg-[var(--color-surface-secondary)] transition-colors">
                                <td className="px-4 py-2.5 whitespace-nowrap">{end.toLocaleDateString()}</td>
                                <td className="px-4 py-2.5"><span className="rounded-full bg-primary-50 dark:bg-primary-950/30 px-2 py-0.5 text-[10px] font-semibold text-primary-700 dark:text-primary-300 whitespace-nowrap">{e.type.replace(/_/g, ' ')}</span></td>
                                <td className="px-4 py-2.5 max-w-[160px] truncate">{e.resourceName || '—'}</td>
                                <td className="px-4 py-2.5 hidden md:table-cell">{e.course?.title?.en || '—'}</td>
                                <td className="px-4 py-2.5">{e.status || '—'}</td>
                                <td className="px-4 py-2.5 hidden lg:table-cell whitespace-nowrap">{start.toLocaleTimeString()}</td>
                                <td className="px-4 py-2.5 hidden lg:table-cell whitespace-nowrap">{end.toLocaleTimeString()}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap">{e.durationSeconds ? formatDuration(e.durationSeconds) : '—'}</td>
                                <td className="px-4 py-2.5 hidden xl:table-cell">{e.percent != null ? `${e.percent}%` : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentActivity;
