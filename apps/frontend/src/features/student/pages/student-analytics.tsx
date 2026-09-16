import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Filter,
  ListChecks,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import api from '../../../lib/axios';

type LocalizedTitle = { en?: string; so?: string; ar?: string } | string;
type ActivityType = 'interactive_lesson' | 'quiz';
type DetailTab = 'activity' | 'chart';

interface PerformanceActivity {
  id: string;
  courseId: string;
  courseTitle: LocalizedTitle;
  chapterTitle: string;
  title: string;
  type: ActivityType;
  score: number;
  total: number;
  percentage: number;
  status: string;
  date: string;
  attempts?: number;
}

interface CoursePerformance {
  courseId: string;
  title: LocalizedTitle;
  lessonsCompleted: number;
  totalLessons: number;
  quizzesCompleted: number;
  totalQuizzes: number;
  averageScore: number;
  progressPercent: number;
}

interface PerformanceResponse {
  student: { class?: { _id?: string; title?: string; section?: string } | null };
  courses: CoursePerformance[];
  activities: PerformanceActivity[];
}

const EMPTY_DATA: PerformanceResponse = {
  student: { class: null },
  courses: [],
  activities: [],
};

function titleOf(value: LocalizedTitle): string {
  if (typeof value === 'string') return value;
  return value?.en || value?.so || value?.ar || 'Course';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function scoreTone(score: number) {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 65) return 'bg-amber-400';
  return 'bg-red-500';
}

export function StudentAnalytics() {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId');
  const [data, setData] = useState<PerformanceResponse>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('activity');
  const [typeFilter, setTypeFilter] = useState<'all' | ActivityType>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: response } = await api.get('/students/my/performance');
        if (!cancelled) setData(response.data || EMPTY_DATA);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.message || 'Unable to load performance data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setActiveTab('activity');
    setTypeFilter('all');
  }, [courseId]);

  const classLabel = useMemo(() => {
    const klass = data.student?.class;
    if (!klass) return 'Current Class';
    return [klass.title, klass.section].filter(Boolean).join(' - ') || 'Current Class';
  }, [data.student]);

  const selectedCourse = useMemo(
    () => data.courses.find((course) => course.courseId === courseId) || null,
    [data.courses, courseId],
  );

  const courseActivities = useMemo(
    () => data.activities.filter((row) => row.courseId === courseId),
    [data.activities, courseId],
  );

  const filteredActivities = useMemo(
    () => courseActivities.filter((row) => typeFilter === 'all' || row.type === typeFilter),
    [courseActivities, typeFilter],
  );

  const chartRows = useMemo(
    () => [...courseActivities]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-12),
    [courseActivities],
  );

  const chartPointList = chartRows.map((row, index) => {
    const x = chartRows.length <= 1 ? 50 : 7 + (index * 86) / (chartRows.length - 1);
    const y = 90 - (Math.min(100, Math.max(0, row.percentage)) * 0.8);
    return { x, y, row };
  });
  const chartPoints = chartPointList.map((point) => `${point.x},${point.y}`).join(' ');

  const courseInsights = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const row of courseActivities) {
      const key = row.chapterTitle?.trim() || 'General';
      const scores = groups.get(key) || [];
      scores.push(row.percentage);
      groups.set(key, scores);
    }
    const areas = Array.from(groups.entries()).map(([name, scores]) => ({
      name,
      score: Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length),
    }));
    return {
      strong: areas.filter((area) => area.score >= 70).sort((a, b) => b.score - a.score).slice(0, 3),
      improve: areas.filter((area) => area.score < 70).sort((a, b) => a.score - b.score).slice(0, 3),
    };
  }, [courseActivities]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-[var(--color-surface-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-500" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Loading performance...</p>
        </div>
      </div>
    );
  }

  if (courseId && !selectedCourse) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-primary)] px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-6 text-center">
          <h1 className="text-xl font-black text-[var(--color-text-primary)]">Course not found</h1>
          <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">This course is not available in your current performance record.</p>
          <Link to="/student/analytics" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
            <ArrowLeft className="h-4 w-4" /> Back to courses
          </Link>
        </div>
      </div>
    );
  }

  if (!courseId) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-primary)]">
        <div className="mx-auto max-w-[1200px] space-y-5 px-4 pb-12 pt-5 sm:px-6 lg:px-8">
          <header>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <BarChart3 className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Quiz & Lesson Performance</h1>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Select a course to view its lesson activity and progress chart.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
              <Link to="/student" className="hover:text-emerald-500">Home</Link>
              <ChevronRight className="h-3 w-3" />
              <span>Results & Performance</span>
              <ChevronRight className="h-3 w-3" />
              <span className="font-semibold text-[var(--color-text-secondary)]">Performance by Course</span>
            </div>
          </header>

          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[var(--color-text-primary)]">Performance by Course</h2>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{classLabel} • Tap a course to open its performance details.</p>
              </div>
              <span className="rounded-full border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-secondary)]">{data.courses.length} courses</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.courses.map((course) => (
                <Link
                  key={course.courseId}
                  to={`/student/analytics?courseId=${encodeURIComponent(course.courseId)}`}
                  className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-black text-[var(--color-text-primary)]">{titleOf(course.title)}</h3>
                        <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{classLabel}</p>
                      </div>
                    </div>
                    <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-500" />
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">Average</p>
                      <p className="mt-1 text-xl font-black text-[var(--color-text-primary)]">{course.averageScore}%</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">Lessons</p>
                      <p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{course.lessonsCompleted}/{course.totalLessons}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">Quizzes</p>
                      <p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{course.quizzesCompleted}/{course.totalQuizzes}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[var(--color-text-tertiary)]">
                      <span>Course progress</span>
                      <span>{course.progressPercent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                      <div className={`h-full rounded-full ${scoreTone(course.progressPercent)}`} style={{ width: `${Math.min(100, Math.max(0, course.progressPercent))}%` }} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {data.courses.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-5 py-12 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" />
                <p className="mt-3 text-sm font-bold text-[var(--color-text-secondary)]">No course performance data yet.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)]">
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <header>
          <Link to="/student/analytics" className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] hover:text-emerald-500">
            <ArrowLeft className="h-4 w-4" /> Performance by Course
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">{titleOf(selectedCourse!.title)}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{classLabel} • Course performance</p>
            </div>
          </div>
        </header>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

        <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] shadow-sm">
          <div className="border-b border-[var(--color-border-default)] p-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('activity')}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${activeTab === 'activity' ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
              >
                <ListChecks className="h-4 w-4" /> Lesson Activity
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('chart')}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${activeTab === 'chart' ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
              >
                <Target className="h-4 w-4" /> Progress Chart
              </button>
            </div>
          </div>

          {activeTab === 'activity' && (
            <div className="p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-black text-[var(--color-text-primary)]">Lesson Activity</h2>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Interactive lesson checks and standalone quizzes for {titleOf(selectedCourse!.title)}.</p>
                </div>
                <label className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-2">
                  <Filter className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | ActivityType)} className="bg-transparent text-xs font-bold text-[var(--color-text-primary)] outline-none">
                    <option value="all">All Activity</option>
                    <option value="interactive_lesson">Interactive Lessons</option>
                    <option value="quiz">Quizzes</option>
                  </select>
                </label>
              </div>

              <div className="space-y-3">
                {filteredActivities.map((row) => (
                  <article key={row.id} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${row.type === 'quiz' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                        {row.type === 'quiz' ? <CircleHelp className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-black text-[var(--color-text-primary)]">{row.title}</h3>
                            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{row.chapterTitle || 'General'} • {formatDate(row.date)}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.type === 'quiz' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                            {row.type === 'quiz' ? 'Quiz' : 'Interactive Lesson'}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Score</p><p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{row.score} / {row.total}</p></div>
                          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Percentage</p><p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{row.percentage}%</p></div>
                          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Status</p><p className={`mt-1 text-sm font-black ${row.status === 'Completed' ? 'text-emerald-400' : 'text-amber-400'}`}>{row.status}</p></div>
                          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Attempts</p><p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{row.attempts || 1}</p></div>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}

                {filteredActivities.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--color-border-default)] px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">No lesson or quiz activity yet for this course.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'chart' && (
            <div className="space-y-5 p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-black text-[var(--color-text-primary)]">Progress Chart</h2>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Score trend for {titleOf(selectedCourse!.title)} only.</p>
              </div>

              {chartRows.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3 text-[11px] font-semibold text-[var(--color-text-tertiary)]">
                    <span>Recent performance</span>
                    <span>{chartRows.length} activities</span>
                  </div>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-64 w-full" aria-label="Course progress score chart" role="img">
                    {[10, 30, 50, 70, 90].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" className="text-[var(--color-border-subtle)]" strokeWidth="0.45" />)}
                    <polyline fill="none" stroke="rgb(16 185 129)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" points={chartPoints} />
                    {chartPointList.map(({ x, y, row }) => <circle key={row.id} cx={x} cy={y} r="1.7" fill="rgb(16 185 129)" vectorEffect="non-scaling-stroke" />)}
                  </svg>
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {chartRows.slice(-6).map((row) => <div key={row.id} className="min-w-0 text-center"><p className="truncate text-[10px] font-semibold text-[var(--color-text-secondary)]" title={row.title}>{row.title}</p><p className="mt-0.5 text-[9px] text-[var(--color-text-tertiary)]">{formatShortDate(row.date)}</p></div>)}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--color-border-default)] py-14 text-center text-sm text-[var(--color-text-tertiary)]">Complete a lesson check or quiz in this course to see the progress chart.</div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5">
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><TrendingUp className="h-5 w-5" /></span>
                    <div><h3 className="font-black text-[var(--color-text-primary)]">Strong Areas</h3><p className="text-xs text-[var(--color-text-tertiary)]">Best-performing topics in this course</p></div>
                  </div>
                  <div className="space-y-4">
                    {courseInsights.strong.map((area) => <div key={area.name}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-[var(--color-text-secondary)]">{area.name}</span><span className="text-xs font-black text-[var(--color-text-primary)]">{area.score}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${area.score}%` }} /></div></div>)}
                    {courseInsights.strong.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)]">More course activity is needed to identify strong areas.</p>}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5">
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-400"><TrendingDown className="h-5 w-5" /></span>
                    <div><h3 className="font-black text-[var(--color-text-primary)]">Areas to Improve</h3><p className="text-xs text-[var(--color-text-tertiary)]">Topics in this course that need more practice</p></div>
                  </div>
                  <div className="space-y-4">
                    {courseInsights.improve.map((area) => <div key={area.name}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-[var(--color-text-secondary)]">{area.name}</span><span className="text-xs font-black text-[var(--color-text-primary)]">{area.score}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full rounded-full ${scoreTone(area.score)}`} style={{ width: `${area.score}%` }} /></div></div>)}
                    {courseInsights.improve.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)]">No low-scoring topic has been identified yet.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default StudentAnalytics;
