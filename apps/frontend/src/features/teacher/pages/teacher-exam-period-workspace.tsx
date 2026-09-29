import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardEdit,
  Clock3,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../../../lib/axios';

type WorkspaceTab = 'schedule' | 'invigilation' | 'attendance' | 'results';

interface ExamPeriod {
  _id: string;
  name: string;
  academicYear: string;
  term?: string;
  startDate?: string;
  endDate?: string;
  status: 'draft' | 'published' | 'closed';
}

interface Exam {
  _id: string;
  title: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  room?: string;
  totalMarks?: number;
  course?: {
    _id?: string;
    title?: { en?: string };
    class?: { title?: string; section?: string };
  };
}

interface Assignment {
  _id: string;
  examDate: string;
  startTime: string;
  endTime: string;
  studentCount?: number;
  markedCount?: number;
  completed?: boolean;
  submissionStatus?: 'submitted' | 'missing';
  submittedBy?: { name?: string; role?: string } | null;
  room?: { _id?: string; name?: string; building?: string; capacity?: number };
  period?: string | { _id?: string; name?: string; academicYear?: string; status?: string };
}

type DutyStatus = 'upcoming' | 'active' | 'completed';

const dateKey = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toISOString().slice(0, 10);
};

const dutyStatus = (assignment: Assignment): DutyStatus => {
  const day = dateKey(assignment.examDate);
  if (!day) return 'upcoming';
  const start = new Date(`${day}T${assignment.startTime}:00`);
  const end = new Date(`${day}T${assignment.endTime}:00`);
  const now = new Date();
  if (now < start) return 'upcoming';
  if (now <= end) return 'active';
  return 'completed';
};

const assignmentPeriodId = (assignment: Assignment) =>
  typeof assignment.period === 'string' ? assignment.period : String(assignment.period?._id || '');

const formatDate = (value?: string, withYear = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
};

const formatRange = (period?: ExamPeriod) => {
  if (!period) return '';
  const start = period.startDate ? formatDate(period.startDate, true) : '';
  const end = period.endDate ? formatDate(period.endDate, true) : '';
  if (start && end) return `${start} – ${end}`;
  return start || end || 'Dates not set';
};

const classLabel = (exam: Exam) => {
  const cls = exam.course?.class;
  if (!cls?.title) return 'Class not set';
  return cls.section ? `${cls.title} - ${cls.section}` : cls.title;
};

const dutyTone: Record<DutyStatus, string> = {
  upcoming: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  completed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const tabs: { key: WorkspaceTab; label: string; icon: typeof CalendarDays }[] = [
  { key: 'schedule', label: 'Schedule', icon: CalendarDays },
  { key: 'invigilation', label: 'Invigilation Rooms', icon: Building2 },
  { key: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { key: 'results', label: 'Result Entry', icon: ClipboardEdit },
];

export function TeacherExamPeriodWorkspace() {
  const { periodId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as WorkspaceTab | null;
  const activeTab: WorkspaceTab = tabs.some((item) => item.key === requestedTab) ? requestedTab! : 'schedule';

  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!periodId) return;
    setLoading(true);
    setError('');
    try {
      const [periodResponse, examResponse, assignmentResponse] = await Promise.all([
        api.get('/exams/periods'),
        api.get('/exams', { params: { period: periodId, limit: 200 } }),
        api.get('/exams/invigilators/my'),
      ]);
      setPeriods(periodResponse.data?.data || []);
      setExams(examResponse.data?.data || []);
      setAssignments((assignmentResponse.data?.data || []).filter((assignment: Assignment) => assignmentPeriodId(assignment) === periodId));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load this exam workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [periodId]);

  const period = useMemo(
    () => periods.find((item) => item._id === periodId && item.status === 'published'),
    [periodId, periods],
  );

  const sortedExams = useMemo(
    () => [...exams].sort((a, b) => new Date(a.examDate || 0).getTime() - new Date(b.examDate || 0).getTime() || String(a.startTime || '').localeCompare(String(b.startTime || ''))),
    [exams],
  );

  const sortedAssignments = useMemo(
    () => [...assignments].sort((a, b) => new Date(a.examDate || 0).getTime() - new Date(b.examDate || 0).getTime() || a.startTime.localeCompare(b.startTime)),
    [assignments],
  );

  const setTab = (tab: WorkspaceTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const emptyState = (title: string, detail: string, icon: typeof CalendarDays = CalendarDays) => {
    const Icon = icon;
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center">
        <Icon className="mx-auto h-9 w-9 text-[var(--color-text-tertiary)]" />
        <h3 className="mt-3 font-bold text-[var(--color-text-primary)]">{title}</h3>
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{detail}</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-16 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <main className="mx-auto max-w-7xl space-y-5">
        <header>
          <Link
            to="/teacher/exams"
            className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-secondary)] transition hover:text-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Exam Periods
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600">
                <ShieldCheck className="h-4 w-4" />
                Teacher Exam Operations
              </p>
              <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
                {period?.name || (loading ? 'Loading exam…' : 'Exam Workspace')}
              </h1>
              {period && (
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                  {period.academicYear}{period.term ? ` · ${period.term}` : ''} · {formatRange(period)}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] shadow-sm transition hover:bg-[var(--color-surface-secondary)] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && !period ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
            <h2 className="font-bold text-amber-800 dark:text-amber-300">This exam period is not available.</h2>
            <p className="mt-1 text-sm text-amber-700/80 dark:text-amber-300/80">Only exam periods currently published by administration can be opened in the Teacher Portal.</p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm">
              <nav className="grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--color-surface-secondary)] p-1 sm:grid-cols-4" aria-label="Teacher exam period sections">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const selected = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTab(tab.key)}
                      className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold transition sm:text-sm ${selected ? 'bg-emerald-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-primary)]'}`}
                      aria-current={selected ? 'page' : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </section>

            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>This is the teacher view of the admin exam workflow. Schedule data is read-only and automatically limited to your courses and rooms assigned to you.</span>
            </div>

            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-emerald-600" />
              </div>
            ) : period && activeTab === 'schedule' ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-xl font-black text-[var(--color-text-primary)]">My Exam Schedule</h2>
                  <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Only scheduled courses assigned to you are shown.</p>
                </div>

                {sortedExams.length === 0 ? emptyState('No course exams assigned', 'Your courses do not have a scheduled paper in this published exam period yet.', BookOpenCheck) : (
                  <>
                    <div className="grid gap-3 md:hidden">
                      {sortedExams.map((exam) => (
                        <article key={exam._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black uppercase tracking-wide text-emerald-600">{exam.course?.title?.en || 'Course'}</p>
                              <h3 className="mt-1 truncate font-bold text-[var(--color-text-primary)]">{exam.title}</h3>
                              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{classLabel(exam)}</p>
                            </div>
                            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-bold text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">Schedule</span>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                            <span className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><CalendarDays className="mb-1 h-4 w-4 text-[var(--color-text-tertiary)]" />{formatDate(exam.examDate)}</span>
                            <span className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><Clock3 className="mb-1 h-4 w-4 text-[var(--color-text-tertiary)]" />{exam.startTime || '—'}{exam.endTime ? `–${exam.endTime}` : ''}</span>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="hidden overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] md:block">
                      <table className="w-full text-left">
                        <thead className="bg-[var(--color-surface-secondary)] text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                          <tr>
                            <th className="px-4 py-3">Course</th>
                            <th className="px-4 py-3">Class</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Time</th>
                            <th className="px-4 py-3">Room</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)]">
                          {sortedExams.map((exam) => (
                            <tr key={exam._id}>
                              <td className="px-4 py-4">
                                <p className="font-bold text-[var(--color-text-primary)]">{exam.course?.title?.en || 'Course'}</p>
                                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{exam.title}</p>
                              </td>
                              <td className="px-4 py-4 text-sm text-[var(--color-text-secondary)]">{classLabel(exam)}</td>
                              <td className="px-4 py-4 text-sm text-[var(--color-text-secondary)]">{formatDate(exam.examDate)}</td>
                              <td className="px-4 py-4 text-sm font-semibold text-[var(--color-text-primary)]">{exam.startTime || '—'}{exam.endTime ? `–${exam.endTime}` : ''}</td>
                              <td className="px-4 py-4 text-sm text-[var(--color-text-secondary)]">{exam.room || 'By room allocation'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            ) : period && activeTab === 'invigilation' ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-xl font-black text-[var(--color-text-primary)]">My Invigilation Rooms</h2>
                  <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Rooms administration assigned to you for this exam period.</p>
                </div>

                {sortedAssignments.length === 0 ? emptyState('No invigilation rooms assigned', 'When administration assigns you a room, it will appear here.', Building2) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sortedAssignments.map((assignment) => {
                      const status = dutyStatus(assignment);
                      return (
                        <article key={assignment._id} className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
                          <div className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <span className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/30"><Building2 className="h-5 w-5" /></span>
                                <div className="min-w-0">
                                  <h3 className="truncate font-black text-[var(--color-text-primary)]">{assignment.room?.name || 'Exam Room'}</h3>
                                  <p className="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)]">{assignment.room?.building || 'Main Campus'}</p>
                                </div>
                              </div>
                              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${dutyTone[status]}`}>{status}</span>
                            </div>
                            <div className="mt-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
                              <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--color-text-tertiary)]" />{formatDate(assignment.examDate, true)}</p>
                              <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[var(--color-text-tertiary)]" />{assignment.startTime}–{assignment.endTime}</p>
                              <p className="flex items-center gap-2"><Users className="h-4 w-4 text-[var(--color-text-tertiary)]" />{assignment.studentCount || 0} students</p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : period && activeTab === 'attendance' ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-xl font-black text-[var(--color-text-primary)]">Exam Attendance</h2>
                  <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Open an assigned room to mark or review student attendance.</p>
                </div>

                {sortedAssignments.length === 0 ? emptyState('No attendance rooms available', 'Attendance becomes available through rooms assigned to you for invigilation.', ClipboardCheck) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sortedAssignments.map((assignment) => {
                      const status = dutyStatus(assignment);
                      const total = assignment.studentCount || 0;
                      const marked = Math.min(assignment.markedCount || 0, total);
                      const pct = total ? Math.round((marked / total) * 100) : 0;
                      return (
                        <Link
                          key={assignment._id}
                          to={`/teacher/exam-attendance/${assignment._id}`}
                          className="group overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400"
                        >
                          <div className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate font-black text-[var(--color-text-primary)]">{assignment.room?.name || 'Exam Room'}</h3>
                                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{formatDate(assignment.examDate, true)} · {assignment.startTime}–{assignment.endTime}</p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${dutyTone[status]}`}>{status}</span>
                            </div>

                            <div className="mt-4 rounded-xl bg-[var(--color-surface-secondary)] p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><Users className="h-4 w-4" />{total} students</span>
                                <span className="text-xs font-bold text-emerald-600">{marked}/{total} marked</span>
                              </div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-border-subtle)]">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                            </div>

                            {status === 'completed' && (
                              <div className="mt-3">
                                {assignment.submissionStatus === 'submitted' ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Submitted by {assignment.submittedBy?.name || 'User'}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700 dark:bg-red-950/30 dark:text-red-300">Missing</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]/60 px-4 py-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 sm:px-5">
                            <span>{status === 'completed' ? 'Review Attendance' : 'Open Attendance'}</span>
                            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : period && activeTab === 'results' ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-xl font-black text-[var(--color-text-primary)]">Result Entry</h2>
                  <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Enter results only for courses assigned to you in this exam period.</p>
                </div>

                {sortedExams.length === 0 ? emptyState('No courses available for results', 'Your assigned scheduled courses for this exam period will appear here.', GraduationCap) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {sortedExams.map((exam) => {
                      const courseId = exam.course?._id || '';
                      return (
                        <article key={exam._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-5">
                          <div className="flex items-start gap-3">
                            <span className="rounded-xl bg-primary-50 p-3 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300"><GraduationCap className="h-5 w-5" /></span>
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate font-black text-[var(--color-text-primary)]">{exam.course?.title?.en || 'Course'}</h3>
                              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{classLabel(exam)} · {formatDate(exam.examDate)}</p>
                            </div>
                          </div>
                          <Link
                            to={courseId ? `/teacher/results/enter?courseId=${encodeURIComponent(courseId)}` : '/teacher/results/enter'}
                            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-500"
                          >
                            <ClipboardEdit className="h-4 w-4" />
                            Enter Results
                          </Link>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default TeacherExamPeriodWorkspace;
