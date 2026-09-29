/**
 * Teacher Schedule — responsive weekly timetable
 *
 * The teacher sees the timetable assigned to them. Student totals are supplied
 * by the backend from active students registered in each class; course
 * enrollment is deliberately not required.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Leaf,
  MapPinned,
  Monitor,
  Moon,
  Sun,
  Users,
} from 'lucide-react';
import api from '../../../lib/axios';

interface Schedule {
  _id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  studentCount?: number;
  school?: { _id: string; name: string };
  class?: {
    _id: string;
    title: string;
    section: string;
    shiftMode?: 'Morning' | 'Afternoon' | 'Evening' | 'Virtual';
  };
  course?: { _id: string; title: { en: string } };
}

interface Period {
  label?: string;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DISPLAY_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getShiftLabel(schedule: Schedule): 'Morning' | 'Afternoon' | 'Evening' | 'Virtual' {
  if (schedule.class?.shiftMode) return schedule.class.shiftMode;

  const hour = Number(schedule.startTime.slice(0, 2));
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function ShiftIcon({ shift }: { shift: string }) {
  if (shift === 'Evening') return <Moon className="h-4 w-4" />;
  if (shift === 'Virtual') return <Monitor className="h-4 w-4" />;
  return <Sun className="h-4 w-4" />;
}

function CourseIcon({ title }: { title: string }) {
  const value = title.toLowerCase();
  if (value.includes('chem')) return <FlaskConical className="h-6 w-6" />;
  if (value.includes('geo')) return <MapPinned className="h-6 w-6" />;
  if (value.includes('bio')) return <Leaf className="h-6 w-6" />;
  return <BookOpen className="h-6 w-6" />;
}

const cardTones = [
  {
    rail: 'bg-emerald-500',
    time: 'bg-emerald-50/90 dark:bg-emerald-950/25',
    period: 'bg-emerald-600',
    icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  {
    rail: 'bg-blue-500',
    time: 'bg-blue-50/90 dark:bg-blue-950/25',
    period: 'bg-blue-600',
    icon: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
  },
  {
    rail: 'bg-amber-500',
    time: 'bg-amber-50/90 dark:bg-amber-950/25',
    period: 'bg-orange-500',
    icon: 'bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-300',
  },
  {
    rail: 'bg-rose-500',
    time: 'bg-rose-50/90 dark:bg-rose-950/25',
    period: 'bg-rose-500',
    icon: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
  },
] as const;

function startOfTeachingWeek(source: Date, weekOffset = 0) {
  const date = new Date(source);
  date.setHours(12, 0, 0, 0);
  const daysSinceSaturday = (date.getDay() - 6 + 7) % 7;
  date.setDate(date.getDate() - daysSinceSaturday + weekOffset * 7);
  return date;
}

function formatDayDate(date: Date) {
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function TeacherSchedule() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDay());
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/class-schedules/my-teaching');
        setSchedules(data.data || []);

        try {
          const periodResponse = await api.get('/class-schedules/school/period-settings');
          setPeriods(periodResponse.data?.data?.periods || []);
        } catch {
          setPeriods([]);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load your schedule');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const lessonPeriods = useMemo(
    () => periods
      .filter((period) => !period.isBreak)
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [periods],
  );

  const grouped = useMemo(() => {
    const result: Record<number, Schedule[]> = {};
    schedules.forEach((schedule) => {
      (result[schedule.dayOfWeek] = result[schedule.dayOfWeek] || []).push(schedule);
    });
    Object.values(result).forEach((items) => items.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return result;
  }, [schedules]);

  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfTeachingWeek(today, weekOffset), [today, weekOffset]);
  const weekDates = useMemo(
    () => DISPLAY_ORDER.map((day, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      return { day, date };
    }),
    [weekStart],
  );

  const selectedDate = weekDates.find((item) => item.day === selectedDay)?.date || today;
  const selectedSchedules = grouped[selectedDay] || [];
  const subjectCount = new Set(selectedSchedules.map((item) => item.course?._id || item.course?.title?.en).filter(Boolean)).size;
  const isTodaySelected = weekOffset === 0 && selectedDay === today.getDay();

  const getPeriodNumber = (schedule: Schedule, fallbackIndex: number) => {
    const configuredIndex = lessonPeriods.findIndex(
      (period) => period.startTime === schedule.startTime && period.endTime === schedule.endTime,
    );
    return (configuredIndex >= 0 ? configuredIndex : fallbackIndex) + 1;
  };

  const goToToday = () => {
    setWeekOffset(0);
    setSelectedDay(new Date().getDay());
  };

  return (
    <div className="min-w-0 p-3 pt-3 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-900/10">
          <div className="flex flex-col gap-4 px-4 py-6 pl-16 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-7">
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">My Teaching Schedule</h1>
              <p className="mt-1 text-sm font-medium text-emerald-50/90 sm:text-base">Your weekly class timetable</p>
            </div>
            <button
              type="button"
              onClick={goToToday}
              className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold backdrop-blur transition hover:bg-white/20"
            >
              <CalendarDays className="h-5 w-5" />
              This Week
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2 shadow-sm sm:p-3">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {weekDates.map(({ day, date }) => {
              const active = selectedDay === day;
              const currentDay = weekOffset === 0 && today.getDay() === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={
                    'min-w-0 rounded-xl px-1 py-2.5 text-center transition sm:rounded-2xl sm:px-2 sm:py-3 ' +
                    (active
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-700/15'
                      : 'bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]')
                  }
                >
                  <span className="block truncate text-[11px] font-black sm:text-sm">{SHORT_DAYS[day]}</span>
                  <span className={'mt-0.5 block truncate text-[9px] font-semibold sm:text-xs ' + (active ? 'text-emerald-50' : 'text-[var(--color-text-tertiary)]')}>
                    {formatDayDate(date)}
                  </span>
                  <span className={'mx-auto mt-1 block h-1.5 w-1.5 rounded-full ' + (currentDay ? (active ? 'bg-white' : 'bg-emerald-500') : 'bg-transparent')} />
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--color-border-default)] border-t-emerald-600" />
          </div>
        )}

        {!loading && schedules.length === 0 && !error && (
          <div className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center shadow-sm">
            <CalendarDays className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="mt-4 text-lg font-black text-[var(--color-text-primary)]">No classes scheduled yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-text-tertiary)]">
              Your teaching schedule will appear here once an administrator sets up your class times.
            </p>
          </div>
        )}

        {!loading && schedules.length > 0 && (
          <section className="overflow-hidden rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 sm:flex">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-black text-[var(--color-text-primary)] sm:text-xl">
                    {formatLongDate(selectedDate)}
                  </h2>
                  <p className="mt-0.5 text-xs font-medium text-[var(--color-text-tertiary)] sm:text-sm">
                    {selectedSchedules.length} class{selectedSchedules.length === 1 ? '' : 'es'} scheduled
                  </p>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {isTodaySelected && (
                  <span className="hidden rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 sm:inline-flex">
                    Today
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setWeekOffset((value) => value - 1)}
                  aria-label="Previous week"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)]"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset((value) => value + 1)}
                  aria-label="Next week"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)]"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {selectedSchedules.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <p className="text-base font-black text-[var(--color-text-primary)]">No classes on {DAYS[selectedDay]}</p>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Choose another day above to view your schedule.</p>
              </div>
            ) : (
              <div className="space-y-3 p-3 sm:p-5">
                {selectedSchedules.map((schedule, index) => {
                  const shift = getShiftLabel(schedule);
                  const tone = cardTones[index % cardTones.length];
                  const courseTitle = schedule.course?.title?.en || 'Untitled Course';
                  const periodNumber = getPeriodNumber(schedule, index);
                  const className = schedule.class
                    ? `${schedule.class.title} ${schedule.class.section || ''}`.trim()
                    : '—';

                  return (
                    <article
                      key={schedule._id}
                      className="relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <span className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                        <div className={`flex flex-col items-center justify-center px-2 py-4 text-center sm:px-4 sm:py-5 ${tone.time}`}>
                          <p className="text-base font-black leading-tight text-[var(--color-text-primary)] sm:text-xl">
                            {schedule.startTime}
                            <span className="block">– {schedule.endTime}</span>
                          </p>
                          <span className={`mt-2 rounded-full px-3 py-1 text-[10px] font-black text-white sm:text-xs ${tone.period}`}>
                            Period {periodNumber}
                          </span>
                        </div>

                        <div className="min-w-0 px-3 py-4 sm:flex sm:items-center sm:gap-4 sm:px-5 sm:py-5">
                          <div className={`hidden h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl sm:flex ${tone.icon}`}>
                            <CourseIcon title={courseTitle} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-base font-black text-[var(--color-text-primary)] sm:text-lg">{courseTitle}</p>
                              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 sm:hidden">
                                <ShiftIcon shift={shift} />
                                {shift}
                              </span>
                            </div>
                            <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)] sm:text-sm">
                              <BookOpen className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{className}</span>
                            </p>
                            <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)] sm:text-sm">
                              <Users className="h-4 w-4 flex-shrink-0" />
                              {schedule.studentCount ?? 0} students
                            </p>
                          </div>
                        </div>

                        <div className="hidden items-center pr-5 sm:flex">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                            <ShiftIcon shift={shift} />
                            {shift}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}

                <div className="flex flex-col gap-3 rounded-2xl bg-blue-50 px-4 py-4 text-blue-900 dark:bg-blue-950/25 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">i</div>
                    <div>
                      <p className="text-sm font-black">
                        You have {selectedSchedules.length} class{selectedSchedules.length === 1 ? '' : 'es'} {isTodaySelected ? 'today' : `on ${DAYS[selectedDay]}`}
                      </p>
                      <p className="mt-0.5 text-xs font-medium opacity-75">
                        {subjectCount} subject{subjectCount === 1 ? '' : 's'} in your teaching schedule
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={goToToday}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-100 px-4 py-2.5 text-xs font-black text-blue-700 transition hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-200 sm:w-auto"
                  >
                    <CalendarDays className="h-4 w-4" />
                    View This Week
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default TeacherSchedule;
