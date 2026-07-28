/**
 * Student Schedule — Read-Only View
 *
 * Displays the student's weekly class schedule fetched from
 * GET /class-schedules/my. Shows day, time, course name, and
 * teacher for each scheduled class.
 */

import { useEffect, useState } from 'react';
import { CalendarDays, User, Clock } from 'lucide-react';
import api from '../../../lib/axios';

interface Schedule {
  _id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  course?: { _id: string; title: { en: string } };
  teacher?: { _id: string; name?: string; profile?: { firstName: string; lastName: string } };
}

// dayOfWeek is stored/compared as JS Date.getDay() (0 = Sunday .. 6 = Saturday).
// DAY_NAMES stays indexed by that number; DISPLAY_ORDER just controls what
// order the day cards render in — the school week starts Saturday here.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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

/** Interleaves a "Free Slot" placeholder between two consecutive classes whenever the gap between them is 30+ minutes. */
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

export function StudentSchedule() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const teacherLabel = (t?: any): string => {
    if (!t) return '—';
    const fullName = t.profile ? `${t.profile.firstName || ''} ${t.profile.lastName || ''}`.trim() : '';
    return fullName || t.name || '—';
  };

  // Group schedules by day
  const grouped: Record<number, Schedule[]> = {};
  schedules.forEach((s) => {
    (grouped[s.dayOfWeek] = grouped[s.dayOfWeek] || []).push(s);
  });

  // Sort each day's schedules by start time
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => a.startTime.localeCompare(b.startTime)));

  const todayDow = new Date().getDay();

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
            {DISPLAY_ORDER.map((day) => {
              const dayName = DAY_NAMES[day];
              const isToday = day === todayDow;
              return (
              <div
                key={day}
                className={`rounded-2xl border overflow-hidden shadow-card ${
                  isToday
                    ? 'border-blue-400 bg-blue-50/40 dark:bg-blue-950/20'
                    : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'
                }`}
              >
                <div className={`flex items-center gap-2 px-5 py-3 border-b ${isToday ? 'border-blue-200 dark:border-blue-900/50' : 'bg-[var(--color-surface-secondary)] border-[var(--color-border-subtle)]'}`}>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{dayName}</h3>
                  {isToday && (
                    <span className="inline-flex items-center rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Today
                    </span>
                  )}
                </div>
                {grouped[day] ? (
                  <div className="divide-y divide-[var(--color-border-subtle)]">
                    {withBreaks(grouped[day]).map((row, i) =>
                      row.kind === 'break' ? (
                        <div key={`break-${i}`} className="flex items-center gap-4 px-5 py-2.5 bg-slate-50/50 dark:bg-slate-900/20 border-y border-dashed border-slate-200 dark:border-slate-800">
                          <div className="flex-shrink-0 w-24 text-center">
                            <span className="inline-flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-400">
                              <Clock className="h-3 w-3" strokeWidth={1.75} />
                              {formatBreakLabel(row.minutes)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 italic">Free Slot</p>
                        </div>
                      ) : (
                        <div key={row.schedule._id} className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--color-surface-secondary)] transition-colors">
                          <div className="flex-shrink-0 w-24 text-center">
                            <span className="inline-block rounded-lg bg-slate-100 dark:bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                              {row.schedule.startTime} – {row.schedule.endTime}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-bold text-[var(--color-text-primary)] truncate">
                              {row.schedule.course?.title?.en || 'Untitled Course'}
                            </p>
                            <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] mt-0.5">
                              <User className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} />
                              {teacherLabel(row.schedule.teacher)}
                            </p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <p className="px-5 py-4 text-xs text-[var(--color-text-tertiary)]">No classes scheduled.</p>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentSchedule;