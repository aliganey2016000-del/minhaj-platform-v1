import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  DollarSign,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Plus,
  Presentation,
  School,
  Settings,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
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

interface StudentStats {
  total: number;
  byStatus: { active: number; inactive: number; graduated: number; suspended: number };
  byClass: Array<{ classId: string | null; label: string; count: number }>;
  byDepartment: Array<{ department: string; count: number }>;
  byOrganization: Array<{ schoolId: string | null; name: string; count: number }>;
  byShift: Array<{ shift: string; count: number }>;
  enrollmentTrend: Array<{ month: string; count: number }>;
}

interface AttendanceData {
  attendance: { present: number; late: number; absent: number; excused: number };
  sessions: { total: number; complete: number; partial: number; missing: number; completionRate: number };
}

interface ClassItem {
  _id: string;
  title: string;
  section?: string;
  room?: string;
  capacity?: number | null;
  department?: string;
  academicYear?: string;
  status?: string;
}

const EMPTY_STATS: DashboardStats = {
  students: { total: 0, active: 0 },
  courses: { total: 0, published: 0 },
  teachers: 0,
  parents: 0,
  recentRegistrations: 0,
  totalRevenue: 0,
  courseDistribution: [],
  monthlyRegistrations: [],
  enrollment: { totalEnrolled: 0, totalCapacity: 0, occupancyRate: 0 },
};

const toneStyles = {
  blue: { icon: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  green: { icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  purple: { icon: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400', badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  amber: { icon: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  teal: { icon: 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400', badge: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
  pink: { icon: 'bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400', badge: 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300' },
} as const;

type Tone = keyof typeof toneStyles;

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function compactMoney(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return `$${Math.round(value).toLocaleString()}`;
}

function formatMonth(value: string) {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

async function loadActiveClasses(): Promise<ClassItem[]> {
  const collected: ClassItem[] = [];
  const limit = 200;
  let page = 1;

  while (true) {
    const response = await api.get('/classes', { params: { status: 'active', page, limit } });
    const batch = (response.data?.data || []) as ClassItem[];
    collected.push(...batch);
    const meta = response.data?.meta || {};
    const total = Number(meta.total || 0);
    const totalPages = Number(meta.totalPages || 0);

    if (
      batch.length === 0 ||
      batch.length < limit ||
      (totalPages > 0 && page >= totalPages) ||
      (total > 0 && collected.length >= total)
    ) break;

    page += 1;
  }

  return collected;
}

function QuickAction({ icon: Icon, label, tone, onClick }: { icon: LucideIcon; label: string; tone: Tone; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-2 py-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneStyles[tone].icon}`}>
        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
      </span>
      <span className="text-[11px] font-semibold leading-tight text-[var(--color-text-primary)] sm:text-xs">{label}</span>
    </button>
  );
}

function MetricCard({ icon: Icon, label, value, badge, tone }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  badge: string;
  tone: Tone;
}) {
  return (
    <div className="min-h-[118px] rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 shadow-sm transition hover:shadow-md sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneStyles[tone].icon}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${toneStyles[tone].badge}`}>{badge}</span>
      </div>
      <p className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-[var(--color-text-tertiary)] sm:text-xs">{label}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">{label}</p>
      <p className="text-sm font-bold text-[var(--color-text-primary)]">{payload[0]?.value || 0} registrations</p>
    </div>
  );
}

export function AdminDashboard() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const isStaff = user?.role === 'staff';
  const canQuickAct = user?.role === 'admin' || user?.role === 'org_admin';

  const [stats, setStats] = useState<DashboardStats | null>(isStaff ? EMPTY_STATS : null);
  const [studentStats, setStudentStats] = useState<StudentStats | null>(null);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');

    if (isStaff) {
      setStats(EMPTY_STATS);
      setStudentStats(null);
      setAttendance(null);
      setClasses([]);
      setLoading(false);
      return;
    }

    try {
      const analyticsResponse = await api.get('/analytics/dashboard');
      setStats(analyticsResponse.data?.data || EMPTY_STATS);

      const [studentResponse, attendanceResponse, classResponse] = await Promise.all([
        api.get('/students/stats').catch(() => null),
        api.get('/attendance/school/dashboard', { params: { date: localDate(), days: 30, threshold: 90 } }).catch(() => null),
        loadActiveClasses().catch(() => [] as ClassItem[]),
      ]);

      setStudentStats(studentResponse?.data?.data || null);
      setAttendance(attendanceResponse?.data?.data || null);
      setClasses(classResponse);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDashboard();
  }, [isStaff]);

  const safeStats = stats || EMPTY_STATS;

  const academicYear = useMemo(() => {
    const counts = new Map<string, number>();
    classes.forEach((cls) => {
      const year = cls.academicYear?.trim();
      if (year) counts.set(year, (counts.get(year) || 0) + 1);
    });
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]));
    if (ranked[0]?.[0]) return ranked[0][0];
    const now = new Date().getFullYear();
    return `${now}-${now + 1}`;
  }, [classes]);

  const attendanceSummary = useMemo(() => {
    if (!attendance) return null;
    const { present, late, absent, excused } = attendance.attendance;
    const total = present + late + absent + excused;
    const attending = present + late;
    return {
      attending,
      rate: total > 0 ? Math.round((attending / total) * 100) : 0,
    };
  }, [attendance]);

  const capacity = useMemo(() => {
    const classCapacity = classes.reduce((sum, cls) => sum + Math.max(0, Number(cls.capacity || 0)), 0);
    if (classCapacity > 0) {
      const enrolled = safeStats.students.active;
      return {
        title: 'Campus Capacity',
        enrolled,
        capacity: classCapacity,
        rate: Math.min(100, Math.round((enrolled / classCapacity) * 100)),
        available: Math.max(0, classCapacity - enrolled),
        usesClasses: true,
      };
    }
    return {
      title: 'Learning Capacity',
      enrolled: safeStats.enrollment.totalEnrolled,
      capacity: safeStats.enrollment.totalCapacity,
      rate: safeStats.enrollment.occupancyRate,
      available: Math.max(0, safeStats.enrollment.totalCapacity - safeStats.enrollment.totalEnrolled),
      usesClasses: false,
    };
  }, [classes, safeStats.enrollment, safeStats.students.active]);

  const departmentCapacity = useMemo(() => {
    const capacities = new Map<string, number>();
    classes.forEach((cls) => {
      const department = cls.department?.trim() || 'Unassigned';
      capacities.set(department, (capacities.get(department) || 0) + Math.max(0, Number(cls.capacity || 0)));
    });
    const studentCounts = new Map<string, number>();
    (studentStats?.byDepartment || []).forEach((item) => {
      const department = item.department?.trim() || 'Unassigned';
      studentCounts.set(department, item.count);
    });
    const names = new Set([...capacities.keys(), ...studentCounts.keys()]);
    return [...names]
      .map((name) => {
        const max = capacities.get(name) || 0;
        const count = studentCounts.get(name) || 0;
        return { name, max, count, rate: max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0 };
      })
      .sort((a, b) => (b.max || b.count) - (a.max || a.count))
      .slice(0, 2);
  }, [classes, studentStats]);

  const gradeRows = useMemo(
    () => (studentStats?.byClass || []).filter((row) => row.classId && row.count > 0).sort((a, b) => b.count - a.count).slice(0, 3),
    [studentStats],
  );

  const growthData = useMemo(
    () => safeStats.monthlyRegistrations.map((item) => ({ month: formatMonth(item.month), count: item.count })),
    [safeStats.monthlyRegistrations],
  );

  const sixMonthGrowth = growthData.reduce((sum, item) => sum + item.count, 0);
  const latestGrowth = growthData.length > 0 ? growthData[growthData.length - 1].count : 0;
  const roleLabel = user?.role === 'admin' ? 'Super Admin' : user?.role === 'org_admin' ? 'Org Admin' : 'Admin Staff';
  const gridColor = isDark ? '#1e293b' : '#e2e8f0';
  const axisColor = isDark ? '#64748b' : '#94a3b8';
  const gaugeTrack = isDark ? '#1e293b' : '#e2e8f0';
  const capacityStatus = capacity.rate >= 95 ? 'Near Capacity' : capacity.rate >= 80 ? 'Optimal' : 'Available';

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-5 animate-pulse">
          <div className="h-16 rounded-2xl bg-[var(--color-surface-tertiary)]" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-[var(--color-surface-tertiary)]" />)}</div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-[var(--color-surface-tertiary)]" />)}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[420px] items-center justify-center px-4">
        <div className="max-w-sm rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/20">
          <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-red-500" />
          <p className="mb-4 text-sm text-red-700 dark:text-red-300">{error}</p>
          <button type="button" onClick={() => void fetchDashboard()} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-8">
      <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Admin Dashboard</h1>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{roleLabel}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)] sm:text-sm">Live overview of students, academics, attendance and finance.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CalendarCheck className="h-3.5 w-3.5" /> Academic Year · {academicYear}
          </span>
        </section>

        {canQuickAct && (
          <section className="grid grid-cols-4 gap-2.5 sm:gap-4">
            <QuickAction icon={UserPlus} label="New Student" tone="blue" onClick={() => navigate('/admin/students', { state: { openCreate: true } })} />
            <QuickAction icon={DollarSign} label="Collect Fee" tone="green" onClick={() => navigate('/admin/payments/record')} />
            <QuickAction icon={CalendarCheck} label="Attendance" tone="purple" onClick={() => navigate('/admin/attendance')} />
            <QuickAction icon={Megaphone} label="Broadcast" tone="amber" onClick={() => navigate('/admin/announcements')} />
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">Core Metrics</p>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Live Updates</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <MetricCard icon={GraduationCap} label="Total Students" value={safeStats.students.total.toLocaleString()} badge={`+${safeStats.recentRegistrations} · 30d`} tone="blue" />
            <MetricCard icon={School} label="Active Classes" value={classes.length.toLocaleString()} badge="Active" tone="green" />
            <MetricCard icon={Presentation} label="Teachers" value={safeStats.teachers.toLocaleString()} badge="Staff" tone="purple" />
            <MetricCard icon={DollarSign} label="Net Collection" value={compactMoney(safeStats.totalRevenue)} badge="Collected" tone="amber" />
            <MetricCard icon={UserCheck} label={attendanceSummary ? 'Attending Today' : 'Active Students'} value={(attendanceSummary?.attending ?? safeStats.students.active).toLocaleString()} badge={attendanceSummary ? `${attendanceSummary.rate}% today` : 'Active'} tone="teal" />
            <MetricCard icon={Users} label="Parents Portal" value={safeStats.parents.toLocaleString()} badge="Linked" tone="pink" />
          </div>
        </section>

        <section className="rounded-[22px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[var(--color-text-primary)] sm:text-lg">{capacity.title}</h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{capacity.enrolled.toLocaleString()} enrolled of {capacity.capacity.toLocaleString()} total capacity</p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{capacityStatus}</span>
          </div>

          <div className="grid items-center gap-6 md:grid-cols-[190px_1fr]">
            <div className="flex justify-center">
              <div className="relative h-36 w-36 rounded-full p-[13px] sm:h-40 sm:w-40" style={{ background: `conic-gradient(#10b981 ${Math.max(0, Math.min(100, capacity.rate)) * 3.6}deg, ${gaugeTrack} 0deg)` }}>
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[var(--color-surface-primary)]">
                  <span className="text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)]">{capacity.rate}%</span>
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Occupied</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {departmentCapacity.length > 0 && capacity.usesClasses ? departmentCapacity.map((item, index) => (
                <div key={item.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-[var(--color-text-secondary)]">{item.name}</span>
                    <span className="font-bold text-[var(--color-text-primary)]">{item.count} / {item.max || '—'}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                    <div className={`h-full rounded-full ${index === 0 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${item.rate}%` }} />
                  </div>
                </div>
              )) : (
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs text-[var(--color-text-tertiary)]">Add class capacity values to see department-level utilization here.</div>
              )}
              <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-3 text-xs">
                <span className="text-[var(--color-text-tertiary)]">Available Seats</span>
                <span className="font-extrabold text-[var(--color-text-primary)]">{capacity.available.toLocaleString()} seats left</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[var(--color-text-primary)] sm:text-lg">Grade Distribution</h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Largest current classes by enrolled students</p>
            </div>
            <button type="button" onClick={() => navigate('/admin/students')} className="text-xs font-bold text-primary-600 hover:text-primary-700">View All</button>
          </div>

          {gradeRows.length === 0 ? (
            <div className="rounded-xl bg-[var(--color-surface-secondary)] p-6 text-center text-sm text-[var(--color-text-tertiary)]">No class enrollment data yet.</div>
          ) : (
            <div className="space-y-2.5">
              {gradeRows.map((row, index) => {
                const tint = index === 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : index === 1 ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300';
                const short = row.label.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'CL';
                return (
                  <button key={row.classId || row.label} type="button" onClick={() => navigate('/admin/students')} className="flex w-full items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] p-3 text-left transition hover:bg-[var(--color-surface-tertiary)]">
                    <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${tint}`}>{short}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--color-text-primary)]">{row.label}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">Current enrollment</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-[var(--color-text-primary)]">{row.count} Students</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-emerald-600">Active class</p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)]" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[22px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[var(--color-text-primary)] sm:text-lg">Admissions & Growth</h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Monthly student registrations · last 6 months</p>
            </div>
            <span className="rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-[10px] font-bold text-[var(--color-text-secondary)]">{sixMonthGrowth} total</span>
          </div>

          <div className="relative h-52 w-full sm:h-64">
            {latestGrowth > 0 && (
              <div className="absolute right-2 top-0 z-10 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white dark:bg-slate-100 dark:text-slate-900">+{latestGrowth} latest month</div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthData} margin={{ top: 28, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminGrowthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#10b981', strokeDasharray: '4 4' }} />
                <Area type="monotone" dataKey="count" name="Registrations" stroke="#059669" strokeWidth={2.5} fill="url(#adminGrowthFill)" activeDot={{ r: 4, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-[20px] border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white"><AlertTriangle className="h-5 w-5" /></span>
            <div>
              <p className="text-sm font-extrabold text-amber-900 dark:text-amber-200">{safeStats.recentRegistrations} New Student Registrations in the Last 30 Days</p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Review recent admissions and confirm each student's class placement.</p>
            </div>
          </div>
          <button type="button" onClick={() => navigate('/admin/students')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-700 shadow-sm hover:bg-emerald-50 dark:border-amber-800 dark:bg-slate-900 dark:text-emerald-300">
            Review Now <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]/95 px-3 py-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end">
          <button type="button" onClick={() => navigate('/admin')} className="flex flex-col items-center gap-1 py-1 text-primary-600"><LayoutDashboard className="h-5 w-5" /><span className="text-[9px] font-bold">Dashboard</span></button>
          <button type="button" onClick={() => navigate('/admin/students')} className="flex flex-col items-center gap-1 py-1 text-[var(--color-text-tertiary)]"><GraduationCap className="h-5 w-5" /><span className="text-[9px] font-medium">Students</span></button>
          <button type="button" onClick={() => navigate('/admin/students', { state: { openCreate: true } })} className="mx-auto -mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg ring-4 ring-[var(--color-surface-secondary)]"><Plus className="h-6 w-6" /></button>
          <button type="button" onClick={() => navigate('/admin/payments')} className="flex flex-col items-center gap-1 py-1 text-[var(--color-text-tertiary)]"><DollarSign className="h-5 w-5" /><span className="text-[9px] font-medium">Finance</span></button>
          <button type="button" onClick={() => navigate('/admin/settings')} className="flex flex-col items-center gap-1 py-1 text-[var(--color-text-tertiary)]"><Settings className="h-5 w-5" /><span className="text-[9px] font-medium">Settings</span></button>
        </div>
      </nav>
    </div>
  );
}

export default AdminDashboard;
