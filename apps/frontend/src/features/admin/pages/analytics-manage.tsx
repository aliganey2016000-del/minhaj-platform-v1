import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileQuestion,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  Search,
  Target,
  Users,
} from 'lucide-react';
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

type LearningTab = 'overview' | 'lessons' | 'quizzes' | 'assignments' | 'results' | 'institution';

type PerformanceCourse = {
  courseId: string;
  title: { en?: string; so?: string; ar?: string } | string;
  class?: { title?: string; section?: string } | null;
  teacher?: { name?: string } | null;
  students: number;
  averageScore: number;
  quizAverage: number;
  interactiveAverage: number;
  completedActivities: number;
};

type PerformancePayload = {
  summary: {
    courses: number;
    students: number;
    averageScore: number;
    quizAverage: number;
    interactiveAverage: number;
    completedActivities: number;
  };
  courses: PerformanceCourse[];
};

const catLabels: Record<string, string> = {
  quran: 'Quran', fiqh: 'Fiqh', aqeedah: 'Aqeedah', seerah: 'Seerah',
  arabic: 'Arabic', tajweed: 'Tajweed', hadith: 'Hadith', akhlaq: 'Akhlaq',
};

const titleOf = (value: PerformanceCourse['title']) => typeof value === 'string' ? value : value?.en || value?.so || value?.ar || 'Course';
const classOf = (course: PerformanceCourse) => [course.class?.title, course.class?.section].filter(Boolean).join(' - ') || 'No class assigned';

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
        <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.enrollment.occupancyRate}%` }} /></div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-6">
          <h3 className="mb-4 text-lg font-black">Course Distribution</h3>
          <div className="space-y-3">{stats.courseDistribution.map((course) => <div key={course.category} className="flex items-center gap-3"><span className="w-24 truncate text-sm font-semibold">{catLabels[course.category] || course.category}</span><div className="h-2 flex-1 rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min((course.count / distributionMax) * 100, 100)}%` }} /></div><span className="w-8 text-right text-sm font-black">{course.count}</span></div>)}</div>
        </section>
        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-6">
          <h3 className="mb-4 text-lg font-black">Monthly Registrations</h3>
          <div className="flex h-40 items-end gap-3">{stats.monthlyRegistrations.map((month) => <div key={month.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><span className="text-xs font-black">{month.count}</span><div className="w-full rounded-t-lg bg-emerald-500" style={{ height: `${month.count ? (month.count / registrationMax) * 100 : 2}%`, minHeight: '2px' }} /><span className="text-xs text-[var(--color-text-tertiary)]">{month.month.slice(5)}</span></div>)}</div>
        </section>
      </div>
    </div>
  );
}

function LearningContent({ mode }: { mode: 'overview' | 'lessons' | 'quizzes' }) {
  const navigate = useNavigate();
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/analytics/performance');
      setData(response.data?.data || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load learning content.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const courses = useMemo(() => (data?.courses || []).filter((course) => titleOf(course.title).toLowerCase().includes(search.toLowerCase().trim())), [data?.courses, search]);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-500" /></div>;
  if (error) return <div className="rounded-2xl border border-red-500/20 bg-[var(--color-surface-primary)] p-8 text-center"><p className="text-sm text-red-500">{error}</p><button type="button" onClick={() => void load()} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"><RefreshCw className="mr-2 inline h-4 w-4" />Retry</button></div>;
  if (!data) return null;

  const summary = data.summary;
  const heading = mode === 'lessons' ? 'Interactive Lessons' : mode === 'quizzes' ? 'Quizzes' : 'Learning & Assessments Overview';
  const help = mode === 'lessons'
    ? 'Choose a course to create, edit, reorder, publish, and review interactive lessons.'
    : mode === 'quizzes'
      ? 'Choose a course to create, edit, publish, and manage standalone quizzes and their questions.'
      : 'Manage lessons, quizzes, assignments, and learning results from one place.';

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-xl font-black text-[var(--color-text-primary)]">{heading}</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{help}</p></div>
        <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-[var(--color-border-default)] px-3 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </header>

      {mode === 'overview' && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={<BookOpen className="h-5 w-5" />} label="Courses" value={summary.courses} helper="Courses in current scope" />
            <Metric icon={<Users className="h-5 w-5" />} label="Students" value={summary.students} helper="Active enrolled students" />
            <Metric icon={<Target className="h-5 w-5" />} label="Average Score" value={`${summary.averageScore}%`} helper={`Quiz ${summary.quizAverage}% • Interactive ${summary.interactiveAverage}%`} />
            <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Completed Activity" value={summary.completedActivities} helper="Quiz and interactive completions" />
          </section>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <QuickAction icon={<BookOpen className="h-5 w-5" />} title="Manage Lessons" text="Interactive lesson content" onClick={() => navigate('/admin/analytics?tab=lessons')} />
            <QuickAction icon={<FileQuestion className="h-5 w-5" />} title="Manage Quizzes" text="Standalone quizzes & questions" onClick={() => navigate('/admin/analytics?tab=quizzes')} />
            <QuickAction icon={<ClipboardList className="h-5 w-5" />} title="Assignments" text="Create and manage assignments" onClick={() => navigate('/admin/assignments')} />
            <QuickAction icon={<BarChart3 className="h-5 w-5" />} title="Results & Gradebook" text="Review student performance" onClick={() => navigate('/admin/analytics?tab=results')} />
          </section>
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="font-black text-[var(--color-text-primary)]">{mode === 'overview' ? 'Courses' : `Courses with ${mode === 'lessons' ? 'lesson' : 'quiz'} tools`}</h3><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Open Course Builder to manage the selected course content.</p></div>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 sm:w-72"><Search className="h-4 w-4 text-[var(--color-text-tertiary)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses..." className="w-full bg-transparent text-sm outline-none" /></label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <article key={course.courseId} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate font-black text-[var(--color-text-primary)]">{titleOf(course.title)}</h4><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{classOf(course)}{course.teacher?.name ? ` • ${course.teacher.name}` : ''}</p></div><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-500">{course.students} students</span></div>
            <div className="mt-4 grid grid-cols-3 gap-2"><Mini label="Average" value={`${course.averageScore}%`} /><Mini label="Quiz" value={`${course.quizAverage}%`} /><Mini label="Interactive" value={`${course.interactiveAverage}%`} /></div>
            <button type="button" onClick={() => navigate(`/admin/courses/${course.courseId}/builder`)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"><ExternalLink className="h-4 w-4" /> {mode === 'lessons' ? 'Manage Lessons' : mode === 'quizzes' ? 'Manage Quizzes' : 'Open Course Builder'}</button>
          </article>
        ))}
      </div>
      {courses.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] py-14 text-center text-sm text-[var(--color-text-tertiary)]">No courses match this search.</div>}
    </div>
  );
}

function AssignmentsHub() {
  const navigate = useNavigate();
  return <HubAction icon={<ClipboardList className="h-8 w-8" />} title="Assignments" description="Create, edit, publish, review, and manage assignments using the existing full Assignment Management workspace." button="Open Assignment Management" onClick={() => navigate('/admin/assignments')} />;
}

function ResultsHub() {
  return <CoursePerformanceView endpoint="/analytics/performance" title="Results & Gradebook" description="Review standalone quiz results and interactive lesson performance by course and student." adminFilters />;
}

function HubAction({ icon, title, description, button, onClick }: { icon: React.ReactNode; title: string; description: string; button: string; onClick: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-sm sm:p-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">{icon}</div>
      <h2 className="mt-5 text-xl font-black text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-tertiary)]">{description}</p>
      <button type="button" onClick={onClick} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700">{button}<ExternalLink className="h-4 w-4" /></button>
    </div>
  );
}

export function AnalyticsManage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: LearningTab = raw === 'lessons' || raw === 'quizzes' || raw === 'assignments' || raw === 'results' || raw === 'institution' ? raw : 'overview';

  const setTab = (next: LearningTab) => {
    if (next === 'overview') setParams({});
    else setParams({ tab: next });
  };

  const tabs: Array<{ key: LearningTab; label: string; icon: React.ReactNode }> = [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
    { key: 'lessons', label: 'Lessons', icon: <BookOpen className="h-4 w-4" /> },
    { key: 'quizzes', label: 'Quizzes', icon: <FileQuestion className="h-4 w-4" /> },
    { key: 'assignments', label: 'Assignments', icon: <ClipboardList className="h-4 w-4" /> },
    { key: 'results', label: 'Results & Gradebook', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'institution', label: 'Institution Overview', icon: <Building2 className="h-4 w-4" /> },
  ];

  return (
    <div className="p-3 pt-20 sm:p-6 sm:pt-20 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500"><GraduationCap className="h-5 w-5" /></span><div><h1 className="text-2xl font-black text-[var(--color-text-primary)] sm:text-3xl">Learning & Assessments</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Interactive lessons, quizzes, assignments, and learning results in one academic workspace.</p></div></header>

        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2">
          <div className="flex min-w-max gap-2">{tabs.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition ${tab === item.key ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>{item.icon}{item.label}</button>)}</div>
        </div>

        {tab === 'overview' && <LearningContent mode="overview" />}
        {tab === 'lessons' && <LearningContent mode="lessons" />}
        {tab === 'quizzes' && <LearningContent mode="quizzes" />}
        {tab === 'assignments' && <AssignmentsHub />}
        {tab === 'results' && <ResultsHub />}
        {tab === 'institution' && <InstitutionOverview />}
      </div>
    </div>
  );
}

function Metric({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">{icon}</span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</p><p className="mt-1 truncate text-xl font-black text-[var(--color-text-primary)]">{value}</p></div></div><p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{helper}</p></div>;
}

function QuickAction({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 text-left shadow-sm transition hover:border-emerald-500/40 hover:shadow-md"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">{icon}</span><p className="mt-3 font-black text-[var(--color-text-primary)]">{title}</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{text}</p></button>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><p className="text-[9px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</p><p className="mt-1 text-sm font-black text-[var(--color-text-primary)]">{value}</p></div>;
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-5"><div className="flex items-center gap-4"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color} text-lg text-white`}>{icon}</div><div className="min-w-0"><p className="truncate text-xl font-black text-[var(--color-text-primary)]">{value}</p><p className="truncate text-xs text-[var(--color-text-tertiary)]">{label}</p></div></div></div>;
}

export default AnalyticsManage;
