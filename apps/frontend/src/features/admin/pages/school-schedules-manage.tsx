import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Download, MoreVertical, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import BulkEntityImportModal from './components/bulk-entity-import-modal';

type Ref = { _id: string; title?: string; name?: string; section?: string };
type Teacher = { _id: string; teacherId?: string; profile?: { firstName?: string; lastName?: string }; user?: { email?: string } };
type Course = { _id: string; courseCode?: string; title: { en: string }; teacher?: Teacher | null; class?: Ref | null };
type Schedule = {
  _id: string;
  class: Ref;
  course: Course;
  teacher?: Teacher | null;
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

function ActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
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
    <button ref={buttonRef} onClick={() => setOpen(v => !v)} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]" aria-label="Schedule actions"><MoreVertical className="h-4 w-4" /></button>
    {open && rect && createPortal(
      <div ref={menuRef} style={{ position: 'fixed', top: rect.bottom + 4, left: Math.max(8, rect.right - 160), zIndex: 120 }} className="w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-xl">
        <button onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-tertiary)]"><Pencil className="h-4 w-4" /> Edit</button>
        <button onClick={() => { setOpen(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"><Trash2 className="h-4 w-4" /> Delete</button>
      </div>, document.body,
    )}
  </>;
}

function ScheduleModal({
  schedule,
  organizationId,
  classes,
  teachers,
  onClose,
  onSaved,
}: {
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
      const list: Course[] = data.data || [];
      setCourses(list);
      if (keepCourse && !list.some(course => course._id === keepCourse)) {
        try {
          const detail = await api.get(`/courses/${keepCourse}/admin`);
          const item = detail.data.data || detail.data;
          setCourses(current => current.some(course => course._id === item._id) ? current : [...current, item]);
        } catch { /* keep current list */ }
      }
    } catch {
      setCourses([]);
    } finally {
      setLoadingCourses(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (form.classId) loadCourses(form.classId, schedule?.course?._id);
  }, [form.classId, loadCourses, schedule?.course?._id]);

  const changeClass = (classId: string) => {
    setForm(current => ({ ...current, classId, courseId: '', teacherId: '' }));
  };

  const changeCourse = (courseId: string) => {
    const selected = courses.find(course => course._id === courseId);
    setForm(current => ({ ...current, courseId, teacherId: selected?.teacher?._id || '' }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        school: organizationId,
        class: form.classId,
        course: form.courseId,
        teacher: form.teacherId || null,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
        isActive: form.isActive,
      };
      if (schedule) await api.put(`/class-schedules/school/${schedule._id}`, payload);
      else await api.post('/class-schedules/school', payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
        <div><h2 className="text-lg font-bold">{schedule ? 'Edit Class Schedule' : 'Add Class Schedule'}</h2><p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Simple school timetable entry</p></div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]"><X className="h-5 w-5" /></button>
      </div>
      <form onSubmit={submit} className="space-y-4 p-5">
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/20">{error}</div>}
        <label className="block text-xs font-semibold">Class / Section *
          <select required value={form.classId} onChange={e => changeClass(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm">
            <option value="">Select class / section...</option>
            {classes.map(cls => <option key={cls._id} value={cls._id}>{className(cls)}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold">Course / Subject *
          <select required disabled={!form.classId || loadingCourses} value={form.courseId} onChange={e => changeCourse(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm disabled:opacity-50">
            <option value="">{loadingCourses ? 'Loading subjects...' : form.classId ? 'Select course / subject...' : 'Select class first'}</option>
            {courses.map(course => <option key={course._id} value={course._id}>{course.title.en}{course.courseCode ? ` — ${course.courseCode}` : ''}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold">Teacher / Instructor
          <select value={form.teacherId} onChange={e => setForm(current => ({ ...current, teacherId: e.target.value }))} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm">
            <option value="">Unassigned — assign later</option>
            {teachers.map(teacher => <option key={teacher._id} value={teacher._id}>{teacherName(teacher)}</option>)}
          </select>
          <span className="mt-1 block text-[11px] font-normal text-[var(--color-text-tertiary)]">If the subject already has a teacher, it is selected automatically. Unassigned is allowed.</span>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold">Day *
            <select value={form.dayOfWeek} onChange={e => setForm(current => ({ ...current, dayOfWeek: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm">
              {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <div>
            <span className="block text-xs font-semibold">Time *</span>
            <div className="mt-1 flex items-center gap-2">
              <input required type="time" value={form.startTime} onChange={e => setForm(current => ({ ...current, startTime: e.target.value }))} className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" />
              <span className="text-xs text-[var(--color-text-tertiary)]">to</span>
              <input required type="time" value={form.endTime} onChange={e => setForm(current => ({ ...current, endTime: e.target.value }))} className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" />
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => setForm(current => ({ ...current, isActive: e.target.checked }))} /> Active schedule</label>
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
  const [menuOpen, setMenuOpen] = useState(false);

  const loadReferences = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [classRes, teacherRes] = await Promise.all([
        api.get('/classes', { params: { schoolId: organizationId, status: 'active', limit: 500 } }),
        api.get('/teachers', { params: { school: organizationId, status: 'active', limit: 500 } }),
      ]);
      setClasses(classRes.data.data || []);
      setTeachers(teacherRes.data.data || []);
    } catch {
      setClasses([]);
      setTeachers([]);
    }
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/class-schedules', { params: { school: organizationId, limit: 100 } });
      setSchedules(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load class schedules');
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { loadReferences(); load(); }, [loadReferences, load]);

  const filtered = useMemo(() => schedules.filter(schedule => {
    const q = search.trim().toLowerCase();
    const searchable = `${className(schedule.class)} ${schedule.course?.title?.en || ''} ${schedule.course?.courseCode || ''} ${teacherName(schedule.teacher)} ${DAYS[schedule.dayOfWeek]}`.toLowerCase();
    return (!q || searchable.includes(q))
      && (!classFilter || schedule.class?._id === classFilter)
      && (!teacherFilter || schedule.teacher?._id === teacherFilter)
      && (!dayFilter || String(schedule.dayOfWeek) === dayFilter);
  }), [schedules, search, classFilter, teacherFilter, dayFilter]);

  const remove = async (schedule: Schedule) => {
    if (!window.confirm(`Delete ${schedule.course?.title?.en || 'this'} schedule?`)) return;
    try { await api.delete(`/class-schedules/${schedule._id}`); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Delete failed'); }
  };

  const exportSchedules = async () => {
    try {
      const response = await api.get('/class-schedules/school/export', { params: { school: organizationId }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `school-class-schedules-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { setError(err.response?.data?.message || 'Export failed'); }
  };

  return <div className="space-y-4 p-4 sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-xl font-bold"><CalendarDays className="h-5 w-5 text-primary-600" /> Class Schedules</h1><p className="mt-1 text-sm text-[var(--color-text-secondary)]">{schedules.length} schedule{schedules.length === 1 ? '' : 's'} · School timetable</p></div>
      <div className="relative"><button onClick={() => setMenuOpen(v => !v)} className="rounded-xl border border-[var(--color-border-default)] p-2.5 hover:bg-[var(--color-surface-tertiary)]" aria-label="Schedule actions"><MoreVertical className="h-5 w-5" /></button>{menuOpen && <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-xl"><button onClick={() => { setModal('new'); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-tertiary)]"><Plus className="h-4 w-4" /> Add Schedule</button><button onClick={() => { setShowImport(true); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-tertiary)]"><Upload className="h-4 w-4" /> Import Schedules</button><button onClick={() => { exportSchedules(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-tertiary)]"><Download className="h-4 w-4" /> Export Schedules</button></div>}</div>
    </div>

    {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/20">{error}</div>}

    <div className="grid grid-cols-1 gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subject, class, teacher..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent py-2.5 pl-9 pr-3 text-sm" /></div>
      <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">All classes</option>{classes.map(cls => <option key={cls._id} value={cls._id}>{className(cls)}</option>)}</select>
      <select value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">All teachers</option>{teachers.map(teacher => <option key={teacher._id} value={teacher._id}>{teacherName(teacher)}</option>)}</select>
      <select value={dayFilter} onChange={e => setDayFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">All days</option>{DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select>
    </div>

    {loading ? <div className="rounded-2xl border border-[var(--color-border-default)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading schedules...</div> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-10 text-center"><CalendarDays className="mx-auto mb-2 h-8 w-8 text-[var(--color-text-tertiary)]" /><p className="font-medium">No schedules found</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Add a schedule or adjust the filters.</p></div> : <>
      <div className="hidden overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] md:block">
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-xs uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Class / Section</th><th className="px-4 py-3">Course / Subject</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Day</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{filtered.map(schedule => <tr key={schedule._id} className="hover:bg-[var(--color-surface-secondary)]"><td className="px-4 py-3 font-medium">{className(schedule.class)}</td><td className="px-4 py-3"><span className="font-medium">{schedule.course?.title?.en || '—'}</span>{schedule.course?.courseCode && <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">{schedule.course.courseCode}</span>}</td><td className="px-4 py-3">{teacherName(schedule.teacher)}</td><td className="px-4 py-3">{DAYS[schedule.dayOfWeek]}</td><td className="px-4 py-3 whitespace-nowrap">{schedule.startTime} – {schedule.endTime}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${schedule.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{schedule.isActive ? 'Active' : 'Inactive'}</span></td><td className="px-4 py-3 text-right"><ActionsMenu onEdit={() => setModal(schedule)} onDelete={() => remove(schedule)} /></td></tr>)}</tbody></table></div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:hidden">{filtered.map(schedule => <div key={schedule._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-bold">{className(schedule.class)}</p><p className="mt-1 text-sm font-medium text-primary-600">{schedule.course?.title?.en || '—'}</p></div><ActionsMenu onEdit={() => setModal(schedule)} onDelete={() => remove(schedule)} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-[var(--color-surface-tertiary)] p-2"><span className="text-[var(--color-text-tertiary)]">Teacher</span><p className="mt-0.5 font-medium">{teacherName(schedule.teacher)}</p></div><div className="rounded-lg bg-[var(--color-surface-tertiary)] p-2"><span className="text-[var(--color-text-tertiary)]">Day / Time</span><p className="mt-0.5 font-medium">{DAYS[schedule.dayOfWeek]} · {schedule.startTime}–{schedule.endTime}</p></div></div></div>)}</div>
    </>}

    {modal && <ScheduleModal schedule={modal === 'new' ? undefined : modal} organizationId={organizationId} classes={classes} teachers={teachers} onClose={() => setModal(null)} onSaved={load} />}
    {showImport && <BulkEntityImportModal title="Import Class Schedules" description="School schedule template, import and export use the same simple columns. Teacher can be blank for Unassigned." templateUrl="/class-schedules/school/template" importUrl="/class-schedules/school/import" templateName="school-class-schedules-template.xlsx" headers={IMPORT_HEADERS} onClose={() => setShowImport(false)} onImported={load} />}
  </div>;
}

export default SchoolSchedulesManage;
