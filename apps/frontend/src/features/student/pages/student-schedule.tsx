/**
 * Student Schedule — Read-Only View
 *
 * Premium mobile-first weekly timetable for students. Keeps the existing
 * schedule API, swipe navigation, live-class state, Google Calendar action,
 * and local reminder support while presenting the timetable as a clean
 * timeline that mirrors the approved visual direction.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  Clock,
  Coffee,
  MapPin,
  User,
  Video,
} from 'lucide-react';
import api from '../../../lib/axios';

interface Schedule {
  _id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  course?: {
    _id: string;
    title: { en: string } | string;
    courseCode?: string;
    isLive?: boolean;
  };
  teacher?: {
    _id: string;
    name?: string;
    profile?: { firstName: string; lastName: string };
  };
}

interface Period {
  label?: string;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DISPLAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatBreakLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}-min Break`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours}-hour Break`;
  return `${hours}h ${rest}m Break`;
}

type DayRow =
  | { kind: 'class'; schedule: Schedule }
  | { kind: 'break'; minutes: number; startTime?: string; endTime?: string };

function withBreaks(daySchedules: Schedule[], periods: Period[]): DayRow[] {
  const rows: DayRow[] = [];
  const configuredBreaks = periods
    .filter((period) => period.isBreak)
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  daySchedules.forEach((schedule, index) => {
    rows.push({ kind: 'class', schedule });
    const next = daySchedules[index + 1];
    if (!next) return;

    const breaksBetween = configuredBreaks.filter(
      (period) => period.startTime >= schedule.endTime && period.endTime <= next.startTime,
    );

    if (breaksBetween.length > 0) {
      breaksBetween.forEach((period) => {
        rows.push({
          kind: 'break',
          minutes: Math.max(0, toMinutes(period.endTime) - toMinutes(period.startTime)),
          startTime: period.startTime,
          endTime: period.endTime,
        });
      });
      return;
    }

    const gap = toMinutes(next.startTime) - toMinutes(schedule.endTime);
    if (gap >= 30) {
      rows.push({
        kind: 'break',
        minutes: gap,
        startTime: schedule.endTime,
        endTime: next.startTime,
      });
    }
  });

  return rows;
}

const COURSE_PALETTE = [
  {
    border: 'border-l-violet-500',
    dot: 'bg-violet-500',
    avatar: 'bg-violet-500/20 text-violet-700 dark:text-violet-300',
    badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/25',
  },
  {
    border: 'border-l-emerald-500',
    dot: 'bg-emerald-500',
    avatar: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  },
  {
    border: 'border-l-sky-500',
    dot: 'bg-sky-500',
    avatar: 'bg-sky-500/20 text-sky-700 dark:text-sky-300',
    badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25',
  },
  {
    border: 'border-l-fuchsia-500',
    dot: 'bg-fuchsia-500',
    avatar: 'bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300',
    badge: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25',
  },
  {
    border: 'border-l-amber-500',
    dot: 'bg-amber-500',
    avatar: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25',
  },
  {
    border: 'border-l-cyan-500',
    dot: 'bg-cyan-500',
    avatar: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300',
    badge: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/25',
  },
];

function courseAccentColor(courseId: string) {
  let hash = 0;
  for (let i = 0; i < courseId.length; i += 1) {
    hash = (hash * 31 + courseId.charCodeAt(i)) >>> 0;
  }
  return COURSE_PALETTE[hash % COURSE_PALETTE.length];
}

function courseTitle(schedule: Schedule): string {
  const title = schedule.course?.title;
  if (typeof title === 'string') return title || 'Untitled Course';
  return title?.en || 'Untitled Course';
}

function courseInitials(title: string): string {
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  return initials || 'CLS';
}

function weekDateForDay(reference: Date, dayOfWeek: number): Date {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const daysSinceSaturday = (reference.getDay() - 6 + 7) % 7;
  start.setDate(reference.getDate() - daysSinceSaturday);
  const index = DISPLAY_ORDER.indexOf(dayOfWeek);
  const result = new Date(start);
  result.setDate(start.getDate() + Math.max(0, index));
  return result;
}

function formatSelectedDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function nextOccurrenceDate(dayOfWeek: number, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const result = new Date(now);
  result.setHours(h, m, 0, 0);
  let diff = (dayOfWeek - now.getDay() + 7) % 7;
  if (diff === 0 && result.getTime() < now.getTime()) diff = 7;
  result.setDate(now.getDate() + diff);
  return result;
}

function formatGCalDateTime(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

function buildGoogleCalendarUrl(schedule: Schedule, teacherName: string): string {
  const start = nextOccurrenceDate(schedule.dayOfWeek, schedule.startTime);
  const end = nextOccurrenceDate(schedule.dayOfWeek, schedule.endTime);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: courseTitle(schedule),
    dates: `${formatGCalDateTime(start)}/${formatGCalDateTime(end)}`,
    details: `Teacher: ${teacherName}`,
    recur: 'RRULE:FREQ=WEEKLY',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const REMINDERS_KEY = 'sahal_schedule_reminders';
const REMINDER_LEAD_MINUTES = 10;

interface PendingReminder {
  id: string;
  courseTitle: string;
  fireAt: number;
}

function getPendingReminders(): PendingReminder[] {
  try {
    return JSON.parse(localStorage.getItem(REMINDERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function savePendingReminders(list: PendingReminder[]): void {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(list));
}

export function StudentSchedule() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());
  const touchStartX = useRef<number | null>(null);
  const [swipeDirection, setSwipeDirection] = useState(0);

  const todayDow = now.getDay();
  const [selectedDay, setSelectedDay] = useState(todayDow);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/class-schedules/my');
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

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const checkReminders = () => {
      const pending = getPendingReminders();
      if (pending.length === 0) return;

      const nowMs = Date.now();
      const due = pending.filter((reminder) => reminder.fireAt <= nowMs);
      const remaining = pending.filter((reminder) => reminder.fireAt > nowMs);

      if (due.length > 0) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          due.forEach((reminder) => {
            new Notification(`⏰ ${reminder.courseTitle} starts soon`, {
              body: `Starting in about ${REMINDER_LEAD_MINUTES} minutes.`,
              icon: '/icons/pwa-192x192.png',
            });
          });
        }
        savePendingReminders(remaining);
      }

      setRemindedIds(new Set(remaining.map((reminder) => reminder.id.split('|')[0])));
    };

    checkReminders();
    const id = setInterval(checkReminders, 60000);
    return () => clearInterval(id);
  }, []);

  const teacherLabel = (teacher?: Schedule['teacher']): string => {
    if (!teacher) return 'Teacher not assigned';
    const fullName = teacher.profile
      ? `${teacher.profile.firstName || ''} ${teacher.profile.lastName || ''}`.trim()
      : '';
    return fullName || teacher.name || 'Teacher not assigned';
  };

  const handleAddToCalendar = (schedule: Schedule) => {
    window.open(
      buildGoogleCalendarUrl(schedule, teacherLabel(schedule.teacher)),
      '_blank',
      'noopener,noreferrer',
    );
  };

  const handleSetReminder = async (schedule: Schedule) => {
    if (typeof Notification === 'undefined') return;
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const start = nextOccurrenceDate(schedule.dayOfWeek, schedule.startTime);
    const fireAt = start.getTime() - REMINDER_LEAD_MINUTES * 60000;
    if (fireAt <= Date.now()) return;

    const pending = getPendingReminders();
    const id = `${schedule._id}|${fireAt}`;
    if (pending.some((reminder) => reminder.id === id)) return;

    pending.push({ id, courseTitle: courseTitle(schedule), fireAt });
    savePendingReminders(pending);
    setRemindedIds((previous) => new Set(previous).add(schedule._id));
  };

  const handleJoinClass = (schedule: Schedule) => {
    if (schedule.course?._id) navigate(`/student/courses/${schedule.course._id}`);
  };

  const grouped: Record<number, Schedule[]> = {};
  schedules.forEach((schedule) => {
    (grouped[schedule.dayOfWeek] = grouped[schedule.dayOfWeek] || []).push(schedule);
  });
  Object.values(grouped).forEach((items) =>
    items.sort((a, b) => a.startTime.localeCompare(b.startTime)),
  );

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isLiveNow = (schedule: Schedule) =>
    schedule.dayOfWeek === todayDow &&
    nowMinutes >= toMinutes(schedule.startTime) &&
    nowMinutes <= toMinutes(schedule.endTime);

  const changeDay = (delta: number) => {
    const index = DISPLAY_ORDER.indexOf(selectedDay);
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= DISPLAY_ORDER.length) return;
    setSwipeDirection(delta);
    setSelectedDay(DISPLAY_ORDER[nextIndex]);
  };

  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    changeDay(delta < 0 ? 1 : -1);
  };

  const daySchedules = grouped[selectedDay] || [];
  const dayRows = withBreaks(daySchedules, periods);
  const selectedDate = weekDateForDay(now, selectedDay);

  return (
    <div className="px-4 pb-12 pt-20 sm:px-6 lg:px-10 lg:pt-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
              <CalendarDays className="h-6 w-6" strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                My Schedule
              </h1>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)] sm:text-base">
                Your weekly class timetable
              </p>
            </div>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] shadow-sm">
            <CalendarDays className="h-4 w-4 text-primary-500" />
            {formatSelectedDate(selectedDate)}
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-14">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
          </div>
        )}

        {!loading && schedules.length === 0 && !error && (
          <div className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-12 text-center shadow-sm">
            <CalendarDays className="mx-auto h-10 w-10 text-[var(--color-text-tertiary)]" />
            <p className="mt-4 text-lg font-bold text-[var(--color-text-primary)]">
              No classes scheduled yet
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
              Your schedule will appear here once your administrator sets up class times.
            </p>
          </div>
        )}

        {!loading && schedules.length > 0 && (
          <div className="space-y-5">
            <div
              className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none' }}
            >
              {DISPLAY_ORDER.map((day) => {
                const date = weekDateForDay(now, day);
                const isToday = day === todayDow;
                const isSelected = day === selectedDay;
                const count = grouped[day]?.length || 0;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setSwipeDirection(DISPLAY_ORDER.indexOf(day) > DISPLAY_ORDER.indexOf(selectedDay) ? 1 : -1);
                      setSelectedDay(day);
                    }}
                    className={`min-w-[88px] shrink-0 rounded-2xl border px-4 py-3 text-center transition-all duration-200 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/15'
                        : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)] hover:-translate-y-0.5 hover:border-primary-300'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-sm font-bold">{DAY_SHORT[day]}</span>
                      {count > 0 && (
                        <span className={`text-[10px] font-black ${isSelected ? 'text-white/85' : 'text-[var(--color-text-tertiary)]'}`}>
                          • {count}
                        </span>
                      )}
                    </div>
                    <p className={`mt-1 text-xs ${isSelected ? 'text-white/85' : 'text-[var(--color-text-tertiary)]'}`}>
                      {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                    {isToday && !isSelected && (
                      <span className="mx-auto mt-1.5 block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>

            <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedDay}
                  initial={{ opacity: 0, x: swipeDirection >= 0 ? 26 : -26 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: swipeDirection >= 0 ? -26 : 26 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  {dayRows.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-6 py-14 text-center">
                      <CalendarDays className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" />
                      <p className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">
                        No classes on {DAY_NAMES[selectedDay]}
                      </p>
                    </div>
                  )}

                  {dayRows.map((row, index) => {
                    if (row.kind === 'break') {
                      return (
                        <div key={`break-${index}`} className="grid grid-cols-[58px_1fr] gap-3 sm:grid-cols-[76px_1fr]">
                          <div className="flex flex-col items-center pt-2 text-[11px] font-semibold text-[var(--color-text-tertiary)] sm:text-xs">
                            {row.startTime && <span>{row.startTime}</span>}
                            <span className="my-1 h-4 w-px bg-amber-400/50" />
                            {row.endTime && <span>{row.endTime}</span>}
                          </div>
                          <div className="rounded-2xl border border-dashed border-amber-400/30 bg-amber-500/10 px-4 py-4 sm:px-5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                                  <Coffee className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-amber-700 dark:text-amber-300">Break</p>
                                  <p className="text-sm text-amber-700/75 dark:text-amber-300/75">
                                    {formatBreakLabel(row.minutes)}
                                  </p>
                                </div>
                              </div>
                              <span className="hidden rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 sm:inline-flex">
                                Break Time
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const schedule = row.schedule;
                    const title = courseTitle(schedule);
                    const color = courseAccentColor(schedule.course?._id || schedule._id);
                    const live = isLiveNow(schedule);
                    const hasReminder = remindedIds.has(schedule._id);
                    const isLiveCourse = !!schedule.course?.isLive;
                    const startMinutes = toMinutes(schedule.startTime);
                    const endMinutes = toMinutes(schedule.endTime);
                    const progress = live
                      ? Math.min(100, Math.max(0, ((nowMinutes - startMinutes) / Math.max(1, endMinutes - startMinutes)) * 100))
                      : 0;
                    const minutesLeft = live ? Math.max(0, endMinutes - nowMinutes) : 0;

                    return (
                      <div key={schedule._id} className="grid grid-cols-[58px_1fr] gap-3 sm:grid-cols-[76px_1fr]">
                        <div className="flex flex-col items-center pt-5 text-xs font-bold text-[var(--color-text-secondary)] sm:text-sm">
                          <span>{schedule.startTime}</span>
                          <div className="my-2 flex min-h-[64px] flex-1 flex-col items-center">
                            <span className={`h-3 w-3 rounded-full ring-4 ring-[var(--color-background-primary)] ${color.dot}`} />
                            <span className="mt-1.5 w-px flex-1 bg-[var(--color-border-default)]" />
                          </div>
                          <span>{schedule.endTime}</span>
                        </div>

                        <article
                          className={`overflow-hidden rounded-3xl border border-[var(--color-border-default)] border-l-4 ${color.border} bg-[var(--color-surface-primary)] shadow-sm transition-all duration-200 ${
                            live
                              ? 'ring-2 ring-red-400/70 shadow-[0_0_30px_-10px_rgba(239,68,68,0.65)]'
                              : 'hover:-translate-y-0.5 hover:shadow-lg'
                          }`}
                        >
                          <div className="p-4 sm:p-5">
                            <div className="flex items-start gap-3 sm:gap-4">
                              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-sm font-black sm:h-16 sm:w-16 sm:text-base ${color.avatar}`}>
                                {courseInitials(title)}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h2 className="truncate text-lg font-black text-[var(--color-text-primary)] sm:text-xl">
                                    {title}
                                  </h2>
                                  {live && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                                      Live now
                                    </span>
                                  )}
                                </div>

                                {schedule.course?.courseCode && (
                                  <p className="mt-1 text-xs font-semibold text-[var(--color-text-tertiary)]">
                                    {schedule.course.courseCode}
                                  </p>
                                )}

                                <p className="mt-2 flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
                                  <User className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                                  <span className="truncate">{teacherLabel(schedule.teacher)}</span>
                                </p>
                              </div>

                              {schedule.room && (
                                <span className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold sm:inline-flex ${color.badge}`}>
                                  <MapPin className="h-3.5 w-3.5" />
                                  {schedule.room}
                                </span>
                              )}
                            </div>

                            {schedule.room && (
                              <div className="mt-3 sm:hidden">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${color.badge}`}>
                                  <MapPin className="h-3.5 w-3.5" />
                                  {schedule.room}
                                </span>
                              </div>
                            )}

                            {live && (
                              <div className="mt-4">
                                <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-red-500">
                                  <span>In progress</span>
                                  <span>{minutesLeft} min left</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-red-500/15">
                                  <div
                                    className="h-full rounded-full bg-red-500 transition-all duration-500"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            <div className="mt-4 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleAddToCalendar(schedule)}
                                title="Add to Google Calendar"
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] transition-all hover:-translate-y-0.5 hover:text-primary-600 active:translate-y-0"
                              >
                                <CalendarPlus className="h-4.5 w-4.5" strokeWidth={1.75} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSetReminder(schedule)}
                                disabled={hasReminder}
                                title={hasReminder ? 'Reminder set' : `Remind me ${REMINDER_LEAD_MINUTES} min before`}
                                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all hover:-translate-y-0.5 active:translate-y-0 ${
                                  hasReminder
                                    ? 'border-primary-300 bg-primary-50 text-primary-600 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300'
                                    : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] hover:text-primary-600'
                                }`}
                              >
                                <Bell className="h-4.5 w-4.5" strokeWidth={1.75} fill={hasReminder ? 'currentColor' : 'none'} />
                              </button>

                              {isLiveCourse && (
                                <button
                                  type="button"
                                  onClick={() => handleJoinClass(schedule)}
                                  className="ml-auto inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-red-700"
                                >
                                  <Video className="h-4 w-4" />
                                  Join Class
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      </div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>

              <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--color-text-tertiary)] sm:hidden">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                Swipe left or right to switch days
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentSchedule;
