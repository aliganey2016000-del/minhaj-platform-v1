import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Printer, RefreshCw } from 'lucide-react';
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
const MAX_PERIODS = 6;

function courseName(course?: ScheduleItem['course']) {
  if (!course) return '—';
  if (typeof course.title === 'string') return course.title;
  return course.title?.en || '—';
}

function className(item?: ScheduleItem['class']) {
  if (!item) return 'Class';
  return `${item.title || 'Class'}${item.section ? ` ${item.section}` : ''}`.trim();
}

function schoolName(school?: ScheduleItem['school']) {
  if (!school) return '';
  return typeof school === 'string' ? school : school.name;
}

function timeToMinutes(value: string) {
  const [h, m] = String(value || '00:00').slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function formatTime(value: string) {
  const [h, m] = String(value || '').slice(0, 5).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value || '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function normalizeDay(value: unknown) {
  const n = Number(value);
  if (n >= 0 && n <= 6) return n;
  return 0;
}

export function SchedulesTimetable() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'org_admin';
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [schools, setSchools] = useState<{ _id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: '1', limit: '500' };
      if (schoolId) params.school = schoolId;
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
      } catch {
        // The schedules endpoint may already be scoped to the current organization.
      }
    })();
  }, [isOrgAdmin]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const daySchedules = useMemo(
    () => schedules
      .filter((item) => item.isActive && normalizeDay(item.dayOfWeek) === selectedDay)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
    [schedules, selectedDay],
  );

  const columns = useMemo(() => {
    const map = new Map<string, string>();
    daySchedules.forEach((item) => {
      const id = item.class?._id || className(item.class);
      if (!map.has(id)) map.set(id, className(item.class));
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [daySchedules]);

  const periods = useMemo(() => {
    const groups = new Map<string, { start: string; end: string }>();
    daySchedules.forEach((item) => {
      const key = `${item.startTime}-${item.endTime}`;
      if (!groups.has(key)) groups.set(key, { start: item.startTime, end: item.endTime });
    });
    return Array.from(groups.values())
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
      .slice(0, MAX_PERIODS);
  }, [daySchedules]);

  const rows = useMemo(() => {
    const first = periods.slice(0, 3);
    const second = periods.slice(3, 6);
    const result: Array<{ type: 'period' | 'break'; number?: number; start?: string; end?: string }> = [];
    first.forEach((period, index) => result.push({ type: 'period', number: index + 1, ...period }));
    if (second.length > 0) result.push({ type: 'break' });
    second.forEach((period, index) => result.push({ type: 'period', number: index + 4, ...period }));
    return result;
  }, [periods]);

  const getCell = (classId: string, periodStart?: string, periodEnd?: string) =>
    daySchedules.find((item) => {
      const itemClassId = item.class?._id || className(item.class);
      if (itemClassId !== classId || !periodStart || !periodEnd) return false;
      return item.startTime === periodStart && item.endTime === periodEnd;
    });

  const activeCount = daySchedules.length;
  const schoolTitle = schoolName(daySchedules[0]?.school) || schools.find((school) => school._id === schoolId)?.name || 'Class Timetable';

  const previousDay = () => setSelectedDay((day) => (day + 6) % 7);
  const nextDay = () => setSelectedDay((day) => (day + 1) % 7);

  return (
    <div className="min-h-full bg-[var(--color-surface-primary)] p-4 pt-20 sm:p-6 lg:pt-8">
      <div className="mx-auto w-full max-w-screen-2xl space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/30">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Class Timetable</h1>
              <p className="text-xs text-[var(--color-text-tertiary)]">{activeCount} active classes · {schoolTitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isOrgAdmin && (
              <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs text-[var(--color-text-primary)]">
                <option value="">All Organizations</option>
                {schools.map((school) => <option key={school._id} value={school._id}>{school.name}</option>)}
              </select>
            )}
            <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700">
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm print:hidden">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button type="button" onClick={previousDay} className="shrink-0 rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"><ChevronLeft className="h-4 w-4" /></button>
            {DAYS.map((day, index) => (
              <button key={day} type="button" onClick={() => setSelectedDay(index)} className={`min-w-[82px] flex-1 rounded-lg px-2 py-2 text-center ${selectedDay === index ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>
                <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-75">{DAY_SHORT[index]}</span>
                <span className="block text-xs font-bold">{day}</span>
              </button>
            ))}
            <button type="button" onClick={nextDay} className="shrink-0 rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}

        <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-white shadow-sm print:rounded-none print:border-black print:shadow-none dark:bg-[var(--color-surface-primary)]">
          <div className="border-b border-[var(--color-border-default)] px-4 py-4 text-center print:py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--color-text-tertiary)]">{schoolTitle}</div>
            <h2 className="mt-1 text-xl font-extrabold uppercase tracking-wide text-[var(--color-text-primary)] sm:text-2xl">{DAYS[selectedDay]} — Class Time Table</h2>
            <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{activeCount} scheduled sessions</div>
          </div>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-primary-600" /></div>
          ) : columns.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
              <CalendarDays className="h-10 w-10 text-[var(--color-text-tertiary)]" />
              <p className="mt-3 font-semibold text-[var(--color-text-primary)]">No classes scheduled for {DAYS[selectedDay]}</p>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Choose another day or change the organization.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse table-fixed">
                <thead>
                  <tr>
                    <th className="w-[82px] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-3 text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--color-text-primary)] sm:w-[96px]">Period</th>
                    {columns.map((column) => (
                      <th key={column.id} className="border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-3 text-center text-xs font-extrabold text-[var(--color-text-primary)] sm:text-sm">{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => {
                    if (row.type === 'break') {
                      return (
                        <tr key="break">
                          <td colSpan={columns.length + 1} className="border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-center text-[10px] font-extrabold uppercase tracking-[0.35em] text-[var(--color-text-tertiary)]">BREAK</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={`period-${row.number}`} className="min-h-[76px]">
                        <td className="border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-3 text-center align-middle">
                          <div className="text-base font-extrabold text-[var(--color-text-primary)]">{row.number}</div>
                          <div className="mt-1 text-[9px] font-medium leading-tight text-[var(--color-text-tertiary)]">{formatTime(row.start || '')}</div>
                          <div className="text-[9px] font-medium leading-tight text-[var(--color-text-tertiary)]">– {formatTime(row.end || '')}</div>
                        </td>
                        {columns.map((column) => {
                          const item = getCell(column.id, row.start, row.end);
                          return (
                            <td key={column.id} className="border border-[var(--color-border-default)] px-2 py-2 text-center align-middle">
                              {item ? (
                                <div className="mx-auto flex min-h-[56px] flex-col items-center justify-center rounded-md px-1 py-1">
                                  <div className="text-xs font-bold leading-tight text-[var(--color-text-primary)] sm:text-sm">{courseName(item.course)}</div>
                                  <div className="mt-1 text-[9px] leading-tight text-[var(--color-text-tertiary)] sm:text-[10px]">{item.teacher ? (typeof item.teacher === 'string' ? item.teacher : `${item.teacher.profile?.firstName || ''} ${item.teacher.profile?.lastName || ''}`.trim() || item.teacher.name || '') : ''}</div>
                                </div>
                              ) : (
                                <span className="text-xs text-[var(--color-text-tertiary)]">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 1} className="border border-[var(--color-border-default)] px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">No period times found for this day.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-[var(--color-border-default)] px-4 py-3 text-[9px] text-[var(--color-text-tertiary)] sm:flex-row sm:items-center sm:justify-between">
            <span>F = Secondary School · G = Middle School</span>
            <span>Subjects / Teachers are shown in each class box.</span>
          </div>
        </div>
      </div>

      <style>{`@media print { body { background: white !important; } .print\\:hidden { display: none !important; } }`}</style>
    </div>
  );
}

export default SchedulesTimetable;
