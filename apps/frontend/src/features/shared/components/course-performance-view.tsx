import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Eye,
  Filter,
  ListChecks,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import api from '../../../lib/axios';

type LocalizedTitle = { en?: string; so?: string; ar?: string } | string;
type ActivityType = 'quiz' | 'interactive_lesson';
type DetailTab = 'activity' | 'chart';

interface ClassRef {
  id: string;
  title: string;
  section?: string;
  academicYear?: string;
}

interface TeacherRef {
  id: string;
  teacherId?: string;
  name: string;
}

interface ActivityRow {
  id: string;
  studentId: string;
  courseId: string;
  chapterTitle: string;
  title: string;
  type: ActivityType;
  score: number;
  total: number;
  percentage: number;
  status: string;
  date: string;
  attempts: number;
}

interface StudentMetric {
  id: string;
  studentId: string;
  name: string;
  avatar?: string | null;
  class?: ClassRef | null;
  averageScore: number;
  quizAverage: number;
  interactiveAverage: number;
  activitiesCompleted: number;
  lessonsCompleted: number;
  totalLessons: number;
  quizzesCompleted: number;
  totalQuizzes: number;
  progressPercent: number;
}

interface CourseMetric {
  courseId: string;
  title: LocalizedTitle;
  class?: ClassRef | null;
  teacher?: TeacherRef | null;
  status?: string;
  students: number;
  averageScore: number;
  quizAverage: number;
  interactiveAverage: number;
  completedActivities: number;
}

interface PerformancePayload {
  scope: 'teacher' | 'admin';
  summary: {
    courses: number;
    students: number;
    averageScore: number;
    quizAverage: number;
    interactiveAverage: number;
    completedActivities: number;
  };
  courses: CourseMetric[];
  filters: {
    courses: Array<{ id: string; title: LocalizedTitle; class?: ClassRef | null; teacher?: TeacherRef | null }>;
    classes: ClassRef[];
    teachers: TeacherRef[];
  };
  selectedCourse?: {
    courseId: string;
    title: LocalizedTitle;
    class?: ClassRef | null;
    teacher?: TeacherRef | null;
    summary: {
      students: number;
      averageScore: number;
      quizAverage: number;
      interactiveAverage: number;
      completedActivities: number;
    };
    students: StudentMetric[];
  } | null;
  studentDetail?: {
    student: { id: string; studentId: string; name: string; avatar?: string | null; class?: ClassRef | null };
    course: { id: string; title: LocalizedTitle; class?: ClassRef | null };
    summary: StudentMetric | null;
    activities: ActivityRow[];
    strongAreas: Array<{ name: string; score: number }>;
    areasToImprove: Array<{ name: string; score: number }>;
  } | null;
}

function titleOf(value: LocalizedTitle): string {
  if (typeof value === 'string') return value;
  return value?.en || value?.so || value?.ar || 'Course';
}

function classLabel(value?: ClassRef | null) {
  if (!value) return 'No class assigned';
  const title = [value.title, value.section].filter(Boolean).join(' - ');
  return value.academicYear ? `${title} • ${value.academicYear}` : title;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function scoreTone(score: number) {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 65) return 'bg-amber-400';
  return 'bg-red-500';
}

function SummaryCard({ label, value, helper, icon }: { label: string; value: string | number; helper: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">{icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</p>
          <p className="mt-1 truncate text-xl font-black text-[var(--color-text-primary)]">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--color-text-tertiary)]">{helper}</p>
    </div>
  );
}

export function CoursePerformanceView({
  endpoint,
  title,
  description,
  adminFilters = false,
}: {
  endpoint: string;
  title: string;
  description: string;
  adminFilters?: boolean;
}) {
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [courseId, setCourseId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | ActivityType>('all');
  const [detailTab, setDetailTab] = useState<DetailTab>('activity');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (courseId) params.set('courseId', courseId);
      if (studentId) params.set('studentId', studentId);
      if (adminFilters && classId) params.set('classId', classId);
      if (adminFilters && teacherId) params.set('teacherId', teacherId);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const response = await api.get(`${endpoint}${suffix}`);
      setData(response.data?.data || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load learning performance. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [adminFilters, classId, courseId, endpoint, studentId, teacherId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setActivityFilter('all');
    setDetailTab('activity');
  }, [studentId]);

  const filteredActivities = useMemo(() => {
    const rows = data?.studentDetail?.activities || [];
    return rows.filter((row) => activityFilter === 'all' || row.type === activityFilter);
  }, [activityFilter, data?.studentDetail?.activities]);

  const chartRows = useMemo(() => [...(data?.studentDetail?.activities || [])]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12), [data?.studentDetail?.activities]);

  const chartPoints = chartRows.map((row, index) => {
    const x = chartRows.length <= 1 ? 50 : 7 + (index * 86) / (chartRows.length - 1);
    const y = 90 - Math.min(100, Math.max(0, row.percentage)) * 0.8;
    return { x, y, row };
  });

  const clearCourse = () => {
    setStudentId('');
    setCourseId('');
  };

  const selectCourse = (id: string) => {
    setStudentId('');
    setCourseId(id);
  };

  const changeClass = (value: string) => {
    setClassId(value);
    setCourseId('');
    setStudentId('');
  };

  const changeTeacher = (value: string) => {
    setTeacherId(value);
    setCourseId('');
    setStudentId('');
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center" aria-live="polite">
        <div className="text-center"><div className="mx-auto h-11 w-11 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-500" /><p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Loading performance...</p></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-red-500/25 bg-[var(--color-surface-primary)] p-6 text-center">
        <AlertCircle className="mx-auto h-9 w-9 text-red-400" />
        <h2 className="mt-3 text-lg font-black text-[var(--color-text-primary)]">Performance unavailable</h2>
        <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"><RefreshCw className="h-4 w-4" /> Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const summary = data.summary;
  const detail = data.studentDetail;
  const selected = data.selectedCourse;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><BarChart3 className="h-5 w-5" /></span>
            <div><h2 className="text-xl font-black text-[var(--color-text-primary)] sm:text-2xl">{title}</h2><p className="mt-1 text-sm leading-5 text-[var(--color-text-tertiary)]">{description}</p></div>
          </div>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-[var(--color-border-default)] px-3 text-xs font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </header>

      {error && <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-500">{error}</div>}

      <div className={`grid gap-3 ${adminFilters ? 'md:grid-cols-3' : 'md:grid-cols-1'}`}>
        {adminFilters && (
          <label className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Class</span>
            <select value={classId} onChange={(event) => changeClass(event.target.value)} className="w-full bg-transparent text-sm font-semibold text-[var(--color-text-primary)] outline-none">
              <option value="">All classes</option>
              {data.filters.classes.map((klass) => <option key={klass.id} value={klass.id}>{classLabel(klass)}</option>)}
            </select>
          </label>
        )}
        {adminFilters && (
          <label className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Teacher</span>
            <select value={teacherId} onChange={(event) => changeTeacher(event.target.value)} className="w-full bg-transparent text-sm font-semibold text-[var(--color-text-primary)] outline-none">
              <option value="">All teachers</option>
              {data.filters.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
            </select>
          </label>
        )}
        <label className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Course</span>
          <select value={courseId} onChange={(event) => selectCourse(event.target.value)} className="w-full bg-transparent text-sm font-semibold text-[var(--color-text-primary)] outline-none">
            <option value="">All courses</option>
            {data.filters.courses.map((course) => <option key={course.id} value={course.id}>{titleOf(course.title)}</option>)}
          </select>
        </label>
      </div>

      {!courseId && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label="Courses" value={summary.courses} helper="Courses in the current scope" icon={<BookOpen className="h-5 w-5" />} />
            <SummaryCard label="Students" value={summary.students} helper="Active enrolled students" icon={<Users className="h-5 w-5" />} />
            <SummaryCard label="Average Score" value={`${summary.averageScore}%`} helper={`Quiz ${summary.quizAverage}% • Interactive ${summary.interactiveAverage}%`} icon={<Target className="h-5 w-5" />} />
            <SummaryCard label="Completed Activity" value={summary.completedActivities} helper="Completed quizzes and interactive checks" icon={<ListChecks className="h-5 w-5" />} />
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-black text-[var(--color-text-primary)]">Performance by Course</h3><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Open a course to review its students and individual learning performance.</p></div><span className="rounded-full border border-[var(--color-border-default)] px-3 py-1 text-xs font-bold text-[var(--color-text-secondary)]">{data.courses.length} courses</span></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.courses.map((course) => (
                <button key={course.courseId} type="button" onClick={() => selectCourse(course.courseId)} className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md sm:p-5">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words font-black text-[var(--color-text-primary)]">{titleOf(course.title)}</h4><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{classLabel(course.class)}</p>{course.teacher && <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{course.teacher.name}</p>}</div><ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[var(--color-text-tertiary)] group-hover:text-emerald-500" /></div>
                  <div className="mt-5 grid grid-cols-3 gap-3"><div><p className="text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">Students</p><p className="mt-1 text-lg font-black text-[var(--color-text-primary)]">{course.students}</p></div><div><p className="text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">Average</p><p className="mt-1 text-lg font-black text-[var(--color-text-primary)]">{course.averageScore}%</p></div><div><p className="text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">Completed</p><p className="mt-1 text-lg font-black text-[var(--color-text-primary)]">{course.completedActivities}</p></div></div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full rounded-full ${scoreTone(course.averageScore)}`} style={{ width: `${course.averageScore}%` }} /></div>
                </button>
              ))}
            </div>
            {data.courses.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-12 text-center"><BookOpen className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" /><p className="mt-3 text-sm font-black text-[var(--color-text-secondary)]">No courses in this scope</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Change the filters or assign courses before reviewing performance.</p></div>}
          </section>
        </>
      )}

      {courseId && selected && !studentId && (
        <>
          <button type="button" onClick={clearCourse} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-emerald-500"><ArrowLeft className="h-4 w-4" /> Performance by Course</button>
          <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-xl font-black text-[var(--color-text-primary)]">{titleOf(selected.title)}</h3><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{classLabel(selected.class)}{selected.teacher ? ` • ${selected.teacher.name}` : ''}</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-500">{selected.summary.students} students</span></div>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><SummaryCard label="Average Score" value={`${selected.summary.averageScore}%`} helper="All recorded course activity" icon={<Target className="h-5 w-5" />} /><SummaryCard label="Quiz Average" value={`${selected.summary.quizAverage}%`} helper="Latest standalone quiz attempts" icon={<CircleHelp className="h-5 w-5" />} /><SummaryCard label="Interactive Avg" value={`${selected.summary.interactiveAverage}%`} helper="First-answer lesson accuracy" icon={<BookOpen className="h-5 w-5" />} /><SummaryCard label="Completed" value={selected.summary.completedActivities} helper="Completed learning activities" icon={<ListChecks className="h-5 w-5" />} /></div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
            <div className="border-b border-[var(--color-border-default)] p-4"><h3 className="font-black text-[var(--color-text-primary)]">Student Performance</h3><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Select a student to open Lesson Activity and Progress Chart.</p></div>
            <div className="divide-y divide-[var(--color-border-default)]">
              {selected.students.map((student) => (
                <div key={student.id} className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1"><p className="truncate font-black text-[var(--color-text-primary)]">{student.name}</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{student.studentId} • {classLabel(student.class)}</p></div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[460px]"><div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Average</p><p className="mt-1 text-sm font-black">{student.averageScore}%</p></div><div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Lessons</p><p className="mt-1 text-sm font-black">{student.lessonsCompleted}/{student.totalLessons}</p></div><div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Quizzes</p><p className="mt-1 text-sm font-black">{student.quizzesCompleted}/{student.totalQuizzes}</p></div><div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Progress</p><p className="mt-1 text-sm font-black">{student.progressPercent}%</p></div></div>
                    <button type="button" onClick={() => setStudentId(student.id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 text-xs font-black text-[var(--color-text-primary)] hover:border-emerald-500/50 hover:text-emerald-500"><Eye className="h-4 w-4" /> View</button>
                  </div>
                </div>
              ))}
              {selected.students.length === 0 && <div className="px-5 py-12 text-center text-sm text-[var(--color-text-tertiary)]">No active students are enrolled in this course.</div>}
            </div>
          </section>
        </>
      )}

      {courseId && studentId && detail && (
        <>
          <button type="button" onClick={() => setStudentId('')} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-emerald-500"><ArrowLeft className="h-4 w-4" /> Back to students</button>
          <header className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-xl font-black text-[var(--color-text-primary)]">{detail.student.name}</h3><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{detail.student.studentId} • {titleOf(detail.course.title)} • {classLabel(detail.student.class)}</p></div><Users className="h-5 w-5 shrink-0 text-emerald-500" /></div>
            {detail.summary && <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><SummaryCard label="Average" value={`${detail.summary.averageScore}%`} helper="Quiz and interactive activity" icon={<Target className="h-5 w-5" />} /><SummaryCard label="Quiz Average" value={`${detail.summary.quizAverage}%`} helper={`${detail.summary.quizzesCompleted}/${detail.summary.totalQuizzes} quizzes completed`} icon={<CircleHelp className="h-5 w-5" />} /><SummaryCard label="Interactive Avg" value={`${detail.summary.interactiveAverage}%`} helper={`${detail.summary.lessonsCompleted}/${detail.summary.totalLessons} lessons completed`} icon={<BookOpen className="h-5 w-5" />} /><SummaryCard label="Course Progress" value={`${detail.summary.progressPercent}%`} helper={`${detail.summary.activitiesCompleted} performance activities completed`} icon={<BarChart3 className="h-5 w-5" />} /></div>}
          </header>

          <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
            <div className="grid grid-cols-2 gap-2 border-b border-[var(--color-border-default)] p-2"><button type="button" onClick={() => setDetailTab('activity')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold ${detailTab === 'activity' ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><ListChecks className="h-4 w-4" /> Lesson Activity</button><button type="button" onClick={() => setDetailTab('chart')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold ${detailTab === 'chart' ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><Target className="h-4 w-4" /> Progress Chart</button></div>

            {detailTab === 'activity' && (
              <div className="p-3 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h4 className="font-black text-[var(--color-text-primary)]">Lesson Activity</h4><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Interactive checks and standalone quiz results for this course.</p></div><label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3"><Filter className="h-4 w-4 text-[var(--color-text-tertiary)]" /><select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as 'all' | ActivityType)} className="bg-transparent text-xs font-bold outline-none"><option value="all">All Activity</option><option value="interactive_lesson">Interactive Lessons</option><option value="quiz">Quizzes</option></select></label></div>
                <div className="space-y-3">{filteredActivities.map((row) => <article key={row.id} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${row.type === 'quiz' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{row.type === 'quiz' ? <CircleHelp className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}</span><div><h5 className="font-black text-[var(--color-text-primary)]">{row.title}</h5><p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{row.chapterTitle || 'General'} • {formatDate(row.date)}</p></div></div></div><span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${row.status === 'Completed' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}>{row.status}</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Score</p><p className="mt-1 text-sm font-black">{row.score}/{row.total}</p></div><div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Percentage</p><p className="mt-1 text-sm font-black">{row.percentage}%</p></div><div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Type</p><p className="mt-1 text-sm font-black">{row.type === 'quiz' ? 'Quiz' : 'Interactive'}</p></div><div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Attempts</p><p className="mt-1 text-sm font-black">{row.attempts}</p></div></div></article>)}{filteredActivities.length === 0 && <div className="rounded-xl border border-dashed border-[var(--color-border-default)] px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">No performance activity matches this filter.</div>}</div>
              </div>
            )}

            {detailTab === 'chart' && (
              <div className="space-y-5 p-3 sm:p-5">
                <div><h4 className="font-black text-[var(--color-text-primary)]">Progress Chart</h4><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Recent quiz and interactive lesson score trend.</p></div>
                {chartRows.length ? <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3 sm:p-4"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-52 w-full sm:h-64" role="img" aria-label="Student course performance chart">{[10, 30, 50, 70, 90].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" className="text-[var(--color-border-subtle)]" strokeWidth="0.45" />)}<polyline fill="none" stroke="rgb(16 185 129)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" points={chartPoints.map((point) => `${point.x},${point.y}`).join(' ')} />{chartPoints.map(({ x, y, row }) => <circle key={row.id} cx={x} cy={y} r="1.7" fill="rgb(16 185 129)" vectorEffect="non-scaling-stroke" />)}</svg><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">{chartRows.slice(-6).map((row) => <div key={row.id} className="min-w-0 text-center"><p className="truncate text-[10px] font-semibold text-[var(--color-text-secondary)]">{row.title}</p><p className="mt-0.5 text-[9px] text-[var(--color-text-tertiary)]">{formatDate(row.date)}</p></div>)}</div></div> : <div className="rounded-xl border border-dashed border-[var(--color-border-default)] px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">No scored activity is available yet.</div>}
                <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4"><div className="mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-500" /><h5 className="font-black">Strong Areas</h5></div><div className="space-y-3">{detail.strongAreas.map((area) => <div key={area.name}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate font-semibold">{area.name}</span><span className="font-black">{area.score}%</span></div><div className="h-2 rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${area.score}%` }} /></div></div>)}{detail.strongAreas.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)]">More activity is needed to identify strong areas.</p>}</div></div><div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4"><div className="mb-4 flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" /><h5 className="font-black">Areas to Improve</h5></div><div className="space-y-3">{detail.areasToImprove.map((area) => <div key={area.name}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate font-semibold">{area.name}</span><span className="font-black">{area.score}%</span></div><div className="h-2 rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full rounded-full ${scoreTone(area.score)}`} style={{ width: `${area.score}%` }} /></div></div>)}{detail.areasToImprove.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)]">No low-scoring topic is identified yet.</p>}</div></div></div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default CoursePerformanceView;
