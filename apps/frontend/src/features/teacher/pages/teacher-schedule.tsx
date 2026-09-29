/**
 * Teacher Schedule — Read-Only View
 *
 * Displays the teacher's own weekly teaching schedule fetched from
 * GET /class-schedules/my-teaching. Session numbering is resolved against the
 * school's configured timetable periods so a teacher's first lesson of the
 * day is not incorrectly labelled Period 1 when it is actually Period 3.
 */

import { useEffect, useMemo, useState } from 'react';
import api from '../../../lib/axios';

interface Schedule {
  _id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
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

function getShiftLabel(schedule: Schedule): 'Morning' | 'Afternoon' | 'Evening' | 'Virtual' {
  if (schedule.class?.shiftMode) return schedule.class.shiftMode;

  // Backward-compatible fallback for old schedule responses that pre-date
  // shiftMode population. New responses include the class-configured value.
  const hour = Number(schedule.startTime.slice(0, 2));
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function getShiftIcon(shift: string): string {
  if (shift === 'Morning') return '🌅';
  if (shift === 'Afternoon') return '☀️';
  if (shift === 'Evening') return '🌙';
  return '💻';
}

const sessionNames = ['1aad', '2aad', '3aad', '4aad', '5aad', '6aad', '7aad', '8aad', '9aad', '10aad'];
function getSessionName(index: number): string {
  return sessionNames[index] || `${index + 1}aad`;
}

export function TeacherSchedule() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDay());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/class-schedules/my-teaching');
        setSchedules(data.data || []);

        // Period settings are supplemental. A legacy organization without
        // saved settings should still get the schedule even if this request
        // is unavailable for any reason.
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

  // Group schedules by day and sort each day by start time.
  const grouped: Record<number, Schedule[]> = {};
  schedules.forEach((schedule) => {
    (grouped[schedule.dayOfWeek] = grouped[schedule.dayOfWeek] || []).push(schedule);
  });
  Object.values(grouped).forEach((items) => items.sort((a, b) => a.startTime.localeCompare(b.startTime)));

  const sessionLabel = (schedule: Schedule, fallbackIndex: number) => {
    const configuredIndex = lessonPeriods.findIndex(
      (period) => period.startTime === schedule.startTime && period.endTime === schedule.endTime,
    );
    return `Xisada ${getSessionName(configuredIndex >= 0 ? configuredIndex : fallbackIndex)}`;
  };

  return (
    <div className="p-4 pt-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">My Teaching Schedule</h1>
          <p className="mt-1 text-sm font-medium text-[var(--color-text-tertiary)]">My Schedule</p>

          <div className="mt-4 overflow-x-auto pb-1">
            <div className="grid min-w-[620px] grid-cols-7 gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2 shadow-sm">
              {DISPLAY_ORDER.map((day) => {
                const active = selectedDay === day;
                const today = new Date().getDay() === day;
                const shortName = DAYS[day].slice(0, 3);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={
                      'min-h-14 rounded-xl px-2 py-2 text-center text-xs font-bold transition ' +
                      (active
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]')
                    }
                  >
                    <span className="block">{shortName}</span>
                    {today && (
                      <span className={`mt-1 block text-[9px] font-bold uppercase tracking-wide ${active ? 'text-emerald-100' : 'text-emerald-600'}`}>
                        Today
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
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
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Your teaching schedule will appear here once an administrator sets up class times.</p>
          </div>
        )}

        {!loading && schedules.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-4 py-3 sm:px-5">
              <h3 className="text-sm font-black text-[var(--color-text-primary)]">{DAYS[selectedDay]}</h3>
              <span className="rounded-full bg-[var(--color-surface-primary)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-text-tertiary)]">
                {(grouped[selectedDay] || []).length} class{(grouped[selectedDay] || []).length === 1 ? '' : 'es'}
              </span>
            </div>

            {(grouped[selectedDay] || []).length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-bold text-[var(--color-text-primary)]">No classes on {DAYS[selectedDay]}.</p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Choose another day above to view your schedule.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {(grouped[selectedDay] || []).map((schedule, index) => {
                  const shift = getShiftLabel(schedule);
                  const configuredIndex = lessonPeriods.findIndex(
                    (period) => period.startTime === schedule.startTime && period.endTime === schedule.endTime,
                  );
                  return (
                    <div key={schedule._id} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-[var(--color-surface-secondary)] sm:gap-4 sm:px-5">
                      <div className="w-20 flex-shrink-0 text-center sm:w-24">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-sm font-extrabold text-white shadow-sm">
                          {configuredIndex >= 0 ? configuredIndex + 1 : index + 1}
                        </div>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                          {sessionLabel(schedule, index)}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-block rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                            {schedule.startTime} – {schedule.endTime}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                            {getShiftIcon(shift)} {shift}
                          </span>
                        </div>

                        <p className="mt-2 truncate text-sm font-semibold text-[var(--color-text-primary)]">
                          {schedule.course?.title?.en || 'Untitled Course'}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                          🏫 {schedule.class ? `${schedule.class.title} ${schedule.class.section || ''}`.trim() : '—'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherSchedule;
