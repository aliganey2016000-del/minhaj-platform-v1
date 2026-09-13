import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Columns3, Printer, RefreshCw, RotateCcw } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface ScheduleItem {
  _id: string;
  school?: { _id: string; name: string } | string;
  class?: { _id: string; title?: string; section?: string };
  course?: { _id: string; title?: { en?: string; [key: string]: unknown } | string } | string;
  teacher?: unknown;
  dayOfWeek: number | string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface Department {
  _id: string;
  name: string;
}

interface ClassItem {
  _id: string;
  title?: string;
  name?: string;
  section?: string;
  gradeLevel?: number;
  department?: { _id?: string; name?: string } | string | null;
  departmentId?: string;
  shiftMode?: string;
  shift?: string;
}

interface TimetablePeriod {
  key?: string;
  label?: string;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
}

interface PaginatedResponse {
  data?: ScheduleItem[];
  pagination?: { page?: number; limit?: number; total?: number; totalPages?: number };
}

// dayOfWeek keeps the JavaScript convention (0 = Sunday ... 6 = Saturday).
// The timetable tabs intentionally display the school week starting on Saturday.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DISPLAY_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;
const ALL_DEPARTMENTS = '__all__';
const UNASSIGNED_DEPARTMENT = '__unassigned__';
const ALL_SHIFTS = '__all_shifts__';
const UNASSIGNED_SHIFT = '__unassigned_shift__';

function courseName(course?: ScheduleItem['course']) {
  if (!course) return '—';
  if (typeof course === 'string') return course;
  if (typeof course.title === 'string') return course.title;
  if (course.title?.en) return course.title.en;
  const firstTitle = course.title && Object.values(course.title).find((value) => typeof value === 'string' && value.trim());
  return typeof firstTitle === 'string' ? firstTitle : '—';
}

function className(item?: ScheduleItem['class'] | ClassItem) {
  if (!item) return 'Class';
  const title = 'title' in item ? item.title : undefined;
  const name = 'name' in item ? item.name : undefined;
  return `${title || name || 'Class'}${item.section ? ` ${item.section}` : ''}`.trim();
}

function classDepartmentId(item: ClassItem) {
  if (item.departmentId) return String(item.departmentId);
  if (typeof item.department === 'string') return item.department;
  return item.department?._id ? String(item.department._id) : UNASSIGNED_DEPARTMENT;
}

function classShiftValue(item: ClassItem) {
  const raw = String(item.shiftMode || item.shift || '').trim();
  return raw ? raw.toLowerCase() : UNASSIGNED_SHIFT;
}

function shiftLabel(value: string) {
  if (value === UNASSIGNED_SHIFT) return 'Unassigned Shift';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function schoolName(school?: ScheduleItem['school']) {
  if (!school) return '';
  return typeof school === 'string' ? school : school.name;
}

function timeToMinutes(value: string) {
  const [h, m] = String(value || '00:00').slice(0, 5).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function formatTime(value: string) {
  const raw = String(value || '').slice(0, 5);
  const [h, m] = raw.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return raw;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function normalizeDay(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : -1;
}

export function SchedulesTimetable() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'org_admin';
  const organizationId = String((user as any)?.organizationId || (user as any)?.schoolId || '');
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [configuredPeriods, setConfiguredPeriods] = useState<TimetablePeriod[]>([]);
  const [schools, setSchools] = useState<{ _id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState(isOrgAdmin ? organizationId : '');
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS);
  const [shiftFilter, setShiftFilter] = useState(ALL_SHIFTS);
  const [hiddenClassIds, setHiddenClassIds] = useState<Set<string>>(() => new Set());
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const effectiveSchoolId = schoolId || (isOrgAdmin ? organizationId : '');

  const loadAllSchedules = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const limit = 100;
      const firstParams: Record<string, string> = { page: '1', limit: String(limit) };
      if (effectiveSchoolId) firstParams.school = effectiveSchoolId;

      const first = await api.get<PaginatedResponse>('/class-schedules', { params: firstParams });
      const firstData = first.data?.data || [];
      const pagination = first.data?.pagination;
      const total = Number(pagination?.total || firstData.length);
      const totalPages = Math.max(1, Number(pagination?.totalPages || Math.ceil(total / limit)));

      const remaining = totalPages > 1
        ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => {
            const params: Record<string, string> = { page: String(index + 2), limit: String(limit) };
            if (effectiveSchoolId) params.school = effectiveSchoolId;
            return api.get<PaginatedResponse>('/class-schedules', { params });
          }))
        : [];

      const all = [firstData, ...remaining.map((response) => response.data?.data || [])].flat();
      setSchedules(Array.from(new Map(all.map((item) => [item._id, item])).values()));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load class schedules.');
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveSchoolId]);

  const loadGridMeta = useCallback(async () => {
    if (!effectiveSchoolId) {
      setClasses([]);
      setDepartments([]);
      setConfiguredPeriods([]);
      return;
    }

    try {
      const allClasses: ClassItem[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 25) {
        const response = await api.get('/classes', { params: { schoolId: effectiveSchoolId, status: 'active', page, limit: 200 } });
        const batch: ClassItem[] = response.data?.data || [];
        allClasses.push(...batch);
        const pagination = response.data?.pagination || response.data?.meta || {};
        const total = Number(pagination.total || 0);
        const totalPages = Number(pagination.totalPages || pagination.pages || 0);
        hasMore = totalPages > 0 ? page < totalPages : total > 0 ? allClasses.length < total : batch.length === 200;
        page += 1;
      }
      const uniqueClasses = Array.from(new Map(allClasses.map((item) => [item._id, item])).values());
      uniqueClasses.sort((a, b) => {
        const gradeA = Number(a.gradeLevel ?? Number.MAX_SAFE_INTEGER);
        const gradeB = Number(b.gradeLevel ?? Number.MAX_SAFE_INTEGER);
        if (gradeA !== gradeB) return gradeA - gradeB;
        return className(a).localeCompare(className(b), undefined, { numeric: true, sensitivity: 'base' });
      });
      setClasses(uniqueClasses);
    } catch {
      setClasses([]);
    }

    try {
      const response = await api.get('/departments', { params: { school: effectiveSchoolId, limit: 200 } });
      const list: Department[] = response.data?.data || [];
      setDepartments(Array.from(new Map(list.map((department) => [department._id, department])).values()));
    } catch {
      setDepartments([]);
    }

    try {
      const response = await api.get('/class-schedules/school/studio/bootstrap', { params: { school: effectiveSchoolId } });
      const payload = response.data?.data || response.data || {};
      setConfiguredPeriods(Array.isArray(payload.config?.periods) ? payload.config.periods : []);
    } catch {
      setConfiguredPeriods([]);
    }
  }, [effectiveSchoolId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/schools');
        if (cancelled) return;
        const list = data?.data || [];
        setSchools(list);
        if (isOrgAdmin) {
          const preferred = organizationId || list[0]?._id || '';
          if (preferred) setSchoolId(preferred);
        }
      } catch {
        // Schedule endpoints may already be scoped to the current organization.
      }
    })();
    return () => { cancelled = true; };
  }, [isOrgAdmin, organizationId]);

  useEffect(() => {
    setDepartmentFilter(ALL_DEPARTMENTS);
    setShiftFilter(ALL_SHIFTS);
    setHiddenClassIds(new Set());
    setClassPickerOpen(false);
  }, [effectiveSchoolId]);

  useEffect(() => {
    void loadAllSchedules();
    void loadGridMeta();
  }, [loadAllSchedules, loadGridMeta]);

  const daySchedules = useMemo(
    () => schedules
      .filter((item) => item.isActive && normalizeDay(item.dayOfWeek) === selectedDay)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
    [schedules, selectedDay],
  );

  const departmentOptions = useMemo(() => {
    if (classes.length === 0) return [] as Department[];
    const names = new Map(departments.map((department) => [department._id, department.name]));
    const options = new Map<string, string>();
    classes.forEach((item) => {
      const id = classDepartmentId(item);
      if (id === UNASSIGNED_DEPARTMENT) {
        options.set(id, 'Unassigned Department');
        return;
      }
      const embeddedName = typeof item.department === 'object' && item.department ? item.department.name : undefined;
      options.set(id, embeddedName || names.get(id) || 'Department');
    });
    return Array.from(options.entries())
      .map(([_id, name]) => ({ _id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [classes, departments]);

  const departmentClasses = useMemo(
    () => classes.filter((item) => departmentFilter === ALL_DEPARTMENTS || classDepartmentId(item) === departmentFilter),
    [classes, departmentFilter],
  );

  const shiftOptions = useMemo(() => {
    const values = new Set(departmentClasses.map((item) => classShiftValue(item)));
    return Array.from(values)
      .map((value) => ({ value, label: shiftLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  }, [departmentClasses]);

  const filteredClasses = useMemo(
    () => departmentClasses.filter((item) => shiftFilter === ALL_SHIFTS || classShiftValue(item) === shiftFilter),
    [departmentClasses, shiftFilter],
  );

  const allColumns = useMemo(() => {
    if (classes.length > 0) {
      return classes.map((item) => ({
        id: item._id,
        label: className(item),
        departmentId: classDepartmentId(item),
        shift: classShiftValue(item),
      }));
    }
    const map = new Map<string, string>();
    schedules.filter((item) => item.isActive).forEach((item) => {
      const id = item.class?._id || className(item.class);
      if (!map.has(id)) map.set(id, className(item.class));
    });
    return Array.from(map.entries()).map(([id, label]) => ({
      id,
      label,
      departmentId: UNASSIGNED_DEPARTMENT,
      shift: UNASSIGNED_SHIFT,
    }));
  }, [classes, schedules]);

  const columns = useMemo(
    () => allColumns.filter((column) => {
      const matchesDepartment = departmentFilter === ALL_DEPARTMENTS || column.departmentId === departmentFilter;
      const matchesShift = shiftFilter === ALL_SHIFTS || column.shift === shiftFilter;
      return matchesDepartment && matchesShift && !hiddenClassIds.has(column.id);
    }),
    [allColumns, departmentFilter, shiftFilter, hiddenClassIds],
  );

  const periods = useMemo(() => {
    let lessonNumber = 0;
    if (configuredPeriods.length > 0) {
      return configuredPeriods
        .slice()
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        .map((period, index) => ({
          ...period,
          key: period.key || `${period.startTime}-${period.endTime}-${index}`,
          lessonNumber: period.isBreak ? null : ++lessonNumber,
        }));
    }

    const groups = new Map<string, TimetablePeriod>();
    daySchedules.forEach((item) => {
      const startTime = String(item.startTime || '').slice(0, 5);
      const endTime = String(item.endTime || '').slice(0, 5);
      if (!startTime || !endTime) return;
      const key = `${startTime}-${endTime}`;
      if (!groups.has(key)) groups.set(key, { key, label: '', startTime, endTime, isBreak: false });
    });
    return Array.from(groups.values())
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      .map((period) => ({ ...period, lessonNumber: ++lessonNumber }));
  }, [configuredPeriods, daySchedules]);

  const getCellCourses = (classId: string, start: string, end: string) => {
    const matches = daySchedules.filter((item) => {
      const itemClassId = item.class?._id || className(item.class);
      return itemClassId === classId
        && String(item.startTime || '').slice(0, 5) === start
        && String(item.endTime || '').slice(0, 5) === end;
    });
    const names = matches.map((item) => courseName(item.course)).filter((name) => name && name !== '—');
    return Array.from(new Set(names));
  };

  const visibleColumnIds = useMemo(() => new Set(columns.map((column) => column.id)), [columns]);
  const activeCount = daySchedules.filter((item) => {
    const classId = item.class?._id || className(item.class);
    return visibleColumnIds.has(classId);
  }).length;
  const visibleClassCount = columns.length;
  const filterClassCount = filteredClasses.length || (classes.length === 0 ? allColumns.length : 0);
  const selectedFilterClassCount = classes.length > 0
    ? filteredClasses.filter((item) => !hiddenClassIds.has(item._id)).length
    : allColumns.filter((item) => !hiddenClassIds.has(item.id)).length;

  const schoolTitle = schoolName(daySchedules[0]?.school)
    || schools.find((school) => school._id === effectiveSchoolId)?.name
    || (effectiveSchoolId ? 'Class Timetable' : 'All Organizations');

  const moveSelectedDay = (offset: number) => setSelectedDay((day) => {
    const currentIndex = DISPLAY_ORDER.indexOf(day as (typeof DISPLAY_ORDER)[number]);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return DISPLAY_ORDER[(safeIndex + offset + DISPLAY_ORDER.length) % DISPLAY_ORDER.length];
  });
  const previousDay = () => moveSelectedDay(-1);
  const nextDay = () => moveSelectedDay(1);
  const refreshAll = () => {
    void loadAllSchedules();
    void loadGridMeta();
  };

  const toggleClassColumn = (classId: string) => {
    setHiddenClassIds((previous) => {
      const next = new Set(previous);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  const selectAllFilteredClasses = () => {
    const ids = classes.length > 0 ? filteredClasses.map((item) => item._id) : allColumns.map((item) => item.id);
    setHiddenClassIds((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const hideAllFilteredClasses = () => {
    const ids = classes.length > 0 ? filteredClasses.map((item) => item._id) : allColumns.map((item) => item.id);
    setHiddenClassIds((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const resetColumnFilters = () => {
    setDepartmentFilter(ALL_DEPARTMENTS);
    setShiftFilter(ALL_SHIFTS);
    setHiddenClassIds(new Set());
    setClassPickerOpen(false);
  };

  const classPickerItems = classes.length > 0
    ? filteredClasses.map((item) => ({ id: item._id, label: className(item) }))
    : allColumns.map((item) => ({ id: item.id, label: item.label }));

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
              <p className="text-xs text-[var(--color-text-tertiary)]">{activeCount} visible sessions · {visibleClassCount} class columns · {schoolTitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isOrgAdmin && (
              <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs text-[var(--color-text-primary)]">
                <option value="">All Organizations</option>
                {schools.map((school) => <option key={school._id} value={school._id}>{school.name}</option>)}
              </select>
            )}
            <button type="button" onClick={refreshAll} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700">
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm print:hidden">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button type="button" onClick={previousDay} className="shrink-0 rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]" aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></button>
            {DISPLAY_ORDER.map((dayIndex) => {
              const day = DAYS[dayIndex];
              return (
                <button key={day} type="button" onClick={() => setSelectedDay(dayIndex)} className={`min-w-[82px] flex-1 rounded-lg px-2 py-2 text-center ${selectedDay === dayIndex ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-75">{DAY_SHORT[dayIndex]}</span>
                  <span className="block text-xs font-bold">{day}</span>
                </button>
              );
            })}
            <button type="button" onClick={nextDay} className="shrink-0 rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]" aria-label="Next day"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="relative z-20 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm print:hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="min-w-[200px] text-xs font-semibold text-[var(--color-text-secondary)]">
                <span className="mb-1.5 block">Department</span>
                <select
                  value={departmentFilter}
                  onChange={(event) => {
                    setDepartmentFilter(event.target.value);
                    setShiftFilter(ALL_SHIFTS);
                    setClassPickerOpen(false);
                  }}
                  className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-medium text-[var(--color-text-primary)]"
                >
                  <option value={ALL_DEPARTMENTS}>All Departments</option>
                  {departmentOptions.map((department) => (
                    <option key={department._id} value={department._id}>{department.name}</option>
                  ))}
                </select>
              </label>

              <label className="min-w-[170px] text-xs font-semibold text-[var(--color-text-secondary)]">
                <span className="mb-1.5 block">Shift</span>
                <select
                  value={shiftFilter}
                  onChange={(event) => {
                    setShiftFilter(event.target.value);
                    setClassPickerOpen(false);
                  }}
                  className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-medium text-[var(--color-text-primary)]"
                >
                  <option value={ALL_SHIFTS}>All Shifts</option>
                  {shiftOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <div className="relative min-w-[230px]">
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Class Columns</span>
                <button
                  type="button"
                  onClick={() => setClassPickerOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]"
                >
                  <span className="inline-flex items-center gap-2"><Columns3 className="h-4 w-4 text-primary-600" /> {selectedFilterClassCount} of {filterClassCount} shown</span>
                  <ChevronDown className={`h-4 w-4 transition ${classPickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {classPickerOpen && (
                  <div className="absolute left-0 top-full z-40 mt-2 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-xl">
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-default)] px-3 py-2.5">
                      <div>
                        <div className="text-xs font-bold text-[var(--color-text-primary)]">Choose class columns</div>
                        <div className="text-[10px] text-[var(--color-text-tertiary)]">Unchecked classes are hidden from the grid and print view.</div>
                      </div>
                    </div>
                    <div className="flex gap-2 border-b border-[var(--color-border-default)] px-3 py-2">
                      <button type="button" onClick={selectAllFilteredClasses} className="rounded-md bg-primary-50 px-2.5 py-1.5 text-[10px] font-bold text-primary-700 hover:bg-primary-100 dark:bg-primary-950/30 dark:text-primary-300">Select All</button>
                      <button type="button" onClick={hideAllFilteredClasses} className="rounded-md border border-[var(--color-border-default)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]">Clear All</button>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-2">
                      {classPickerItems.length === 0 ? (
                        <div className="px-2 py-6 text-center text-xs text-[var(--color-text-tertiary)]">No classes match this department and shift.</div>
                      ) : classPickerItems.map((item) => (
                        <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]">
                          <input
                            type="checkbox"
                            checked={!hiddenClassIds.has(item.id)}
                            onChange={() => toggleClassColumn(item.id)}
                            className="h-4 w-4 rounded border-[var(--color-border-default)] accent-emerald-600"
                          />
                          <span className="font-medium">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {(departmentFilter !== ALL_DEPARTMENTS || shiftFilter !== ALL_SHIFTS || hiddenClassIds.size > 0) && (
              <button type="button" onClick={resetColumnFilters} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]">
                <RotateCcw className="h-3.5 w-3.5" /> Reset Filters
              </button>
            )}
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}

        <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-white shadow-sm print:rounded-none print:border-black print:shadow-none dark:bg-[var(--color-surface-primary)]">
          <div className="border-b border-[var(--color-border-default)] px-4 py-4 text-center print:py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--color-text-tertiary)]">{schoolTitle}</div>
            <h2 className="mt-1 text-xl font-extrabold uppercase tracking-wide text-[var(--color-text-primary)] sm:text-2xl">{DAYS[selectedDay]} — Class Time Table</h2>
            <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{activeCount} visible sessions · {visibleClassCount} class columns</div>
          </div>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-primary-600" /></div>
          ) : allColumns.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
              <CalendarDays className="h-10 w-10 text-[var(--color-text-tertiary)]" />
              <p className="mt-3 font-semibold text-[var(--color-text-primary)]">No active classes found</p>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Create or activate classes before building the timetable.</p>
            </div>
          ) : columns.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
              <Columns3 className="h-10 w-10 text-[var(--color-text-tertiary)]" />
              <p className="mt-3 font-semibold text-[var(--color-text-primary)]">No class columns selected</p>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Choose a department, shift, or enable one or more classes from Class Columns.</p>
              <button type="button" onClick={resetColumnFilters} className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 print:hidden">Show All Classes</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse table-fixed">
                <thead>
                  <tr>
                    <th className="w-[105px] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-3 text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--color-text-primary)]">Period</th>
                    {columns.map((column) => (
                      <th key={column.id} className="min-w-[130px] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-3 text-center text-xs font-extrabold text-[var(--color-text-primary)] sm:text-sm">{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => {
                    if (period.isBreak) {
                      return (
                        <tr key={period.key} className="bg-amber-50/70 dark:bg-amber-950/10">
                          <td className="border border-[var(--color-border-default)] px-2 py-3 text-center align-middle">
                            <div className="text-sm font-extrabold uppercase text-amber-700 dark:text-amber-300">Break</div>
                            <div className="mt-1 text-[9px] font-medium text-[var(--color-text-tertiary)]">{formatTime(period.startTime)} – {formatTime(period.endTime)}</div>
                          </td>
                          <td colSpan={columns.length} className="border border-[var(--color-border-default)] px-3 py-4 text-center text-sm font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">{period.label || 'Break'}</td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={period.key} className="min-h-[76px]">
                        <td className="border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-3 text-center align-middle">
                          <div className="text-sm font-extrabold text-[var(--color-text-primary)]">{period.label || `Period ${period.lessonNumber}`}</div>
                          <div className="mt-1 text-[9px] font-medium leading-tight text-[var(--color-text-tertiary)]">{formatTime(period.startTime)}</div>
                          <div className="text-[9px] font-medium leading-tight text-[var(--color-text-tertiary)]">– {formatTime(period.endTime)}</div>
                        </td>
                        {columns.map((column) => {
                          const courses = getCellCourses(column.id, period.startTime, period.endTime);
                          return (
                            <td key={column.id} className="border border-[var(--color-border-default)] px-2 py-2 text-center align-middle">
                              {courses.length > 0 ? (
                                <div className="mx-auto flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-lg bg-primary-50/70 px-2 py-2 dark:bg-primary-950/20">
                                  {courses.map((course, courseIndex) => (
                                    <div key={`${course}-${courseIndex}`} className="text-xs font-bold leading-tight text-[var(--color-text-primary)] sm:text-sm">{course}</div>
                                  ))}
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
                  {periods.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 1} className="border border-[var(--color-border-default)] px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">No timetable periods configured. Open Timetable Settings to add periods and breaks.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-[var(--color-border-default)] px-4 py-3 text-[9px] text-[var(--color-text-tertiary)] sm:flex-row sm:items-center sm:justify-between">
            <span>Rows follow Timetable Settings periods and breaks.</span>
            <span>Department, shift, and class filters control visible columns and print output.</span>
          </div>
        </div>
      </div>

      <style>{`@media print { .print\\:hidden { display: none !important; } body { background: white !important; } @page { size: landscape; margin: 10mm; } }`}</style>
    </div>
  );
}

export default SchedulesTimetable;
