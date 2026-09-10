import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Printer, RefreshCw, Search } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface ScheduleItem {
  _id: string;
  school?: { _id: string; name: string } | string;
  class?: { _id: string; title?: string; section?: string };
  course?: { _id: string; title?: { en?: string } | string };
  teacher?: { _id: string; profile?: { firstName?: string; lastName?: string }; name?: string } | string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const START_HOUR = 7;
const END_HOUR = 20;
const SLOT_MINUTES = 30;

function textTitle(course?: ScheduleItem['course']) {
  if (!course) return 'Untitled course';
  if (typeof course.title === 'string') return course.title;
  return course.title?.en || 'Untitled course';
}

function teacherName(teacher?: ScheduleItem['teacher']) {
  if (!teacher) return 'Teacher not assigned';
  if (typeof teacher === 'string') return teacher;
  const name = `${teacher.profile?.firstName || ''} ${teacher.profile?.lastName || ''}`.trim();
  return name || teacher.name || 'Teacher not assigned';
}

function schoolName(school?: ScheduleItem['school']) {
  if (!school) return '';
  return typeof school === 'string' ? school : school.name;
}

function minutes(time: string) {
  const [h, m] = String(time || '00:00').slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function labelTime(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 || 12;
  return `${display}:${String(m).padStart(2, '0')} ${suffix}`;
}

function overlapStyle(startTime: string, endTime: string) {
  const start = Math.max(minutes(startTime), START_HOUR * 60);
  const end = Math.min(minutes(endTime), END_HOUR * 60);
  const top = ((start - START_HOUR * 60) / SLOT_MINUTES) * 100;
  const height = Math.max(((end - start) / SLOT_MINUTES) * 100, 48);
  return { top: `${top / 2}px`, height: `${height / 2}px` };
}

export function SchedulesTimetable() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'org_admin';
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [schools, setSchools] = useState<{ _id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: '1', limit: '500' };
      if (schoolId) params.school = schoolId;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get('/class-schedules', { params });
      setSchedules(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load class schedules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/schools');
        const list = data.data || [];
        setSchools(list);
        if (isOrgAdmin && list[0]?._id) setSchoolId(list[0]._id);
      } catch { /* schedules can still load for an already-scoped org */ }
    })();
  }, [isOrgAdmin]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const visible = useMemo(() => schedules.filter((s) => s.isActive && s.dayOfWeek === selectedDay), [schedules, selectedDay]);
  const totalActive = useMemo(() => schedules.filter((s) => s.isActive).length, [schedules]);

  const classes = useMemo(() => Array.from(new Set(visible.map((s) => `${s.class?.title || 'Class'} ${s.class?.section || ''}`.trim()))), [visible]);

  const previousDay = () => setSelectedDay((d) => (d + 6) % 7);
  const nextDay = () => setSelectedDay((d) => (d + 1) % 7);

  return (
    <div className="min-h-full p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto w-full max-w-screen-2xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/30">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Class Timetable</h1>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Visual weekly view of active classes, courses and teachers.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          {!isOrgAdmin && (
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)]">
              <option value="">All Organizations</option>
              {schools.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          )}
          <div className={`${isOrgAdmin ? 'lg:col-span-2' : ''} relative`}>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Search course, teacher or class..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-10 pr-4 text-sm" />
          </div>
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)]">
            <strong className="text-[var(--color-text-primary)]">{totalActive}</strong> active sessions
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2 shadow-card">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button onClick={previousDay} className="hidden shrink-0 rounded-xl p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] md:block"><ChevronLeft className="h-5 w-5" /></button>
            {DAYS.map((day, index) => (
              <button key={day} onClick={() => setSelectedDay(index)} className={`min-w-[92px] flex-1 rounded-xl px-3 py-3 text-center transition ${selectedDay === index ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>
                <div className="text-xs font-medium opacity-80">{DAY_SHORT[index]}</div>
                <div className="mt-0.5 text-sm font-bold">{day}</div>
              </button>
            ))}
            <button onClick={nextDay} className="hidden shrink-0 rounded-xl p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] md:block"><ChevronRight className="h-5 w-5" /></button>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}

        <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card print:shadow-none">
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
            <div>
              <h2 className="font-bold text-[var(--color-text-primary)]">{DAYS[selectedDay]} Schedule</h2>
              <p className="text-xs text-[var(--color-text-tertiary)]">{visible.length} session{visible.length === 1 ? '' : 's'} · {classes.length} class{classes.length === 1 ? '' : 'es'}</p>
            </div>
            <div className="hidden items-center gap-2 text-xs text-[var(--color-text-tertiary)] sm:flex"><Clock3 className="h-4 w-4" /> {labelTime(START_HOUR * 60)} – {labelTime(END_HOUR * 60)}</div>
          </div>

          {loading ? (
            <div className="flex min-h-[520px] items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-primary-600" /></div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-surface-secondary)]"><CalendarDays className="h-8 w-8 text-[var(--color-text-tertiary)]" /></div>
              <h3 className="font-semibold text-[var(--color-text-primary)]">No classes scheduled</h3>
              <p className="mt-1 max-w-md text-sm text-[var(--color-text-tertiary)]">There are no active class sessions for {DAYS[selectedDay]}. Try another day or adjust the organization/search filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[92px_1fr] border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]">
                  <div className="border-r border-[var(--color-border-subtle)] px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Time</div>
                  <div className="px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary)]">{DAYS[selectedDay]} · {visible.length} classes</div>
                </div>
                <div className="grid grid-cols-[92px_1fr]">
                  <div className="relative border-r border-[var(--color-border-subtle)]">
                    {Array.from({ length: ((END_HOUR - START_HOUR) * 60) / 60 + 1 }, (_, i) => {
                      const t = (START_HOUR + i) * 60;
                      return <div key={t} className="h-[60px] border-b border-[var(--color-border-subtle)] px-2 pt-1 text-[10px] font-medium text-[var(--color-text-tertiary)]">{labelTime(t)}</div>;
                    })}
                  </div>
                  <div className="relative min-h-[780px] bg-[var(--color-surface-primary)]">
                    {Array.from({ length: (END_HOUR - START_HOUR) * 2 }, (_, i) => <div key={i} className="h-[30px] border-b border-dashed border-[var(--color-border-subtle)]" />)}
                    {visible.map((s) => {
                      const style = overlapStyle(s.startTime, s.endTime);
                      return (
                        <div key={s._id} className="absolute left-3 right-3 overflow-hidden rounded-xl border border-primary-200 bg-primary-50 p-3 shadow-sm dark:border-primary-800 dark:bg-primary-950/30" style={style}>
                          <div className="flex h-full min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-primary-800 dark:text-primary-200">{textTitle(s.course)}</div>
                              <div className="mt-1 truncate text-xs font-medium text-[var(--color-text-secondary)]">{s.class?.title || 'Class'} {s.class?.section || ''}</div>
                              <div className="mt-1 truncate text-[10px] text-[var(--color-text-tertiary)]">{teacherName(s.teacher)}{schoolName(s.school) ? ` · ${schoolName(s.school)}` : ''}</div>
                            </div>
                            <div className="shrink-0 rounded-lg bg-[var(--color-surface-primary)]/70 px-2 py-1 text-[10px] font-semibold text-[var(--color-text-secondary)]">{s.startTime}–{s.endTime}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SchedulesTimetable;
