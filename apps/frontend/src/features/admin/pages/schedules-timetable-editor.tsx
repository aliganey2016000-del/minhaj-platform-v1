import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, RefreshCw, RotateCcw, Save, Send } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

type RefValue = string | { _id?: string } | null | undefined;

type ClassItem = {
  _id: string;
  title?: string;
  name?: string;
  section?: string;
  gradeLevel?: number;
  room?: string;
  department?: { _id?: string; name?: string } | string | null;
  departmentId?: string;
  shiftMode?: string;
  shift?: string;
};

type Department = { _id: string; name: string };

type Course = {
  _id: string;
  courseCode?: string;
  title?: string | { en?: string; so?: string; ar?: string; [key: string]: unknown };
  class?: RefValue;
  teacher?: RefValue;
  status?: string;
};

type Period = {
  key?: string;
  label?: string;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
};

type DraftEntry = {
  _id?: string;
  sourceSchedule?: string | null;
  class: string;
  course: string;
  teacher?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  isActive: boolean;
};

type Conflict = {
  id: string;
  type: string;
  severity: 'error' | 'warning';
  message: string;
  entryIds?: string[];
  suggestions?: string[];
};

type Draft = { _id: string; name?: string; entries?: DraftEntry[]; status?: string };

type BootstrapPayload = {
  config?: { periods?: Period[]; workingDays?: number[] };
  draft?: Draft | null;
  schedules?: DraftEntry[];
  conflicts?: Conflict[];
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DISPLAY_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;
const ALL_DEPARTMENTS = '__all__';
const UNASSIGNED_DEPARTMENT = '__unassigned_department__';
const ALL_SHIFTS = '__all_shifts__';
const UNASSIGNED_SHIFT = '__unassigned_shift__';

function idOf(value: RefValue) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value._id ? String(value._id) : '';
}

function classLabel(item?: ClassItem) {
  if (!item) return 'Class';
  return `${item.title || item.name || 'Class'}${item.section ? ` ${item.section}` : ''}`.trim();
}

function courseLabel(course?: Course) {
  if (!course) return 'Course';
  if (typeof course.title === 'string') return course.title;
  if (course.title?.en) return course.title.en;
  if (course.title) {
    const first = Object.values(course.title).find((value) => typeof value === 'string' && value.trim());
    if (typeof first === 'string') return first;
  }
  return course.courseCode || 'Course';
}

function departmentId(item: ClassItem) {
  if (item.departmentId) return String(item.departmentId);
  if (typeof item.department === 'string') return item.department;
  return item.department?._id ? String(item.department._id) : UNASSIGNED_DEPARTMENT;
}

function shiftValue(item: ClassItem) {
  const value = String(item.shiftMode || item.shift || '').trim();
  return value ? value.toLowerCase() : UNASSIGNED_SHIFT;
}

function titleCase(value: string) {
  if (value === UNASSIGNED_SHIFT) return 'Unassigned Shift';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function timeToMinutes(value: string) {
  const [hour, minute] = String(value || '00:00').slice(0, 5).split(':').map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function formatTime(value: string) {
  const [hour, minute] = String(value || '').slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function normalizeEntry(entry: any): DraftEntry | null {
  const classId = idOf(entry?.class);
  const courseId = idOf(entry?.course);
  if (!classId || !courseId) return null;
  return {
    _id: entry?._id ? String(entry._id) : undefined,
    sourceSchedule: entry?.sourceSchedule ? String(entry.sourceSchedule) : null,
    class: classId,
    course: courseId,
    teacher: idOf(entry?.teacher) || null,
    dayOfWeek: Number(entry?.dayOfWeek),
    startTime: String(entry?.startTime || '').slice(0, 5),
    endTime: String(entry?.endTime || '').slice(0, 5),
    room: String(entry?.room || ''),
    isActive: entry?.isActive !== false,
  };
}

export function SchedulesTimetableEditor() {
  const { user } = useAuth();
  const organizationId = String(user?.organizationId || (user as any)?.schoolId || '');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [draftId, setDraftId] = useState('');
  const [selectedDay, setSelectedDay] = useState(6);
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS);
  const [shiftFilter, setShiftFilter] = useState(ALL_SHIFTS);
  const [hiddenClassIds, setHiddenClassIds] = useState<Set<string>>(() => new Set());
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [changedCells, setChangedCells] = useState<Set<string>>(() => new Set());
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyCell, setBusyCell] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadWorkspace = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError('');
    try {
      const classPromise = (async () => {
        const all: ClassItem[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 25) {
          const response = await api.get('/classes', { params: { schoolId: organizationId, status: 'active', page, limit: 200 } });
          const batch: ClassItem[] = response.data?.data || [];
          all.push(...batch);
          const pagination = response.data?.pagination || response.data?.meta || {};
          const total = Number(pagination.total || 0);
          const totalPages = Number(pagination.totalPages || pagination.pages || 0);
          hasMore = totalPages > 0 ? page < totalPages : total > 0 ? all.length < total : batch.length === 200;
          page += 1;
        }
        return Array.from(new Map(all.map((item) => [item._id, item])).values()).sort((a, b) => {
          const gradeA = Number(a.gradeLevel ?? Number.MAX_SAFE_INTEGER);
          const gradeB = Number(b.gradeLevel ?? Number.MAX_SAFE_INTEGER);
          if (gradeA !== gradeB) return gradeA - gradeB;
          return classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true, sensitivity: 'base' });
        });
      })();

      const [classList, departmentResponse, courseResponse, bootstrapResponse] = await Promise.all([
        classPromise,
        api.get('/departments', { params: { school: organizationId, limit: 200 } }),
        api.get('/courses/admin', { params: { school: organizationId, limit: 500 } }),
        api.get('/class-schedules/school/studio/bootstrap', { params: { school: organizationId } }),
      ]);

      const bootstrap: BootstrapPayload = bootstrapResponse.data?.data || bootstrapResponse.data || {};
      const sourceEntries = bootstrap.draft?.entries || bootstrap.schedules || [];
      setClasses(classList);
      setDepartments(departmentResponse.data?.data || []);
      setCourses(courseResponse.data?.data || []);
      setPeriods((bootstrap.config?.periods || []).slice().sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)));
      setEntries(sourceEntries.map(normalizeEntry).filter((entry): entry is DraftEntry => Boolean(entry)));
      setDraftId(bootstrap.draft?._id ? String(bootstrap.draft._id) : '');
      setConflicts(bootstrap.conflicts || []);
      setDirty(false);
      setChangedCells(new Set());
      setNotice(bootstrap.draft ? 'Existing working draft loaded.' : 'Published timetable loaded. Cell changes will stay in a draft until you publish.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load timetable editor.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  useEffect(() => {
    setDepartmentFilter(ALL_DEPARTMENTS);
    setShiftFilter(ALL_SHIFTS);
    setHiddenClassIds(new Set());
    setClassPickerOpen(false);
  }, [organizationId]);

  const departmentOptions = useMemo(() => {
    const names = new Map(departments.map((item) => [item._id, item.name]));
    const options = new Map<string, string>();
    classes.forEach((item) => {
      const id = departmentId(item);
      const embedded = typeof item.department === 'object' && item.department ? item.department.name : '';
      options.set(id, id === UNASSIGNED_DEPARTMENT ? 'Unassigned Department' : embedded || names.get(id) || 'Department');
    });
    return Array.from(options.entries()).map(([_id, name]) => ({ _id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, departments]);

  const departmentClasses = useMemo(
    () => classes.filter((item) => departmentFilter === ALL_DEPARTMENTS || departmentId(item) === departmentFilter),
    [classes, departmentFilter],
  );

  const shiftOptions = useMemo(() => {
    const values = new Set(departmentClasses.map((item) => shiftValue(item)));
    return Array.from(values).map((value) => ({ value, label: titleCase(value) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [departmentClasses]);

  const filteredClasses = useMemo(
    () => departmentClasses.filter((item) => shiftFilter === ALL_SHIFTS || shiftValue(item) === shiftFilter),
    [departmentClasses, shiftFilter],
  );

  const visibleClasses = useMemo(
    () => filteredClasses.filter((item) => !hiddenClassIds.has(item._id)),
    [filteredClasses, hiddenClassIds],
  );

  const coursesByClass = useMemo(() => {
    const map = new Map<string, Course[]>();
    courses.forEach((course) => {
      if (course.status !== 'published') return;
      const classId = idOf(course.class);
      if (!classId) return;
      const list = map.get(classId) || [];
      list.push(course);
      map.set(classId, list);
    });
    map.forEach((list) => list.sort((a, b) => courseLabel(a).localeCompare(courseLabel(b), undefined, { numeric: true, sensitivity: 'base' })));
    return map;
  }, [courses]);

  const courseMap = useMemo(() => new Map(courses.map((course) => [course._id, course])), [courses]);
  const classMap = useMemo(() => new Map(classes.map((item) => [item._id, item])), [classes]);

  const hardConflicts = conflicts.filter((item) => item.severity === 'error');
  const warnings = conflicts.filter((item) => item.severity === 'warning');

  const cellKey = (classId: string, period: Period) => `${selectedDay}:${classId}:${period.startTime}:${period.endTime}`;

  const cellEntry = (classId: string, period: Period) => entries.find((entry) =>
    entry.isActive
    && entry.class === classId
    && entry.dayOfWeek === selectedDay
    && entry.startTime === period.startTime
    && entry.endTime === period.endTime,
  );

  const checkConflicts = async (candidate: DraftEntry[]) => {
    const response = await api.post('/class-schedules/school/studio/conflicts', { school: organizationId, entries: candidate });
    const payload = response.data?.data || response.data || {};
    const nextConflicts: Conflict[] = payload.conflicts || [];
    setConflicts(nextConflicts);
    return nextConflicts;
  };

  const changeCellCourse = async (classId: string, period: Period, courseId: string) => {
    const key = cellKey(classId, period);
    setBusyCell(key);
    setError('');
    setNotice('');
    try {
      const existing = cellEntry(classId, period);
      const candidate = entries.filter((entry) => !(
        entry.isActive
        && entry.class === classId
        && entry.dayOfWeek === selectedDay
        && entry.startTime === period.startTime
        && entry.endTime === period.endTime
      ));

      if (courseId) {
        const course = courseMap.get(courseId);
        if (!course || idOf(course.class) !== classId) {
          setError('This course is not assigned to the selected class.');
          return;
        }
        if (course.status !== 'published') {
          setError('Only published courses can be assigned to the timetable.');
          return;
        }
        const cls = classMap.get(classId);
        candidate.push({
          _id: existing?._id,
          sourceSchedule: existing?.sourceSchedule || null,
          class: classId,
          course: courseId,
          teacher: idOf(course.teacher) || null,
          dayOfWeek: selectedDay,
          startTime: period.startTime,
          endTime: period.endTime,
          room: cls?.room || existing?.room || '',
          isActive: true,
        });
      }

      const result = await checkConflicts(candidate);
      const blockers = result.filter((item) => item.severity === 'error');
      if (blockers.length > 0) {
        setError(`Change blocked: ${blockers[0].message}`);
        return;
      }

      setEntries(candidate);
      setDirty(true);
      setChangedCells((previous) => new Set(previous).add(key));
      setNotice(courseId ? 'Cell updated in the working copy. Save Draft when ready.' : 'Cell cleared in the working copy. Save Draft when ready.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to validate this timetable change.');
    } finally {
      setBusyCell('');
    }
  };

  const persistDraft = async () => {
    const payload = { school: organizationId, name: 'Timetable Grid Draft', entries };
    if (draftId) {
      const response = await api.put(`/class-schedules/school/studio/drafts/${draftId}`, payload);
      const saved: Draft = response.data?.data || response.data;
      setDraftId(String(saved._id || draftId));
      setEntries((saved.entries || entries).map(normalizeEntry).filter((entry): entry is DraftEntry => Boolean(entry)));
      return String(saved._id || draftId);
    }
    const response = await api.post('/class-schedules/school/studio/drafts', payload);
    const created: Draft = response.data?.data || response.data;
    setDraftId(String(created._id));
    setEntries((created.entries || entries).map(normalizeEntry).filter((entry): entry is DraftEntry => Boolean(entry)));
    return String(created._id);
  };

  const saveDraft = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await persistDraft();
      setDirty(false);
      setChangedCells(new Set());
      setNotice('Draft saved. The published timetable has not changed yet.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to save timetable draft.');
    } finally {
      setBusy(false);
    }
  };

  const validateDraft = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await checkConflicts(entries);
      const errors = result.filter((item) => item.severity === 'error').length;
      const warningCount = result.filter((item) => item.severity === 'warning').length;
      setNotice(errors === 0 ? `Validation passed${warningCount ? ` with ${warningCount} warning(s)` : ''}.` : `Validation found ${errors} hard conflict(s).`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to validate timetable draft.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await checkConflicts(entries);
      const blockers = result.filter((item) => item.severity === 'error');
      if (blockers.length > 0) {
        setError(`Publish blocked: resolve ${blockers.length} hard conflict(s) first.`);
        return;
      }
      const id = await persistDraft();
      await api.post(`/class-schedules/school/studio/drafts/${id}/publish`, { school: organizationId });
      await loadWorkspace();
      setNotice('Timetable published successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to publish timetable.');
    } finally {
      setBusy(false);
    }
  };

  const resetWorkingCopy = async () => {
    if (dirty && !window.confirm('Discard unsaved cell changes and reload the current draft/published timetable?')) return;
    await loadWorkspace();
  };

  const resetFilters = () => {
    setDepartmentFilter(ALL_DEPARTMENTS);
    setShiftFilter(ALL_SHIFTS);
    setHiddenClassIds(new Set());
    setClassPickerOpen(false);
  };

  const toggleClass = (classId: string) => {
    setHiddenClassIds((previous) => {
      const next = new Set(previous);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  if (!organizationId) {
    return <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">Select a school organization before editing its timetable.</div>;
  }

  return (
    <div className="min-h-full bg-[var(--color-surface-primary)] p-4 pt-16 sm:p-6 lg:pt-6">
      <div className="mx-auto w-full max-w-screen-2xl space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><CalendarDays className="h-5 w-5" /></div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Edit Timetable</h1>
                <p className="text-xs text-[var(--color-text-tertiary)]">Choose a course inside any class × period cell. Changes stay as a draft until Publish.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void resetWorkingCopy()} disabled={busy || loading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Cancel Changes</button>
            <button type="button" onClick={() => void validateDraft()} disabled={busy || loading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Validate</button>
            <button type="button" onClick={() => void saveDraft()} disabled={busy || loading || !dirty} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Save Draft</button>
            <button type="button" onClick={() => void publish()} disabled={busy || loading || hardConflicts.length > 0} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Send className="h-3.5 w-3.5" /> Publish Timetable</button>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm">
          <div className="flex items-center gap-1 overflow-x-auto">
            {DISPLAY_ORDER.map((dayIndex) => (
              <button key={dayIndex} type="button" onClick={() => setSelectedDay(dayIndex)} className={`min-w-[82px] flex-1 rounded-lg px-2 py-2 text-center ${selectedDay === dayIndex ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>
                <span className="block text-[10px] font-semibold uppercase opacity-75">{DAY_SHORT[dayIndex]}</span>
                <span className="block text-xs font-bold">{DAYS[dayIndex]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-20 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="min-w-[190px] flex-1 text-xs font-semibold text-[var(--color-text-secondary)]">
              <span className="mb-1 block">Department</span>
              <select value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setShiftFilter(ALL_SHIFTS); }} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs text-[var(--color-text-primary)]">
                <option value={ALL_DEPARTMENTS}>All Departments</option>
                {departmentOptions.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </label>

            <label className="min-w-[170px] flex-1 text-xs font-semibold text-[var(--color-text-secondary)]">
              <span className="mb-1 block">Shift</span>
              <select value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs text-[var(--color-text-primary)]">
                <option value={ALL_SHIFTS}>All Shifts</option>
                {shiftOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            <div className="relative min-w-[220px] flex-1">
              <span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Class Columns</span>
              <button type="button" onClick={() => setClassPickerOpen((open) => !open)} className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border-default)] px-3 py-2.5 text-xs font-semibold text-[var(--color-text-primary)]">
                <span>{visibleClasses.length} of {filteredClasses.length} shown</span><ChevronDown className={`h-4 w-4 ${classPickerOpen ? 'rotate-180' : ''}`} />
              </button>
              {classPickerOpen && (
                <div className="absolute left-0 top-full z-40 mt-2 w-[min(330px,calc(100vw-2rem))] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2 shadow-xl">
                  <div className="max-h-64 overflow-y-auto">
                    {filteredClasses.map((item) => (
                      <label key={item._id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-[var(--color-surface-secondary)]">
                        <input type="checkbox" checked={!hiddenClassIds.has(item._id)} onChange={() => toggleClass(item._id)} className="h-4 w-4 accent-emerald-600" />
                        <span className="font-medium text-[var(--color-text-primary)]">{classLabel(item)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button type="button" onClick={resetFilters} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2.5 text-xs font-semibold text-[var(--color-text-secondary)]"><RefreshCw className="h-3.5 w-3.5" /> Reset Filters</button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
        {(hardConflicts.length > 0 || warnings.length > 0) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-bold">Conflict report: {hardConflicts.length} hard · {warnings.length} warning</div>
            {conflicts.slice(0, 4).map((item) => <div key={item.id} className="mt-1">• {item.message}</div>)}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-white shadow-sm dark:bg-[var(--color-surface-primary)]">
          <div className="border-b border-[var(--color-border-default)] px-4 py-3 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Working Draft</div>
            <h2 className="mt-1 text-xl font-extrabold uppercase text-[var(--color-text-primary)]">{DAYS[selectedDay]} — Editable Timetable</h2>
            <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{dirty ? 'Unsaved cell changes' : draftId ? 'Draft saved' : 'Published timetable copy'} · {visibleClasses.length} class columns</div>
          </div>

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-emerald-600" /></div>
          ) : visibleClasses.length === 0 ? (
            <div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">No class columns match the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] table-fixed border-collapse">
                <thead>
                  <tr>
                    <th className="w-[110px] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-3 text-[10px] font-extrabold uppercase">Period</th>
                    {visibleClasses.map((item) => <th key={item._id} className="min-w-[150px] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-3 text-xs font-extrabold text-[var(--color-text-primary)]">{classLabel(item)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period, index) => {
                    if (period.isBreak) {
                      return <tr key={period.key || `${period.startTime}-${index}`} className="bg-amber-50"><td className="border border-[var(--color-border-default)] px-2 py-3 text-center"><div className="font-extrabold text-amber-700">BREAK</div><div className="text-[9px] text-[var(--color-text-tertiary)]">{formatTime(period.startTime)}–{formatTime(period.endTime)}</div></td><td colSpan={visibleClasses.length} className="border border-[var(--color-border-default)] text-center text-sm font-bold tracking-[0.18em] text-amber-700">BREAK</td></tr>;
                    }
                    return (
                      <tr key={period.key || `${period.startTime}-${index}`}>
                        <td className="border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-3 text-center">
                          <div className="text-sm font-extrabold text-[var(--color-text-primary)]">{period.label || `Period ${index + 1}`}</div>
                          <div className="mt-1 text-[9px] text-[var(--color-text-tertiary)]">{formatTime(period.startTime)}–{formatTime(period.endTime)}</div>
                        </td>
                        {visibleClasses.map((cls) => {
                          const entry = cellEntry(cls._id, period);
                          const key = cellKey(cls._id, period);
                          const classCourses = coursesByClass.get(cls._id) || [];
                          const currentCourse = entry ? courseMap.get(entry.course) : undefined;
                          const changed = changedCells.has(key);
                          return (
                            <td key={cls._id} className={`border border-[var(--color-border-default)] p-2 align-middle ${changed ? 'bg-emerald-50/80' : ''}`}>
                              <select
                                value={entry?.course || ''}
                                disabled={busy || busyCell === key}
                                onChange={(event) => void changeCellCourse(cls._id, period, event.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs font-semibold text-[var(--color-text-primary)] disabled:opacity-50"
                                aria-label={`${classLabel(cls)} ${period.label || period.startTime} course`}
                              >
                                <option value="">— Empty —</option>
                                {currentCourse && !classCourses.some((course) => course._id === currentCourse._id) && <option value={currentCourse._id}>{courseLabel(currentCourse)} (current)</option>}
                                {classCourses.map((course) => <option key={course._id} value={course._id}>{courseLabel(course)}{course.courseCode ? ` · ${course.courseCode}` : ''}</option>)}
                              </select>
                              {classCourses.length === 0 && <div className="mt-1 text-center text-[9px] text-amber-600">No courses assigned to this class</div>}
                              {entry?.teacher ? <div className="mt-1 text-center text-[9px] text-[var(--color-text-tertiary)]">Teacher auto-assigned from course</div> : entry ? <div className="mt-1 text-center text-[9px] text-amber-600">Teacher: Unassigned</div> : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {periods.length === 0 && <tr><td colSpan={visibleClasses.length + 1} className="border border-[var(--color-border-default)] px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">No timetable periods configured. Configure periods first in Timetable Settings.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SchedulesTimetableEditor;
