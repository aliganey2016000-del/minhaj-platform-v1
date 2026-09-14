import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Download, MoreVertical, Pencil, Plus, Search, Settings, Trash2, Upload, X } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import BulkEntityImportModal from './components/bulk-entity-import-modal';

type Ref = { _id: string; title?: string; name?: string; section?: string; room?: string };
type Teacher = { _id: string; teacherId?: string; profile?: { firstName?: string; lastName?: string }; user?: { email?: string } };
type Course = { _id: string; courseCode?: string; title: { en: string }; teacher?: Teacher | null; class?: Ref | null; status?: string };
type Schedule = {
  _id: string;
  class: Ref;
  course: Course;
  teacher?: Teacher | null;
  room?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const IMPORT_HEADERS = ['Class / Section', 'Course / Subject', 'Teacher / Instructor', 'Day', 'Time', 'Status'];

const teacherName = (teacher?: Teacher | null) => {
  if (!teacher) return 'Unassigned';
  const full = `${teacher.profile?.firstName || ''} ${teacher.profile?.lastName || ''}`.trim();
  return full || teacher.teacherId || teacher.user?.email || 'Teacher';
};

const className = (cls?: Ref | null) => cls ? `${cls.title || cls.name || ''}${cls.section ? ` (${cls.section})` : ''}`.trim() : '—';

type PeriodRow = { label: string; startTime: string; endTime: string; isBreak: boolean };
const plusMinutes = (time: string, minutes: number) => {
  const [hours, mins] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, (hours || 0) * 60 + (mins || 0) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function PeriodSettingsModal({ organizationId, onClose }: { organizationId: string; onClose: () => void }) {
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/class-schedules/school/period-settings', { params: { school: organizationId } })
      .then(({ data }) => setPeriods(data.data?.periods || []))
      .catch((err) => setError(err.response?.data?.message || 'Could not load period settings'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const update = (index: number, patch: Partial<PeriodRow>) => setPeriods(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const add = () => {
    const previous = periods[periods.length - 1];
    const startTime = previous?.endTime || '08:00';
    setPeriods(current => [...current, { label: `Period ${current.filter(row => !row.isBreak).length + 1}`, startTime, endTime: plusMinutes(startTime, 45), isBreak: false }]);
  };
  const save = async () => {
    setSaving(true); setError('');
    try {
      await api.put('/class-schedules/school/period-settings', { school: organizationId, periods });
      onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Could not save period settings'); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm" onClick={onClose}><div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl" onClick={event => event.stopPropagation()}>
    <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-4 py-4 sm:px-6"><div><h2 className="flex items-center gap-2 text-lg font-bold"><Settings className="h-5 w-5 text-primary-600" />Timetable Period Settings</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Define lesson periods and breaks. These rows build the Class Timetable.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]"><X className="h-5 w-5" /></button></div>
    <div className="space-y-4 p-4 sm:p-6">{error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}{loading ? <p className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading settings...</p> : <>
      <div className="space-y-3">{periods.map((period, index) => <div key={index} className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(130px,1fr)_130px_130px_auto_auto] sm:items-end ${period.isBreak ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-[var(--color-border-default)]'}`}>
        <label className="text-xs font-semibold">Name<input value={period.label} onChange={event => update(index, { label: event.target.value })} placeholder={period.isBreak ? 'Break' : `Period ${index + 1}`} className="mt-1 w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold">Start<input type="time" value={period.startTime} onChange={event => update(index, { startTime: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold">End<input type="time" value={period.endTime} onChange={event => update(index, { endTime: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" /></label>
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 text-xs font-semibold"><input type="checkbox" checked={period.isBreak} onChange={event => update(index, { isBreak: event.target.checked, label: event.target.checked && /^Period /i.test(period.label) ? 'Break' : period.label })} />Break</label>
        <button type="button" onClick={() => setPeriods(current => current.filter((_, rowIndex) => rowIndex !== index))} disabled={periods.length === 1} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">Remove</button>
      </div>)}</div>
      <button type="button" onClick={add} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-primary-400 px-4 py-2.5 text-sm font-semibold text-primary-700"><Plus className="h-4 w-4" />Add Period or Break</button>
      <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border-subtle)] pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-xl border border-[var(--color-border-default)] px-5 py-2.5 text-sm font-semibold">Cancel</button><button type="button" onClick={() => void save()} disabled={saving || !periods.length} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Period Settings'}</button></div>
    </>}</div>
  </div></div>;
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node) || buttonRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const rect = buttonRef.current?.getBoundingClientRect();
  return <>
    <button ref={buttonRef} type="button" onClick={() => setOpen(value => !value)} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]" aria-label="Schedule actions"><MoreVertical className="h-4 w-4" /></button>
    {open && rect && createPortal(<div ref={menuRef} style={{ position: 'fixed', top: rect.bottom + 4, left: Math.max(8, rect.right - 160), zIndex: 120 }} className="w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-xl">
      <button type="button" onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-tertiary)]"><Pencil className="h-4 w-4" />Edit</button>
      <button type="button" onClick={() => { setOpen(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"><Trash2 className="h-4 w-4" />Delete</button>
    </div>, document.body)}
  </>;
}

function ScheduleModal({ schedule, organizationId, classes, teachers, onClose, onSaved }: {
  schedule?: Schedule;
  organizationId: string;
  classes: Ref[];
  teachers: Teacher[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    classId: schedule?.class?._id || '',
    courseId: schedule?.course?._id || '',
    teacherId: schedule?.teacher?._id || '',
    dayOfWeek: schedule?.dayOfWeek ?? 0,
    startTime: schedule?.startTime || '08:00',
    endTime: schedule?.endTime || '08:45',
    isActive: schedule?.isActive ?? true,
  });

  const loadCourses = useCallback(async (classId: string, keepCourse?: string) => {
    if (!classId) { setCourses([]); return; }
    setLoadingCourses(true);
    try {
      const { data } = await api.get('/courses/admin', { params: { school: organizationId, classId, limit: 300 } });
      const list: Course[] = (data.data || []).filter((course: Course) => course.status !== 'archived');
      setCourses(list);
      if (keepCourse && !list.some(course => course._id === keepCourse)) {
        try {
          const detail = await api.get(`/courses/${keepCourse}/admin`);
          const item = detail.data.data || detail.data;
          setCourses(current => current.some(course => course._id === item._id) ? current : [...current, item]);
        } catch { /* current list is still usable */ }
      }
    } catch {
      setCourses([]);
    } finally {
      setLoadingCourses(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (form.classId) void loadCourses(form.classId, schedule?.course?._id);
  }, [form.classId, loadCourses, schedule?.course?._id]);

  const changeClass = (classId: string) => setForm(current => ({ ...current, classId, courseId: '', teacherId: '' }));
  const changeCourse = (courseId: string) => {
    const selected = courses.find(course => course._id === courseId);
    setForm(current => ({ ...current, courseId, teacherId: selected?.teacher?._id || '' }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const selectedClass = classes.find(cls => cls._id === form.classId);
      const payload = { school: organizationId, class: form.classId, course: form.courseId, teacher: form.teacherId || null, room: selectedClass?.room || '', dayOfWeek: Number(form.dayOfWeek), startTime: form.startTime, endTime: form.endTime, isActive: form.isActive };
      if (schedule) await api.put(`/class-schedules/school/${schedule._id}`, payload);
      else await api.post('/class-schedules/school', payload);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save schedule');
    } finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4"><div><h2 className="text-lg font-bold">{schedule ? 'Edit Class Schedule' : 'Add Schedule'}</h2><p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Teacher may stay Unassigned. Class, teacher and room conflicts are checked on save.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]"><X className="h-5 w-5" /></button></div>
      <form onSubmit={submit} className="space-y-4 p-5">
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/20">{error}</div>}
        <label className="block text-xs font-semibold">Class / Section *<select required value={form.classId} onChange={event => changeClass(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">Select class / section...</option>{classes.map(cls => <option key={cls._id} value={cls._id}>{className(cls)}</option>)}</select></label>
        <label className="block text-xs font-semibold">Course / Subject *<select required disabled={!form.classId || loadingCourses} value={form.courseId} onChange={event => changeCourse(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm disabled:opacity-50"><option value="">{loadingCourses ? 'Loading subjects...' : form.classId ? 'Select course / subject...' : 'Select class first'}</option>{courses.map(course => <option key={course._id} value={course._id}>{course.title.en}{course.courseCode ? ` — ${course.courseCode}` : ''}{course.status ? ` (${course.status})` : ''}</option>)}</select></label>
        <label className="block text-xs font-semibold">Teacher / Instructor<select value={form.teacherId} onChange={event => setForm(current => ({ ...current, teacherId: event.target.value }))} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">Unassigned — assign later</option>{teachers.map(teacher => <option key={teacher._id} value={teacher._id}>{teacherName(teacher)}</option>)}</select></label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">Day *<select value={form.dayOfWeek} onChange={event => setForm(current => ({ ...current, dayOfWeek: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm">{DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><div><span className="block text-xs font-semibold">Time *</span><div className="mt-1 flex items-center gap-2"><input required type="time" value={form.startTime} onChange={event => setForm(current => ({ ...current, startTime: event.target.value }))} className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" /><span className="text-xs text-[var(--color-text-tertiary)]">to</span><input required type="time" value={form.endTime} onChange={event => setForm(current => ({ ...current, endTime: event.target.value }))} className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" /></div></div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} />Active schedule</label>
        <div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm">Cancel</button><button disabled={saving} className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : schedule ? 'Update Schedule' : 'Create Schedule'}</button></div>
      </form>
    </div>
  </div>;
}

export function SchoolSchedulesManage() {
  const { user } = useAuth();
  const organizationId = user?.organizationId || (user as any)?.schoolId || '';
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [classes, setClasses] = useState<Ref[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [modal, setModal] = useState<Schedule | 'new' | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showPeriodSettings, setShowPeriodSettings] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const loadReferences = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [classRes, teacherRes] = await Promise.all([
        api.get('/classes', { params: { schoolId: organizationId, status: 'active', limit: 200 } }),
        api.get('/teachers', { params: { school: organizationId, status: 'active', limit: 500 } }),
      ]);
      setClasses(classRes.data.data || []);
      setTeachers(teacherRes.data.data || []);
    } catch {
      setClasses([]); setTeachers([]);
    }
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError('');
    try {
      const limit = 100;
      const first = await api.get('/class-schedules', { params: { school: organizationId, page: 1, limit } });
      const firstItems: Schedule[] = first.data.data || [];
      const total = Number(first.data.meta?.total || firstItems.length);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const rest = totalPages > 1
        ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => api.get('/class-schedules', { params: { school: organizationId, page: index + 2, limit } })))
        : [];
      const all = [firstItems, ...rest.map(response => response.data.data || [])].flat();
      setSchedules(Array.from(new Map(all.map(item => [item._id, item])).values()));
      setSelected(new Set());
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load class schedules');
      setSchedules([]);
      setSelected(new Set());
    } finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void loadReferences(); void load(); }, [loadReferences, load]);
  useEffect(() => { setSelected(new Set()); }, [search, classFilter, teacherFilter, dayFilter]);

  const filtered = useMemo(() => schedules.filter(schedule => {
    const q = search.trim().toLowerCase();
    const searchable = `${className(schedule.class)} ${schedule.course?.title?.en || ''} ${schedule.course?.courseCode || ''} ${teacherName(schedule.teacher)} ${DAYS[schedule.dayOfWeek]} ${schedule.room || schedule.class?.room || ''}`.toLowerCase();
    return (!q || searchable.includes(q)) && (!classFilter || schedule.class?._id === classFilter) && (!teacherFilter || schedule.teacher?._id === teacherFilter) && (!dayFilter || String(schedule.dayOfWeek) === dayFilter);
  }), [schedules, search, classFilter, teacherFilter, dayFilter]);

  const selectedVisibleCount = filtered.reduce((count, schedule) => count + (selected.has(schedule._id) ? 1 : 0), 0);
  const allFilteredSelected = filtered.length > 0 && selectedVisibleCount === filtered.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedVisibleCount > 0 && !allFilteredSelected;
  }, [selectedVisibleCount, allFilteredSelected]);

  const toggleSelectAll = () => {
    setSelected(current => {
      const next = new Set(current);
      if (allFilteredSelected) filtered.forEach(schedule => next.delete(schedule._id));
      else filtered.forEach(schedule => next.add(schedule._id));
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const remove = async (schedule: Schedule) => {
    if (!window.confirm(`Delete ${schedule.course?.title?.en || 'this'} schedule?`)) return;
    try { await api.delete(`/class-schedules/${schedule._id}`); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Delete failed'); }
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected schedule${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBulkDeleting(true); setError(''); setMenuOpen(false);
    try {
      await api.post('/class-schedules/bulk-delete', { ids });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const deleteAllSchedules = async () => {
    if (schedules.length === 0) return;
    const confirmed = window.confirm(`Delete ALL class schedules for this school?\n\nThis removes every timetable lesson, including schedules not currently visible because of filters. Period & Break Settings, classes, courses and teachers are NOT deleted.\n\nThis cannot be undone.`);
    if (!confirmed) return;
    setBulkDeleting(true); setError(''); setMenuOpen(false);
    try {
      await api.post('/class-schedules/bulk-delete', {
        selectAllMatching: true,
        filters: { school: organizationId },
      });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Delete all schedules failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const exportSchedules = async () => {
    setMenuOpen(false);
    try {
      const response = await api.get('/class-schedules/school/export', { params: { school: organizationId }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url; link.download = `school-class-schedules-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click(); URL.revokeObjectURL(url);
    } catch (err: any) { setError(err.response?.data?.message || 'Export failed'); }
  };

  return <div className="space-y-4 p-4 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-bold"><CalendarDays className="h-5 w-5 text-emerald-600" />Class Schedules</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Build, validate and publish the weekly school timetable.</p></div><div className="relative"><button type="button" onClick={() => setMenuOpen(value => !value)} className="rounded-xl border border-[var(--color-border-default)] p-2.5 hover:bg-[var(--color-surface-tertiary)]" aria-label="Schedule page actions"><MoreVertical className="h-5 w-5" /></button>{menuOpen && <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-xl">
      <button type="button" onClick={() => { setMenuOpen(false); setModal('new'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)]"><Plus className="h-4 w-4" />Add Schedule</button>
      <button type="button" onClick={() => { setMenuOpen(false); setShowImport(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[var(--color-surface-tertiary)]"><Upload className="h-4 w-4" />Import Schedules</button>
      <button type="button" onClick={() => void exportSchedules()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[var(--color-surface-tertiary)]"><Download className="h-4 w-4" />Export Schedules</button>
      <div className="my-1 border-t border-[var(--color-border-subtle)]" />
      <button type="button" onClick={() => { setMenuOpen(false); setShowPeriodSettings(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[var(--color-surface-tertiary)]"><Settings className="h-4 w-4" />Period &amp; Break Settings</button>
      <div className="my-1 border-t border-[var(--color-border-subtle)]" />
      <button type="button" onClick={() => void deleteSelected()} disabled={selected.size === 0 || bulkDeleting} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/20"><Trash2 className="h-4 w-4" />Delete Selected{selected.size > 0 ? ` (${selected.size})` : ''}</button>
      <button type="button" onClick={() => void deleteAllSchedules()} disabled={schedules.length === 0 || bulkDeleting} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950/20"><Trash2 className="h-4 w-4" />{bulkDeleting ? 'Deleting...' : 'Delete All Schedules'}</button>
    </div>}</div></div>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{error}</div>}

    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><div className="text-2xl font-bold text-[var(--color-text-primary)]">{schedules.filter(item => item.isActive).length}</div><div className="text-xs text-[var(--color-text-tertiary)]">Active lessons</div></div><div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><div className="text-2xl font-bold text-[var(--color-text-primary)]">{new Set(schedules.map(item => item.class?._id).filter(Boolean)).size}</div><div className="text-xs text-[var(--color-text-tertiary)]">Classes scheduled</div></div><div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><div className="text-2xl font-bold text-amber-600 dark:text-amber-300">{schedules.filter(item => !item.teacher).length}</div><div className="text-xs text-[var(--color-text-tertiary)]">Unassigned teacher slots</div></div></div>

    <div className="grid gap-2 sm:grid-cols-4"><div className="relative sm:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search class, subject, teacher, day, room..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent py-2.5 pl-9 pr-3 text-sm" /></div><select value={classFilter} onChange={event => setClassFilter(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">All classes</option>{classes.map(cls => <option key={cls._id} value={cls._id}>{className(cls)}</option>)}</select><select value={dayFilter} onChange={event => setDayFilter(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">All days</option>{DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div>
    <select value={teacherFilter} onChange={event => setTeacherFilter(event.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm sm:max-w-sm"><option value="">All teachers</option>{teachers.map(teacher => <option key={teacher._id} value={teacher._id}>{teacherName(teacher)}</option>)}</select>

    {selected.size > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2 text-xs font-semibold text-primary-800 dark:border-primary-900/50 dark:bg-primary-950/20 dark:text-primary-200"><span>{selected.size} schedule{selected.size === 1 ? '' : 's'} selected</span><button type="button" onClick={() => void deleteSelected()} disabled={bulkDeleting} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Delete Selected</button></div>}

    <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]"><div className="overflow-x-auto"><table className="min-w-[940px] w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-xs text-[var(--color-text-tertiary)]"><tr><th className="w-12 px-4 py-3 text-center"><input ref={selectAllRef} type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} disabled={filtered.length === 0 || loading} className="h-4 w-4 rounded border-[var(--color-border-default)] accent-emerald-600" aria-label="Select all visible schedules" title="Select all" /></th><th className="px-4 py-3">Class / Section</th><th className="px-4 py-3">Course / Subject</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Day</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Room</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{loading ? <tr><td colSpan={9} className="px-4 py-12 text-center text-[var(--color-text-tertiary)]">Loading schedules...</td></tr> : filtered.length === 0 ? <tr><td colSpan={9} className="px-4 py-12 text-center text-[var(--color-text-tertiary)]">No schedules found.</td></tr> : filtered.map(schedule => <tr key={schedule._id} className={`hover:bg-[var(--color-surface-secondary)] ${selected.has(schedule._id) ? 'bg-primary-50/50 dark:bg-primary-950/10' : ''}`}><td className="px-4 py-3 text-center"><input type="checkbox" checked={selected.has(schedule._id)} onChange={() => toggleSelected(schedule._id)} className="h-4 w-4 rounded border-[var(--color-border-default)] accent-emerald-600" aria-label={`Select ${schedule.course?.title?.en || 'schedule'}`} /></td><td className="px-4 py-3 font-semibold text-[var(--color-text-primary)]">{className(schedule.class)}</td><td className="px-4 py-3"><div className="font-medium text-[var(--color-text-primary)]">{schedule.course?.title?.en || 'Course'}</div>{schedule.course?.courseCode && <div className="text-[10px] text-[var(--color-text-tertiary)]">{schedule.course.courseCode}</div>}</td><td className="px-4 py-3"><span className={schedule.teacher ? 'text-[var(--color-text-primary)]' : 'font-medium text-amber-600 dark:text-amber-300'}>{teacherName(schedule.teacher)}</span></td><td className="px-4 py-3 text-[var(--color-text-primary)]">{DAYS[schedule.dayOfWeek] || '—'}</td><td className="px-4 py-3 text-[var(--color-text-primary)]">{schedule.startTime}–{schedule.endTime}</td><td className="px-4 py-3 text-[var(--color-text-primary)]">{schedule.room || schedule.class?.room || '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${schedule.isActive ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{schedule.isActive ? 'Active' : 'Inactive'}</span></td><td className="px-4 py-3 text-right"><RowActions onEdit={() => setModal(schedule)} onDelete={() => void remove(schedule)} /></td></tr>)}</tbody></table></div></div>

    {modal && <ScheduleModal schedule={modal === 'new' ? undefined : modal} organizationId={organizationId} classes={classes} teachers={teachers} onClose={() => setModal(null)} onSaved={() => void load()} />}
    {showImport && <BulkEntityImportModal title="Import Class Schedules" description="School schedule template, import and export use the same simple columns. Teacher can be blank for Unassigned." templateUrl="/class-schedules/school/template" importUrl="/class-schedules/school/import" templateName="school-class-schedules-template.xlsx" headers={IMPORT_HEADERS} onClose={() => setShowImport(false)} onImported={() => void load()} />}
    {showPeriodSettings && <PeriodSettingsModal organizationId={organizationId} onClose={() => setShowPeriodSettings(false)} />}
  </div>;
}

export default SchoolSchedulesManage;
