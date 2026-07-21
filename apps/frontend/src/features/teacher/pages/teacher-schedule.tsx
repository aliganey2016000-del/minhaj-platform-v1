/**
 * Teacher Schedule — Read-Only View
 *
 * Displays the teacher's own weekly teaching schedule fetched from
 * GET /class-schedules/my-teaching. Shows day, time, course, and class
 * for each scheduled session.
 */

import { useEffect, useState } from 'react';
import api from '../../../lib/axios';

interface Schedule {
  _id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  school?: { _id: string; name: string };
  class?: { _id: string; title: string; section: string };
  course?: { _id: string; title: { en: string } };
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TeacherSchedule() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/class-schedules/my-teaching');
        setSchedules(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load your schedule');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group schedules by day
  const grouped: Record<number, Schedule[]> = {};
  schedules.forEach((s) => {
    (grouped[s.dayOfWeek] = grouped[s.dayOfWeek] || []).push(s);
  });

  // Sort each day's schedules by start time
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => a.startTime.localeCompare(b.startTime)));

  const daysWithSchedules = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🕐 My Teaching Schedule</h1>
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
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Your teaching schedule will appear here once an administrator sets up class times.</p>
          </div>
        )}

        {!loading && daysWithSchedules.length > 0 && (
          <div className="space-y-4">
            {daysWithSchedules.map((day) => (
              <div key={day} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
                <div className="px-5 py-3 bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-subtle)]">
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{DAYS[day]}</h3>
                </div>
                <div className="divide-y divide-[var(--color-border-subtle)]">
                  {grouped[day].map((s) => (
                    <div key={s._id} className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <div className="flex-shrink-0 w-24 text-center">
                        <span className="inline-block rounded-lg bg-primary-50 dark:bg-primary-950/30 px-3 py-1.5 text-sm font-semibold text-primary-700 dark:text-primary-300">
                          {s.startTime} – {s.endTime}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                          {s.course?.title?.en || 'Untitled Course'}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                          🏫 {s.class ? `${s.class.title} ${s.class.section}` : '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherSchedule;
