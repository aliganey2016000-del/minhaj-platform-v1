/** Teacher Analytics — course performance plus assignment/attendance signals. */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, BookOpen, RefreshCw, TrendingDown, Users } from 'lucide-react';
import api from '../../../lib/axios';
import { CoursePerformanceView } from '../../shared/components/course-performance-view';

type AnalyticsTab = 'performance' | 'signals';

function TeacherSignals() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/teacher-portal/analytics/overview');
      setAnalytics(data.data || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading teacher signals">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-[var(--color-surface-tertiary)]" />)}</div>
      <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-44 animate-pulse rounded-2xl bg-[var(--color-surface-tertiary)]" />)}</div>
    </div>
  );

  if (error) return (
    <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/5 p-5">
      <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /><div className="flex-1"><h2 className="font-black text-[var(--color-text-primary)]">Unable to load teaching signals</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{error}</p><button type="button" onClick={() => void fetchAnalytics()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-700"><RefreshCw className="h-3.5 w-3.5" /> Retry</button></div></div>
    </div>
  );

  const summary = analytics?.summary || {};
  const risk = analytics?.atRiskStudents || [];
  const declining = analytics?.decliningStudents || [];
  const difficult = analytics?.difficultAssignments || [];
  const courses = analytics?.coursePerformance || [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black text-[var(--color-text-primary)]">Assignment & Attendance Signals</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Teacher review signals from the last {analytics?.windowDays || 28} days.</p></div><button type="button" onClick={() => void fetchAnalytics()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 text-xs font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button></div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Students', summary.students ?? 0, Users], ['Graded submissions', summary.gradedSubmissions ?? 0, BookOpen], ['Average grade', summary.averageGrade == null ? '—' : `${summary.averageGrade}%`, BarChart3], ['Pending submissions', summary.pendingSubmissions ?? 0, AlertTriangle]].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><Icon className="mb-3 h-5 w-5 text-emerald-500" /><p className="text-xl font-black text-[var(--color-text-primary)]">{value}</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{label}</p></div>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><div className="mb-4 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /><h3 className="font-black">Students needing attention</h3></div><div className="space-y-2">{risk.length ? risk.map((student: any) => <div key={student.studentId} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-3 py-3"><span className="min-w-0 flex-1 truncate text-sm font-bold">{student.name}</span><span className="shrink-0 text-xs">{student.average == null ? '—' : `${student.average}%`}</span><span className="hidden shrink-0 text-xs font-semibold text-amber-500 sm:inline">{student.riskReasons.length} signals</span></div>) : <p className="text-sm text-[var(--color-text-tertiary)]">No current risk signals.</p>}</div></section>
        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><div className="mb-4 flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" /><h3 className="font-black">Performance declining</h3></div><div className="space-y-2">{declining.length ? declining.map((student: any) => <div key={student.studentId} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-3 py-3"><span className="min-w-0 flex-1 truncate text-sm font-bold">{student.name}</span><span className="shrink-0 text-xs font-black text-red-500">{student.decline}%</span></div>) : <p className="text-sm text-[var(--color-text-tertiary)]">No significant decline detected.</p>}</div></section>
        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><h3 className="mb-4 font-black">Difficult assignments</h3><div className="space-y-2">{difficult.length ? difficult.map((assignment: any) => <div key={assignment.assignmentId} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-3 py-3"><span className="min-w-0 flex-1 truncate text-sm font-bold">{assignment.title}</span><span className="shrink-0 text-xs font-black">{assignment.average}%</span><span className="hidden shrink-0 text-[11px] text-[var(--color-text-tertiary)] sm:inline">{assignment.submissions} graded</span></div>) : <p className="text-sm text-[var(--color-text-tertiary)]">Not enough graded submissions yet.</p>}</div></section>
        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><h3 className="mb-4 font-black">Assignment grade by course</h3>{courses.length ? <div className="space-y-3">{courses.map((course: any) => <div key={course.courseId}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 truncate font-bold">{course.title?.en || 'Untitled'}</span><span className="shrink-0">{course.average == null ? '—' : `${course.average}%`}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-secondary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${course.average || 0}%` }} /></div></div>)}</div> : <p className="text-sm text-[var(--color-text-tertiary)]">No graded course data yet.</p>}</section>
      </div>
      <p className="text-[11px] text-[var(--color-text-tertiary)]">Signals support teacher review; they are not causal conclusions.</p>
    </div>
  );
}

export function TeacherAnalytics() {
  const [tab, setTab] = useState<AnalyticsTab>('performance');

  return (
    <div className="mx-auto max-w-7xl space-y-5 overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2">
        <button type="button" onClick={() => setTab('performance')} className={`min-h-11 rounded-xl px-3 text-sm font-black transition ${tab === 'performance' ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>Course Performance</button>
        <button type="button" onClick={() => setTab('signals')} className={`min-h-11 rounded-xl px-3 text-sm font-black transition ${tab === 'signals' ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>Teaching Signals</button>
      </div>

      {tab === 'performance' ? (
        <CoursePerformanceView
          endpoint="/teacher-portal/analytics/performance"
          title="Course Performance"
          description="Review quiz and interactive lesson performance for students enrolled in your assigned courses."
        />
      ) : <TeacherSignals />}
    </div>
  );
}

export default TeacherAnalytics;
