import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileText,
  GraduationCap,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import api from '../../../lib/axios';

interface CourseCard {
  _id: string;
  title: { en: string; so?: string; ar?: string };
  slug: string;
  category: string;
  status: string;
  studentCount?: number;
  class?: { _id?: string; title?: string; section?: string } | string | null;
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
    avgPerformance: number | null;
    performanceSamples?: number;
  };
  teacher: {
    name?: string;
    teacherId: string;
    qualification?: string;
    // Backend (teacher.model.ts) stores this as string[] — rendering the
    // array directly (as this code previously assumed a plain string) would
    // concatenate entries with no separator (e.g. "TajweedFiqh").
    specialization?: string[];
  };
}

interface TeachingSchedule {
  _id: string;
  startTime: string;
  endTime: string;
  class?: { _id?: string; title?: string; section?: string } | null;
}

interface Duty {
  _id: string;
  examDate: string;
  startTime: string;
  endTime: string;
  studentCount: number;
  completed: boolean;
  room?: { name?: string; building?: string };
  period?: { name?: string; academicYear?: string };
}

const cardClass = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm';

const classNameOf = (course: CourseCard) => {
  const cls = course.class;
  if (!cls || typeof cls === 'string') return '';
  return [cls.title, cls.section].filter(Boolean).join(' ');
};

const dutyStart = (duty: Duty) => {
  const date = new Date(duty.examDate);
  if (Number.isNaN(date.getTime())) return Number.MAX_SAFE_INTEGER;
  const day = date.toISOString().slice(0, 10);
  return new Date(`${day}T${duty.startTime || '00:00'}:00`).getTime();
};

export function TeacherDashboard() {
  const { i18n } = useTranslation();
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const isSo = lang === 'so';

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [teachingSchedule, setTeachingSchedule] = useState<TeachingSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const [dashboardResult, dutiesResult, scheduleResult] = await Promise.allSettled([
      api.get('/teacher-portal/dashboard'),
      api.get('/exams/invigilators/my'),
      api.get('/class-schedules/my-teaching'),
    ]);

    if (dashboardResult.status === 'fulfilled') {
      setDashboard(dashboardResult.value.data?.data || null);
    } else {
      setError(dashboardResult.reason?.response?.data?.message || 'Failed to load dashboard');
    }

    if (dutiesResult.status === 'fulfilled') {
      setDuties(dutiesResult.value.data?.data || []);
    } else {
      setDuties([]);
    }

    if (scheduleResult.status === 'fulfilled') {
      setTeachingSchedule(scheduleResult.value.data?.data || []);
    } else {
      setTeachingSchedule([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const nextDuty = useMemo(() => {
    const now = Date.now();
    return [...duties]
      .filter((duty) => !duty.completed && dutyStart(duty) >= now)
      .sort((a, b) => dutyStart(a) - dutyStart(b))[0] || null;
  }, [duties]);

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
          <button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const assignedClasses = new Set(
    [
      ...teachingSchedule.map((item) => String(item.class?._id || '')),
      ...dashboard.activeCourses.map((course) => {
        const cls = course.class;
        return typeof cls === 'string' ? cls : String(cls?._id || '');
      }),
    ].filter(Boolean),
  );

  const weeklyMinutes = teachingSchedule.reduce((sum, item) => {
    const [startHour, startMinute] = String(item.startTime || '').split(':').map(Number);
    const [endHour, endMinute] = String(item.endTime || '').split(':').map(Number);
    if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return sum;
    const minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    return sum + Math.max(0, minutes);
  }, 0);

  const weeklyHours = weeklyMinutes / 60;
  const weeklyHoursLabel = Number.isInteger(weeklyHours)
    ? String(weeklyHours)
    : weeklyHours.toFixed(1);

  const stats = [
    {
      label: isSo ? 'Fasallada' : 'Classes',
      value: assignedClasses.size,
      icon: GraduationCap,
      tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300',
    },
    {
      label: isSo ? 'Ardayda' : 'Students',
      value: dashboard.stats.totalStudents,
      icon: Users,
      tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
    },
    {
      label: isSo ? 'Koorsooyinka' : 'Courses',
      value: dashboard.stats.totalCourses,
      icon: BookOpen,
      tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    },
    {
      label: isSo ? 'Saacadaha / usbuuc' : 'Hrs / Week',
      value: weeklyHoursLabel,
      icon: Clock3,
      tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    },
  ];

  const quickActions = [
    { label: isSo ? 'Xaadirinta ardayda' : 'Student Attendance', href: '/teacher/attendance', icon: ClipboardCheck, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
    { label: isSo ? 'Imtixaannada' : 'Exam Workspace', href: '/teacher/exams', icon: FileText, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300' },
    { label: isSo ? 'Qiimee shaqada' : 'Review Work', href: '/teacher/gradebook', icon: ClipboardList, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
    { label: isSo ? 'Natiijooyinka' : 'Enter Results', href: '/teacher/results/enter', icon: GraduationCap, tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-3 sm:p-5 lg:p-8">
      <section className="relative isolate overflow-hidden rounded-[2rem] border border-sky-100 bg-gradient-to-br from-sky-50 via-indigo-50 to-cyan-50 text-slate-900 shadow-md dark:border-slate-700 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900">
        <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-12 h-36 w-36 rounded-full bg-gradient-to-br from-sky-300/80 to-blue-500/70 blur-[1px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-1/4 h-36 w-52 rounded-full bg-gradient-to-r from-violet-300/70 to-cyan-300/70 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 rounded-full bg-gradient-to-br from-violet-200 to-indigo-300 opacity-80" />
        <div className="relative flex min-h-[190px] items-center gap-4 px-4 py-7 sm:min-h-[230px] sm:gap-7 sm:px-7 sm:py-8 lg:px-9">
          <div className="relative z-10 flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-[5px] border-white bg-gradient-to-br from-blue-200 via-indigo-200 to-sky-300 text-indigo-800 shadow-lg sm:h-32 sm:w-32 sm:border-[6px]">
            <span className="text-4xl font-black sm:text-5xl">{(dashboard.teacher?.name || 'T').trim().charAt(0).toUpperCase()}</span>
            <span aria-label="Online" title="Online" className="absolute bottom-0 right-0 h-5 w-5 rounded-full border-[3px] border-white bg-emerald-500 sm:h-7 sm:w-7 sm:border-4" />
          </div>
          <div className="relative z-10 min-w-0 flex-1 py-1">
            <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/75 px-3 py-2 text-sm font-extrabold text-blue-700 shadow-sm backdrop-blur sm:px-4 sm:text-lg dark:bg-white/10 dark:text-sky-200">
              <span aria-hidden="true" className="text-xl sm:text-2xl">👋</span>
              <span>{isSo ? 'Soo dhowow' : lang === 'ar' ? 'مرحباً بعودتك' : 'Welcome back,'}</span>
            </p>
            <h1 className="mt-3 break-words text-xl font-black leading-tight tracking-tight text-blue-950 sm:mt-3 sm:text-2xl md:text-3xl lg:text-4xl dark:text-white">
              {dashboard.teacher?.name || (isSo ? 'Macallin' : 'Teacher')}
            </h1>
            <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-violet-100/90 px-4 py-2 text-sm font-extrabold text-violet-800 shadow-sm sm:mt-4 sm:text-base dark:bg-violet-400/15 dark:text-violet-200">
              <span aria-hidden="true" className="text-lg sm:text-xl">🌙</span>
              <span>{(() => { const hour = new Date().getHours(); return hour < 12 ? (isSo ? 'Subax wanaagsan' : lang === 'ar' ? 'صباح الخير' : 'Good Morning') : hour < 17 ? (isSo ? 'Galab wanaagsan' : lang === 'ar' ? 'مساء الخير' : 'Good Afternoon') : (isSo ? 'Fiid wanaagsan' : lang === 'ar' ? 'مساء الخير' : 'Good Evening'); })()}</span>
            </p>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 hidden items-end gap-1 pr-4 sm:flex">
            <div className="mb-1 h-5 w-24 rotate-[-8deg] rounded-md border border-blue-300 bg-blue-500 shadow-sm" />
            <div className="mb-2 h-5 w-28 rotate-[-3deg] rounded-md border border-cyan-300 bg-cyan-400 shadow-sm" />
            <div className="mb-3 h-5 w-24 rotate-[4deg] rounded-md border border-amber-300 bg-amber-400 shadow-sm" />
            <BookOpen className="mb-7 ml-[-7rem] h-9 w-9 text-blue-700/70" />
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`${cardClass} min-w-0 p-4 sm:p-5`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="mt-4 truncate text-2xl font-black text-[var(--color-text-primary)] sm:text-3xl">{value}</p>
            <p className="mt-1 text-xs font-bold text-[var(--color-text-secondary)] sm:text-sm">{label}</p>
          </div>
        ))}
      </section>

      <section className={`${cardClass} p-4 sm:p-5`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-[var(--color-text-primary)]">{isSo ? 'Shaqo degdeg ah' : 'Quick Actions'}</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{isSo ? 'Hal taabasho ku bilow.' : 'Start the task you need now.'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quickActions.map(({ label, href, icon: Icon, tone }) => (
            <Link key={href} to={href} className="group flex min-h-24 flex-col justify-between rounded-2xl border border-[var(--color-border-subtle)] p-3.5 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
              <span className="mt-3 flex items-end justify-between gap-2 text-xs font-black text-[var(--color-text-primary)] sm:text-sm">
                <span>{label}</span><ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <section className={`${cardClass} overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-4 sm:px-5">
            <div>
              <h2 className="font-black text-[var(--color-text-primary)]">{isSo ? 'Koorsooyinkayga' : 'My Courses'}</h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{dashboard.activeCourses.length} active</p>
            </div>
            <Link to="/teacher/courses" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-emerald-600">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-[var(--color-border-subtle)]">
            {dashboard.activeCourses.slice(0, 5).map((course, index) => {
              const title = course.title?.[lang] || course.title?.en || 'Course';
              const classLabel = classNameOf(course);
              const tones = [
                'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
                'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
                'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300',
                'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
              ];
              return (
                <Link key={course._id} to={`/teacher/courses/${course._id}`} className="flex min-h-16 items-center gap-3 px-4 py-3.5 transition hover:bg-[var(--color-surface-secondary)] sm:px-5">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${tones[index % tones.length]}`}>
                    {title.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-[var(--color-text-primary)]">{title}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--color-text-tertiary)]">
                      {classLabel || 'Assigned class'} · {course.studentCount || 0} students
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
                </Link>
              );
            })}
            {dashboard.activeCourses.length === 0 && <p className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No active courses assigned.</p>}
          </div>
        </section>

        <div className="space-y-4">
          <section className={`${cardClass} p-4 sm:p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-600">Next Exam Duty</p>
                {nextDuty ? (
                  <>
                    <h2 className="mt-2 text-lg font-black">{nextDuty.room?.name || 'Exam Room'}</h2>
                    <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{nextDuty.period?.name || 'Exam'} · {nextDuty.studentCount} students</p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-2 text-lg font-black">No upcoming duty</h2>
                    <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">New invigilation assignments will appear here.</p>
                  </>
                )}
              </div>
              <div className="rounded-xl bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300"><CalendarDays className="h-5 w-5" /></div>
            </div>

            {nextDuty && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                  <p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Date</p>
                  <p className="mt-1 text-sm font-bold">{new Date(nextDuty.examDate).toLocaleDateString(undefined,{day:'numeric',month:'short'})}</p>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                  <p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Time</p>
                  <p className="mt-1 text-sm font-bold">{nextDuty.startTime}–{nextDuty.endTime}</p>
                </div>
              </div>
            )}

            <Link to="/teacher/exam-attendance" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white">
              <Clock3 className="h-4 w-4" /> Open Exam Duties
            </Link>
          </section>

        </div>
      </div>
    </div>
  );
}

export default TeacherDashboard;
