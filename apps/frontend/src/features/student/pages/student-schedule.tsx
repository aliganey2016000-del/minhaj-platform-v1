/**
 * Student Schedule — Read-Only View
 *
 * Displays the student's weekly class schedule fetched from
 * GET /class-schedules/my. Day-tab navigation (swipeable on touch devices),
 * color-coded course cards, a live "happening right now" indicator, break
 * dividers, and per-class quick actions (add to Google Calendar, local
 * reminder, join a currently-live class).
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, User, Clock, Coffee, CalendarPlus, Bell, Video } from 'lucide-react';
import api from '../../../lib/axios';

interface Schedule {
  _id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  course?: { _id: string; title: { en: string }; isLive?: boolean };
  teacher?: { _id: string; name?: string; profile?: { firstName: string; lastName: string } };
}

// dayOfWeek is stored/compared as JS Date.getDay() (0 = Sunday .. 6 = Saturday).
// DAY_NAMES stays indexed by that number; DISPLAY_ORDER just controls what
// order the day tabs render in — the school week starts Saturday here.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DISPLAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

/** "09:30" -> 570 (minutes since midnight), for comparing two HH:MM times. */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 30 -> "30-min Break"; 60 -> "1-hour Break"; 90 -> "1h 30m Break". */
function formatBreakLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}-min Break`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours}-hour Break`;
  return `${hours}h ${rest}m Break`;
}

type DayRow = { kind: 'class'; schedule: Schedule } | { kind: 'break'; minutes: number };

/** Interleaves a break placeholder between two consecutive classes whenever the gap between them is 30+ minutes. */
function withBreaks(daySchedules: Schedule[]): DayRow[] {
  const rows: DayRow[] = [];
  daySchedules.forEach((s, i) => {
    rows.push({ kind: 'class', schedule: s });
    const next = daySchedules[i + 1];
    if (next) {
      const gap = toMinutes(next.startTime) - toMinutes(s.endTime);
      if (gap >= 30) rows.push({ kind: 'break', minutes: gap });
    }
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Per-course color-coding — a stable hash of the course id into a fixed,
// curated palette, so the same subject always renders the same color across
// reloads without needing any backend "category color" field.
// ---------------------------------------------------------------------------
const COURSE_PALETTE = [
  { border: 'border-l-blue-500', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  { border: 'border-l-purple-500', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  { border: 'border-l-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  { border: 'border-l-amber-500', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  { border: 'border-l-rose-500', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
  { border: 'border-l-cyan-500', text: 'text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500' },
  { border: 'border-l-indigo-500', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
  { border: 'border-l-fuchsia-500', text: 'text-fuchsia-700 dark:text-fuchsia-300', dot: 'bg-fuchsia-500' },
];
function courseAccentColor(courseId: string) {
  let hash = 0;
  for (let i = 0; i < courseId.length; i++) hash = (hash * 31 + courseId.charCodeAt(i)) >>> 0;
  return COURSE_PALETTE[hash % COURSE_PALETTE.length];
}

// ---------------------------------------------------------------------------
// "Add to Google Calendar" — pure client-side, no backend involved. Computes
// the NEXT real calendar date this weekly slot falls on and opens Google
// Calendar's own "create event" URL (as a weekly-recurring event) in a new tab.
// ---------------------------------------------------------------------------
function nextOccurrenceDate(dayOfWeek: number, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const result = new Date(now);
  result.setHours(h, m, 0, 0);
  let diff = (dayOfWeek - now.getDay() + 7) % 7;
  if (diff === 0 && result.getTime() < now.getTime()) diff = 7; // today's slot already passed -> next week
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
    text: schedule.course?.title?.en || 'Class',
    dates: `${formatGCalDateTime(start)}/${formatGCalDateTime(end)}`,
    details: `Teacher: ${teacherName}`,
    recur: 'RRULE:FREQ=WEEKLY',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Local reminders — Notification API + localStorage, no backend. Only fires
// while this page (or another tab of this app) is open at the right moment;
// a real "even if the app is closed" reminder would need a backend-scheduled
// push job against the existing /push infrastructure (out of scope here).
// ---------------------------------------------------------------------------
const REMINDERS_KEY = 'sahal_schedule_reminders';
const REMINDER_LEAD_MINUTES = 10;

interface PendingReminder { id: string; courseTitle: string; fireAt: number; }

function getPendingReminders(): PendingReminder[] {
  try { return JSON.parse(localStorage.getItem(REMINDERS_KEY) || '[]'); } catch { return []; }
}
function savePendingReminders(list: PendingReminder[]): void {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(list));
}

export function StudentSchedule() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
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
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load your schedule');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Tick the clock every 30s so the "LIVE NOW" badge stays accurate.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // Check due local reminders every 60s (plus once immediately on mount, in
  // case one came due while this page was closed) and fire a notification.
  useEffect(() => {
    const checkReminders = () => {
      const pending = getPendingReminders();
      if (pending.length === 0) return;
      const nowMs = Date.now();
      const due = pending.filter((r) => r.fireAt <= nowMs);
      const remaining = pending.filter((r) => r.fireAt > nowMs);
      if (due.length > 0) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          due.forEach((r) => {
            new Notification(`⏰ ${r.courseTitle} starts soon`, {
              body: `Starting in about ${REMINDER_LEAD_MINUTES} minutes.`,
              icon: '/icons/pwa-192x192.png',
            });
          });
        }
        savePendingReminders(remaining);
      }
      setRemindedIds(new Set(remaining.map((r) => r.id.split('|')[0])));
    };
    checkReminders();
    const id = setInterval(checkReminders, 60000);
    return () => clearInterval(id);
  }, []);

  const teacherLabel = (t?: Schedule['teacher']): string => {
    if (!t) return '—';
    const fullName = t.profile ? `${t.profile.firstName || ''} ${t.profile.lastName || ''}`.trim() : '';
    return fullName || t.name || '—';
  };

  const handleAddToCalendar = (schedule: Schedule) => {
    window.open(buildGoogleCalendarUrl(schedule, teacherLabel(schedule.teacher)), '_blank', 'noopener,noreferrer');
  };

  const handleSetReminder = async (schedule: Schedule) => {
    if (typeof Notification === 'undefined') return;
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const start = nextOccurrenceDate(schedule.dayOfWeek, schedule.startTime);
    const fireAt = start.getTime() - REMINDER_LEAD_MINUTES * 60000;
    if (fireAt <= Date.now()) return; // too close to / past start to usefully remind

    const pending = getPendingReminders();
    const id = `${schedule._id}|${fireAt}`;
    if (pending.some((r) => r.id === id)) return; // already set for this occurrence
    pending.push({ id, courseTitle: schedule.course?.title?.en || 'Class', fireAt });
    savePendingReminders(pending);
    setRemindedIds((prev) => new Set(prev).add(schedule._id));
  };

  const handleJoinClass = (schedule: Schedule) => {
    if (schedule.course?._id) navigate(`/student/courses/${schedule.course._id}`);
  };

  // Group + sort each day's schedules by start time.
  const grouped: Record<number, Schedule[]> = {};
  schedules.forEach((s) => {
    (grouped[s.dayOfWeek] = grouped[s.dayOfWeek] || []).push(s);
  });
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => a.startTime.localeCompare(b.startTime)));

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isLiveNow = (s: Schedule) => s.dayOfWeek === todayDow && nowMinutes >= toMinutes(s.startTime) && nowMinutes <= toMinutes(s.endTime);

  const changeDay = (delta: number) => {
    const idx = DISPLAY_ORDER.indexOf(selectedDay);
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= DISPLAY_ORDER.length) return;
    setSwipeDirection(delta);
    setSelectedDay(DISPLAY_ORDER[nextIdx]);
  };

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    changeDay(delta < 0 ? 1 : -1); // swipe left -> next day, swipe right -> previous day
  };

  const daySchedules = grouped[selectedDay] || [];
  const dayRows = withBreaks(daySchedules);

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-5xl w-full px-0 sm:px-4 space-y-6">
        <div>
          <h1 className="flex items-center gap-2.5 text-3xl font-bold text-[var(--color-text-primary)]">
            <CalendarDays className="h-8 w-8 text-primary-600" strokeWidth={1.75} />
            My Schedule
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Your weekly class timetable</p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          </div>
        )}

        {!loading && schedules.length === 0 && !error && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-12 text-center shadow-card">
            <p className="text-lg text-[var(--color-text-tertiary)]">No classes scheduled yet.</p>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Your schedule will appear here once your administrator sets up class times.</p>
          </div>
        )}

        {!loading && schedules.length > 0 && (
          <div className="space-y-4">
            {/* ── Day Tabs ── */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {DISPLAY_ORDER.map((day) => {
                const isToday = day === todayDow;
                const isSelected = day === selectedDay;
                const count = grouped[day]?.length || 0;
                return (
                  <button
                    key={day}
                    onClick={() => { setSwipeDirection(day > selectedDay ? 1 : -1); setSelectedDay(day); }}
                    className={`relative flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
                    }`}
                  >
                    <span className="hidden sm:inline">{DAY_NAMES[day]}</span>
                    <span className="sm:hidden">{DAY_SHORT[day]}</span>
                    {isToday && (
                      <span className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-primary-500'}`} />
                    )}
                    {count > 0 && (
                      <span className={`ml-1.5 text-[10px] ${isSelected ? 'text-white/70' : 'text-[var(--color-text-tertiary)]'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Selected Day Panel (swipeable on touch) ── */}
            <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedDay}
                  initial={{ opacity: 0, x: swipeDirection >= 0 ? 24 : -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: swipeDirection >= 0 ? -24 : 24 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  {dayRows.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center">
                      <p className="text-sm text-[var(--color-text-tertiary)]">No classes on {DAY_NAMES[selectedDay]}.</p>
                    </div>
                  )}

                  {dayRows.map((row, i) =>
                    row.kind === 'break' ? (
                      <div key={`break-${i}`} className="flex items-center gap-3 rounded-xl border border-dashed border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10 px-4 py-2.5">
                        <Coffee className="h-4 w-4 text-amber-500 flex-shrink-0" strokeWidth={1.75} />
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">☕ Break — {formatBreakLabel(row.minutes)}</p>
                      </div>
                    ) : (() => {
                      const s = row.schedule;
                      const color = courseAccentColor(s.course?._id || s._id);
                      const live = isLiveNow(s);
                      const isLiveCourse = !!s.course?.isLive;
                      const hasReminder = remindedIds.has(s._id);
                      return (
                        <div
                          key={s._id}
                          className={`rounded-2xl border-l-4 ${color.border} border-y border-r border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden transition-all ${
                            live ? 'ring-2 ring-red-400/70 dark:ring-red-500/50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-4 px-5 py-4">
                            <div className="flex-shrink-0 w-24 text-center">
                              <span className="inline-block rounded-lg bg-slate-100 dark:bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                                {s.startTime} – {s.endTime}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${color.dot}`} />
                                <p className="text-base font-bold text-[var(--color-text-primary)] truncate">
                                  {s.course?.title?.en || 'Untitled Course'}
                                </p>
                                {live && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white animate-pulse">
                                    <span className="h-1.5 w-1.5 rounded-full bg-white" /> Live Now
                                  </span>
                                )}
                              </div>
                              <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] mt-0.5">
                                <User className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} />
                                {teacherLabel(s.teacher)}
                              </p>
                            </div>
                          </div>

                          {/* Quick actions */}
                          <div className="flex items-center gap-2 px-5 pb-3.5 pt-0.5">
                            <button
                              onClick={() => handleAddToCalendar(s)}
                              title="Add to Google Calendar"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                              <span className="hidden sm:inline">Add to Calendar</span>
                            </button>
                            <button
                              onClick={() => handleSetReminder(s)}
                              disabled={hasReminder}
                              title={hasReminder ? 'Reminder set' : `Remind me ${REMINDER_LEAD_MINUTES} min before (while this app is open)`}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                hasReminder
                                  ? 'border-primary-300 bg-primary-50 dark:bg-primary-950/30 text-primary-600 dark:text-primary-400'
                                  : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
                              }`}
                            >
                              <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
                              <span className="hidden sm:inline">{hasReminder ? 'Reminder Set' : 'Remind Me'}</span>
                            </button>
                            {isLiveCourse && (
                              <button
                                onClick={() => handleJoinClass(s)}
                                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors animate-pulse"
                              >
                                <Video className="h-3.5 w-3.5" strokeWidth={1.75} />
                                Join Class
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  )}
                </motion.div>
              </AnimatePresence>
              {/* Mobile swipe hint */}
              <p className="sm:hidden text-center text-[11px] text-[var(--color-text-tertiary)] pt-2 flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" strokeWidth={1.75} /> Swipe left or right to switch days
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentSchedule;
