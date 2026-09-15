import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Info,
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
  present: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  absent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  late: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  excused: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

const COURSE_ACCENTS = [
  'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
];

function statsFor(course: CourseAttendance): AttendanceStats {
  // Product rule: Late counts as Present, Excused counts as Absent.
  const present = Number(course.present || 0) + Number(course.late || 0);
  const absent = Number(course.absent || 0) + Number(course.excused || 0);
  const counted = present + absent;
  const days = Math.max(Number(course.days || 0), counted);
  const attendance = days > 0 ? Math.round((present / days) * 100) : 0;
  return { days, present, absent, attendance };
}

function rateText(rate: number): string {
  if (rate >= 90) return 'Excellent attendance';
  if (rate >= 75) return 'Good attendance';
  if (rate >= 50) return 'Needs attention';
  return 'Attendance is low';
}

function rateClass(rate: number): string {
  if (rate >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (rate >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function progressClass(rate: number): string {
  if (rate >= 75) return 'bg-emerald-500';
  if (rate >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

function courseInitials(title: string, code?: string): string {
  const fromCode = String(code || '').split('-')[0].trim().slice(0, 3);
  if (fromCode) return fromCode.toUpperCase();
  return String(title || 'Course')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
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
    <div className="px-3 pb-10 pt-20 sm:px-6 lg:px-10 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-300">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-2xl">Course Attendance</h1>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Your attendance, course by course.</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-secondary)]">
            {courses.length} course{courses.length === 1 ? '' : 's'}
          </span>
        </header>

        <section className="overflow-hidden rounded-[1.5rem] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
          <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
            <div className="flex items-center gap-4">
              <div
                className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full p-[10px]"
                style={{
                  background: `conic-gradient(#34d399 0 ${overall.attendance}%, rgba(148,163,184,.18) ${overall.attendance}% 100%)`,
                }}
              >
                <div className="grid h-full w-full place-items-center rounded-full bg-[var(--color-surface-primary)] text-center">
                  <div>
                    <p className="text-2xl font-black tabular-nums text-[var(--color-text-primary)]">{overall.attendance}%</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Present</p>
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text-primary)]">Overall Attendance</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Across {courses.length} course{courses.length === 1 ? '' : 's'}</p>
                <p className={`mt-2 text-sm font-bold ${rateClass(overall.attendance)}`}>{rateText(overall.attendance)}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Keep improving every day.</p>
              </div>
            </div>

            <div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
              <HeroMetric icon={<CalendarDays className="h-4 w-4" />} label="Days" value={overall.days} />
              <HeroMetric icon={<CheckCircle2 className="h-4 w-4" />} label="Present" value={overall.present} valueClass="text-emerald-600 dark:text-emerald-400" />
              <HeroMetric icon={<XCircle className="h-4 w-4" />} label="Absent" value={overall.absent} valueClass="text-rose-600 dark:text-rose-400" />
              <HeroMetric icon={<BarChart3 className="h-4 w-4" />} label="Attendance" value={`${overall.attendance}%`} valueClass="text-violet-600 dark:text-violet-400" />
            </div>
          </div>
        </section>

        {courses.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-6 py-14 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" />
            <p className="mt-3 text-sm font-bold text-[var(--color-text-primary)]">No attendance records yet</p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Course attendance will appear here after your teacher records it.</p>
          </div>
        ) : (
          <section>
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-base font-black text-[var(--color-text-primary)]">Courses ({courses.length})</h2>
              <span className="text-xs font-medium text-[var(--color-text-tertiary)]">Tap a course for history</span>
            </div>

            <div className="space-y-3">
              {courses.map((course, index) => {
                const stats = statsFor(course);
                const isExpanded = expandedId === course.courseId;

                return (
                  <article
                    key={course.courseId}
                    className="overflow-hidden rounded-[1.35rem] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm transition-shadow hover:shadow-md"
                  >
                    <button type="button" onClick={() => void toggleExpand(course.courseId)} className="w-full p-4 text-left sm:p-5">
                      <div className="flex items-center gap-3">
                        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-xs font-black ${COURSE_ACCENTS[index % COURSE_ACCENTS.length]}`}>
                          {courseInitials(course.title, course.code)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-base font-black text-[var(--color-text-primary)] sm:text-lg">{course.title}</h3>
                          <p className="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)] sm:text-sm">
                            {[course.code, course.section].filter(Boolean).join(' · ')}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {stats.days === 0 && (
                            <span className="hidden rounded-full bg-[var(--color-surface-tertiary)] px-2 py-1 text-[10px] font-bold text-[var(--color-text-tertiary)] sm:inline-flex">No records</span>
                          )}
                          <ChevronDown className={`h-5 w-5 text-[var(--color-text-tertiary)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-4 divide-x divide-[var(--color-border-default)] rounded-xl bg-[var(--color-surface-secondary)] px-1 py-2.5">
                        <CourseStat icon={<CalendarDays className="h-3.5 w-3.5 text-sky-500" />} label="Days" value={stats.days} />
                        <CourseStat icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />} label="Present" value={stats.present} valueClass="text-emerald-600 dark:text-emerald-400" />
                        <CourseStat icon={<XCircle className="h-3.5 w-3.5 text-rose-500" />} label="Absent" value={stats.absent} valueClass="text-rose-600 dark:text-rose-400" />
                        <CourseStat icon={<BarChart3 className="h-3.5 w-3.5 text-violet-500" />} label="Attendance" value={`${stats.attendance}%`} valueClass="text-violet-600 dark:text-violet-400" />
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                        <div className={`h-full rounded-full transition-all duration-700 ${progressClass(stats.attendance)}`} style={{ width: `${stats.attendance}%` }} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-[var(--color-border-default)] px-4 pb-5 pt-4 sm:px-5">
                        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3.5 text-xs text-sky-800 dark:text-sky-200">
                          <div className="flex gap-2.5">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" />
                            <p className="leading-5"><strong>Late</strong> is counted as <strong>Present</strong>. <strong>Excused</strong> is counted as <strong>Absent</strong> in the statistics. History keeps the original status.</p>
                          </div>
                        </div>

                        <div className="mt-5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-[var(--color-text-primary)]">Attendance History</p>
                            <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Recent records for {course.title}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${stats.attendance >= 75 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : stats.attendance >= 50 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'bg-rose-500/10 text-rose-600 dark:text-rose-300'}`}>
                            {stats.attendance}%
                          </span>
                        </div>

                        <div className="mt-3">
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
          </section>
        )}
      </div>
    </div>
  );
}

function HeroMetric({ icon, label, value, valueClass = 'text-[var(--color-text-primary)]' }: { icon: ReactNode; label: string; value: number | string; valueClass?: string }) {
  return (
    <div className="min-w-0 px-1.5 py-1 text-center sm:px-3 sm:py-2">
      <div className="mx-auto mb-1 flex w-fit items-center justify-center text-[var(--color-text-tertiary)]">{icon}</div>
      <p className={`truncate text-base font-black tabular-nums sm:text-lg ${valueClass}`}>{value}</p>
      <p className="mt-0.5 truncate text-[9px] font-semibold text-[var(--color-text-tertiary)] sm:text-[10px]">{label}</p>
    </div>
  );
}

function CourseStat({ icon, label, value, valueClass = 'text-[var(--color-text-primary)]' }: { icon: ReactNode; label: string; value: number | string; valueClass?: string }) {
  return (
    <div className="min-w-0 px-1 text-center sm:px-2">
      <div className="mx-auto mb-1 flex w-fit items-center justify-center">{icon}</div>
      <p className={`truncate text-sm font-black tabular-nums sm:text-base ${valueClass}`}>{value}</p>
      <p className="mt-0.5 truncate text-[8px] font-semibold text-[var(--color-text-tertiary)] sm:text-[10px]">{label}</p>
    </div>
  );
}

function AttendanceHistory({ entries }: { entries: HistoryEntry[] }) {
  const sorted = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-6 text-center">
        <p className="text-sm font-semibold text-[var(--color-text-secondary)]">No attendance history recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)]">
      <div className="hidden grid-cols-[1.15fr_.9fr_.8fr_1fr_1fr] gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)] sm:grid">
        <span>Date</span>
        <span>Status</span>
        <span>Time</span>
        <span>Teacher</span>
        <span>Note</span>
      </div>

      <div className="divide-y divide-[var(--color-border-default)]">
        {sorted.map((entry) => {
          const date = new Date(entry.date);
          const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          const timeLabel = entry.schedule ? `${entry.schedule.startTime}–${entry.schedule.endTime}` : '—';

          return (
            <div key={entry._id} className="bg-[var(--color-surface-primary)] px-3 py-3">
              <div className="grid gap-2 sm:grid-cols-[1.15fr_.9fr_.8fr_1fr_1fr] sm:items-center">
                <div className="flex items-center justify-between gap-3 sm:block">
                  <div>
                    <p className="text-xs font-bold text-[var(--color-text-primary)]">{dateLabel}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)] sm:hidden">{date.toLocaleDateString(undefined, { weekday: 'long' })}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold sm:hidden ${STATUS_BADGE_CLASSES[entry.status] || 'bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]'}`}>
                    {historyStatusLabel(entry.status)}
                  </span>
                </div>

                <span className={`hidden w-fit rounded-full px-2.5 py-1 text-[10px] font-bold sm:inline-flex ${STATUS_BADGE_CLASSES[entry.status] || 'bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]'}`}>
                  {historyStatusLabel(entry.status)}
                </span>

                <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                  <Clock className="h-3.5 w-3.5" />{timeLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                  <User className="h-3.5 w-3.5" />{entry.markedBy || '—'}
                </span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">{entry.notes || '—'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
