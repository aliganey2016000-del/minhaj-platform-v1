import { useEffect, useState } from 'react';
import api from '../../../lib/axios';

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

const catLabels: Record<string, string> = {
  quran: 'Quran', fiqh: 'Fiqh', aqeedah: 'Aqeedah', seerah: 'Seerah',
  arabic: 'Arabic', tajweed: 'Tajweed', hadith: 'Hadith', akhlaq: 'Akhlaq',
};

export function AnalyticsManage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/analytics/dashboard');
        setStats(data.data);
      } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">Retry</button></div>;
  if (!stats) return null;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📈 Analytics</h1>

        {/* Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon="🎓" label="Total Students" value={stats.students.total} color="bg-blue-500" />
          <StatCard icon="📚" label="Courses" value={`${stats.courses.published}/${stats.courses.total}`} color="bg-green-500" />
          <StatCard icon="👨‍🏫" label="Teachers" value={stats.teachers} color="bg-purple-500" />
          <StatCard icon="💰" label="Revenue" value={`$${stats.totalRevenue.toLocaleString()}`} color="bg-gold-500" />
          <StatCard icon="✅" label="Active Students" value={stats.students.active} color="bg-emerald-500" />
          <StatCard icon="👨‍👩‍👧‍👦" label="Parents" value={stats.parents} color="bg-pink-500" />
          <StatCard icon="🆕" label="New (30 days)" value={stats.recentRegistrations} color="bg-cyan-500" />
          <StatCard icon="📊" label="Occupancy" value={`${stats.enrollment.occupancyRate}%`} color="bg-indigo-500" />
        </div>

        {/* Enrollment */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
          <h2 className="text-lg font-bold mb-4">📈 Enrollment Overview</h2>
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-[var(--color-text-secondary)]">{stats.enrollment.totalEnrolled} enrolled of {stats.enrollment.totalCapacity} capacity</span>
            <span className="font-bold text-primary-600">{stats.enrollment.occupancyRate}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
            <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-gold-500 transition-all duration-700" style={{ width: `${stats.enrollment.occupancyRate}%` }} />
          </div>
        </div>

        {/* Course Distribution */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
          <h2 className="text-lg font-bold mb-4">📂 Course Distribution</h2>
          <div className="space-y-3">
            {stats.courseDistribution.map(c => (
              <div key={c.category} className="flex items-center gap-3">
                <span className="w-20 text-sm font-medium">{catLabels[c.category] || c.category}</span>
                <div className="flex-1 h-2 rounded-full bg-[var(--color-surface-tertiary)]">
                  <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min((c.count / Math.max(...stats.courseDistribution.map(x=>x.count))) * 100, 100)}%` }} />
                </div>
                <span className="w-8 text-sm font-semibold text-right">{c.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Registrations */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
          <h2 className="text-lg font-bold mb-4">📅 Monthly Registrations</h2>
          <div className="flex items-end gap-3 h-40">
            {stats.monthlyRegistrations.map(m => {
              const maxVal = Math.max(...stats.monthlyRegistrations.map(x => x.count));
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-semibold">{m.count}</span>
                  <div className="w-full rounded-t-lg bg-primary-500 transition-all duration-500" style={{ height: `${maxVal > 0 ? (m.count / maxVal) * 100 : 0}%`, minHeight: m.count > 0 ? '8px' : '2px' }} />
                  <span className="text-xs text-[var(--color-text-tertiary)]">{m.month.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card hover:shadow-card-hover transition-shadow">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color} text-white text-xl shadow-sm`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
          <p className="text-sm text-[var(--color-text-tertiary)]">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsManage;