import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardEdit,
  Clock3,
  GraduationCap,
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
  attendanceSummary?: {
    present?: number;
    absent?: number;
    totalMarked?: number;
  };
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
  presentCount?: number;
  absentCount?: number;
  completed?: boolean;
  submissionStatus?: 'submitted' | 'missing';
  submittedBy?: { name?: string; role?: string } | null;
  room?: { _id?: string; name?: string; building?: string; capacity?: number };
  classBreakdown?: Array<{
    classId?: string;
    className?: string;
    subject?: string;
    students?: number;
  }>;
  period?: string | { _id?: string; name?: string; academicYear?: string; status?: string };
}

type DutyStatus = 'upcoming' | 'ongoing' | 'completed';

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
  if (now <= end) return 'ongoing';
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
  ongoing: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  completed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const scheduleCardTones = [
  {
    card: 'border-emerald-200/80 bg-emerald-50/45 dark:border-emerald-900/55 dark:bg-emerald-950/15',
    course: 'text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300',
    meta: 'bg-white/75 dark:bg-black/20',
  },
  {
    card: 'border-sky-200/80 bg-sky-50/45 dark:border-sky-900/55 dark:bg-sky-950/15',
    course: 'text-sky-700 dark:text-sky-300',
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950/45 dark:text-sky-300',
    meta: 'bg-white/75 dark:bg-black/20',
  },
  {
    card: 'border-amber-200/80 bg-amber-50/45 dark:border-amber-900/55 dark:bg-amber-950/15',
    course: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/45 dark:text-amber-300',
    meta: 'bg-white/75 dark:bg-black/20',
  },
  {
    card: 'border-violet-200/80 bg-violet-50/45 dark:border-violet-900/55 dark:bg-violet-950/15',
    course: 'text-violet-700 dark:text-violet-300',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950/45 dark:text-violet-300',
    meta: 'bg-white/75 dark:bg-black/20',
  },
] as const;

const tabs: { key: WorkspaceTab; label: string; shortLabel: string; icon: typeof CalendarDays }[] = [
  { key: 'schedule', label: 'Schedule', shortLabel: 'Schedule', icon: CalendarDays },
  { key: 'invigilation', label: 'Invigilation Rooms', shortLabel: 'Rooms', icon: Building2 },
  { key: 'attendance', label: 'Attendance', shortLabel: 'Attendance', icon: ClipboardCheck },
  { key: 'results', label: 'Result Entry', shortLabel: 'Results', icon: ClipboardEdit },
];

export function TeacherExamPeriodWorkspace() {
  const { periodId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as WorkspaceTab | null;
  const activeTab: WorkspaceTab = tabs.some((item) => item.key === requestedTab) ? requestedTab! : 'schedule';

  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [invigilationStatus, setInvigilationStatus] = useState<DutyStatus>('upcoming');
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

  const invigilationCounts = useMemo(() => ({
    upcoming: sortedAssignments.filter((assignment) => dutyStatus(assignment) === 'upcoming').length,
    ongoing: sortedAssignments.filter((assignment) => dutyStatus(assignment) === 'ongoing').length,
    completed: sortedAssignments.filter((assignment) => dutyStatus(assignment) === 'completed').length,
  }), [sortedAssignments]);

  const filteredInvigilationAssignments = useMemo(
    () => sortedAssignments.filter((assignment) => dutyStatus(assignment) === invigilationStatus),
    [sortedAssignments, invigilationStatus],
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
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-3 sm:p-5 sm:pt-4 lg:p-8 lg:pt-6">
      <main className="mx-auto max-w-7xl space-y-5">
        <header>
          <Link
            to="/teacher/exams"
            className="mb-2 inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-secondary)] transition hover:text-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Exam Periods
          </Link>

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
              {period?.name || (loading ? 'Loading exam…' : 'Exam Workspace')}
            </h1>
            {period && (
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                {period.academicYear}{period.term ? ` · ${period.term}` : ''} · {formatRange(period)}
              </p>
            )}
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
              <nav className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1" aria-label="Teacher exam period sections">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const selected = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTab(tab.key)}
                      className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[10px] font-bold transition sm:gap-2 sm:px-2.5 sm:text-sm ${selected ? 'bg-emerald-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-primary)]'}`}
                      aria-current={selected ? 'page' : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate sm:hidden">{tab.shortLabel}</span>
                      <span className="hidden truncate sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </section>

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
                      {sortedExams.map((exam, index) => {
                        const tone = scheduleCardTones[index % scheduleCardTones.length];
                        return (
                          <article key={exam._id} className={`rounded-2xl border p-4 shadow-sm transition ${tone.card}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`truncate text-xs font-black uppercase tracking-wide ${tone.course}`}>{exam.course?.title?.en || 'Course'}</p>
                                <h3 className="mt-1 truncate font-bold text-[var(--color-text-primary)]">{exam.title}</h3>
                                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{classLabel(exam)}</p>
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${tone.badge}`}>Schedule</span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                              <span className={`rounded-xl p-3 ${tone.meta}`}><CalendarDays className="mb-1 h-4 w-4 text-[var(--color-text-tertiary)]" />{formatDate(exam.examDate)}</span>
                              <span className={`rounded-xl p-3 ${tone.meta}`}><Clock3 className="mb-1 h-4 w-4 text-[var(--color-text-tertiary)]" />{exam.startTime || '—'}{exam.endTime ? `–${exam.endTime}` : ''}</span>
                            </div>
                          </article>
                        );
                      })}
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
              <section className="space-y-3">
                <h2 className="text-xl font-black text-[var(--color-text-primary)]">My Invigilation Rooms</h2>

                <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm">
                  <nav className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1" aria-label="Invigilation room status">
                    {([
                      ['upcoming', 'Upcoming'],
                      ['ongoing', 'Ongoing'],
                      ['completed', 'Completed'],
                    ] as Array<[DutyStatus, string]>).map(([key, label]) => {
                      const selected = invigilationStatus === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setInvigilationStatus(key)}
                          className={`flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-black transition sm:text-sm ${selected ? 'bg-emerald-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-primary)]'}`}
                        >
                          <span className="truncate">{label}</span>
                          <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${selected ? 'bg-white/20 text-white' : 'bg-[var(--color-surface-primary)] text-[var(--color-text-tertiary)]'}`}>
                            {invigilationCounts[key]}
                          </span>
                        </button>
                      );
                    })}
                  </nav>
                </div>

                {sortedAssignments.length === 0 ? emptyState('No invigilation rooms assigned', 'When administration assigns you a room, it will appear here.', Building2) : filteredInvigilationAssignments.length === 0 ? (
                  emptyState(
                    `No ${invigilationStatus} rooms`,
                    invigilationStatus === 'upcoming'
                      ? 'You do not have another assigned room waiting to start.'
                      : invigilationStatus === 'ongoing'
                        ? 'You do not have an exam room in progress right now.'
                        : 'No completed invigilation rooms yet.',
                    Building2,
                  )
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {filteredInvigilationAssignments.map((assignment) => {
                      const status = dutyStatus(assignment);
                      const classBreakdown = assignment.classBreakdown || [];
                      return (
                        <article key={assignment._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3.5 shadow-sm sm:p-4">
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="shrink-0 rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950/30">
                                <Building2 className="h-5 w-5" />
                              </span>
                              <div className="min-w-0">
                                <h3 className="truncate text-base font-black text-[var(--color-text-primary)]">{assignment.room?.name || 'Exam Room'}</h3>
                                <p className="truncate text-xs text-[var(--color-text-tertiary)]">{assignment.room?.building || 'Main Campus'}</p>
                              </div>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black capitalize ${dutyTone[status]}`}>{status}</span>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-[var(--color-text-secondary)]">
                            <p className="col-span-2 flex min-w-0 items-center gap-2">
                              <CalendarDays className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
                              <span className="truncate">{formatDate(assignment.examDate, true)}</span>
                            </p>
                            <p className="flex min-w-0 items-center gap-2">
                              <Clock3 className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
                              <span className="truncate">{assignment.startTime}–{assignment.endTime}</span>
                            </p>
                            <p className="flex min-w-0 items-center gap-2">
                              <Users className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
                              <span className="truncate">{assignment.studentCount || 0} students</span>
                            </p>
                          </div>

                          <div className="mt-3 border-t border-[var(--color-border-subtle)] pt-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">Classes in this room</span>
                              <span className="text-[10px] font-bold text-[var(--color-text-tertiary)]">{classBreakdown.length} {classBreakdown.length === 1 ? 'class' : 'classes'}</span>
                            </div>
                            {classBreakdown.length ? (
                              <div className="space-y-1.5">
                                {classBreakdown.map((item, index) => (
                                  <div
                                    key={`${item.classId || item.className || 'class'}-${item.subject || index}`}
                                    className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-surface-secondary)] px-2.5 py-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-black text-[var(--color-text-primary)]">{item.className || 'Class'}</p>
                                      <p className="truncate text-[10px] text-[var(--color-text-tertiary)]">{item.subject || 'Exam'}</p>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-[var(--color-surface-primary)] px-2 py-1 text-[10px] font-black text-[var(--color-text-secondary)]">
                                      {item.students || 0} students
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-[var(--color-text-tertiary)]">No class allocation found for this room.</p>
                            )}
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
                      return (
                        <Link
                          key={assignment._id}
                          to={`/teacher/exam-attendance/${assignment._id}`}
                          className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400"
                        >
                          <div className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <span className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/30">
                                  <Building2 className="h-5 w-5" />
                                </span>
                                <div className="min-w-0">
                                  <h3 className="truncate font-black text-[var(--color-text-primary)]">{assignment.room?.name || 'Exam Room'}</h3>
                                  <p className="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)]">{assignment.room?.building || 'Main Campus'}</p>
                                </div>
                              </div>
                              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${dutyTone[status]}`}>{status}</span>
                            </div>

                            <div className="mt-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
                              <p className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                                {formatDate(assignment.examDate, true)}
                              </p>
                              <p className="flex items-center gap-2">
                                <Clock3 className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                                {assignment.startTime}–{assignment.endTime}
                              </p>
                              <p className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                                {assignment.studentCount || 0} students
                              </p>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div className="rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-950/25">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Present</p>
                                <p className="mt-0.5 text-base font-black text-emerald-700 dark:text-emerald-300">{assignment.presentCount || 0}</p>
                              </div>
                              <div className="rounded-xl bg-red-50 px-3 py-2 dark:bg-red-950/25">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">Absent</p>
                                <p className="mt-0.5 text-base font-black text-red-700 dark:text-red-300">{assignment.absentCount || 0}</p>
                              </div>
                            </div>
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

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <div className="rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-950/25">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Present</p>
                              <p className="mt-0.5 text-base font-black text-emerald-700 dark:text-emerald-300">{exam.attendanceSummary?.present || 0}</p>
                            </div>
                            <div className="rounded-xl bg-red-50 px-3 py-2 dark:bg-red-950/25">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">Absent</p>
                              <p className="mt-0.5 text-base font-black text-red-700 dark:text-red-300">{exam.attendanceSummary?.absent || 0}</p>
                            </div>
                          </div>

                          <Link
                            to={courseId ? `/teacher/results/enter?courseId=${encodeURIComponent(courseId)}&examId=${encodeURIComponent(exam._id)}` : '/teacher/results/enter'}
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
