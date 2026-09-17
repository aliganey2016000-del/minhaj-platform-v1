import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarChart3, BookOpen, Building2, CircleHelp, Database, FileQuestion,
  ListChecks, Pencil, RefreshCw, Search, Target,
} from 'lucide-react';
import api from '../../../lib/axios';
import { CoursePerformanceView } from '../../shared/components/course-performance-view';

type AnalyticsTab = 'learning' | 'lessons' | 'quizzes' | 'questions' | 'performance' | 'overview';

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
  id: string; title: string; courseId: string; courseTitle: string; chapterTitle: string;
  className?: string; teacherName?: string; deliveryMode: string; status: string;
  duration: number; updatedAt: string;
}

interface QuizRow {
  id: string; title: string; courseId: string; courseTitle: string; chapterTitle: string;
  className?: string; teacherName?: string; questionCount: number; passingScore: number;
  maxAttempts: number; status: string; updatedAt: string;
}

interface QuestionRow {
  id: string; quizId: string; quizTitle: string; courseId: string; courseTitle: string;
  chapterTitle: string; type: string; text: string; points: number;
}

interface RecentRow {
  id: string; type: 'lesson' | 'quiz'; title: string; courseId: string; courseTitle: string;
  chapterTitle: string; className?: string; teacherName?: string; status: string; updatedAt: string;
}

interface LearningInventory {
  summary: LearningSummary;
  courses: CourseOption[];
  lessons: LessonRow[];
  quizzes: QuizRow[];
  questions: QuestionRow[];
  recentActivities: RecentRow[];
}

const validTabs = new Set<AnalyticsTab>(['learning', 'lessons', 'quizzes', 'questions', 'performance', 'overview']);
const catLabels: Record<string, string> = {
  quran: 'Quran', fiqh: 'Fiqh', aqeedah: 'Aqeedah', seerah: 'Seerah',
  arabic: 'Arabic', tajweed: 'Tajweed', hadith: 'Hadith', akhlaq: 'Akhlaq',
};

function statusClass(status: string) {
  if (status === 'published') return 'bg-emerald-500/15 text-emerald-500';
  if (status === 'archived') return 'bg-slate-500/15 text-slate-500';
  return 'bg-amber-500/15 text-amber-500';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function LoadingBlock({ label }: { label: string }) {
  return <div className="flex justify-center py-20"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-500" /><p className="mt-3 text-sm text-[var(--color-text-tertiary)]">{label}</p></div></div>;
}

function ErrorBlock({ message, retry }: { message: string; retry: () => void | Promise<void> }) {
  return <div className="py-16 text-center"><p className="mb-4 text-red-500">{message}</p><button type="button" onClick={() => void retry()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" /> Retry</button></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-5 py-12 text-center text-sm text-[var(--color-text-tertiary)]">{text}</div>;
}

function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">{icon}</span><div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">{label}</p><p className="text-xl font-black">{value}</p></div></div><p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{helper}</p></div>;
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-5"><div className="flex items-center gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-lg">{icon}</div><div className="min-w-0"><p className="truncate text-xl font-black">{value}</p><p className="truncate text-xs text-[var(--color-text-tertiary)]">{label}</p></div></div></div>;
}

function DataPanel({ title, helper, count, children }: { title: string; helper: string; count: number; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-default)] p-4"><div><h3 className="font-black">{title}</h3><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{helper}</p></div><span className="rounded-full border border-[var(--color-border-default)] px-3 py-1 text-xs font-bold">{count}</span></div>{children}</section>;
}

function QuickLink({ to, label, helper, icon }: { to: string; label: string; helper: string; icon: React.ReactNode }) {
  return <Link to={to} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 transition hover:border-emerald-500/40 hover:shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">{icon}</span><p className="mt-3 font-black">{label}</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{helper}</p></Link>;
}

function InstitutionOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/analytics/dashboard'); setStats(data.data); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to load institution analytics.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingBlock label="Loading institution overview..." />;
  if (error) return <ErrorBlock message={error} retry={load} />;
  if (!stats) return null;

  const distributionMax = Math.max(1, ...stats.courseDistribution.map((item) => item.count));
  const registrationMax = Math.max(1, ...stats.monthlyRegistrations.map((item) => item.count));
  return <div className="space-y-6">
    <div><h2 className="text-xl font-black">Institution Overview</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Enrollment, users, course distribution, registrations, and revenue.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard icon="🎓" label="Total Students" value={stats.students.total} /><StatCard icon="📚" label="Courses" value={`${stats.courses.published}/${stats.courses.total}`} /><StatCard icon="👨‍🏫" label="Teachers" value={stats.teachers} /><StatCard icon="💰" label="Revenue" value={`$${stats.totalRevenue.toLocaleString()}`} />
      <StatCard icon="✅" label="Active Students" value={stats.students.active} /><StatCard icon="👨‍👩‍👧‍👦" label="Parents" value={stats.parents} /><StatCard icon="🆕" label="New (30 days)" value={stats.recentRegistrations} /><StatCard icon="📊" label="Occupancy" value={`${stats.enrollment.occupancyRate}%`} />
    </div>
    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><div className="mb-2 flex justify-between text-sm"><span>{stats.enrollment.totalEnrolled} enrolled of {stats.enrollment.totalCapacity} capacity</span><b className="text-emerald-500">{stats.enrollment.occupancyRate}%</b></div><div className="h-3 rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.enrollment.occupancyRate}%` }} /></div></section>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><h3 className="mb-4 font-black">Course Distribution</h3><div className="space-y-3">{stats.courseDistribution.map((course) => <div key={course.category} className="flex items-center gap-3"><span className="w-24 truncate text-sm">{catLabels[course.category] || course.category}</span><div className="h-2 flex-1 rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(course.count / distributionMax * 100, 100)}%` }} /></div><b>{course.count}</b></div>)}</div></section>
      <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><h3 className="mb-4 font-black">Monthly Registrations</h3><div className="flex h-40 items-end gap-3">{stats.monthlyRegistrations.map((month) => <div key={month.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><b className="text-xs">{month.count}</b><div className="w-full rounded-t bg-emerald-500" style={{ height: `${month.count ? month.count / registrationMax * 100 : 2}%`, minHeight: '2px' }} /><span className="text-xs text-[var(--color-text-tertiary)]">{month.month.slice(5)}</span></div>)}</div></section>
    </div>
  </div>;
}

function LearningWorkspace({ tab }: { tab: 'learning' | 'lessons' | 'quizzes' | 'questions' }) {
  const [inventory, setInventory] = useState<LearningInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [courseId, setCourseId] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/analytics/learning-assessments'); setInventory(data.data || null); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to load learning content.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const match = useCallback((course: string, text: string) => {
    const term = search.trim().toLowerCase();
    return (!courseId || course === courseId) && (!term || text.toLowerCase().includes(term));
  }, [courseId, search]);
  const lessons = useMemo(() => (inventory?.lessons || []).filter((r) => match(r.courseId, `${r.title} ${r.courseTitle} ${r.chapterTitle} ${r.teacherName || ''}`)), [inventory?.lessons, match]);
  const quizzes = useMemo(() => (inventory?.quizzes || []).filter((r) => match(r.courseId, `${r.title} ${r.courseTitle} ${r.chapterTitle} ${r.teacherName || ''}`)), [inventory?.quizzes, match]);
  const questions = useMemo(() => (inventory?.questions || []).filter((r) => match(r.courseId, `${r.text} ${r.quizTitle} ${r.courseTitle}`)), [inventory?.questions, match]);

  if (loading && !inventory) return <LoadingBlock label="Loading lessons and quizzes..." />;
  if (error && !inventory) return <ErrorBlock message={error} retry={load} />;
  if (!inventory) return null;
  const s = inventory.summary;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-black">Learning & Assessments</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Manage lessons, interactive activities, quizzes and their question bank in one place.</p></div><button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-[var(--color-border-default)] px-3 text-xs font-bold"><RefreshCw className="h-4 w-4" /> Refresh</button></div>

    {tab === 'learning' ? <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard icon={<BookOpen className="h-5 w-5" />} label="Lessons" value={s.lessons} helper={`${s.interactiveLessons} interactive`} /><MetricCard icon={<CircleHelp className="h-5 w-5" />} label="Quizzes" value={s.quizzes} helper="Standalone course quizzes" /><MetricCard icon={<FileQuestion className="h-5 w-5" />} label="Questions" value={s.questions} helper="Questions across all quizzes" /><MetricCard icon={<Database className="h-5 w-5" />} label="Courses with Content" value={`${s.coursesWithContent}/${s.courses}`} helper="Courses containing authored content" /></div>
      <DataPanel title="Recent Learning Activities" helper="Latest authored lessons and quizzes." count={inventory.recentActivities.length}>{inventory.recentActivities.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-[10px] uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{inventory.recentActivities.map((r) => <tr key={`${r.type}-${r.id}`}><td className="px-4 py-3 font-bold">{r.title}</td><td className="px-4 py-3">{r.type === 'quiz' ? 'Quiz' : 'Lesson'}</td><td className="px-4 py-3">{r.courseTitle}</td><td className="px-4 py-3">{r.teacherName || '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${statusClass(r.status)}`}>{r.status}</span></td><td className="px-4 py-3">{formatDate(r.updatedAt)}</td><td className="px-4 py-3"><Link className="font-bold text-emerald-500" to={r.type === 'quiz' ? `/admin/courses/${r.courseId}/quizzes/${r.id}/edit` : `/admin/courses/${r.courseId}/lessons/${r.id}/edit`}>Open</Link></td></tr>)}</tbody></table></div> : <EmptyState text="No lessons or quizzes have been created yet." />}</DataPanel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><QuickLink to="/admin/courses" label="Open Courses" helper="Choose a course and build content" icon={<BookOpen className="h-5 w-5" />} /><QuickLink to="/admin/assignments" label="Assignments" helper="Manage coursework and submissions" icon={<ListChecks className="h-5 w-5" />} /><QuickLink to="/admin/analytics?tab=performance" label="Learning Results" helper="Quiz and interactive performance" icon={<BarChart3 className="h-5 w-5" />} /><QuickLink to="/admin/exams" label="Examinations" helper="Formal exam scheduling and papers" icon={<Target className="h-5 w-5" />} /></div>
    </> : <>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><label className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2"><span className="mb-1 block text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Course</span><select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-full bg-transparent text-sm font-semibold outline-none"><option value="">All courses</option>{inventory.courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.className ? ` • ${c.className}` : ''}</option>)}</select></label><label className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2"><span className="mb-1 block text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Search</span><span className="flex items-center gap-2"><Search className="h-4 w-4" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Title, course or teacher" /></span></label><button type="button" onClick={() => { setCourseId(''); setSearch(''); }} className="min-h-11 rounded-xl border border-[var(--color-border-default)] px-4 text-sm font-bold md:self-end">Clear</button></div>
      {tab === 'lessons' && <LessonTable rows={lessons} />}{tab === 'quizzes' && <QuizTable rows={quizzes} />}{tab === 'questions' && <QuestionTable rows={questions} />}
    </>}
  </div>;
}

function LessonTable({ rows }: { rows: LessonRow[] }) {
  return <DataPanel title="Lessons" helper="Traditional and interactive lessons across all courses." count={rows.length}>{rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-[10px] uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Lesson</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Chapter</th><th className="px-4 py-3">Mode</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{rows.map((r) => <tr key={`${r.courseId}-${r.id}`}><td className="px-4 py-3"><b>{r.title}</b><p className="text-xs text-[var(--color-text-tertiary)]">{r.teacherName || 'No teacher'}{r.duration ? ` • ${r.duration} min` : ''}</p></td><td className="px-4 py-3">{r.courseTitle}<p className="text-xs text-[var(--color-text-tertiary)]">{r.className || ''}</p></td><td className="px-4 py-3">{r.chapterTitle}</td><td className="px-4 py-3">{r.deliveryMode === 'interactive_gate' ? 'Interactive' : 'Traditional'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${statusClass(r.status)}`}>{r.status}</span></td><td className="px-4 py-3"><Link to={`/admin/courses/${r.courseId}/lessons/${r.id}/edit`} className="inline-flex items-center gap-1 font-bold text-emerald-500"><Pencil className="h-3.5 w-3.5" /> Edit</Link></td></tr>)}</tbody></table></div> : <EmptyState text="No lessons match the selected filters." />}</DataPanel>;
}

function QuizTable({ rows }: { rows: QuizRow[] }) {
  return <DataPanel title="Quizzes" helper="Standalone course quizzes and their settings." count={rows.length}>{rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-[10px] uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Quiz</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Questions</th><th className="px-4 py-3">Pass</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{rows.map((r) => <tr key={`${r.courseId}-${r.id}`}><td className="px-4 py-3"><b>{r.title}</b><p className="text-xs text-[var(--color-text-tertiary)]">{r.chapterTitle}</p></td><td className="px-4 py-3">{r.courseTitle}</td><td className="px-4 py-3 font-bold">{r.questionCount}</td><td className="px-4 py-3">{r.passingScore}%</td><td className="px-4 py-3">{r.maxAttempts || '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${statusClass(r.status)}`}>{r.status}</span></td><td className="px-4 py-3"><Link to={`/admin/courses/${r.courseId}/quizzes/${r.id}/edit`} className="inline-flex items-center gap-1 font-bold text-emerald-500"><Pencil className="h-3.5 w-3.5" /> Edit</Link></td></tr>)}</tbody></table></div> : <EmptyState text="No quizzes match the selected filters." />}</DataPanel>;
}

function QuestionTable({ rows }: { rows: QuestionRow[] }) {
  return <DataPanel title="Question Bank" helper="Searchable questions already authored inside course quizzes." count={rows.length}>{rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-[10px] uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Question</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Quiz</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Points</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{rows.map((r) => <tr key={r.id}><td className="max-w-md px-4 py-3 font-semibold">{r.text}</td><td className="px-4 py-3 capitalize">{r.type.replace(/_/g, ' ')}</td><td className="px-4 py-3">{r.quizTitle}</td><td className="px-4 py-3">{r.courseTitle}</td><td className="px-4 py-3">{r.points || '—'}</td><td className="px-4 py-3"><Link to={`/admin/courses/${r.courseId}/quizzes/${r.quizId}/edit`} className="font-bold text-emerald-500">Open Quiz</Link></td></tr>)}</tbody></table></div> : <EmptyState text="No questions match the selected filters." />}</DataPanel>;
}

export function AnalyticsManage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as AnalyticsTab | null;
  const tab: AnalyticsTab = requested && validTabs.has(requested) ? requested : 'learning';
  const setTab = (next: AnalyticsTab) => setParams(next === 'learning' ? {} : { tab: next });
  const tabs: Array<{ key: AnalyticsTab; label: string; icon: React.ReactNode }> = [
    { key: 'learning', label: 'Overview', icon: <BookOpen className="h-4 w-4" /> },
    { key: 'lessons', label: 'Lessons', icon: <BookOpen className="h-4 w-4" /> },
    { key: 'quizzes', label: 'Quizzes', icon: <CircleHelp className="h-4 w-4" /> },
    { key: 'questions', label: 'Question Bank', icon: <FileQuestion className="h-4 w-4" /> },
    { key: 'performance', label: 'Learning Results', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'overview', label: 'Institution Overview', icon: <Building2 className="h-4 w-4" /> },
  ];

  return <div className="p-3 pt-20 sm:p-6 sm:pt-20 lg:p-10 lg:pt-10"><div className="mx-auto max-w-7xl space-y-5">
    <header><h1 className="text-2xl font-black sm:text-3xl">Learning & Assessments</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Lessons, interactive checks, quizzes, learning results and institution analytics in one place.</p></header>
    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2">{tabs.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-black ${tab === item.key ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>{item.icon}{item.label}</button>)}<Link to="/admin/assignments" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-black text-[var(--color-text-secondary)]"><ListChecks className="h-4 w-4" /> Assignments</Link></div>
    {tab === 'performance' && <CoursePerformanceView endpoint="/analytics/performance" title="Learning Results" description="Compare quiz and interactive lesson performance by course and student." adminFilters />}
    {tab === 'overview' && <InstitutionOverview />}
    {(tab === 'learning' || tab === 'lessons' || tab === 'quizzes' || tab === 'questions') && <LearningWorkspace tab={tab} />}
  </div></div>;
}

export default AnalyticsManage;
