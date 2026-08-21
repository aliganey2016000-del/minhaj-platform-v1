import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  RefreshCw,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import api from '../../../lib/axios';

interface CourseCard {
  _id: string;
  title: { en: string; so?: string; ar?: string };
  slug: string;
  category: string;
  enrolledStudents: number;
  maxStudents: number;
  status: string;
}

interface PendingSubmission {
  _id: string;
  studentName: string;
  assignmentTitle: string;
  courseTitle: string;
  submittedAt: string;
  status: string;
}

interface DashboardData {
  activeCourses: CourseCard[];
  pendingSubmissions: PendingSubmission[];
  stats: {
    totalCourses: number;
    totalStudents: number;
    pendingSubmissions: number;
    avgPerformance: number;
  };
  teacher: { teacherId: string };
}

interface GamificationData {
  topStudents: Array<{ studentId: string; name: string; xp: number; level: number; streak: number }>;
  totalClassXP: number;
  participantCount: number;
}

const cardClass = 'rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]';

export function TeacherDashboard() {
  const { i18n } = useTranslation();
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const isSo = lang === 'so';
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [gamification, setGamification] = useState<GamificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const [dashboardResult, gamificationResult] = await Promise.allSettled([
      api.get('/teacher-portal/dashboard'),
      api.get('/teacher-portal/dashboard/gamification'),
    ]);

    if (dashboardResult.status === 'fulfilled') {
      setDashboard(dashboardResult.value.data?.data || null);
    } else {
      setError(dashboardResult.reason?.response?.data?.message || 'Failed to load dashboard');
    }

    if (gamificationResult.status === 'fulfilled') {
      setGamification(gamificationResult.value.data?.data || null);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto h-7 w-7 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
          <p className="mt-3 text-sm text-red-600">{error || 'Dashboard unavailable'}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const stats = [
    { label: isSo ? 'Koorsooyin' : 'Courses', value: dashboard.stats.totalCourses, icon: BookOpen },
    { label: isSo ? 'Arday' : 'Students', value: dashboard.stats.totalStudents, icon: Users },
    { label: isSo ? 'Sugaya' : 'To review', value: dashboard.stats.pendingSubmissions, icon: ClipboardList },
    { label: isSo ? 'Waxqabad' : 'Performance', value: `${dashboard.stats.avgPerformance}%`, icon: TrendingUp },
  ];

  const quickActions = [
    { label: isSo ? 'Qaado xaadirinta' : 'Take attendance', href: '/teacher/attendance', icon: ClipboardCheck },
    { label: isSo ? 'Qiimee shaqada' : 'Review submissions', href: '/teacher/gradebook', icon: ClipboardList },
    { label: isSo ? 'Casharrada' : 'Manage lessons', href: '/teacher/lessons', icon: BookOpen },
    { label: isSo ? 'Analytics' : 'View analytics', href: '/teacher/analytics', icon: TrendingUp },
  ];

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Teacher portal</p>
          <h1 className="mt-1 text-2xl font-black text-[var(--color-text-primary)]">
            {isSo ? 'Dashboard-ka Macallinka' : lang === 'ar' ? 'لوحة المعلم' : 'Teacher Dashboard'}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
            {isSo ? 'Wax walba oo muhiim ah hal meel.' : 'Your teaching activity at a glance.'}
            {dashboard.teacher?.teacherId ? ` · ID ${dashboard.teacher.teacherId}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className={`${cardClass} p-4`}>
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-black text-[var(--color-text-primary)]">{value}</p>
            <p className="mt-1 text-xs font-medium text-[var(--color-text-tertiary)]">{label}</p>
          </div>
        ))}
      </section>

      <section className={`${cardClass} mb-6 p-4 md:p-5`}>
        <div className="mb-3">
          <h2 className="text-sm font-bold text-[var(--color-text-primary)]">{isSo ? 'Tallaabooyin degdeg ah' : 'Quick actions'}</h2>
          <p className="text-xs text-[var(--color-text-tertiary)]">{isSo ? 'Bilow shaqada aad hadda u baahan tahay.' : 'Start the task you need right now.'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {quickActions.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              to={href}
              className="group flex min-h-20 items-center gap-3 rounded-xl border border-[var(--color-border-subtle)] p-3 transition hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-secondary)] text-emerald-600">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 text-xs font-bold text-[var(--color-text-primary)]">{label}</span>
              <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)] transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section className={`${cardClass} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-4 md:px-5">
              <div>
                <h2 className="text-sm font-bold text-[var(--color-text-primary)]">{isSo ? 'Koorsooyinkayga' : 'My courses'}</h2>
                <p className="text-xs text-[var(--color-text-tertiary)]">{dashboard.activeCourses.length} active</p>
              </div>
              <Link to="/teacher/courses" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {dashboard.activeCourses.slice(0, 6).map((course) => {
                const title = course.title?.[lang] || course.title?.en || 'Course';
                return (
                  <Link key={course._id} to={`/teacher/courses/${course._id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--color-surface-secondary)] md:px-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {course.category?.charAt(0)?.toUpperCase() || 'C'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[var(--color-text-primary)]">{title}</span>
                      <span className="block text-xs text-[var(--color-text-tertiary)]">{course.enrolledStudents}/{course.maxStudents} students</span>
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold capitalize text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{course.status}</span>
                  </Link>
                );
              })}
              {dashboard.activeCourses.length === 0 && <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No active courses.</p>}
            </div>
          </section>

          <section className={`${cardClass} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-4 md:px-5">
              <div>
                <h2 className="text-sm font-bold text-[var(--color-text-primary)]">{isSo ? 'Shaqooyinka sugaya' : 'Pending submissions'}</h2>
                <p className="text-xs text-[var(--color-text-tertiary)]">{dashboard.pendingSubmissions.length} need attention</p>
              </div>
              <Link to="/teacher/gradebook" className="text-xs font-bold text-emerald-600">Open gradebook</Link>
            </div>
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {dashboard.pendingSubmissions.slice(0, 5).map((submission) => (
                <div key={submission._id} className="flex items-center gap-3 px-4 py-3.5 md:px-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xs font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{submission.studentName?.charAt(0) || '?'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{submission.studentName} · {submission.assignmentTitle}</p>
                    <p className="truncate text-xs text-[var(--color-text-tertiary)]">{submission.courseTitle} · {new Date(submission.submittedAt).toLocaleDateString()}</p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold capitalize text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{submission.status}</span>
                </div>
              ))}
              {dashboard.pendingSubmissions.length === 0 && <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">Nothing waiting for review.</p>}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className={`${cardClass} overflow-hidden`}>
            <div className="border-b border-[var(--color-border-subtle)] px-4 py-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-bold text-[var(--color-text-primary)]">{isSo ? 'Hogaamiyayaasha XP' : 'Class leaderboard'}</h2>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> {gamification?.totalClassXP?.toLocaleString() || 0} class XP · {gamification?.participantCount || 0} students
              </div>
            </div>
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {gamification?.topStudents?.slice(0, 6).map((student, index) => (
                <div key={student.studentId} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 text-center text-xs font-black text-[var(--color-text-tertiary)]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[var(--color-text-primary)]">{student.name}{student.streak > 0 ? ` 🔥${student.streak}` : ''}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (student.xp / 1000) * 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-amber-600">{student.xp} XP</span>
                </div>
              ))}
              {!gamification?.topStudents?.length && <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No leaderboard data yet.</p>}
            </div>
          </section>

          <section className={`${cardClass} p-5`}>
            <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Attendance</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">Open today’s teaching schedule and mark students present, absent, late, or excused.</p>
            <Link to="/teacher/attendance" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
              <ClipboardCheck className="h-4 w-4" /> Take attendance
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default TeacherDashboard;
