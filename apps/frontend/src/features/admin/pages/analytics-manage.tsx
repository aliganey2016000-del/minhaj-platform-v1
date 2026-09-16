import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Building2 } from 'lucide-react';
import api from '../../../lib/axios';
import { CoursePerformanceView } from '../../shared/components/course-performance-view';

interface DashboardStats {
  students: { total: number; active: number };
  courses: { total: number; published: number };
  teachers: number;
  parents: number;
  recentRegistrations: number;
  totalRevenue: number;
  courseDistribution: { category: string; count: number }[];
  monthlyRegistrations: { month: string; count: number }[];
  enrollment: { totalEnrolled: number; totalCapacity: number; occupancyRate: number };
}

type AnalyticsTab = 'performance' | 'overview';

const catLabels: Record<string, string> = {
  quran: 'Quran', fiqh: 'Fiqh', aqeedah: 'Aqeedah', seerah: 'Seerah',
  arabic: 'Arabic', tajweed: 'Tajweed', hadith: 'Hadith', akhlaq: 'Akhlaq',
};

function InstitutionOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/analytics/dashboard');
      setStats(data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load institution analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-500" /></div>;
  if (error) return <div className="py-20 text-center"><p className="mb-4 text-red-500">{error}</p><button type="button" onClick={() => void load()} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700">Retry</button></div>;
  if (!stats) return null;

  const distributionMax = Math.max(1, ...stats.courseDistribution.map((item) => item.count));
  const registrationMax = Math.max(1, ...stats.monthlyRegistrations.map((item) => item.count));

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-black text-[var(--color-text-primary)]">Institution Overview</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Enrollment, users, course distribution, registrations, and revenue.</p></div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="🎓" label="Total Students" value={stats.students.total} color="bg-blue-500" />
        <StatCard icon="📚" label="Courses" value={`${stats.courses.published}/${stats.courses.total}`} color="bg-green-500" />
        <StatCard icon="👨‍🏫" label="Teachers" value={stats.teachers} color="bg-purple-500" />
        <StatCard icon="💰" label="Revenue" value={`$${stats.totalRevenue.toLocaleString()}`} color="bg-amber-500" />
        <StatCard icon="✅" label="Active Students" value={stats.students.active} color="bg-emerald-500" />
        <StatCard icon="👨‍👩‍👧‍👦" label="Parents" value={stats.parents} color="bg-pink-500" />
        <StatCard icon="🆕" label="New (30 days)" value={stats.recentRegistrations} color="bg-cyan-500" />
        <StatCard icon="📊" label="Occupancy" value={`${stats.enrollment.occupancyRate}%`} color="bg-indigo-500" />
      </div>

      <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-6">
        <h3 className="mb-4 text-lg font-black">Enrollment Overview</h3>
        <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="text-[var(--color-text-secondary)]">{stats.enrollment.totalEnrolled} enrolled of {stats.enrollment.totalCapacity} capacity</span><span className="font-black text-emerald-500">{stats.enrollment.occupancyRate}%</span></div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${stats.enrollment.occupancyRate}%` }} /></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-6">
          <h3 className="mb-4 text-lg font-black">Course Distribution</h3>
          <div className="space-y-3">{stats.courseDistribution.map((course) => <div key={course.category} className="flex items-center gap-3"><span className="w-24 truncate text-sm font-semibold">{catLabels[course.category] || course.category}</span><div className="h-2 flex-1 rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min((course.count / distributionMax) * 100, 100)}%` }} /></div><span className="w-8 text-right text-sm font-black">{course.count}</span></div>)}</div>
        </section>

        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-6">
          <h3 className="mb-4 text-lg font-black">Monthly Registrations</h3>
          <div className="flex h-40 items-end gap-3">{stats.monthlyRegistrations.map((month) => <div key={month.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><span className="text-xs font-black">{month.count}</span><div className="w-full rounded-t-lg bg-emerald-500 transition-all duration-500" style={{ height: `${month.count ? (month.count / registrationMax) * 100 : 2}%`, minHeight: '2px' }} /><span className="text-xs text-[var(--color-text-tertiary)]">{month.month.slice(5)}</span></div>)}</div>
        </section>
      </div>
    </div>
  );
}

export function AnalyticsManage() {
  const [tab, setTab] = useState<AnalyticsTab>('performance');

  return (
    <div className="p-3 pt-20 sm:p-6 sm:pt-20 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-5">
        <header><h1 className="text-2xl font-black text-[var(--color-text-primary)] sm:text-3xl">Analytics</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Institution health and learning performance in one place.</p></header>

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2">
          <button type="button" onClick={() => setTab('performance')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${tab === 'performance' ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><BarChart3 className="h-4 w-4" /> Learning Performance</button>
          <button type="button" onClick={() => setTab('overview')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${tab === 'overview' ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><Building2 className="h-4 w-4" /> Institution Overview</button>
        </div>

        {tab === 'performance' ? (
          <CoursePerformanceView
            endpoint="/analytics/performance"
            title="Learning Performance"
            description="Compare course performance and drill into each student's quiz and interactive lesson results."
            adminFilters
          />
        ) : <InstitutionOverview />}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex items-center gap-4"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color} text-lg text-white shadow-sm`}>{icon}</div><div className="min-w-0"><p className="truncate text-xl font-black text-[var(--color-text-primary)]">{value}</p><p className="truncate text-xs text-[var(--color-text-tertiary)]">{label}</p></div></div>
    </div>
  );
}

export default AnalyticsManage;
