import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarChart3, BookOpen, Building2, CircleHelp, Database, FileQuestion, ListChecks,
  Pencil, RefreshCw, Search, Target, Users,
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

interface LearningSummary {
  courses: number;
  coursesWithContent: number;
  lessons: number;
  interactiveLessons: number;
  quizzes: number;
  questions: number;
}

interface CourseOption {
  id: string;
  title: string;
  className?: string;
  teacherName?: string;
  status: string;
  lessons: number;
  quizzes: number;
}

interface LessonRow {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  chapterTitle: string;
  className?: string;
  teacherName?: string;
  deliveryMode: string;
  status: string;
  duration: number;
  updatedAt: string;
}

interface QuizRow {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  chapterTitle: string;
  className?: string;
  teacherName?: string;
  questionCount: number;
  passingScore: number;
  maxAttempts: number;
  status: string;
  updatedAt: string;
}

interface QuestionRow {
  id: string;
  quizId: string;
  quizTitle: string;
  courseId: string;
  courseTitle: string;
  chapterTitle: string;
  type: string;
  text: string;
  points: number;
}

interface RecentRow {
  id: string;
  type: 'lesson' | 'quiz';
  title: string;
  courseId: string;
  courseTitle: string;
  chapterTitle: string;
  className?: string;
  teacherName?: string;
  status: string;
  updatedAt: string;
}

interface LearningInventory {
  summary: LearningSummary;
  courses: CourseOption[];
  lessons: LessonRow[];
  quizzes: QuizRow[];
  questions: QuestionRow[];
  recentActivities: RecentRow[];
}

type AnalyticsTab = 'learning' | 'lessons' | 'quizzes' | 'questions' | 'performance' | 'overview';

const catLabels: Record<string, string> = {
  quran: 'Quran', fiqh: 'Fiqh', aqeedah: 'Aqeedah', seerah: 'Seerah',
  arabic: 'Arabic', tajweed: 'Tajweed', hadith: 'Hadith', akhlaq: 'Akhlaq',
};

const validTabs = new Set<AnalyticsTab>(['learning', 'lessons', 'quizzes', 'questions', 'performance', 'overview']);

function statusClass(status: string) {
  if (status === 'published') return 'bg-emerald-500/15 text-emerald-500';
  if (status === 'archived') return 'bg-slate-500/15 text-slate-500';
  return 'bg-amber-500/15 text-amber-500';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

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

  if (loading) return <LoadingBlock label="Loading institution overview..." />;
  if (error) return <ErrorBlock message={error} retry={load} />;
  if (!stats) return null;

  const distributionMax = Math.max(1, ...stats.courseDistribution.map((item) => item.count));
  const registrationMax = Math.max(1, ...stats.monthlyRegistrations.map((item) => item.count));

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-black text-[var(--color-text-primary)]">Institution Overview</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Enrollment, users, course distribution, registrations, and revenue.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="🎓" label="Total Students" value={stats.students.total} />
        <StatCard icon="📚" label="Courses" value={`${stats.courses.published}/${stats.courses.total}`} />
        <StatCard icon="👨‍🏫" label="Teachers" value={stats.teachers} />
        <StatCard icon="💰" label="Revenue" value={`$${stats.totalRevenue.toLocaleString()}`} />
        <StatCard icon="✅" label="Active Students" value={stats.students.active} />
        <StatCard icon="👨‍👩‍👧‍👦" label="Parents" value={stats.parents} />
        <StatCard icon="🆕" label="New (30 days)" value={stats.recentRegistrations} />
        <StatCard icon="📊" label="Occupancy" value={`${stats.enrollment.occupancyRate}%`} />
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

function LearningWorkspace({ tab }: { tab: Exclude<AnalyticsTab, 'performance' | 'overview'> }) {
  const [inventory, setInventory] = useState<LearningInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [courseId, setCourseId] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/analytics/learning-assessments');
      setInventory(data.data || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load learning content.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const match = useCallback((course: string, text: string) => {
    const courseOk = !courseId || course === courseId;
    const term = search.trim().toLowerCase();
    return courseOk && (!term || text.toLowerCase().includes(term));
  }, [courseId, search]);

  const lessons = useMemo(() => (inventory?.lessons || []).filter((row) => match(row.courseId, `${row.title} ${row.courseTitle} ${row.chapterTitle} ${row.teacherName || ''}`)), [inventory?.lessons, match]);
  const quizzes = useMemo(() => (inventory?.quizzes || []).filter((row) => match(row.courseId, `${row.title} ${row.courseTitle} ${row.chapterTitle} ${row.teacherName || ''}`)), [inventory?.quizzes, match]);
  const questions = useMemo(() => (inventory?.questions || []).filter((row) => match(row.courseId, `${row.text} ${row.quizTitle} ${row.courseTitle}`)), [inventory?.questions, match]);

  if (loading && !inventory) return <LoadingBlock label="Loading lessons and quizzes..." />;
  if (error && !inventory) return <ErrorBlock message={error} retry={load} />;
  if (!inventory) return null;

  const summary = inventory.summary;
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-xl font-black text-[var(--color-text-primary)]">Learning & Assessments</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Manage lessons, interactive activities, quizzes and their question bank in one place.</p></div>
        <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-[var(--color-border-default)] px-3 text-xs font-bold hover:bg-[var(--color-surface-tertiary)]"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      {tab === 'learning' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon={<BookOpen className="h-5 w-5" />} label="Lessons" value={summary.lessons} helper={`${summary.interactiveLessons} interactive`} />
            <MetricCard icon={<CircleHelp className="h-5 w-5" />} label="Quizzes" value={summary.quizzes} helper="Standalone course quizzes" />
            <MetricCard icon={<FileQuestion className="h-5 w-5" />} label="Questions" value={summary.questions} helper="Questions across all quizzes" />
            <MetricCard icon={<Database className="h-5 w-5" />} label="Courses with Content" value={`${summary.coursesWithContent}/${summary.courses}`} helper="Courses containing authored content" />
          </div>

          <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-default)] p-4"><div><h3 className="font-black">Recent Learning Activities</h3><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Latest authored lessons and quizzes.</p></div><span className="text-xs font-bold text-[var(--color-text-tertiary)]">{inventory.recentActivities.length} recent</span></div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-[10px] uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{inventory.recentActivities.map((row) => <tr key={`${row.type}-${row.id}`}><td className="px-4 py-3 font-bold">{row.title}</td><td className="px-4 py-3"><span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-500">{row.type === 'quiz' ? 'Quiz' : 'Lesson'}</span></td><td className="px-4 py-3">{row.courseTitle}</td><td className="px-4 py-3">{row.teacherName || '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${statusClass(row.status)}`}>{row.status}</span></td><td className="px-4 py-3">{formatDate(row.updatedAt)}</td><td className="px-4 py-3"><Link className="font-bold text-emerald-500 hover:underline" to={row.type === 'quiz' ? `/admin/courses/${row.courseId}/quizzes/${row.id}/edit` : `/admin/courses/${row.courseId}/lessons/${row.id}/edit`}>Open</Link></td></tr>)}</tbody></table>
            </div>
            {inventory.recentActivities.length === 0 && <EmptyState text="No lessons or quizzes have been created yet." />}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuickLink to="/admin/courses" label="Open Courses" helper="Choose a course and build content" icon={<BookOpen className="h-5 w-5" />} />
            <QuickLink to="/admin/assignments" label="Assignments" helper="Manage coursework and submissions" icon={<ListChecks className="h-5 w-5" />} />
            <QuickLink to="/admin/analytics?tab=performance" label="Learning Results" helper="Quiz and interactive performance" icon={<BarChart3 className="h-5 w-5" />} />
            <QuickLink to="/admin/exams" label="Examinations" helper="Formal exam scheduling and papers" icon={<Target className="h-5 w-5" />} />
          </section>
        </>
      )}

      {tab !== 'learning' && (
        <>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2"><span className="mb-1 block text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Course</span><select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="w-full bg-transparent text-sm font-semibold outline-none"><option value="">All courses</option>{inventory.courses.map((course) => <option key={course.id} value={course.id}>{course.title}{course.className ? ` • ${course.className}` : ''}</option>)}</select></label>
            <label className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2"><span className="mb-1 block text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Search</span><span className="flex items-center gap-2"><Search className="h-4 w-4 text-[var(--color-text-tertiary)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Title, course or teacher" /></span></label>
            <button type="button" onClick={() => { setCourseId(''); setSearch(''); }} className="min-h-11 rounded-xl border border-[var(--color-border-default)] px-4 text-sm font-bold hover:bg-[var(--color-surface-tertiary)] md:self-end">Clear</button>
          </div>

          {tab === 'lessons' && <LessonTable rows={lessons} />}
          {tab === 'quizzes' && <QuizTable rows={quizzes} />}
          {tab === 'questions' && <QuestionTable rows={questions} />}
        </>
      )}
    </div>
  );
}

function LessonTable({ rows }: { rows: LessonRow[] }) {
  return <DataPanel title="Lessons" helper="Traditional and interactive lessons across all courses." count={rows.length}>{rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-[10px] uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Lesson</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Chapter</th><th className="px-4 py-3">Mode</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{rows.map((row) => <tr key={`${row.courseId}-${row.id}`}><td className="px-4 py-3"><p className="font-bold">{row.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{row.teacherName || 'No teacher'}{row.duration ? ` • ${row.duration} min` : ''}</p></td><td className="px-4 py-3">{row.courseTitle}<p className="text-xs text-[var(--color-text-tertiary)]">{row.className || ''}</p></td><td className="px-4 py-3">{row.chapterTitle}</td><td className="px-4 py-3"><span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-500">{row.deliveryMode === 'interactive_gate' ? 'Interactive' : 'Traditional'}</span></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${statusClass(row.status)}`}>{row.status}</span></td><td className="px-4 py-3"><Link to={`/admin/courses/${row.courseId}/lessons/${row.id}/edit`} className="inline-flex items-center gap-1 font-bold text-emerald-500 hover:underline"><Pencil className="h-3.5 w-3.5" /> Edit</Link></td></tr>)}</tbody></table></div> : <EmptyState text="No lessons match the selected filters." />}</DataPanel>;
}

function QuizTable({ rows }: { rows: QuizRow[] }) {
  return <DataPanel title="Quizzes" helper="Standalone course quizzes and their settings." count={rows.length}>{rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-[10px] uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Quiz</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Questions</th><th className="px-4 py-3">Pass</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{rows.map((row) => <tr key={`${row.courseId}-${row.id}`}><td className="px-4 py-3"><p className="font-bold">{row.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{row.chapterTitle}</p></td><td className="px-4 py-3">{row.courseTitle}<p className="text-xs text-[var(--color-text-tertiary)]">{row.className || ''}</p></td><td className="px-4 py-3 font-bold">{row.questionCount}</td><td className="px-4 py-3">{row.passingScore}%</td><td className="px-4 py-3">{row.maxAttempts || '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${statusClass(row.status)}`}>{row.status}</span></td><td className="px-4 py-3"><Link to={`/admin/courses/${row.courseId}/quizzes/${row.id}/edit`} className="inline-flex items-center gap-1 font-bold text-emerald-500 hover:underline"><Pencil className="h-3.5 w-3.5" /> Edit</Link></td></tr>)}</tbody></table></div> : <EmptyState text="No quizzes match the selected filters." />}</DataPanel>;
}

function QuestionTable({ rows }: { rows: QuestionRow[] }) {
  return <DataPanel title="Question Bank" helper="A searchable index of questions already authored inside course quizzes." count={rows.length}>{rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-[10px] uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Question</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Quiz</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Points</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{rows.map((row) => <tr key={row.id}><td className="max-w-md px-4 py-3 font-semibold">{row.text}</td><td className="px-4 py-3 capitalize">{row.type.replaceAll('_', ' ')}</td><td className="px-4 py-3">{row.quizTitle}</td><td className="px-4 py-3">{row.courseTitle}</td><td className="px-4 py-3">{row.points || '—'}</td><td className="px-4 py-3"><Link to={`/admin/courses/${row.courseId}/quizzes/${row.quizId}/edit`} className="font-bold text-emerald-500 hover:underline">Open Quiz</Link></td></tr>)}</tbody></table></div> : <EmptyState text="No questions match the selected filters." />}</DataPanel>;
}

export function AnalyticsManage() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') as AnalyticsTab | null;
  const tab: AnalyticsTab = rawTab && validTabs.has(rawTab) ? rawTab : 'learning';
  const setTab = (next: AnalyticsTab) => setParams(next === 'learning' ? {} : { tab: next });

  const tabs: Array<{ key: AnalyticsTab; label: string; icon: React.ReactNode }> = [
    { key: 'learning', label: 'Overview', icon: <BookOpen className="h-4 w-4" /> },
    { key: 'lessons', label: 'Lessons', icon: <BookOpen className="h-4 w-4" /> },
    { key: 'quizzes', label: 'Quizzes', icon: <CircleHelp className="h-4 w-4" /> },
    { key: 'questions', label: 'Question Bank', icon: <FileQuestion className="h-4 w-4" /> },
    { key: 'performance', label: 'Learning Results', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'overview', label: 'Institution Overview', icon: <Building2 className="h-4 w-4" /> },
  ];

  return (
    <div className="p-3 pt-20 sm:p-6 sm:pt-20 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-5">
        <header><h1 className="text-2xl font-black text-[var(--color-text-primary)] sm:text-3xl">Learning & Assessments</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Lessons, interactive checks, quizzes, learning results and institution analytics in one place.</p></header>
        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2">
          {tabs.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition ${tab === item.key ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>{item.icon}{item.label}</button>)}
          <Link to="/admin/assignments" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]"><ListChecks className="h-4 w-4" /> Assignments</Link>
        </div>
        {tab === 'performance' && <CoursePerformanceView endpoint="/analytics/performance" title="Learning Results" description="Compare quiz and interactive lesson performance by course and student." adminFilters />}
        {tab === 'overview' && <InstitutionOverview />}
        {(tab === 'learning' || tab === 'lessons' || tab === 'quizzes' || tab === 'questions') && <LearningWorkspace tab={tab} />}
      </div>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return <div className="flex justify-center py-20"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-500" /><p className="mt-3 text-sm text-[var(--color-text-tertiary)]">{label}</p></div></div>;
}

function ErrorBlock({ message, retry }: { message: string; retry: () => void | Promise<void> }) {
  return <div className="py-16 text-center"><p className="mb-4 text-red-500">{message}</p><button type="button" onClick={() => void retry()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700"><RefreshCw className="h-4 w-4" /> Retry</button></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-5 py-12 text-center text-sm text-[var(--color-text-tertiary)]">{text}</div>;
}

function DataPanel({ title, helper, count, children }: { title: string; helper: string; count: number; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-default)] p-4"><div><h3 className="font-black">{title}</h3><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{helper}</p></div><span className="rounded-full border border-[var(--color-border-default)] px-3 py-1 text-xs font-bold">{count}</span></div>{children}</section>;
}

function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">{icon}</span><div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">{label}</p><p className="text-xl font-black">{value}</p></div></div><p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{helper}</p></div>;
}

function QuickLink({ to, label, helper, icon }: { to: string; label: string; helper: string; icon: React.ReactNode }) {
  return <Link to={to} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 transition hover:border-emerald-500/40 hover:shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">{icon}</span><p className="mt-3 font-black">{label}</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{helper}</p></Link>;
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-5"><div className="flex items-center gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-lg">{icon}</div><div className="min-w-0"><p className="truncate text-xl font-black text-[var(--color-text-primary)]">{value}</p><p className="truncate text-xs text-[var(--color-text-tertiary)]">{label}</p></div></div></div>;
}

export default AnalyticsManage;
