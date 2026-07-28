/**
 * Admin Dashboard — Real Live Stats
 * Fetches from /api/v1/analytics/dashboard
 */

import { useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import {
  GraduationCap, BookOpen, Presentation, DollarSign, UserCheck, Layers, Users, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import api from '../../../lib/axios';
import { useTheme } from '../../../store/theme-context';

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

// ---------------------------------------------------------------------------
// Categorical palette (dataviz skill reference instance) — fixed order per
// category so identity never repaints when data changes, CVD-validated for
// 8 adjacent categorical slots in both light and dark mode.
// ---------------------------------------------------------------------------
const CATEGORY_ORDER = ['quran', 'fiqh', 'aqeedah', 'seerah', 'arabic', 'tajweed', 'hadith', 'akhlaq'] as const;
const CATEGORY_COLORS_LIGHT: Record<string, string> = {
  quran: '#2a78d6', fiqh: '#eb6834', aqeedah: '#1baf7a', seerah: '#eda100',
  arabic: '#e87ba4', tajweed: '#008300', hadith: '#4a3aa7', akhlaq: '#e34948',
};
const CATEGORY_COLORS_DARK: Record<string, string> = {
  quran: '#3987e5', fiqh: '#d95926', aqeedah: '#199e70', seerah: '#c98500',
  arabic: '#d55181', tajweed: '#008300', hadith: '#9085e9', akhlaq: '#e66767',
};
const catLabels: Record<string, string> = {
  quran: 'Quran', fiqh: 'Fiqh', aqeedah: 'Aqeedah', seerah: 'Seerah',
  arabic: 'Arabic', tajweed: 'Tajweed', hadith: 'Hadith', akhlaq: 'Akhlaq',
};

// ---------------------------------------------------------------------------
// Stat Card — white surface, thin border; color lives only on the icon's
// pastel container, not the whole card.
// ---------------------------------------------------------------------------

const iconTint: Record<string, { bg: string; text: string }> = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-950/40',       text: 'text-blue-600 dark:text-blue-400' },
  green:   { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-600 dark:text-emerald-400' },
  purple:  { bg: 'bg-violet-50 dark:bg-violet-950/40',   text: 'text-violet-600 dark:text-violet-400' },
  gold:    { bg: 'bg-amber-50 dark:bg-amber-950/40',     text: 'text-amber-600 dark:text-amber-400' },
  emerald: { bg: 'bg-teal-50 dark:bg-teal-950/40',       text: 'text-teal-600 dark:text-teal-400' },
  amber:   { bg: 'bg-orange-50 dark:bg-orange-950/40',   text: 'text-orange-600 dark:text-orange-400' },
  pink:    { bg: 'bg-pink-50 dark:bg-pink-950/40',       text: 'text-pink-600 dark:text-pink-400' },
  cyan:    { bg: 'bg-cyan-50 dark:bg-cyan-950/40',       text: 'text-cyan-600 dark:text-cyan-400' },
};

function StatCard({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: string | number; color: keyof typeof iconTint }) {
  const tint = iconTint[color];
  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${tint.bg} ${tint.text}`}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-[var(--color-text-primary)] truncate">{value}</p>
          <p className="text-sm text-[var(--color-text-tertiary)] truncate">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart tooltip — token-based, matches the rest of the app's cards.
// ---------------------------------------------------------------------------
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-semibold text-[var(--color-text-primary)] mb-0.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-[var(--color-text-secondary)]">
          <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-semibold text-[var(--color-text-primary)]">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { isDark } = useTheme();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/analytics/dashboard');
      setStats(data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={fetchStats} className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700">Retry</button>
        </div>
      </div>
    );
  }

  const categoryColors = isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;
  const gridColor = isDark ? '#1e293b' : '#e2e8f0';
  const axisColor = isDark ? '#64748b' : '#94a3b8';

  // Fixed category order (never re-sorted by value) with a color assigned
  // per identity, not per rank.
  const distribution = CATEGORY_ORDER
    .map((cat) => stats!.courseDistribution.find((c) => c.category === cat))
    .filter((c): c is { category: string; count: number } => !!c && c.count > 0);

  const monthlyData = stats!.monthlyRegistrations.map((m) => ({ month: m.month.slice(5), count: m.count }));
  const occupancyRate = stats!.enrollment.occupancyRate;
  const radialData = [{ name: 'Occupancy', value: occupancyRate, fill: isDark ? '#34d399' : '#059669' }];

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Admin Dashboard</h1>

        {/* Stat Cards Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={GraduationCap} label="Total Students" value={stats!.students.total} color="blue" />
          <StatCard icon={BookOpen} label="Published Courses" value={stats!.courses.published} color="green" />
          <StatCard icon={Presentation} label="Teachers" value={stats!.teachers} color="purple" />
          <StatCard icon={DollarSign} label="Revenue" value={`$${stats!.totalRevenue.toLocaleString()}`} color="gold" />
          <StatCard icon={UserCheck} label="Active Students" value={stats!.students.active} color="emerald" />
          <StatCard icon={Layers} label="Total Courses" value={stats!.courses.total} color="amber" />
          <StatCard icon={Users} label="Parents" value={stats!.parents} color="pink" />
          <StatCard icon={Sparkles} label="New (30 days)" value={stats!.recentRegistrations} color="cyan" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Enrollment Overview — radial gauge */}
          <div className="flex h-[360px] flex-col rounded-xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-6">
            <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-1">Enrollment Overview</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-2">
              {stats!.enrollment.totalEnrolled} enrolled of {stats!.enrollment.totalCapacity} capacity
            </p>
            <div className="relative flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="70%"
                  outerRadius="100%"
                  data={radialData}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background={{ fill: isDark ? '#0f172a' : '#f1f5f9' }} dataKey="value" cornerRadius={8} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-[var(--color-text-primary)]">{occupancyRate}%</span>
                <span className="text-xs text-[var(--color-text-tertiary)]">occupied</span>
              </div>
            </div>
          </div>

          {/* Course Distribution — donut + legend */}
          <div className="flex h-[360px] flex-col rounded-xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-6">
            <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-4">Course Distribution</h2>
            {distribution.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)] py-12 text-center">No courses yet</p>
            ) : (
              <div className="flex flex-1 items-center gap-4 min-h-0">
                <div className="h-40 w-40 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribution}
                        dataKey="count"
                        nameKey="category"
                        innerRadius="60%"
                        outerRadius="100%"
                        paddingAngle={2}
                        stroke={isDark ? '#0a0f1a' : '#ffffff'}
                        strokeWidth={2}
                      >
                        {distribution.map((d) => (
                          <Cell key={d.category} fill={categoryColors[d.category]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5 min-w-0 max-h-full overflow-y-auto">
                  {distribution.map((d) => (
                    <li key={d.category} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: categoryColors[d.category] }} />
                      <span className="flex-1 text-[var(--color-text-secondary)] truncate">{catLabels[d.category] || d.category}</span>
                      <span className="font-semibold text-[var(--color-text-primary)]">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Monthly Registrations — bar chart */}
          <div className="flex h-[360px] flex-col rounded-xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-6">
            <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-4">Monthly Registrations</h2>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gridColor} />
                  <XAxis dataKey="month" tick={{ fill: axisColor, fontSize: 11 }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }} />
                  <Bar dataKey="count" name="Registrations" fill={isDark ? '#34d399' : '#059669'} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
