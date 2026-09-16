import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Eye,
  Filter,
  History,
  ListChecks,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import api from '../../../lib/axios';
import { StudentAttemptDetail } from './student-attempt-detail';

type LocalizedTitle = { en?: string; so?: string; ar?: string } | string;
type ActivityType = 'interactive_lesson' | 'quiz';
type DetailTab = 'activity' | 'chart';

interface PerformanceActivity {
  id: string;
  periodId?: string;
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
  progressAvailable?: boolean;
}

interface PerformancePeriod {
  id: string;
  academicYear: string;
  class?: { _id?: string; title?: string; section?: string; academicYear?: string } | null;
  grade?: string;
  status: 'active' | 'completed' | 'graduated';
  isCurrent: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
  courses: CoursePerformance[];
  activities: PerformanceActivity[];
}

interface PerformanceResponse {
  student: { class?: { _id?: string; title?: string; section?: string; academicYear?: string } | null };
  courses: CoursePerformance[];
  activities: PerformanceActivity[];
  periods?: PerformancePeriod[];
}

const EMPTY_DATA: PerformanceResponse = {
  student: { class: null },
  courses: [],
  activities: [],
  periods: [],
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

function classLabelFor(period?: PerformancePeriod | null, fallback?: PerformanceResponse['student']['class']) {
  const klass = period?.class || fallback;
  if (!klass) return period?.grade || 'Current Class';
  return [klass.title || period?.grade, klass.section].filter(Boolean).join(' - ') || 'Current Class';
}

function periodOptionLabel(period: PerformancePeriod) {
  const classLabel = classLabelFor(period);
  const year = period.academicYear || 'Academic Year';
  return `${classLabel} • ${year}${period.isCurrent ? ' • Current' : ''}`;
}

function PageLoader() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-[var(--color-surface-primary)]" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-500" />
        <p className="text-sm text-[var(--color-text-tertiary)]">Loading performance...</p>
      </div>
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)] px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-2xl border border-red-500/25 bg-[var(--color-surface-secondary)] p-6 text-center shadow-sm sm:p-8">
        <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
        <h1 className="mt-3 text-xl font-black text-[var(--color-text-primary)]">Performance data unavailable</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--color-text-tertiary)]">{message}</p>
        <button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    </div>
  );
}

export function StudentAnalytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const periodIdParam = searchParams.get('periodId');
  const courseId = searchParams.get('courseId');
  const activityTypeParam = searchParams.get('activityType');
  const activityType: ActivityType | null = activityTypeParam === 'quiz' || activityTypeParam === 'interactive_lesson' ? activityTypeParam : null;
  const activityId = searchParams.get('activityId');
  const isAttemptDetail = Boolean(courseId && activityType && activityId);

  const [data, setData] = useState<PerformanceResponse>(EMPTY_DATA);
  const [loading, setLoading] = useState(!isAttemptDetail);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('activity');
  const [typeFilter, setTypeFilter] = useState<'all' | ActivityType>('all');

  const loadPerformance = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: response } = await api.get('/students/my/performance');
      setData(response.data || EMPTY_DATA);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load performance data. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAttemptDetail) {
      setLoading(false);
      return;
    }
    void loadPerformance();
  }, [isAttemptDetail, loadPerformance]);

  useEffect(() => {
    setActiveTab('activity');
    setTypeFilter('all');
  }, [courseId, periodIdParam]);

  const periods = useMemo<PerformancePeriod[]>(() => {
    if (data.periods?.length) return data.periods;
    return [{
      id: 'current',
      academicYear: data.student.class?.academicYear || 'Current',
      class: data.student.class || null,
      status: 'active',
      isCurrent: true,
      courses: data.courses,
      activities: data.activities,
    }];
  }, [data]);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodIdParam)
      || periods.find((period) => period.isCurrent)
      || periods[0],
    [periodIdParam, periods],
  );

  const periodCourses = selectedPeriod?.courses || [];
  const periodActivities = selectedPeriod?.activities || [];
  const classLabel = classLabelFor(selectedPeriod, data.student.class);
  const periodRoot = selectedPeriod?.id
    ? `/student/analytics?periodId=${encodeURIComponent(selectedPeriod.id)}`
    : '/student/analytics';

  const selectedCourse = useMemo(
    () => periodCourses.find((course) => course.courseId === courseId) || null,
    [periodCourses, courseId],
  );

  const courseActivities = useMemo(
    () => periodActivities.filter((row) => row.courseId === courseId),
    [periodActivities, courseId],
  );

  const filteredActivities = useMemo(
    () => courseActivities.filter((row) => typeFilter === 'all' || row.type === typeFilter),
    [courseActivities, typeFilter],
  );

  const chartRows = useMemo(
    () => [...courseActivities].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-12),
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

  if (isAttemptDetail) {
    return <StudentAttemptDetail courseId={courseId!} activityType={activityType!} activityId={activityId!} periodId={periodIdParam || undefined} />;
  }

  if (loading) return <PageLoader />;
  const hasAnyCourses = periods.some((period) => period.courses.length > 0);
  if (error && !hasAnyCourses) return <LoadError message={error} onRetry={() => void loadPerformance()} />;

  if (courseId && !selectedCourse) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-primary)] px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-6 text-center sm:p-8">
          <AlertCircle className="mx-auto h-9 w-9 text-amber-400" />
          <h1 className="mt-3 text-xl font-black text-[var(--color-text-primary)]">Course not found</h1>
          <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">This course is not available in the selected academic period.</p>
          <Link to={periodRoot} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
            <ArrowLeft className="h-4 w-4" /> Back to courses
          </Link>
        </div>
      </div>
    );
  }

  if (!courseId) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-primary)]">
        <div className="mx-auto max-w-[1200px] space-y-5 px-3 pb-12 pt-4 sm:px-6 sm:pt-5 lg:px-8">
          <header>
            <div className="flex items-start gap-3 sm:items-center">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><BarChart3 className="h-6 w-6" /></div>
              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Quiz & Lesson Performance</h1>
                <p className="mt-1 text-sm leading-5 text-[var(--color-text-tertiary)]">Select an academic period, then choose a course to view its lesson activity and progress chart.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] sm:gap-2">
              <Link to="/student" className="hover:text-emerald-500">Home</Link><ChevronRight className="h-3 w-3" /><span>Results & Performance</span><ChevronRight className="h-3 w-3" /><span className="font-semibold text-[var(--color-text-secondary)]">Performance by Course</span>
            </div>
          </header>

          {error && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-300 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => void loadPerformance()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-500/30 px-3 text-xs font-black hover:bg-amber-500/10"><RefreshCw className="h-4 w-4" /> Retry</button>
            </div>
          )}

          <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400"><History className="h-5 w-5" /></span>
                <div>
                  <h2 className="font-black text-[var(--color-text-primary)]">Academic History</h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">Current and previous class performance remains available after promotion.</p>
                </div>
              </div>
              <label className="min-w-0 sm:min-w-[300px]">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Academic period</span>
                <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3">
                  <CalendarDays className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
                  <select
                    value={selectedPeriod?.id || ''}
                    onChange={(event) => setSearchParams({ periodId: event.target.value })}
                    className="min-w-0 flex-1 bg-transparent py-2 text-sm font-bold text-[var(--color-text-primary)] outline-none"
                  >
                    {periods.map((period) => <option key={period.id} value={period.id}>{periodOptionLabel(period)}</option>)}
                  </select>
                </div>
              </label>
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-[var(--color-text-primary)]">Performance by Course</h2>
                  {selectedPeriod && <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${selectedPeriod.isCurrent ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{selectedPeriod.isCurrent ? 'Current' : 'Historical'}</span>}
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{classLabel} • {selectedPeriod?.academicYear || 'Academic Year'} • Tap a course to open its performance details.</p>
              </div>
              {periodCourses.length > 0 && <span className="rounded-full border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-secondary)]">{periodCourses.length} courses</span>}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {periodCourses.map((course) => (
                <Link
                  key={`${selectedPeriod?.id || 'period'}:${course.courseId}`}
                  to={`/student/analytics?periodId=${encodeURIComponent(selectedPeriod?.id || '')}&courseId=${encodeURIComponent(course.courseId)}`}
                  className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400"><BookOpen className="h-5 w-5" /></span>
                      <div className="min-w-0"><h3 className="break-words text-base font-black text-[var(--color-text-primary)]">{titleOf(course.title)}</h3><p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{classLabel} • {selectedPeriod?.academicYear}</p></div>
                    </div>
                    <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-500" />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="col-span-2 rounded-xl bg-[var(--color-surface-primary)] p-3 sm:col-span-1 sm:bg-transparent sm:p-0"><p className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">Average</p><p className="mt-1 text-xl font-black text-[var(--color-text-primary)]">{course.averageScore}%</p></div>
                    <div><p className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">Lessons</p><p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{course.progressAvailable === false ? '—' : `${course.lessonsCompleted}/${course.totalLessons}`}</p></div>
                    <div><p className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">Quizzes</p><p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{course.progressAvailable === false ? '—' : `${course.quizzesCompleted}/${course.totalQuizzes}`}</p></div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[var(--color-text-tertiary)]"><span>Course progress</span><span>{course.progressAvailable === false ? 'Historical' : `${course.progressPercent}%`}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full rounded-full ${course.progressAvailable === false ? 'bg-slate-500/40' : scoreTone(course.progressPercent)}`} style={{ width: course.progressAvailable === false ? '100%' : `${Math.min(100, Math.max(0, course.progressPercent))}%` }} /></div>
                  </div>
                </Link>
              ))}
            </div>

            {periodCourses.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-5 py-12 text-center">
                <BookOpen className="mx-auto h-9 w-9 text-[var(--color-text-tertiary)]" />
                <p className="mt-3 text-sm font-black text-[var(--color-text-secondary)]">No course performance for this period</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--color-text-tertiary)]">Choose another academic period, or complete an interactive lesson check or quiz in your current courses.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)]">
      <div className="mx-auto max-w-[1200px] space-y-5 px-3 pb-12 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <header>
          <Link to={periodRoot} className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] hover:text-emerald-500"><ArrowLeft className="h-4 w-4" /> Performance by Course</Link>
          <div className="flex items-start gap-3 sm:items-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400"><BookOpen className="h-6 w-6" /></div>
            <div className="min-w-0">
              <h1 className="break-words text-xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">{titleOf(selectedCourse!.title)}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{classLabel} • {selectedPeriod?.academicYear} • Course performance</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-300 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span><button type="button" onClick={() => void loadPerformance()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-500/30 px-3 text-xs font-black hover:bg-amber-500/10"><RefreshCw className="h-4 w-4" /> Retry</button>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] shadow-sm">
          <div className="border-b border-[var(--color-border-default)] p-2">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setActiveTab('activity')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-bold transition sm:px-3 sm:text-sm ${activeTab === 'activity' ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><ListChecks className="h-4 w-4 shrink-0" /> <span>Lesson Activity</span></button>
              <button type="button" onClick={() => setActiveTab('chart')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-bold transition sm:px-3 sm:text-sm ${activeTab === 'chart' ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><Target className="h-4 w-4 shrink-0" /> <span>Progress Chart</span></button>
            </div>
          </div>

          {activeTab === 'activity' && (
            <div className="p-3 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div><h2 className="text-lg font-black text-[var(--color-text-primary)]">Lesson Activity</h2><p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">Interactive lesson checks and standalone quizzes for {titleOf(selectedCourse!.title)} in {selectedPeriod?.academicYear}.</p></div>
                <label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-2 sm:w-auto">
                  <Filter className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | ActivityType)} className="w-full bg-transparent text-xs font-bold text-[var(--color-text-primary)] outline-none sm:w-auto"><option value="all">All Activity</option><option value="interactive_lesson">Interactive Lessons</option><option value="quiz">Quizzes</option></select>
                </label>
              </div>

              <div className="space-y-3">
                {filteredActivities.map((row) => (
                  <article key={row.id} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${row.type === 'quiz' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{row.type === 'quiz' ? <CircleHelp className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0"><h3 className="break-words text-sm font-black text-[var(--color-text-primary)]">{row.title}</h3><p className="mt-1 text-[11px] leading-4 text-[var(--color-text-tertiary)]">{row.chapterTitle || 'General'} • {formatDate(row.date)}</p></div>
                          <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-bold ${row.type === 'quiz' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{row.type === 'quiz' ? 'Quiz' : 'Interactive Lesson'}</span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
                          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Score</p><p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{row.score} / {row.total}</p></div>
                          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Percentage</p><p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{row.percentage}%</p></div>
                          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Status</p><p className={`mt-1 text-sm font-black ${row.status === 'Completed' ? 'text-emerald-400' : 'text-amber-400'}`}>{row.status}</p></div>
                          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Attempts</p><p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{row.attempts || 1}</p></div>
                        </div>
                        <div className="mt-4 flex justify-end">
                          <Link to={`/student/analytics?periodId=${encodeURIComponent(selectedPeriod?.id || '')}&courseId=${encodeURIComponent(courseId)}&activityType=${encodeURIComponent(row.type)}&activityId=${encodeURIComponent(row.id)}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs font-black text-[var(--color-text-primary)] hover:border-emerald-500/50 hover:text-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 sm:w-auto"><Eye className="h-4 w-4" /> View details</Link>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
                {filteredActivities.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--color-border-default)] px-4 py-12 text-center"><ListChecks className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" /><p className="mt-3 text-sm font-black text-[var(--color-text-secondary)]">{courseActivities.length === 0 ? 'No activity recorded for this course and period' : 'No activity matches this filter'}</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--color-text-tertiary)]">{courseActivities.length === 0 ? 'No quiz or interactive lesson result was recorded during this academic period.' : 'Choose All Activity or another activity type to see your results.'}</p></div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'chart' && (
            <div className="space-y-5 p-3 sm:p-5">
              <div><h2 className="text-lg font-black text-[var(--color-text-primary)]">Progress Chart</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Score trend for {titleOf(selectedCourse!.title)} during {selectedPeriod?.academicYear} only.</p></div>
              {chartRows.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between gap-3 text-[11px] font-semibold text-[var(--color-text-tertiary)]"><span>Recent performance</span><span>{chartRows.length} activities</span></div>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-52 w-full sm:h-64" aria-label="Course progress score chart" role="img">
                    {[10, 30, 50, 70, 90].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" className="text-[var(--color-border-subtle)]" strokeWidth="0.45" />)}
                    <polyline fill="none" stroke="rgb(16 185 129)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" points={chartPoints} />
                    {chartPointList.map(({ x, y, row }) => <circle key={row.id} cx={x} cy={y} r="1.7" fill="rgb(16 185 129)" vectorEffect="non-scaling-stroke" />)}
                  </svg>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">{chartRows.slice(-6).map((row) => <div key={row.id} className="min-w-0 text-center"><p className="truncate text-[10px] font-semibold text-[var(--color-text-secondary)]" title={row.title}>{row.title}</p><p className="mt-0.5 text-[9px] text-[var(--color-text-tertiary)]">{formatShortDate(row.date)}</p></div>)}</div>
                </div>
              ) : <div className="rounded-xl border border-dashed border-[var(--color-border-default)] px-4 py-14 text-center text-sm text-[var(--color-text-tertiary)]">No lesson check or quiz score is recorded for this course in this academic period.</div>}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
                  <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><TrendingUp className="h-5 w-5" /></span><div><h3 className="font-black text-[var(--color-text-primary)]">Strong Areas</h3><p className="text-xs text-[var(--color-text-tertiary)]">Best-performing topics in this course</p></div></div>
                  <div className="space-y-4">{courseInsights.strong.map((area) => <div key={area.name}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-[var(--color-text-secondary)]">{area.name}</span><span className="text-xs font-black text-[var(--color-text-primary)]">{area.score}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${area.score}%` }} /></div></div>)}{courseInsights.strong.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)]">More course activity is needed to identify strong areas.</p>}</div>
                </div>
                <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
                  <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400"><TrendingDown className="h-5 w-5" /></span><div><h3 className="font-black text-[var(--color-text-primary)]">Areas to Improve</h3><p className="text-xs text-[var(--color-text-tertiary)]">Topics in this course that need more practice</p></div></div>
                  <div className="space-y-4">{courseInsights.improve.map((area) => <div key={area.name}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-[var(--color-text-secondary)]">{area.name}</span><span className="text-xs font-black text-[var(--color-text-primary)]">{area.score}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full rounded-full ${scoreTone(area.score)}`} style={{ width: `${area.score}%` }} /></div></div>)}{courseInsights.improve.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)]">No low-scoring topic has been identified yet.</p>}</div>
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
