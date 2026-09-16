import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Filter,
  ListChecks,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import api from '../../../lib/axios';

type LocalizedTitle = { en?: string; so?: string; ar?: string } | string;
type TabKey = 'courses' | 'activity' | 'chart';
type ActivityType = 'interactive_lesson' | 'quiz';

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
  summary: {
    overallScore: number;
    interactiveLessonAvg: number;
    quizAvg: number;
    completedActivities: number;
    totalActivities: number;
  };
  courses: CoursePerformance[];
  activities: PerformanceActivity[];
  weekly: { date: string; count: number; averageScore: number }[];
  strongAreas: { name: string; score: number }[];
  areasToImprove: { name: string; score: number }[];
}

const EMPTY_DATA: PerformanceResponse = {
  student: { class: null },
  summary: { overallScore: 0, interactiveLessonAvg: 0, quizAvg: 0, completedActivities: 0, totalActivities: 0 },
  courses: [], activities: [], weekly: [], strongAreas: [], areasToImprove: [],
};

function titleOf(value: LocalizedTitle): string {
  if (typeof value === 'string') return value;
  return value?.en || value?.so || value?.ar || 'Course';
}

function scoreTone(score: number) {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 65) return 'bg-amber-400';
  return 'bg-red-500';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatCard({ icon, iconClass, title, value, helper, progress }: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  value: string;
  helper: string;
  progress?: number;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--color-text-secondary)]">{title}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-[var(--color-text-primary)]">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">{helper}</p>
      {typeof progress === 'number' && (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
          <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">{progress}%</span>
        </div>
      )}
    </div>
  );
}

export function StudentAnalytics() {
  const [data, setData] = useState<PerformanceResponse>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('courses');
  const [courseFilter, setCourseFilter] = useState('all');
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

  const classLabel = useMemo(() => {
    const klass = data.student?.class;
    if (!klass) return 'Current Class';
    return [klass.title, klass.section].filter(Boolean).join(' - ') || 'Current Class';
  }, [data.student]);

  const filteredActivities = useMemo(() => data.activities.filter((row) => {
    if (courseFilter !== 'all' && row.courseId !== courseFilter) return false;
    if (typeFilter !== 'all' && row.type !== typeFilter) return false;
    return true;
  }), [data.activities, courseFilter, typeFilter]);

  const chartRows = useMemo(() => [...filteredActivities].slice(0, 10).reverse(), [filteredActivities]);
  const chartPointList = chartRows.map((row, index) => {
    const x = chartRows.length <= 1 ? 50 : 6 + (index * 88) / (chartRows.length - 1);
    const y = 92 - (row.percentage * 0.78);
    return { x, y, row };
  });
  const chartPoints = chartPointList.map((point) => `${point.x},${point.y}`).join(' ');

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'courses', label: 'Performance by Course', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'activity', label: 'Quiz & Lesson Activity', icon: <ListChecks className="h-4 w-4" /> },
    { key: 'chart', label: 'Progress Chart', icon: <Target className="h-4 w-4" /> },
  ];

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

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)]">
      <div className="mx-auto max-w-[1440px] space-y-5 px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <BarChart3 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Quiz & Lesson Performance</h1>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Track your performance in interactive lessons and quizzes</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
              <Link to="/student" className="hover:text-emerald-500">Home</Link>
              <ChevronRight className="h-3 w-3" />
              <span>Results & Performance</span>
              <ChevronRight className="h-3 w-3" />
              <span className="font-semibold text-[var(--color-text-secondary)]">Quiz & Lesson Performance</span>
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:w-auto">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[var(--color-text-tertiary)]">Course</span>
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="h-11 w-full min-w-[180px] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-sm font-semibold text-[var(--color-text-primary)] outline-none focus:border-emerald-500"
              >
                <option value="all">All Courses</option>
                {data.courses.map((course) => <option key={course.courseId} value={course.courseId}>{titleOf(course.title)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[var(--color-text-tertiary)]">Class</span>
              <select className="h-11 w-full min-w-[170px] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-sm font-semibold text-[var(--color-text-primary)] outline-none" value="current" onChange={() => undefined}>
                <option value="current">{classLabel}</option>
              </select>
            </label>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<Trophy className="h-6 w-6" />} iconClass="bg-emerald-500/15 text-emerald-500" title="Overall Score" value={`${data.summary.overallScore}%`} helper="Average from lessons & quizzes" />
          <StatCard icon={<BookOpen className="h-6 w-6" />} iconClass="bg-blue-500/15 text-blue-500" title="Interactive Lesson Avg" value={`${data.summary.interactiveLessonAvg}%`} helper="First-attempt Stop & Check accuracy" />
          <StatCard icon={<CircleHelp className="h-6 w-6" />} iconClass="bg-red-500/15 text-red-400" title="Quiz Avg" value={`${data.summary.quizAvg}%`} helper="Latest score from completed quizzes" />
          <StatCard icon={<CheckCircle2 className="h-6 w-6" />} iconClass="bg-violet-500/15 text-violet-400" title="Activities Completed" value={`${data.summary.completedActivities} / ${data.summary.totalActivities}`} helper="Interactive lessons and quizzes" progress={data.summary.totalActivities ? Math.round((data.summary.completedActivities / data.summary.totalActivities) * 100) : 0} />
        </div>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] shadow-sm">
          <div className="overflow-x-auto border-b border-[var(--color-border-default)]">
            <div className="flex min-w-max">
              {tabs.map((tab) => (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 border-b-2 px-5 py-4 text-sm font-bold transition-colors ${activeTab === tab.key ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>{tab.icon}{tab.label}</button>
              ))}
            </div>
          </div>

          {activeTab === 'courses' && (
            <div className="p-4 sm:p-5">
              <div className="mb-4"><h2 className="text-lg font-black text-[var(--color-text-primary)]">Performance by Course</h2><p className="text-xs text-[var(--color-text-tertiary)]">See your average score and completion in each course</p></div>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border-default)]">
                <table className="min-w-[820px] w-full text-left text-sm">
                  <thead className="bg-[var(--color-surface-tertiary)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Lessons Completed</th><th className="px-4 py-3">Quizzes Completed</th><th className="px-4 py-3">Average Score</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Action</th></tr></thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {data.courses.map((course, index) => (
                      <tr key={course.courseId} className="hover:bg-[var(--color-surface-tertiary)]/60">
                        <td className="px-4 py-3 text-[var(--color-text-tertiary)]">{index + 1}</td>
                        <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400"><BookOpen className="h-4 w-4" /></span><span className="font-bold text-[var(--color-text-primary)]">{titleOf(course.title)}</span></div></td>
                        <td className="px-4 py-3 font-semibold text-[var(--color-text-secondary)]">{course.lessonsCompleted} / {course.totalLessons}</td>
                        <td className="px-4 py-3 font-semibold text-[var(--color-text-secondary)]">{course.quizzesCompleted} / {course.totalQuizzes}</td>
                        <td className="px-4 py-3 font-black text-[var(--color-text-primary)]">{course.averageScore}%</td>
                        <td className="px-4 py-3"><div className="flex min-w-[150px] items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full rounded-full ${scoreTone(course.progressPercent)}`} style={{ width: `${course.progressPercent}%` }} /></div><span className="w-9 text-xs font-bold text-[var(--color-text-secondary)]">{course.progressPercent}%</span></div></td>
                        <td className="px-4 py-3"><button type="button" onClick={() => { setCourseFilter(course.courseId); setActiveTab('activity'); }} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-primary)] hover:border-emerald-500/60">View</button></td>
                      </tr>
                    ))}
                    {data.courses.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--color-text-tertiary)]">No course performance data yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div><h2 className="text-lg font-black text-[var(--color-text-primary)]">Quiz & Lesson Activity</h2><p className="text-xs text-[var(--color-text-tertiary)]">Your recent interactive lesson and quiz attempts</p></div>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-2"><Filter className="h-4 w-4 text-[var(--color-text-tertiary)]" /><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | ActivityType)} className="bg-transparent text-xs font-bold text-[var(--color-text-primary)] outline-none"><option value="all">All Activities</option><option value="interactive_lesson">Interactive Lessons</option><option value="quiz">Quizzes</option></select></label>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border-default)]">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead className="bg-[var(--color-surface-tertiary)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Percentage</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Action</th></tr></thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {filteredActivities.map((row, index) => (
                      <tr key={row.id} className="hover:bg-[var(--color-surface-tertiary)]/60">
                        <td className="px-4 py-3 text-[var(--color-text-tertiary)]">{index + 1}</td>
                        <td className="px-4 py-3"><p className="font-bold text-[var(--color-text-primary)]">{row.title}</p><p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{titleOf(row.courseTitle)} • {row.chapterTitle}</p></td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.type === 'quiz' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{row.type === 'quiz' ? 'Quiz' : 'Interactive Lesson'}</span></td>
                        <td className="px-4 py-3 font-black text-[var(--color-text-primary)]">{row.score}</td>
                        <td className="px-4 py-3 font-semibold text-[var(--color-text-secondary)]">{row.total}</td>
                        <td className="px-4 py-3 font-black text-[var(--color-text-primary)]">{row.percentage}%</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.status === 'Completed' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{row.status}</span></td>
                        <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">{formatDate(row.date)}</td>
                        <td className="px-4 py-3"><button type="button" className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-primary)]">View</button></td>
                      </tr>
                    ))}
                    {filteredActivities.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-[var(--color-text-tertiary)]">No quiz or interactive lesson activity yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'chart' && (
            <div className="p-5">
              <h2 className="text-lg font-black text-[var(--color-text-primary)]">Progress Chart</h2>
              <p className="mb-5 text-xs text-[var(--color-text-tertiary)]">Your recent score trend across quizzes and interactive lessons</p>
              {chartRows.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-64 w-full">
                    {[20, 40, 60, 80].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" className="text-[var(--color-border-subtle)]" strokeWidth="0.5" />)}
                    <polyline fill="none" stroke="rgb(16 185 129)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" points={chartPoints} />
                    {chartPointList.map(({ x, y, row }) => <circle key={row.id} cx={x} cy={y} r="1.5" fill="rgb(16 185 129)" vectorEffect="non-scaling-stroke" />)}
                  </svg>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{chartRows.slice(-5).map((row) => <div key={row.id} className="truncate text-center text-[10px] text-[var(--color-text-tertiary)]" title={row.title}>{row.title}</div>)}</div>
                </div>
              ) : <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">Complete a quiz or interactive lesson to see your trend.</div>}
            </div>
          )}
        </section>

        {activeTab === 'chart' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><TrendingUp className="h-5 w-5" /></span><div><h3 className="font-black text-[var(--color-text-primary)]">Strong Areas</h3><p className="text-xs text-[var(--color-text-tertiary)]">Topics where you perform best</p></div></div>
              <div className="space-y-4">{data.strongAreas.map((area) => <div key={area.name}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-[var(--color-text-secondary)]">{area.name}</span><span className="text-xs font-black text-[var(--color-text-primary)]">{area.score}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${area.score}%` }} /></div></div>)}{data.strongAreas.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)]">More activity is needed to identify strong areas.</p>}</div>
            </div>
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-400"><TrendingDown className="h-5 w-5" /></span><div><h3 className="font-black text-[var(--color-text-primary)]">Areas to Improve</h3><p className="text-xs text-[var(--color-text-tertiary)]">Topics that may need more practice</p></div></div>
              <div className="space-y-4">{data.areasToImprove.map((area) => <div key={area.name}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-[var(--color-text-secondary)]">{area.name}</span><span className="text-xs font-black text-[var(--color-text-primary)]">{area.score}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full rounded-full ${scoreTone(area.score)}`} style={{ width: `${area.score}%` }} /></div></div>)}{data.areasToImprove.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)]">More activity is needed to identify improvement areas.</p>}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentAnalytics;