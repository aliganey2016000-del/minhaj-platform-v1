import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Info,
  Percent,
  User,
  XCircle,
} from 'lucide-react';
import api from '../../../lib/axios';

interface CourseAttendance {
  courseId: string;
  code: string;
  title: string;
  section: string;
  days: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  presentPercentage: number;
  absentPercentage: number;
}

interface HistoryEntry {
  _id: string;
  date: string;
  status: string;
  notes?: string;
  schedule?: { startTime: string; endTime: string } | null;
  markedBy?: string | null;
}

type AttendanceStats = {
  days: number;
  present: number;
  absent: number;
  attendance: number;
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  present: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  absent: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
  late: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  excused: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300',
};

const STATUS_BORDER_CLASSES: Record<string, string> = {
  present: 'border-l-emerald-500',
  absent: 'border-l-rose-500',
  late: 'border-l-amber-500',
  excused: 'border-l-sky-500',
};

function statsFor(course: CourseAttendance): AttendanceStats {
  // Product rule: Late counts as Present, Excused counts as Absent.
  const present = Number(course.present || 0) + Number(course.late || 0);
  const absent = Number(course.absent || 0) + Number(course.excused || 0);
  const statusCount = present + absent;
  const days = Math.max(Number(course.days || 0), statusCount);
  const attendance = days > 0 ? Math.round((present / days) * 100) : 0;
  return { days, present, absent, attendance };
}

function attendanceTone(rate: number): string {
  if (rate >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (rate >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function progressTone(rate: number): string {
  if (rate >= 75) return 'bg-emerald-500';
  if (rate >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

function historyStatusLabel(status: string): string {
  if (status === 'late') return 'Late · Present';
  if (status === 'excused') return 'Excused · Absent';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function StudentAttendance() {
  const { t } = useTranslation('common');
  const [courses, setCourses] = useState<CourseAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyByCourse, setHistoryByCourse] = useState<Record<string, HistoryEntry[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/attendance/my/courses');
        setCourses(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || t('error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const toggleExpand = async (courseId: string) => {
    if (expandedId === courseId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(courseId);
    if (historyByCourse[courseId]) return;

    setHistoryLoading(courseId);
    try {
      const { data } = await api.get('/attendance/my/course-history', { params: { courseId } });
      setHistoryByCourse((prev) => ({ ...prev, [courseId]: data.data || [] }));
    } catch {
      setHistoryByCourse((prev) => ({ ...prev, [courseId]: [] }));
    } finally {
      setHistoryLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-24 text-center sm:px-6">
        <p className="mb-4 text-sm text-red-500">{error}</p>
        <button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white">
          {t('retry')}
        </button>
      </div>
    );
  }

  const overall = courses.reduce<AttendanceStats>(
    (total, course) => {
      const stats = statsFor(course);
      total.days += stats.days;
      total.present += stats.present;
      total.absent += stats.absent;
      return total;
    },
    { days: 0, present: 0, absent: 0, attendance: 0 },
  );
  overall.attendance = overall.days > 0 ? Math.round((overall.present / overall.days) * 100) : 0;

  return (
    <div className="px-4 pb-10 pt-20 sm:px-6 lg:px-10 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/30 dark:text-primary-300">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[var(--color-text-primary)] sm:text-2xl">Course Attendance</h1>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)] sm:text-sm">A clear summary of your attendance in every course.</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
            {courses.length} course{courses.length === 1 ? '' : 's'}
          </span>
        </header>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
          <div className="border-b border-[var(--color-border-default)] px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">Overall attendance</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Late is included in Present. Excused is included in Absent.</p>
              </div>
              <span className={`text-2xl font-black tabular-nums ${attendanceTone(overall.attendance)}`}>{overall.attendance}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
              <div className={`h-full rounded-full transition-all duration-700 ${progressTone(overall.attendance)}`} style={{ width: `${overall.attendance}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border-default)] sm:grid-cols-4 sm:divide-y-0">
            <SummaryMetric icon={<CalendarDays className="h-4 w-4" />} label="Days" value={overall.days} />
            <SummaryMetric icon={<CheckCircle2 className="h-4 w-4" />} label="Present" value={overall.present} valueClass="text-emerald-600 dark:text-emerald-400" />
            <SummaryMetric icon={<XCircle className="h-4 w-4" />} label="Absent" value={overall.absent} valueClass="text-rose-600 dark:text-rose-400" />
            <SummaryMetric icon={<Percent className="h-4 w-4" />} label="Attendance" value={`${overall.attendance}%`} valueClass={attendanceTone(overall.attendance)} />
          </div>
        </section>

        {courses.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-6 py-14 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" />
            <p className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">No course attendance yet</p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Your attendance will appear here after it is recorded.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((course) => {
              const stats = statsFor(course);
              const isExpanded = expandedId === course.courseId;

              return (
                <article key={course.courseId} className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
                  <button type="button" onClick={() => void toggleExpand(course.courseId)} className="w-full p-4 text-left sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-secondary)] text-primary-600 dark:text-primary-300">
                        <BookOpen className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {course.code && <span className="font-mono text-xs font-bold tracking-wide text-primary-600 dark:text-primary-300">{course.code}</span>}
                          {stats.days === 0 && (
                            <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-text-tertiary)]">No records yet</span>
                          )}
                        </div>
                        <h2 className="mt-1 truncate text-base font-bold text-[var(--color-text-primary)] sm:text-lg">{course.title}</h2>
                        {course.section && <p className="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)] sm:text-sm">{course.section}</p>}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-right">
                          <p className={`text-xl font-black tabular-nums ${attendanceTone(stats.attendance)}`}>{stats.attendance}%</p>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Attendance</p>
                        </div>
                        <ChevronDown className={`h-5 w-5 text-[var(--color-text-tertiary)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <CourseMetric label="Days" value={stats.days} />
                      <CourseMetric label="Present" value={stats.present} valueClass="text-emerald-600 dark:text-emerald-400" note={course.late > 0 ? `${course.late} late included` : undefined} />
                      <CourseMetric label="Absent" value={stats.absent} valueClass="text-rose-600 dark:text-rose-400" note={course.excused > 0 ? `${course.excused} excused included` : undefined} />
                      <CourseMetric label="Attendance" value={`${stats.attendance}%`} valueClass={attendanceTone(stats.attendance)} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--color-border-default)] px-4 pb-5 pt-4 sm:px-5">
                      <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-3 text-xs text-primary-900 dark:border-primary-900/50 dark:bg-primary-950/20 dark:text-primary-200">
                        <div className="flex gap-2">
                          <Info className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <p className="font-semibold">How your statistics are counted</p>
                            <p className="mt-1 text-primary-800/80 dark:text-primary-200/80"><strong>Late → Present</strong> and <strong>Excused → Absent</strong>. The history below still shows the original status.</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="font-medium text-[var(--color-text-tertiary)]">Course attendance rate</span>
                          <span className={`font-bold ${attendanceTone(stats.attendance)}`}>{stats.attendance}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                          <div className={`h-full rounded-full transition-all duration-700 ${progressTone(stats.attendance)}`} style={{ width: `${stats.attendance}%` }} />
                        </div>
                      </div>

                      <div className="mt-5">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Attendance history</p>
                        {historyLoading === course.courseId ? (
                          <div className="flex justify-center py-8">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
                          </div>
                        ) : (
                          <AttendanceHistory entries={historyByCourse[course.courseId] || []} />
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryMetric({ icon, label, value, valueClass = 'text-[var(--color-text-primary)]' }: { icon: React.ReactNode; label: string; value: number | string; valueClass?: string }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{icon}{label}</div>
      <p className={`mt-1 text-xl font-black tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function CourseMetric({ label, value, valueClass = 'text-[var(--color-text-primary)]', note }: { label: string; value: number | string; valueClass?: string; note?: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-secondary)] px-3 py-2.5">
      <p className={`text-lg font-black tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">{label}</p>
      {note && <p className="mt-1 truncate text-[10px] text-[var(--color-text-tertiary)]">{note}</p>}
    </div>
  );
}

function AttendanceHistory({ entries }: { entries: HistoryEntry[] }) {
  const sorted = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sorted.length === 0) {
    return <p className="rounded-xl bg-[var(--color-surface-secondary)] px-4 py-5 text-center text-sm text-[var(--color-text-tertiary)]">No attendance history recorded yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)]">
      {sorted.map((entry, index) => {
        const date = new Date(entry.date);
        return (
          <div key={entry._id} className={`border-l-4 bg-[var(--color-surface-primary)] px-3.5 py-3 ${index > 0 ? 'border-t border-t-[var(--color-border-default)]' : ''} ${STATUS_BORDER_CLASSES[entry.status] || 'border-l-transparent'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{date.toLocaleDateString(undefined, { weekday: 'long' })}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGE_CLASSES[entry.status] || 'bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]'}`}>
                {historyStatusLabel(entry.status)}
              </span>
            </div>

            {(entry.schedule || entry.markedBy) && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
                {entry.schedule && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{entry.schedule.startTime} – {entry.schedule.endTime}</span>}
                {entry.markedBy && <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{entry.markedBy}</span>}
              </div>
            )}

            {entry.notes && <p className="mt-2 text-xs italic text-[var(--color-text-tertiary)]">“{entry.notes}”</p>}
          </div>
        );
      })}
    </div>
  );
}
