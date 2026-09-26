import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, List, MoreVertical, Pencil, Printer, RefreshCw, RotateCcw, Save, School, Settings, Upload, Users, X } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface TeacherItem {
  _id: string;
  teacherId?: string;
  profile?: { firstName?: string; lastName?: string } | null;
  user?: { email?: string } | string | null;
}

interface ScheduleItem {
  _id: string;
  school?: { _id: string; name: string } | string;
  class?: { _id: string; title?: string; section?: string } | string;
  course?: { _id: string; title?: { en?: string; [key: string]: unknown } | string } | string;
  teacher?: TeacherItem | string | null;
  room?: string;
  dayOfWeek: number | string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface Department { _id: string; name: string }

interface ClassItem {
  _id: string;
  title?: string;
  name?: string;
  section?: string;
  gradeLevel?: number;
  academicYear?: string;
  department?: { _id?: string; name?: string } | string | null;
  departmentId?: string;
  shiftMode?: string;
  shift?: string;
  room?: string;
}

interface CourseItem {
  _id: string;
  courseCode?: string;
  title?: { en?: string } | string;
  teacher?: { _id?: string } | string | null;
  status?: string;
}

interface TimetablePeriod {
  key?: string;
  label?: string;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
  lessonNumber?: number;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DISPLAY_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;
const ALL_DEPARTMENTS = '__all__';
const ALL_SHIFTS = '__all_shifts__';
const ALL_CLASSES = '__all_classes__';
const UNASSIGNED_DEPARTMENT = '__unassigned__';
const UNASSIGNED_SHIFT = '__unassigned_shift__';

function normalizeDay(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : -1;
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

function classLabel(item?: ScheduleItem['class'] | ClassItem) {
  if (!item) return 'Class';
  if (typeof item === 'string') return item;
  const title = 'title' in item ? item.title : undefined;
  const name = 'name' in item ? item.name : undefined;
  return `${title || name || 'Class'}${item.section ? ` ${item.section}` : ''}`.trim();
}

function classIdOf(item?: ScheduleItem['class']) {
  if (!item) return '';
  return typeof item === 'string' ? item : item._id;
}

function courseIdOf(item?: ScheduleItem['course']) {
  if (!item) return '';
  return typeof item === 'string' ? item : item._id;
}

function courseLabel(item?: ScheduleItem['course'] | CourseItem) {
  if (!item) return '—';
  if (typeof item === 'string') return item;
  if (typeof item.title === 'string') return item.title;
  if (item.title?.en) return item.title.en;
  const first = item.title && Object.values(item.title).find((value) => typeof value === 'string' && value.trim());
  return typeof first === 'string' ? first : '—';
}

function teacherIdOf(item?: ScheduleItem['teacher']) {
  if (!item) return '';
  return typeof item === 'string' ? item : item._id;
}

function teacherLabel(item?: ScheduleItem['teacher']) {
  if (!item) return 'Unassigned';
  if (typeof item === 'string') return item;
  const fullName = `${item.profile?.firstName || ''} ${item.profile?.lastName || ''}`.trim();
  const email = typeof item.user === 'object' && item.user ? item.user.email : '';
  return fullName || item.teacherId || email || 'Teacher';
}

function departmentId(item: ClassItem) {
  if (item.departmentId) return String(item.departmentId);
  if (typeof item.department === 'string') return item.department;
  return item.department?._id ? String(item.department._id) : UNASSIGNED_DEPARTMENT;
}

function shiftValue(item: ClassItem) {
  const raw = String(item.shiftMode || item.shift || '').trim();
  return raw ? raw.toLowerCase() : UNASSIGNED_SHIFT;
}

function shiftLabel(value: string) {
  if (value === UNASSIGNED_SHIFT) return 'Unassigned Shift';
  return value.split(/[_\s-]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function responseList(response: any): ScheduleItem[] {
  const raw = response?.data?.data ?? response?.data ?? [];
  return Array.isArray(raw) ? raw : [];
}

export type SchedulePerspective = 'day' | 'class' | 'teacher';

type TimetableWorkspaceActions = {
  perspective?: SchedulePerspective;
  onPerspectiveChange?: (perspective: SchedulePerspective) => void;
  onSwitchToList?: () => void;
  onPrint?: () => void;
  onAddSchedule?: () => void;
  onImportSchedules?: () => void;
  onExportSchedules?: () => void;
  onPeriodSettings?: () => void;
};

export function SchedulesTimetable({
  perspective = 'day',
  onPerspectiveChange,
  onSwitchToList,
  onPrint,
  onAddSchedule,
  onImportSchedules,
  onExportSchedules,
  onPeriodSettings,
}: TimetableWorkspaceActions) {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'org_admin';
  const organizationId = String((user as any)?.organizationId || (user as any)?.schoolId || '');

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schools, setSchools] = useState<{ _id: string; name: string }[]>([]);
  const [printBranding, setPrintBranding] = useState<{ name?: string; branding?: { logo?: string } }>({});
  const [configuredPeriods, setConfiguredPeriods] = useState<TimetablePeriod[]>([]);
  const [schoolId, setSchoolId] = useState(isOrgAdmin ? organizationId : '');
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS);
  const [shiftFilter, setShiftFilter] = useState(ALL_SHIFTS);
  const [dayClassFilters, setDayClassFilters] = useState<string[]>([ALL_CLASSES]);
  const [dayClassPickerOpen, setDayClassPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [coursesByClass, setCoursesByClass] = useState<Record<string, CourseItem[]>>({});
  const [loadingCourses, setLoadingCourses] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  const effectiveSchoolId = schoolId || (isOrgAdmin ? organizationId : '');
  const draftStorageKey = `timetable-draft:${effectiveSchoolId || 'none'}`;

  const loadAllSchedules = useCallback(async () => {
    if (!effectiveSchoolId && isOrgAdmin) return;
    setLoading(true);
    setError('');
    try {
      const first = await api.get('/class-schedules', { params: { school: effectiveSchoolId || undefined, page: 1, limit: 500 } });
      let all = responseList(first);
      const pagination = first.data?.pagination || first.data?.meta;
      const totalPages = Number(pagination?.totalPages || pagination?.pages || 1);
      if (totalPages > 1) {
        const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, i) => api.get('/class-schedules', {
          params: { school: effectiveSchoolId || undefined, page: i + 2, limit: 500 },
        })));
        all = all.concat(...rest.map(responseList));
      }
      setSchedules(Array.from(new Map(all.map(item => [item._id, item])).values()));
    } catch (err: any) {
      setSchedules([]);
      setError(err?.response?.data?.message || 'Failed to load class schedules.');
    } finally {
      setLoading(false);
    }
  }, [effectiveSchoolId, isOrgAdmin]);

  const loadGridMeta = useCallback(async () => {
    if (!effectiveSchoolId) { setClasses([]); setDepartments([]); return; }
    try {
      const all: ClassItem[] = [];
      for (let page = 1; page <= 25; page += 1) {
        const response = await api.get('/classes', { params: { schoolId: effectiveSchoolId, status: 'active', page, limit: 200 } });
        const batch: ClassItem[] = response.data?.data || [];
        all.push(...batch);
        const meta = response.data?.pagination || response.data?.meta || {};
        const pages = Number(meta.totalPages || meta.pages || 0);
        const total = Number(meta.total || 0);
        if (!batch.length || batch.length < 200 || (pages && page >= pages) || (total && all.length >= total)) break;
      }
      const unique = Array.from(new Map(all.map(item => [item._id, item])).values());
      unique.sort((a, b) => Number(a.gradeLevel ?? 9999) - Number(b.gradeLevel ?? 9999) || classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true }));
      setClasses(unique);
    } catch { setClasses([]); }

    try {
      const response = await api.get('/departments', { params: { school: effectiveSchoolId, limit: 300 } });
      setDepartments(response.data?.data || []);
    } catch { setDepartments([]); }
  }, [effectiveSchoolId]);

  const loadPeriods = useCallback(async () => {
    if (!effectiveSchoolId) { setConfiguredPeriods([]); return; }
    try {
      const response = await api.get('/class-schedules/school/period-settings', { params: { school: effectiveSchoolId } });
      setConfiguredPeriods(response.data?.data?.periods || []);
    } catch { setConfiguredPeriods([]); }
  }, [effectiveSchoolId]);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get('/schools');
        const list = response.data?.data || [];
        setSchools(list);
        if (isOrgAdmin && !schoolId) setSchoolId(organizationId || list[0]?._id || '');
      } catch { /* scoped users can still use timetable */ }
    })();
  }, [isOrgAdmin, organizationId, schoolId]);

  useEffect(() => {
    if (!effectiveSchoolId) {
      setPrintBranding({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get(`/schools/${effectiveSchoolId}/branding`);
        if (!cancelled) setPrintBranding(response.data?.data?.school || {});
      } catch {
        if (!cancelled) setPrintBranding({});
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveSchoolId]);

  useEffect(() => {
    setDepartmentFilter(ALL_DEPARTMENTS);
    setShiftFilter(ALL_SHIFTS);
    setDayClassFilters([ALL_CLASSES]);
    setDayClassPickerOpen(false);
    setSelectedClassId('');
    setSelectedTeacherId('');
    setCoursesByClass({});
    setDraft({});
    setEditMode(false);
    void loadAllSchedules();
    void loadGridMeta();
    void loadPeriods();
  }, [effectiveSchoolId, loadAllSchedules, loadGridMeta, loadPeriods]);

  useEffect(() => {
    if (!effectiveSchoolId) return;
    try {
      const saved = window.localStorage.getItem(draftStorageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
        setDraft(parsed);
        setEditMode(true);
      }
    } catch { /* ignore invalid browser storage */ }
  }, [draftStorageKey, effectiveSchoolId]);

  useEffect(() => {
    if (!effectiveSchoolId) return;
    if (Object.keys(draft).length) window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    else window.localStorage.removeItem(draftStorageKey);
  }, [draft, draftStorageKey, effectiveSchoolId]);

  const daySchedules = useMemo(() => schedules
    .filter(item => item.isActive && normalizeDay(item.dayOfWeek) === selectedDay)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)), [schedules, selectedDay]);

  const departmentOptions = useMemo(() => {
    const names = new Map(departments.map(d => [d._id, d.name]));
    const map = new Map<string, string>();
    classes.forEach(cls => {
      const id = departmentId(cls);
      const embedded = typeof cls.department === 'object' && cls.department ? cls.department.name : undefined;
      map.set(id, embedded || names.get(id) || (id === UNASSIGNED_DEPARTMENT ? 'Unassigned Department' : 'Department'));
    });
    return Array.from(map.entries()).map(([_id, name]) => ({ _id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, departments]);

  const departmentClasses = useMemo(() => classes.filter(cls => departmentFilter === ALL_DEPARTMENTS || departmentId(cls) === departmentFilter), [classes, departmentFilter]);
  const shiftOptions = useMemo(() => Array.from(new Set(departmentClasses.map(shiftValue))).map(value => ({ value, label: shiftLabel(value) })).sort((a, b) => a.label.localeCompare(b.label)), [departmentClasses]);
  const columns = useMemo(() => departmentClasses.filter(cls => shiftFilter === ALL_SHIFTS || shiftValue(cls) === shiftFilter), [departmentClasses, shiftFilter]);

  useEffect(() => {
    const availableIds = new Set(columns.map(cls => cls._id));
    setDayClassFilters(current => {
      if (current.includes(ALL_CLASSES)) return current;
      const next = current.filter(id => availableIds.has(id));
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [columns]);

  const allDayClassesSelected = dayClassFilters.includes(ALL_CLASSES);

  const dayColumns = useMemo(
    () => allDayClassesSelected ? columns : columns.filter(cls => dayClassFilters.includes(cls._id)),
    [allDayClassesSelected, columns, dayClassFilters],
  );

  const dayClassFilterLabel = useMemo(() => {
    if (allDayClassesSelected) return 'All Classes';
    if (dayClassFilters.length === 0) return 'No Classes';
    if (dayClassFilters.length === 1) {
      return classLabel(columns.find(cls => cls._id === dayClassFilters[0]));
    }
    return `${dayClassFilters.length} Classes`;
  }, [allDayClassesSelected, columns, dayClassFilters]);

  const toggleAllDayClasses = () => {
    setDayClassFilters(current => current.includes(ALL_CLASSES) ? [] : [ALL_CLASSES]);
  };

  const toggleDayClass = (classId: string) => {
    setDayClassFilters(current => {
      if (current.includes(ALL_CLASSES)) {
        return columns.filter(cls => cls._id !== classId).map(cls => cls._id);
      }
      return current.includes(classId)
        ? current.filter(id => id !== classId)
        : [...current, classId];
    });
  };

  const scopedActiveSchedules = useMemo(() => {
    const visibleClassIds = new Set(columns.map(cls => cls._id));
    return schedules.filter(item => item.isActive && visibleClassIds.has(classIdOf(item.class)));
  }, [columns, schedules]);

  const weeklyDisplayDays = useMemo(
    () => DISPLAY_ORDER.filter(day => scopedActiveSchedules.some(item => normalizeDay(item.dayOfWeek) === day)),
    [scopedActiveSchedules],
  );

  const teacherOptions = useMemo(() => {
    const map = new Map<string, { _id: string; label: string }>();
    scopedActiveSchedules.forEach(item => {
      const id = teacherIdOf(item.teacher);
      if (!id) return;
      map.set(id, { _id: id, label: teacherLabel(item.teacher) });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [scopedActiveSchedules]);

  useEffect(() => {
    if (selectedClassId && columns.some(cls => cls._id === selectedClassId)) return;
    setSelectedClassId(columns[0]?._id || '');
  }, [columns, selectedClassId]);

  useEffect(() => {
    if (selectedTeacherId && teacherOptions.some(teacher => teacher._id === selectedTeacherId)) return;
    setSelectedTeacherId(teacherOptions[0]?._id || '');
  }, [selectedTeacherId, teacherOptions]);

  const selectedClass = useMemo(() => columns.find(cls => cls._id === selectedClassId), [columns, selectedClassId]);
  const selectedTeacher = useMemo(() => teacherOptions.find(teacher => teacher._id === selectedTeacherId), [selectedTeacherId, teacherOptions]);

  const selectedClassSchedules = useMemo(
    () => scopedActiveSchedules
      .filter(item => classIdOf(item.class) === selectedClassId)
      .sort((a, b) => normalizeDay(a.dayOfWeek) - normalizeDay(b.dayOfWeek) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
    [scopedActiveSchedules, selectedClassId],
  );

  const selectedTeacherSchedules = useMemo(
    () => scopedActiveSchedules
      .filter(item => teacherIdOf(item.teacher) === selectedTeacherId)
      .sort((a, b) => normalizeDay(a.dayOfWeek) - normalizeDay(b.dayOfWeek) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
    [scopedActiveSchedules, selectedTeacherId],
  );

  const periodSourceSchedules = perspective === 'day'
    ? daySchedules
    : perspective === 'class'
      ? selectedClassSchedules
      : selectedTeacherSchedules;

  const periods = useMemo(() => {
    if (configuredPeriods.length) {
      let lesson = 0;
      return configuredPeriods
        .map((period, index) => ({ ...period, key: `${period.startTime}-${period.endTime}-${index}` }))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        .map(period => ({ ...period, lessonNumber: period.isBreak ? undefined : ++lesson }));
    }
    const map = new Map<string, TimetablePeriod>();
    periodSourceSchedules.forEach(item => {
      const startTime = String(item.startTime).slice(0, 5);
      const endTime = String(item.endTime).slice(0, 5);
      map.set(`${startTime}-${endTime}`, { key: `${startTime}-${endTime}`, startTime, endTime, isBreak: false });
    });
    let lesson = 0;
    return Array.from(map.values())
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      .map(period => ({ ...period, lessonNumber: ++lesson }));
  }, [configuredPeriods, periodSourceSchedules]);

  const loadClassCourses = useCallback(async (classId: string) => {
    if (!effectiveSchoolId || coursesByClass[classId] || loadingCourses.has(classId)) return;
    setLoadingCourses(current => new Set(current).add(classId));
    try {
      const response = await api.get('/courses/admin', { params: { school: effectiveSchoolId, classId, limit: 300 } });
      const available = (response.data?.data || []).filter((course: CourseItem) => course.status !== 'archived');
      setCoursesByClass(current => ({ ...current, [classId]: available }));
    } catch (err: any) {
      setError(err?.response?.data?.message || `Could not load courses for ${classLabel(classes.find(item => item._id === classId))}.`);
    } finally {
      setLoadingCourses(current => { const next = new Set(current); next.delete(classId); return next; });
    }
  }, [classes, coursesByClass, effectiveSchoolId, loadingCourses]);

  const cellSchedules = useCallback((classId: string, period: TimetablePeriod) => {
    const sameClass = daySchedules.filter(item => classIdOf(item.class) === classId);
    const exact = sameClass.filter(item => String(item.startTime).slice(0, 5) === period.startTime && String(item.endTime).slice(0, 5) === period.endTime);
    if (exact.length) return exact;
    const pStart = timeToMinutes(period.startTime);
    const pEnd = timeToMinutes(period.endTime);
    return sameClass.filter(item => timeToMinutes(item.startTime) < pEnd && timeToMinutes(item.endTime) > pStart);
  }, [daySchedules]);

  const weeklyCellSchedules = (items: ScheduleItem[], day: number, period: TimetablePeriod) => {
    if (period.isBreak) return [];
    const pStart = timeToMinutes(period.startTime);
    const pEnd = timeToMinutes(period.endTime);
    return items.filter(item => {
      if (normalizeDay(item.dayOfWeek) !== day) return false;
      const start = timeToMinutes(item.startTime);
      const end = timeToMinutes(item.endTime);
      return start < pEnd && end > pStart;
    });
  };

  const draftKey = (classId: string, period: TimetablePeriod) => `${selectedDay}|${classId}|${period.startTime}|${period.endTime}`;

  const currentCourseId = (classId: string, period: TimetablePeriod) => {
    const key = draftKey(classId, period);
    if (Object.prototype.hasOwnProperty.call(draft, key)) return draft[key];
    return courseIdOf(cellSchedules(classId, period)[0]?.course);
  };

  const beginEdit = () => {
    setEditMode(true);
    setError('');
    setSuccess('');
    columns.forEach(cls => void loadClassCourses(cls._id));
  };

  const cancelEdit = () => {
    if (Object.keys(draft).length && !window.confirm('Discard unsaved timetable changes?')) return;
    setDraft({});
    setEditMode(false);
    setError('');
    setSuccess('');
  };

  const saveTimetable = async () => {
    const entries = Object.entries(draft);
    if (!entries.length) { setEditMode(false); return; }
    setSaving(true);
    setError('');
    setSuccess('');

    // Each cell is saved independently so one conflicting cell can't abort
    // the rest of the batch, silently drop changes the user already made,
    // or — since a failed cell used to leave the whole draft (including
    // already-saved cells) untouched — cause a retry to re-POST a cell that
    // had, in fact, already saved and create a duplicate schedule row.
    const savedKeys: string[] = [];
    const failures: string[] = [];

    for (const [key, courseId] of entries) {
      const [dayRaw, classId, startTime, endTime] = key.split('|');
      const day = Number(dayRaw);
      const cls = classes.find(item => item._id === classId);
      const cellLabel = `${classLabel(cls)} ${DAY_SHORT[day] ?? ''} ${startTime}-${endTime}`.trim();
      try {
        const existing = schedules.filter(item => item.isActive && normalizeDay(item.dayOfWeek) === day && classIdOf(item.class) === classId && (
          (String(item.startTime).slice(0, 5) === startTime && String(item.endTime).slice(0, 5) === endTime)
          || (timeToMinutes(item.startTime) < timeToMinutes(endTime) && timeToMinutes(item.endTime) > timeToMinutes(startTime))
        ));

        if (!courseId) {
          await Promise.all(existing.map(item => api.delete(`/class-schedules/${item._id}`)));
          savedKeys.push(key);
          continue;
        }

        const course = (coursesByClass[classId] || []).find(item => item._id === courseId);
        const teacher = typeof course?.teacher === 'string' ? course.teacher : course?.teacher?._id || null;
        const payload = {
          school: effectiveSchoolId,
          class: classId,
          course: courseId,
          teacher,
          room: cls?.room || '',
          dayOfWeek: day,
          startTime,
          endTime,
          isActive: true,
        };

        if (existing[0]) await api.put(`/class-schedules/school/${existing[0]._id}`, payload);
        else await api.post('/class-schedules/school', payload);
        if (existing.length > 1) await Promise.all(existing.slice(1).map(item => api.delete(`/class-schedules/${item._id}`)));
        savedKeys.push(key);
      } catch (err: any) {
        const message = err?.response?.data?.message || 'could not save';
        failures.push(`${cellLabel}: ${message}`);
      }
    }

    // Only the cells that actually saved leave the draft — a failed cell
    // stays editable/visible so nothing already typed gets lost.
    if (savedKeys.length) {
      setDraft(prev => {
        const next = { ...prev };
        for (const key of savedKeys) delete next[key];
        return next;
      });
    }
    // Refresh regardless of partial failure so the next save attempt (for
    // the remaining failed cells) sees the schedules that did just save,
    // instead of re-POSTing them as new rows.
    await loadAllSchedules();
    setSaving(false);

    if (!failures.length) {
      setEditMode(false);
      setSuccess(`Timetable saved successfully — ${savedKeys.length} ${savedKeys.length === 1 ? 'change' : 'changes'} applied.`);
      return;
    }
    setError(`${savedKeys.length} of ${entries.length} change${entries.length === 1 ? '' : 's'} saved. ${failures.length} failed: ${failures.join('; ')}`);
  };

  const refreshAll = () => {
    void loadAllSchedules();
    void loadGridMeta();
    void loadPeriods();
  };

  const moveDay = (offset: number) => setSelectedDay(day => {
    const idx = DISPLAY_ORDER.indexOf(day as (typeof DISPLAY_ORDER)[number]);
    return DISPLAY_ORDER[((idx < 0 ? 0 : idx) + offset + DISPLAY_ORDER.length) % DISPLAY_ORDER.length];
  });

  const visibleSessionCount = perspective === 'day'
    ? daySchedules.filter(item => dayColumns.some(cls => cls._id === classIdOf(item.class))).length
    : perspective === 'class'
      ? selectedClassSchedules.length
      : selectedTeacherSchedules.length;

  const perspectiveSummary = perspective === 'day'
    ? `${dayColumns.length} classes`
    : perspective === 'class'
      ? classLabel(selectedClass)
      : selectedTeacher?.label || 'No teacher selected';

  const printSchoolName = printBranding.name || schools.find(school => school._id === effectiveSchoolId)?.name || user?.organizationName || 'School';
  const printLogo = printBranding.branding?.logo || '';
  const printClasses = perspective === 'class' && selectedClass
    ? [selectedClass]
    : perspective === 'teacher'
      ? columns.filter(cls => selectedTeacherSchedules.some(item => classIdOf(item.class) === cls._id))
      : dayColumns;
  const printAcademicYears = Array.from(new Set(printClasses.map(cls => String(cls.academicYear || '').trim()).filter(Boolean)));
  const printAcademicYear = printAcademicYears.length ? printAcademicYears.join(' / ') : '—';
  const visibleShifts = Array.from(new Set(printClasses.map(shiftValue).filter(value => value !== UNASSIGNED_SHIFT)));
  const printShiftName = shiftFilter !== ALL_SHIFTS
    ? shiftLabel(shiftFilter)
    : visibleShifts.length === 1
      ? shiftLabel(visibleShifts[0])
      : visibleShifts.length > 1
        ? 'Multiple Shifts'
        : 'School Shift';
  const printGeneratedDate = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  const printTitle = perspective === 'teacher' ? 'TEACHER SCHEDULE' : 'CLASS SCHEDULE';
  const printSubtitle = perspective === 'day'
    ? `${DAYS[selectedDay]} Timetable - ${printShiftName}`
    : perspective === 'class'
      ? `${classLabel(selectedClass)} - Weekly Timetable`
      : `${selectedTeacher?.label || 'Teacher'} - Weekly Timetable`;
  const printContextLabel = perspective === 'day' ? 'Day / Class' : perspective === 'class' ? 'Class' : 'Teacher';
  const printContextValue = perspective === 'day'
    ? `${DAYS[selectedDay]} · ${dayClassFilterLabel}`
    : perspective === 'class'
      ? classLabel(selectedClass)
      : selectedTeacher?.label || '—';
  const printFooterLabel = perspective === 'day'
    ? `Class Schedule - ${DAYS[selectedDay]}`
    : perspective === 'class'
      ? `Class Schedule - ${classLabel(selectedClass)}`
      : `Teacher Schedule - ${selectedTeacher?.label || 'Teacher'}`;

  return (
    <div className="min-h-full min-w-0 max-w-full overflow-x-hidden bg-[var(--color-surface-primary)] p-3 pt-20 sm:p-6 lg:pt-8">
      <style>{`
        .schedule-print-header,
        .schedule-print-footer {
          display: none;
        }

        @page {
          size: A4 landscape;
          margin: 6mm;
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body * {
            visibility: hidden !important;
          }

          #schedule-timetable-print,
          #schedule-timetable-print * {
            visibility: visible !important;
          }

          #schedule-timetable-print {
            position: fixed !important;
            inset: 0 !important;
            z-index: 2147483647 !important;
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            max-width: none !important;
            min-height: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #0f2348 !important;
          }

          #schedule-timetable-print .schedule-print-header {
            display: grid !important;
            grid-template-columns: minmax(240px, 1fr) minmax(320px, 1.25fr) minmax(225px, 0.9fr) !important;
            align-items: start !important;
            gap: 14px !important;
            padding: 4mm 2mm 5mm !important;
          }

          #schedule-timetable-print .schedule-print-brand {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            min-width: 0 !important;
          }

          #schedule-timetable-print .schedule-print-logo {
            width: 46px !important;
            height: 46px !important;
            object-fit: contain !important;
            flex: 0 0 auto !important;
          }

          #schedule-timetable-print .schedule-print-logo-fallback {
            display: flex !important;
            width: 46px !important;
            height: 46px !important;
            flex: 0 0 46px !important;
            align-items: center !important;
            justify-content: center !important;
            border: 2px solid #0f766e !important;
            border-radius: 10px !important;
            background: #ecfdf5 !important;
            color: #0f766e !important;
            font-size: 20px !important;
            font-weight: 900 !important;
          }

          #schedule-timetable-print .schedule-print-school {
            min-width: 0 !important;
          }

          #schedule-timetable-print .schedule-print-school-name {
            margin: 0 !important;
            font-size: 13px !important;
            line-height: 1.15 !important;
            font-weight: 800 !important;
            color: #0b2454 !important;
          }

          #schedule-timetable-print .schedule-print-school-subtitle {
            margin-top: 4px !important;
            font-size: 9px !important;
            line-height: 1.2 !important;
            color: #24558c !important;
          }

          #schedule-timetable-print .schedule-print-title {
            text-align: center !important;
            align-self: center !important;
          }

          #schedule-timetable-print .schedule-print-title h2 {
            margin: 0 !important;
            font-size: 22px !important;
            line-height: 1 !important;
            letter-spacing: -0.02em !important;
            font-weight: 900 !important;
            color: #0a2456 !important;
          }

          #schedule-timetable-print .schedule-print-title p {
            margin: 5px 0 0 !important;
            font-size: 12px !important;
            line-height: 1.15 !important;
            color: #173765 !important;
          }

          #schedule-timetable-print .schedule-print-meta {
            justify-self: end !important;
            min-width: 210px !important;
            font-size: 9px !important;
            line-height: 1.45 !important;
            color: #12284f !important;
          }

          #schedule-timetable-print .schedule-print-meta-row {
            display: grid !important;
            grid-template-columns: auto 1fr !important;
            gap: 4px !important;
          }

          #schedule-timetable-print .schedule-print-meta-label {
            font-weight: 800 !important;
          }

          #schedule-timetable-print .schedule-timetable-print-scroll {
            width: 100% !important;
            overflow: visible !important;
            flex: 1 1 auto !important;
          }

          #schedule-timetable-print table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
            border-collapse: separate !important;
            border-spacing: 0 !important;
            border: 1px solid #b8cee6 !important;
            border-radius: 4px !important;
            overflow: hidden !important;
            font-size: 7.3px !important;
            line-height: 1.18 !important;
          }

          #schedule-timetable-print thead {
            display: table-header-group !important;
          }

          #schedule-timetable-print tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          #schedule-timetable-print th,
          #schedule-timetable-print td {
            padding: 5px 3px !important;
            border-right: 1px solid #c6d8ea !important;
            border-bottom: 1px solid #c6d8ea !important;
            border-top: 0 !important;
            border-left: 0 !important;
            vertical-align: middle !important;
            text-align: center !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            color: #0e2448 !important;
          }

          #schedule-timetable-print tr > :last-child {
            border-right: 0 !important;
          }

          #schedule-timetable-print tbody tr:last-child td {
            border-bottom: 0 !important;
          }

          #schedule-timetable-print th {
            background: #edf6fd !important;
            font-size: 7.4px !important;
            font-weight: 800 !important;
            color: #10274e !important;
          }

          #schedule-timetable-print th:first-child,
          #schedule-timetable-print td:first-child {
            width: 62px !important;
          }

          #schedule-timetable-print .schedule-period-cell {
            background: #f6faff !important;
            color: #0e274f !important;
          }

          #schedule-timetable-print .schedule-period-cell > div:first-child {
            font-size: 7.5px !important;
            font-weight: 800 !important;
          }

          #schedule-timetable-print .schedule-period-time {
            margin-top: 3px !important;
            font-size: 6.4px !important;
            line-height: 1.25 !important;
            color: #375477 !important;
          }

          #schedule-timetable-print .schedule-print-subject {
            min-height: 30px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 4px 3px !important;
            border-radius: 4px !important;
            font-size: 7px !important;
            line-height: 1.15 !important;
            font-weight: 800 !important;
            color: #10284d !important;
          }

          #schedule-timetable-print .schedule-print-subject-1 {
            background: #ddf8e8 !important;
          }

          #schedule-timetable-print .schedule-print-subject-2 {
            background: #dceeff !important;
          }

          #schedule-timetable-print .schedule-print-subject-3 {
            background: #fff1b9 !important;
          }

          #schedule-timetable-print .schedule-break-row {
            background: #fff0f0 !important;
            color: #8a1717 !important;
            font-size: 8px !important;
            font-weight: 900 !important;
            padding: 6px 4px !important;
          }

          #schedule-timetable-print .schedule-empty-cell {
            color: #45627e !important;
            font-size: 8px !important;
          }

          #schedule-timetable-print .schedule-print-footer {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 12px !important;
            margin-top: 5mm !important;
            padding: 3mm 1mm 0 !important;
            border-top: 1px solid #a9bfd8 !important;
            font-size: 7.5px !important;
            line-height: 1.2 !important;
            color: #17345c !important;
          }

          #schedule-timetable-print td > div {
            max-width: 100% !important;
          }

          #schedule-timetable-print td .space-y-1\\.5 {
            display: block !important;
          }

          #schedule-timetable-print td .space-y-1\\.5 > * + * {
            margin-top: 3px !important;
          }

          #schedule-timetable-print .schedule-screen-only {
            display: none !important;
          }
        }
      `}</style>
      <div className="mx-auto w-full max-w-screen-2xl space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/30"><CalendarDays className="h-5 w-5" /></div>
            <div><h1 className="text-2xl font-bold">Class Timetable</h1><p className="text-xs text-[var(--color-text-tertiary)]">{visibleSessionCount} visible sessions · {perspectiveSummary}</p></div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {!isOrgAdmin && <select value={schoolId} onChange={e => setSchoolId(e.target.value)} className="max-w-full rounded-lg border bg-[var(--color-surface-primary)] px-3 py-2 text-xs"><option value="">Select Organization...</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>}
            {!editMode ? <button onClick={beginEdit} disabled={!effectiveSchoolId} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary-600 bg-primary-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />Edit Timetable</button> : <>
              <button onClick={cancelEdit} disabled={saving} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"><X className="h-3.5 w-3.5" />Cancel</button>
              <button onClick={() => void saveTimetable()} disabled={saving || Object.keys(draft).length === 0} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving ? 'Saving...' : `Save Timetable${Object.keys(draft).length ? ` (${Object.keys(draft).length})` : ''}`}</button>
            </>}
            <button onClick={refreshAll} disabled={loading || saving} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span></button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setWorkspaceMenuOpen(open => !open)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]"
                aria-label="Timetable view and print actions"
                aria-expanded={workspaceMenuOpen}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {workspaceMenuOpen && (
                <div className="absolute right-0 z-[80] mt-2 w-[min(86vw,17rem)] overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-2xl">
                  <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">View Mode</div>
                  <button type="button" onClick={() => { setWorkspaceMenuOpen(false); onSwitchToList?.(); }} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><span className="flex items-center gap-2"><List className="h-4 w-4" />List</span></button>
                  <button type="button" onClick={() => setWorkspaceMenuOpen(false)} className="flex w-full items-center justify-between rounded-xl bg-primary-50 px-3 py-2.5 text-left text-sm font-semibold text-primary-700 dark:bg-primary-950/20 dark:text-primary-300"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Table</span><Check className="h-4 w-4" /></button>

                  <div className="my-1 border-t border-[var(--color-border-subtle)]" />
                  <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Filter By</div>
                  {([
                    ['day','Day',CalendarDays],
                    ['class','Class',School],
                    ['teacher','Teacher',Users],
                  ] as const).map(([value,label,Icon]) => (
                    <button key={value} type="button" onClick={() => { onPerspectiveChange?.(value); setWorkspaceMenuOpen(false); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)] ${perspective === value ? 'font-semibold text-primary-600' : ''}`}>
                      <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span>
                      {perspective === value && <Check className="h-4 w-4" />}
                    </button>
                  ))}

                  <div className="my-1 border-t border-[var(--color-border-subtle)]" />
                  <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Action</div>
                  <button type="button" onClick={() => { setWorkspaceMenuOpen(false); if (onPrint) onPrint(); else window.print(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-[var(--color-surface-secondary)]"><Printer className="h-4 w-4" />Print</button>

                  {(onAddSchedule || onImportSchedules || onExportSchedules || onPeriodSettings) && <>
                    <div className="my-1 border-t border-[var(--color-border-subtle)]" />
                    <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Manage</div>
                    {onAddSchedule && <button type="button" onClick={() => { setWorkspaceMenuOpen(false); onAddSchedule(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Pencil className="h-4 w-4" />Add Schedule</button>}
                    {onImportSchedules && <button type="button" onClick={() => { setWorkspaceMenuOpen(false); onImportSchedules(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Upload className="h-4 w-4" />Import Schedules</button>}
                    {onExportSchedules && <button type="button" onClick={() => { setWorkspaceMenuOpen(false); onExportSchedules(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Download className="h-4 w-4" />Export Schedules</button>}
                    {onPeriodSettings && <button type="button" onClick={() => { setWorkspaceMenuOpen(false); onPeriodSettings(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Settings className="h-4 w-4" />Period &amp; Break Settings</button>}
                  </>}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}
        {editMode && perspective === 'day' && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Edit mode:</strong> choose courses in the table, then press <strong>Save Timetable</strong>. Unsaved selections are kept in this browser even if the page is refreshed.</div>}

        <div className="flex flex-col gap-3 rounded-2xl border bg-[var(--color-surface-primary)] p-3">
          {perspective === 'day' ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select
                  value={departmentFilter}
                  onChange={e => { setDepartmentFilter(e.target.value); setShiftFilter(ALL_SHIFTS); setDayClassFilters([ALL_CLASSES]); setDayClassPickerOpen(false); }}
                  className="min-w-0 w-full rounded-xl border bg-[var(--color-surface-primary)] px-2 py-2.5 text-xs sm:px-3 sm:text-sm"
                  aria-label="Department filter"
                >
                  <option value={ALL_DEPARTMENTS}>All Departments</option>
                  {departmentOptions.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
                <select
                  value={shiftFilter}
                  onChange={e => { setShiftFilter(e.target.value); setDayClassFilters([ALL_CLASSES]); setDayClassPickerOpen(false); }}
                  className="min-w-0 w-full rounded-xl border bg-[var(--color-surface-primary)] px-2 py-2.5 text-xs sm:px-3 sm:text-sm"
                  aria-label="Shift filter"
                >
                  <option value={ALL_SHIFTS}>All Shifts</option>
                  {shiftOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => setDayClassPickerOpen(open => !open)}
                    className="flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-[var(--color-surface-primary)] px-2 py-2.5 text-left text-xs sm:px-3 sm:text-sm"
                    aria-haspopup="listbox"
                    aria-expanded={dayClassPickerOpen}
                  >
                    <span className="truncate">{dayClassFilterLabel}</span>
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${dayClassPickerOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {dayClassPickerOpen && (
                    <div className="absolute right-0 z-50 mt-2 w-[min(88vw,22rem)] overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
                      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-3 py-2.5">
                        <div>
                          <div className="text-sm font-bold">Select Classes</div>
                          <div className="text-[11px] text-[var(--color-text-tertiary)]">Choose one or more classes</div>
                        </div>
                        <button type="button" onClick={() => setDayClassPickerOpen(false)} className="rounded-lg border p-1.5" aria-label="Close class filter"><X className="h-4 w-4" /></button>
                      </div>
                      <div className="max-h-72 overflow-y-auto p-2" role="listbox" aria-multiselectable="true">
                        <button
                          type="button"
                          onClick={toggleAllDayClasses}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"
                        >
                          <span className="font-semibold">All Classes</span>
                          <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${allDayClassesSelected ? 'border-primary-600 bg-primary-600 text-white' : 'border-[var(--color-border-default)]'}`}>
                            {allDayClassesSelected && <Check className="h-3.5 w-3.5" />}
                          </span>
                        </button>
                        {columns.map(cls => {
                          const checked = allDayClassesSelected || dayClassFilters.includes(cls._id);
                          return (
                            <button
                              type="button"
                              key={cls._id}
                              onClick={() => toggleDayClass(cls._id)}
                              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"
                              role="option"
                              aria-selected={checked}
                            >
                              <span>{classLabel(cls)}</span>
                              <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? 'border-primary-600 bg-primary-600 text-white' : 'border-[var(--color-border-default)]'}`}>
                                {checked && <Check className="h-3.5 w-3.5" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] px-3 py-2">
                        <span className="text-xs text-[var(--color-text-tertiary)]">{allDayClassesSelected ? `All ${columns.length} selected` : dayClassFilters.length ? `${dayClassFilters.length} selected` : 'No classes selected'}</span>
                        <button type="button" onClick={() => setDayClassPickerOpen(false)} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white">Done</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setDepartmentFilter(ALL_DEPARTMENTS); setShiftFilter(ALL_SHIFTS); setDayClassFilters([ALL_CLASSES]); setDayClassPickerOpen(false); }} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm"><RotateCcw className="h-4 w-4" />Reset Filters</button>
                <div className="flex flex-1 items-center justify-end gap-2"><button onClick={() => moveDay(-1)} className="rounded-lg border p-2"><ChevronLeft className="h-4 w-4" /></button><div className="min-w-28 text-center sm:min-w-36"><div className="text-xs text-[var(--color-text-tertiary)]">Selected day</div><div className="font-bold">{DAYS[selectedDay]}</div></div><button onClick={() => moveDay(1)} className="rounded-lg border p-2"><ChevronRight className="h-4 w-4" /></button></div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <select value={departmentFilter} onChange={e => { setDepartmentFilter(e.target.value); setShiftFilter(ALL_SHIFTS); }} className="rounded-xl border bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"><option value={ALL_DEPARTMENTS}>All Departments</option>{departmentOptions.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}</select>
              <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)} className="rounded-xl border bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"><option value={ALL_SHIFTS}>All Shifts</option>{shiftOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              <button onClick={() => { setDepartmentFilter(ALL_DEPARTMENTS); setShiftFilter(ALL_SHIFTS); }} className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm"><RotateCcw className="h-4 w-4" />Reset Filters</button>
            </div>
          )}
          {perspective === 'class' ? (
            <label className="flex flex-1 flex-col gap-1 lg:max-w-sm lg:ml-auto">
              <span className="text-xs font-medium text-[var(--color-text-tertiary)]">Selected class</span>
              <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} className="rounded-xl border bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm font-semibold">
                {columns.length === 0 && <option value="">No classes available</option>}
                {columns.map(cls => <option key={cls._id} value={cls._id}>{classLabel(cls)}</option>)}
              </select>
            </label>
          ) : perspective === 'teacher' ? (
            <label className="flex flex-1 flex-col gap-1 lg:max-w-sm lg:ml-auto">
              <span className="text-xs font-medium text-[var(--color-text-tertiary)]">Selected teacher</span>
              <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)} className="rounded-xl border bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm font-semibold">
                {teacherOptions.length === 0 && <option value="">No scheduled teachers</option>}
                {teacherOptions.map(teacher => <option key={teacher._id} value={teacher._id}>{teacher.label}</option>)}
              </select>
            </label>
          ) : null}
        </div>

        {perspective === 'day' && <div className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-xl border bg-[var(--color-surface-primary)] p-1.5 [scrollbar-width:thin]">{DISPLAY_ORDER.map(day => <button key={day} onClick={() => setSelectedDay(day)} className={`min-w-20 flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${selectedDay === day ? 'bg-primary-600 text-white' : 'hover:bg-[var(--color-surface-secondary)]'}`}>{DAY_SHORT[day]}</button>)}</div>}

        <div className="flex items-center justify-end px-1 text-[10px] font-medium text-[var(--color-text-tertiary)] sm:hidden">
          Swipe timetable horizontally →
        </div>

        <div id="schedule-timetable-print" className="overflow-hidden rounded-2xl border bg-[var(--color-surface-primary)] shadow-sm">
          <div className="schedule-print-header">
            <div className="schedule-print-brand">
              {printLogo ? (
                <img className="schedule-print-logo" src={printLogo} alt="" />
              ) : (
                <div className="schedule-print-logo-fallback">{printSchoolName.charAt(0).toUpperCase()}</div>
              )}
              <div className="schedule-print-school">
                <div className="schedule-print-school-name">{printSchoolName}</div>
                <div className="schedule-print-school-subtitle">Class Schedule • Weekly Academic Timetable</div>
              </div>
            </div>
            <div className="schedule-print-title">
              <h2>{printTitle}</h2>
              <p>{printSubtitle}</p>
            </div>
            <div className="schedule-print-meta">
              <div className="schedule-print-meta-row"><span className="schedule-print-meta-label">Academic Year:</span><span>{printAcademicYear}</span></div>
              <div className="schedule-print-meta-row"><span className="schedule-print-meta-label">Shift:</span><span>{printShiftName}</span></div>
              <div className="schedule-print-meta-row"><span className="schedule-print-meta-label">{printContextLabel}:</span><span>{printContextValue}</span></div>
              <div className="schedule-print-meta-row"><span className="schedule-print-meta-label">Generated:</span><span>{printGeneratedDate}</span></div>
            </div>
          </div>
          {loading ? (
            <div className="flex min-h-72 items-center justify-center"><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Loading timetable...</div>
          ) : !effectiveSchoolId ? (
            <div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">Select an organization to view the timetable.</div>
          ) : perspective === 'class' && !selectedClass ? (
            <div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">No class matches the current filters.</div>
          ) : perspective === 'teacher' && !selectedTeacherId ? (
            <div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">No scheduled teacher matches the current filters.</div>
          ) : periods.length === 0 ? (
            <div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">No periods or schedule times are configured yet.</div>
          ) : perspective === 'day' ? (
            <div className="schedule-timetable-print-scroll max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin] touch-auto"><table className="w-max min-w-full table-fixed border-collapse text-xs sm:text-sm"><thead><tr><th className="sticky left-0 z-20 w-[92px] min-w-[92px] max-w-[92px] border bg-[var(--color-surface-secondary)] px-1.5 py-2.5 text-[10px] shadow-[2px_0_5px_rgba(0,0,0,0.08)] sm:w-28 sm:min-w-28 sm:max-w-none sm:px-2 sm:py-3 sm:text-xs">Period</th>{dayColumns.map(cls => <th key={cls._id} className="w-[92px] min-w-[92px] max-w-[92px] border bg-[var(--color-surface-secondary)] px-1.5 py-2.5 text-[10px] sm:w-40 sm:min-w-40 sm:max-w-none sm:px-2 sm:py-3 sm:text-xs"><div className="break-words font-bold leading-4">{classLabel(cls)}</div>{cls.shiftMode && <div className="mt-0.5 font-normal text-[8px] text-[var(--color-text-tertiary)] sm:mt-1 sm:text-[10px]">{cls.shiftMode}</div>}</th>)}</tr></thead><tbody>{periods.map(period => <tr key={period.key || `${period.startTime}-${period.endTime}`}>{period.isBreak ? <td colSpan={Math.max(1, dayColumns.length + 1)} className="schedule-break-row border bg-amber-50 px-3 py-3 text-center text-xs font-bold text-amber-800">{period.label || 'Break'} ({formatTime(period.startTime)} – {formatTime(period.endTime)})</td> : <><td className="schedule-period-cell sticky left-0 z-10 w-[92px] min-w-[92px] max-w-[92px] border bg-[var(--color-surface-secondary)] px-1.5 py-2.5 text-center text-[10px] shadow-[2px_0_5px_rgba(0,0,0,0.08)] sm:w-28 sm:min-w-28 sm:max-w-none sm:px-2 sm:py-3 sm:text-xs"><div className="font-bold"><span className="sm:hidden">{period.isBreak ? (period.label || 'Break') : `P${period.lessonNumber || ''}`}</span><span className="hidden sm:inline">{period.label || `Period ${period.lessonNumber || ''}`}</span></div><div className="schedule-period-time mt-0.5 text-[8px] leading-3 text-[var(--color-text-tertiary)] sm:mt-1 sm:text-[10px]">{formatTime(period.startTime)}<br />– {formatTime(period.endTime)}</div></td>{dayColumns.map(cls => {
                    const existing = cellSchedules(cls._id, period);
                    const selected = currentCourseId(cls._id, period);
                    const hasDraft = Object.prototype.hasOwnProperty.call(draft, draftKey(cls._id, period));
                    return <td key={`${cls._id}-${period.key}`} className={`w-[92px] min-w-[92px] max-w-[92px] border p-1.5 align-top sm:w-40 sm:min-w-40 sm:max-w-none sm:p-2 ${hasDraft ? 'bg-amber-50/70' : ''}`}>
                      {editMode ? <select value={selected} onFocus={() => void loadClassCourses(cls._id)} onChange={e => setDraft(current => ({ ...current, [draftKey(cls._id, period)]: e.target.value }))} className="min-h-11 w-full rounded-lg border bg-[var(--color-surface-primary)] px-2 py-2 text-xs"><option value="">— No course —</option>{loadingCourses.has(cls._id) && <option disabled>Loading...</option>}{(coursesByClass[cls._id] || []).map(course => <option key={course._id} value={course._id}>{courseLabel(course)}{course.courseCode ? ` · ${course.courseCode}` : ''}</option>)}</select> : existing.length ? <div className="space-y-1.5">{existing.map(item => <div key={item._id} className={`schedule-print-subject schedule-print-subject-${((period.lessonNumber || 1) - 1) % 3 + 1} rounded-lg bg-primary-50 px-1.5 py-1.5 text-center text-[10px] text-primary-900 dark:bg-primary-950/30 dark:text-primary-100 sm:px-2 sm:py-2 sm:text-xs`}><div className="break-words font-bold leading-4">{courseLabel(item.course)}</div>{teacherIdOf(item.teacher) && <div className="mt-0.5 break-words text-[8px] font-medium leading-3 opacity-75 sm:mt-1 sm:text-[10px] sm:leading-4">{teacherLabel(item.teacher)}</div>}{item.room && <div className="schedule-screen-only mt-0.5 break-words text-[8px] leading-3 opacity-70 sm:mt-1 sm:text-[10px]">Room {item.room}</div>}</div>)}</div> : <div className="schedule-empty-cell py-3 text-center text-xs text-[var(--color-text-tertiary)]">—</div>}
                    </td>;
                  })}</>}</tr>)}</tbody></table></div>
          ) : (
            <div className="schedule-timetable-print-scroll max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin] touch-auto">
              <table className="w-max min-w-full table-fixed border-collapse text-xs sm:text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 w-[92px] min-w-[92px] max-w-[92px] border bg-[var(--color-surface-secondary)] px-1.5 py-2.5 text-[10px] shadow-[2px_0_5px_rgba(0,0,0,0.08)] sm:w-28 sm:min-w-28 sm:max-w-none sm:px-2 sm:py-3 sm:text-xs">Period</th>
                    {weeklyDisplayDays.map(day => (
                      <th key={day} className="w-[86px] min-w-[86px] max-w-[86px] border bg-[var(--color-surface-secondary)] px-1.5 py-2.5 text-[10px] sm:w-28 sm:min-w-28 sm:max-w-none sm:px-2 sm:py-3 sm:text-xs">
                        <span className="sm:hidden">{DAY_SHORT[day]}</span>
                        <span className="hidden sm:inline">{DAYS[day]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map(period => (
                    <tr key={period.key || `${period.startTime}-${period.endTime}`}>
                      <td className="schedule-period-cell sticky left-0 z-10 w-[92px] min-w-[92px] max-w-[92px] border bg-[var(--color-surface-secondary)] px-1.5 py-2.5 text-center text-[10px] shadow-[2px_0_5px_rgba(0,0,0,0.08)] sm:w-28 sm:min-w-28 sm:max-w-none sm:px-2 sm:py-3 sm:text-xs">
                        <div className="font-bold"><span className="sm:hidden">{period.isBreak ? (period.label || 'Break') : `P${period.lessonNumber || ''}`}</span><span className="hidden sm:inline">{period.label || (period.isBreak ? 'Break' : `Period ${period.lessonNumber || ''}`)}</span></div>
                        <div className="schedule-period-time mt-0.5 text-[8px] leading-3 text-[var(--color-text-tertiary)] sm:mt-1 sm:text-[10px]">{formatTime(period.startTime)}<br />– {formatTime(period.endTime)}</div>
                      </td>
                      {weeklyDisplayDays.map(day => {
                        if (period.isBreak) {
                          return <td key={`${period.key}-${day}`} className="schedule-break-row w-[86px] min-w-[86px] max-w-[86px] border bg-amber-50 px-1.5 py-2.5 text-center text-[10px] font-bold text-amber-800 sm:w-28 sm:min-w-28 sm:max-w-none sm:px-2 sm:py-3 sm:text-xs">{period.label || 'Break'}</td>;
                        }
                        const existing = weeklyCellSchedules(
                          perspective === 'class' ? selectedClassSchedules : selectedTeacherSchedules,
                          day,
                          period,
                        );
                        return (
                          <td key={`${period.key}-${day}`} className="w-[86px] min-w-[86px] max-w-[86px] border p-1.5 align-top sm:w-28 sm:min-w-28 sm:max-w-none sm:p-2">
                            {existing.length ? (
                              <div className="space-y-1.5">
                                {existing.map(item => (
                                  <div key={item._id} className={`schedule-print-subject schedule-print-subject-${((period.lessonNumber || 1) - 1) % 3 + 1} rounded-lg bg-primary-50 px-1.5 py-1.5 text-center text-[10px] text-primary-900 dark:bg-primary-950/30 dark:text-primary-100 sm:px-2 sm:py-2 sm:text-xs`}>
                                    <div className="break-words font-bold">{courseLabel(item.course)}</div>
                                    {perspective === 'class' ? (
                                      teacherIdOf(item.teacher) && <div className="mt-0.5 text-[8px] font-medium leading-3 opacity-75 sm:mt-1 sm:text-[10px]">{teacherLabel(item.teacher)}</div>
                                    ) : (
                                      <div className="mt-0.5 text-[8px] font-medium leading-3 opacity-75 sm:mt-1 sm:text-[10px]">{classLabel(item.class)}</div>
                                    )}
                                    {item.room && <div className="schedule-screen-only mt-1 text-[10px] opacity-70">Room {item.room}</div>}
                                  </div>
                                ))}
                              </div>
                            ) : <div className="schedule-empty-cell py-3 text-center text-xs text-[var(--color-text-tertiary)]">—</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="schedule-print-footer">
            <span>{printSchoolName} &nbsp;|&nbsp; {printFooterLabel}</span>
            <span>Page 1 of 1</span>
          </div>
        </div>

        {editMode && perspective === 'day' && <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:bg-slate-950/95"><div className="text-xs"><strong>{Object.keys(draft).length}</strong> unsaved timetable change(s)</div><div className="flex gap-2"><button onClick={cancelEdit} disabled={saving} className="rounded-xl border px-4 py-2 text-sm font-semibold">Cancel</button><button onClick={() => void saveTimetable()} disabled={saving || Object.keys(draft).length === 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />{saving ? 'Saving...' : 'Save Timetable'}</button></div></div>}
      </div>
    </div>
  );
}

export default SchedulesTimetable;
