/**
 * Teacher Course Workspace
 *
 * A course-scoped command center between My Courses and the individual tools.
 * Data is loaded from the teacher dashboard (already server-scoped) and the
 * teacher analytics endpoint, so the workspace never needs an unrestricted
 * course lookup.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  GraduationCap,
  Lock,
  PlayCircle,
  Users,
  TrendingUp,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import api from '../../../lib/axios';

interface Course {
  _id: string;
  title: { en: string; so?: string; ar?: string } | string;
  category?: string;
  level?: string;
  duration?: number;
  enrolledStudents?: number;
  maxStudents?: number;
  status?: string;
  thumbnail?: string;
  school?: { name?: string } | null;
  class?: { title?: string; section?: string } | null;
}

interface DashboardData {
  activeCourses?: Course[];
  draftCourses?: Course[];
  teacher?: { coursePermission?: string };
}

interface Analytics {
  totalStudents?: number;
  totalSubmissions?: number;
  gradedCount?: number;
  pendingCount?: number;
  avgClassGrade?: number;
}

function courseTitle(course: Course, lang: 'en' | 'so' | 'ar') {
  if (typeof course.title === 'string') return course.title;
  return course.title[lang] || course.title.en || 'Untitled course';
}

export function TeacherCourseWorkspace() {
  const { courseId } = useParams<{ courseId: string }>();
  const { i18n } = useTranslation();
  const lang = (i18n.language as 'en' | 'so' | 'ar') || 'en';

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!courseId) {
      setError('Course not found');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [dashboardResponse, analyticsResponse] = await Promise.all([
        api.get('/teacher-portal/dashboard'),
        api.get(`/teacher-portal/courses/${courseId}/analytics`),
      ]);
      setDashboard(dashboardResponse.data?.data || null);
      setAnalytics(analyticsResponse.data?.data || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load course workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [courseId]);

  const course = useMemo(() => {
    const allCourses = [
      ...(dashboard?.activeCourses || []),
      ...(dashboard?.draftCourses || []),
    ];
    return allCourses.find((item) => item._id === courseId) || null;
  }, [dashboard, courseId]);

  const isBuilder = dashboard?.teacher?.coursePermission === 'COURSE_BUILDER';

  const actionCards = [
    {
      href: isBuilder ? `/teacher/courses/${courseId}/builder` : `/teacher/lessons?courseId=${courseId}`,
      icon: isBuilder ? BookOpen : PlayCircle,
      title: isBuilder
        ? (lang === 'so' ? 'Dhismaha Koorso' : 'Course Builder')
        : (lang === 'so' ? 'Daawo Casharrada' : 'Open Lessons'),
      description: isBuilder
        ? (lang === 'so' ? 'Maamul cutubyada, casharrada iyo nuxurka.' : 'Manage chapters, lessons and course content.')
        : (lang === 'so' ? 'Daawo jidka waxbarashada ee koorsada.' : 'Open the read-only learning path for this course.'),
      iconClass: isBuilder ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
    },
    {
      href: `/teacher/quizzes?courseId=${courseId}`,
      icon: FileQuestion,
      title: lang === 'so' ? 'Quiz-yada' : 'Quizzes',
      description: lang === 'so' ? 'Abuur oo maamul qiimeynta quiz-ka.' : 'Create and manage course quizzes.',
      iconClass: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30',
    },
    {
      href: `/teacher/courses/${courseId}/gradebook`,
      icon: ClipboardList,
      title: lang === 'so' ? 'Buugga Qiimeynta' : 'Gradebook',
      description: lang === 'so' ? 'Hubi gudbinta iyo geli dhibcaha.' : 'Review submissions and enter grades.',
      iconClass: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
    },
    {
      href: `/teacher/analytics?courseId=${courseId}`,
      icon: BarChart3,
      title: lang === 'so' ? 'Falanqayn' : 'Analytics',
      description: lang === 'so' ? 'La soco waxqabadka fasalka.' : 'Monitor class performance and outcomes.',
      iconClass: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30',
    },
    {
      href: `/teacher/courses/${courseId}/gate-report`,
      icon: CheckCircle2,
      title: lang === 'so' ? 'Warbixinta Gate' : 'Gate Report',
      description: lang === 'so' ? 'Hubi gates-ka iyo horumarka content-ka.' : 'Inspect content gates and verification status.',
      iconClass: 'text-teal-600 bg-teal-50 dark:bg-teal-950/30',
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Loading course workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center p-6">
        <div className="w-full rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/40 dark:bg-red-950/20">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <h1 className="font-bold text-red-700 dark:text-red-300">
            {lang === 'so' ? 'Koorsada lama helin' : 'Course unavailable'}
          </h1>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error || 'This course is not assigned to your teacher account.'}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:text-red-300">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
            <Link to="/teacher/courses" className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">
              {lang === 'so' ? 'Koorsooyinkayga' : 'My Courses'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const title = courseTitle(course, lang);
  const enrollment = course.maxStudents ? Math.round(((course.enrolledStudents || 0) / course.maxStudents) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/teacher/courses" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
            <ArrowLeft className="h-3.5 w-3.5" /> {lang === 'so' ? 'Koorsooyinkayga' : 'My Courses'}
          </Link>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[var(--color-text-primary)]">{title}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                {[course.school?.name, course.class?.title, course.class?.section].filter(Boolean).join(' · ') || (lang === 'so' ? 'Koorsadaada' : 'Your assigned course')}
              </p>
            </div>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          {isBuilder ? <BookOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {isBuilder ? 'COURSE_BUILDER' : 'STUDENT_VIEW'}
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: lang === 'so' ? 'Arday' : 'Students', value: analytics?.totalStudents ?? course.enrolledStudents ?? 0, icon: Users },
          { label: lang === 'so' ? 'Gudbin' : 'Submissions', value: analytics?.totalSubmissions ?? 0, icon: ClipboardList },
          { label: lang === 'so' ? 'Sugaya' : 'Pending', value: analytics?.pendingCount ?? 0, icon: TrendingUp },
          { label: lang === 'so' ? 'Celcelis' : 'Avg Grade', value: `${analytics?.avgClassGrade ?? 0}%`, icon: BarChart3 },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-[var(--color-text-tertiary)]"><item.icon className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-wide">{item.label}</span></div>
            <p className="text-xl font-extrabold text-[var(--color-text-primary)]">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--color-text-primary)]">{lang === 'so' ? 'Buuxinta Koorsada' : 'Course Enrollment'}</h2>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{course.enrolledStudents || 0} / {course.maxStudents || 0} students</p>
          </div>
          <span className="text-sm font-bold text-emerald-600">{Math.min(100, enrollment)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, enrollment)}%` }} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {actionCards.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} to={action.href} className="group rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${action.iconClass}`}><Icon className="h-5 w-5" /></div>
              <h2 className="text-sm font-bold text-[var(--color-text-primary)]">{action.title}</h2>
              <p className="mt-1.5 text-xs leading-5 text-[var(--color-text-tertiary)]">{action.description}</p>
              <span className="mt-4 inline-flex text-xs font-semibold text-emerald-600 group-hover:underline">Open →</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default TeacherCourseWorkspace;
