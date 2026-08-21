/** Teacher Analytics — actionable, teacher-scoped performance overview. */
import { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, BookOpen, TrendingDown, Users } from 'lucide-react';
import api from '../../../lib/axios';

export function TeacherAnalytics() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/teacher-portal/analytics/overview');
        setAnalytics(data.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" /></div>;
  if (error) return <div className="m-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  const summary = analytics?.summary || {};
  const risk = analytics?.atRiskStudents || [];
  const declining = analytics?.decliningStudents || [];
  const difficult = analytics?.difficultAssignments || [];
  const courses = analytics?.coursePerformance || [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[var(--color-text-primary)]">Teacher Analytics</h1>
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Actionable signals from the last {analytics?.windowDays || 28} days.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Students', summary.students ?? 0, Users],
          ['Graded submissions', summary.gradedSubmissions ?? 0, BookOpen],
          ['Average grade', summary.averageGrade == null ? '—' : `${summary.averageGrade}%`, BarChart3],
          ['Pending submissions', summary.pendingSubmissions ?? 0, AlertTriangle],
        ].map(([label, value, Icon]: any) => (
          <div key={label} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4">
            <Icon className="h-5 w-5 text-emerald-600 mb-3" />
            <p className="text-2xl font-extrabold text-[var(--color-text-primary)]">{value}</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
          <div className="flex items-center gap-2 mb-4"><AlertTriangle className="h-5 w-5 text-amber-600" /><h2 className="font-bold">Students needing attention</h2></div>
          <div className="space-y-2">
            {risk.length ? risk.map((s: any) => (
              <div key={s.studentId} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-3 py-3">
                <span className="font-semibold text-sm flex-1">{s.name}</span>
                <span className="text-xs">{s.average == null ? '—' : `${s.average}%`}</span>
                <span className="text-xs text-amber-700">{s.riskReasons.length} signals</span>
              </div>
            )) : <p className="text-sm text-[var(--color-text-tertiary)]">No current risk signals.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
          <div className="flex items-center gap-2 mb-4"><TrendingDown className="h-5 w-5 text-rose-600" /><h2 className="font-bold">Performance declining</h2></div>
          <div className="space-y-2">
            {declining.length ? declining.map((s: any) => (
              <div key={s.studentId} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-3 py-3">
                <span className="font-semibold text-sm flex-1">{s.name}</span>
                <span className="text-xs font-bold text-rose-600">{s.decline}%</span>
              </div>
            )) : <p className="text-sm text-[var(--color-text-tertiary)]">No significant decline detected.</p>}
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
          <h2 className="font-bold mb-4">Assignments students find difficult</h2>
          <div className="space-y-2">
            {difficult.length ? difficult.map((a: any) => (
              <div key={a.assignmentId} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-3 py-3">
                <span className="font-semibold text-sm flex-1 truncate">{a.title}</span>
                <span className="text-xs font-bold">{a.average}%</span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">{a.submissions} graded</span>
              </div>
            )) : <p className="text-sm text-[var(--color-text-tertiary)]">Not enough graded submissions yet.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
          <h2 className="font-bold mb-4">Course performance</h2>
          <div className="space-y-3">
            {courses.map((c: any) => (
              <div key={c.courseId}>
                <div className="flex justify-between text-sm mb-1"><span className="font-semibold">{c.title?.en || 'Untitled'}</span><span>{c.average == null ? '—' : `${c.average}%`}</span></div>
                <div className="h-2 rounded-full bg-[var(--color-surface-secondary)] overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.average || 0}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="text-[11px] text-[var(--color-text-tertiary)]">Analytics are decision-support signals for teacher review, not causal conclusions.</p>
    </div>
  );
}

export default TeacherAnalytics;
