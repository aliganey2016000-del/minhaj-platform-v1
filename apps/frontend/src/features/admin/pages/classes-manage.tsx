import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BookOpen, CheckCircle2, Download, FileSpreadsheet, GraduationCap, MoreVertical, Pencil, Plus, RefreshCw, Search, Trash2, Upload, Users, X } from 'lucide-react';
import api from '../../../lib/axios';

interface Organization { _id: string; name: string; organizationType?: string; }
interface Faculty { _id: string; name: string; code?: string; }
interface Department { _id: string; name: string; code?: string; facultyId?: string | Faculty | null; }
interface ClassItem {
  _id: string;
  title: string;
  section?: string;
  room: string;
  department?: string;
  departmentId?: string;
  shiftMode?: 'Morning' | 'Afternoon' | 'Evening' | 'Virtual';
  school?: { _id: string; name: string };
  status: 'active' | 'inactive' | 'completed';
  batch?: string;
  gradeLevel?: number;
  academicYear?: string;
  isGraduatingGrade?: boolean;
  isEntryGrade?: boolean;
  promotedAt?: string;
  createdAt?: string;
}

interface ClassForm {
  faculty: string;
  department: string;
  title: string;
  section: string;
  room: string;
  shiftMode: 'Morning' | 'Afternoon' | 'Evening' | 'Virtual';
  batch: string;
  gradeLevel: string;
  academicYear: string;
  isGraduatingGrade: boolean;
  isEntryGrade: boolean;
}

const academicYears = Array.from({ length: 7 }, (_, i) => {
  const y = new Date().getFullYear() - 3 + i;
  return `${y}-${y + 1}`;
});

function defaultForm(): ClassForm {
  const y = new Date().getFullYear();
  return {
    faculty: '', department: '', title: '', section: '', room: '', shiftMode: 'Morning', batch: '',
    gradeLevel: '', academicYear: `${y}-${y + 1}`, isGraduatingGrade: false, isEntryGrade: false,
  };
}

function responseData<T>(response: any): T {
  return response?.data?.data ?? response?.data ?? response;
}

function errorMessage(error: any) {
  return error?.response?.data?.message || error?.message || 'Something went wrong. Please try again.';
}

function facultyIdOf(department: Department) {
  return typeof department.facultyId === 'string' ? department.facultyId : department.facultyId?._id || '';
}

function organizationTypeLabel(type?: string) {
  return type === 'university' ? 'University' : 'School';
}

function Field({ label, required, children, className = '' }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  );
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-800';

function ClassModal({
  cls, organization, faculties, departments, onClose, onSaved,
}: {
  cls?: ClassItem;
  organization: Organization | null;
  faculties: Faculty[];
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isUniversity = organization?.organizationType === 'university';
  const [form, setForm] = useState<ClassForm>(() => {
    const initial = defaultForm();
    if (cls) {
      initial.department = cls.departmentId || '';
      initial.title = cls.title || '';
      initial.section = cls.section || '';
      initial.room = cls.room || '';
      initial.shiftMode = cls.shiftMode || 'Morning';
      initial.batch = cls.batch || '';
      initial.gradeLevel = cls.gradeLevel == null ? '' : String(cls.gradeLevel);
      initial.academicYear = cls.academicYear || initial.academicYear;
      initial.isGraduatingGrade = !!cls.isGraduatingGrade;
      initial.isEntryGrade = !!cls.isEntryGrade;
      const dept = departments.find((d) => d._id === initial.department);
      initial.faculty = dept ? facultyIdOf(dept) : '';
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const availableDepartments = useMemo(() => {
    if (!isUniversity || !form.faculty) return isUniversity ? [] : departments;
    return departments.filter((d) => facultyIdOf(d) === form.faculty);
  }, [departments, form.faculty, isUniversity]);

  useEffect(() => {
    if (isUniversity && form.department && !availableDepartments.some((d) => d._id === form.department)) {
      setForm((current) => ({ ...current, department: '' }));
    }
  }, [availableDepartments, form.department, isUniversity]);

  const set = <K extends keyof ClassForm>(key: K, value: ClassForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.department) return setError('Department is required.');
    if (!form.title.trim()) return setError(isUniversity ? 'Program / Cohort Name is required.' : 'Class Name is required.');
    if (!form.room.trim()) return setError('Room is required.');
    if (!form.academicYear) return setError('Academic Year is required.');
    if (!isUniversity && (!form.batch.trim() || !form.gradeLevel)) return setError('Batch Number and Grade Level are required for schools.');

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        department: form.department,
        title: form.title.trim(),
        section: form.section.trim(),
        room: form.room.trim(),
        shiftMode: form.shiftMode,
        academicYear: form.academicYear,
      };
      if (!isUniversity) {
        payload.batch = form.batch.trim();
        payload.gradeLevel = Number(form.gradeLevel);
        payload.isGraduatingGrade = form.isGraduatingGrade;
        payload.isEntryGrade = form.isEntryGrade;
      }
      if (cls?._id) await api.patch(`/classes/${cls._id}`, payload);
      else await api.post('/classes', payload);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl dark:bg-slate-950">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">{cls ? 'Edit Class' : isUniversity ? 'Add Academic Class' : 'Add Class'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{organizationTypeLabel(organization?.organizationType)} structure</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

          {isUniversity ? (
            <>
              <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="mb-3 flex items-center gap-2"><GraduationCap size={17} className="text-slate-600 dark:text-slate-300" /><span className="text-sm font-semibold text-slate-900 dark:text-white">University hierarchy</span></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Faculty" required>
                    <select className={inputClass} value={form.faculty} onChange={(e) => setForm((c) => ({ ...c, faculty: e.target.value, department: '' }))}>
                      <option value="">Select Faculty</option>
                      {faculties.map((f) => <option key={f._id} value={f._id}>{f.name}{f.code ? ` (${f.code})` : ''}</option>)}
                    </select>
                  </Field>
                  <Field label="Department" required>
                    <select className={inputClass} value={form.department} onChange={(e) => set('department', e.target.value)} disabled={!form.faculty}>
                      <option value="">{form.faculty ? 'Select Department' : 'Select Faculty first'}</option>
                      {availableDepartments.map((d) => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}
                    </select>
                  </Field>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Faculty iyo Department waxaa laga soo qaadanayaa Institution Structure.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Program / Cohort Name" required className="sm:col-span-2">
                  <input className={inputClass} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. BSc Computer Science - Cohort 2026" />
                </Field>
                <Field label="Academic Year" required>
                  <select className={inputClass} value={form.academicYear} onChange={(e) => set('academicYear', e.target.value)}>{academicYears.map((y) => <option key={y}>{y}</option>)}</select>
                </Field>
                <Field label="Section"><input className={inputClass} value={form.section} onChange={(e) => set('section', e.target.value)} placeholder="e.g. A" /></Field>
                <Field label="Room" required><input className={inputClass} value={form.room} onChange={(e) => set('room', e.target.value)} placeholder="e.g. Hall 204" /></Field>
                <Field label="Shift / Learning Mode">
                  <select className={inputClass} value={form.shiftMode} onChange={(e) => set('shiftMode', e.target.value as ClassForm['shiftMode'])}>{['Morning', 'Afternoon', 'Evening', 'Virtual'].map((m) => <option key={m}>{m}</option>)}</select>
                </Field>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Batch Number" required><input className={inputClass} value={form.batch} onChange={(e) => set('batch', e.target.value)} placeholder="e.g. SCH26" /></Field>
              <Field label="Academic Year" required><select className={inputClass} value={form.academicYear} onChange={(e) => set('academicYear', e.target.value)}>{academicYears.map((y) => <option key={y}>{y}</option>)}</select></Field>
              <Field label="Grade Level" required><input type="number" min="0" max="30" className={inputClass} value={form.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)} placeholder="e.g. 8" /></Field>
              <Field label="Department" required><select className={inputClass} value={form.department} onChange={(e) => set('department', e.target.value)}><option value="">Select Department</option>{departments.map((d) => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}</select></Field>
              <Field label="Class Name" required className="sm:col-span-2"><input className={inputClass} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Grade 8" /></Field>
              <Field label="Section"><input className={inputClass} value={form.section} onChange={(e) => set('section', e.target.value)} placeholder="e.g. A" /></Field>
              <Field label="Room" required><input className={inputClass} value={form.room} onChange={(e) => set('room', e.target.value)} placeholder="e.g. Room 8" /></Field>
              <Field label="Shift / Learning Mode"><select className={inputClass} value={form.shiftMode} onChange={(e) => set('shiftMode', e.target.value as ClassForm['shiftMode'])}>{['Morning', 'Afternoon', 'Evening', 'Virtual'].map((m) => <option key={m}>{m}</option>)}</select></Field>
              <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={form.isGraduatingGrade} onChange={(e) => set('isGraduatingGrade', e.target.checked)} /> Final Grade</label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={form.isEntryGrade} onChange={(e) => set('isEntryGrade', e.target.checked)} /> Entry Grade</label>
              </div>
              <p className="text-[11px] leading-5 text-slate-500 sm:col-span-2">Promote All Classes is available for School organizations only. University cohorts do not use school-grade promotion.</p>
            </div>
          )}
        </form>

        <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:justify-end sm:px-6 dark:border-slate-800 dark:bg-slate-950">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:flex-none dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">Cancel</button>
          <button type="submit" form="__class_form_missing" className="hidden" />
          <button type="button" disabled={saving} onClick={() => document.querySelector<HTMLFormElement>('.class-modal-submit')?.requestSubmit()} className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 sm:flex-none dark:bg-white dark:text-slate-900">
            {saving ? 'Saving...' : cls ? 'Save Changes' : 'Add Class'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClassesManage() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClassItem['status']>('all');
  const [modal, setModal] = useState<{ open: boolean; cls?: ClassItem }>({ open: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orgId = organization?._id;
  const isUniversity = organization?.organizationType === 'university';

  const loadMeta = useCallback(async () => {
    const rawUser = JSON.parse(localStorage.getItem('user') || 'null');
    const id = rawUser?.organizationId?._id || rawUser?.organizationId;
    if (!id) return;
    const [orgRes, facultyRes, deptRes] = await Promise.all([
      api.get(`/schools/${id}`),
      api.get(`/faculties?school=${id}`),
      api.get(`/departments?school=${id}`),
    ]);
    setOrganization(responseData<Organization>(orgRes));
    setFaculties(responseData<Faculty[]>(facultyRes) || []);
    setDepartments(responseData<Department[]>(deptRes) || []);
  }, []);

  const loadClasses = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true); else setRefreshing(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await api.get(`/classes?${params.toString()}`);
      setClasses(responseData<ClassItem[]>(res) || []);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { loadMeta().catch((err) => setError(errorMessage(err))); }, [loadMeta]);
  useEffect(() => { loadClasses().catch(() => undefined); }, [loadClasses]);

  const departmentMap = useMemo(() => new Map(departments.map((d) => [d._id, d])), [departments]);
  const filtered = useMemo(() => classes.filter((cls) => {
    if (statusFilter !== 'all' && cls.status !== statusFilter) return false;
    const haystack = `${cls.title} ${cls.section || ''} ${cls.room || ''} ${cls.department || ''} ${cls.academicYear || ''}`.toLowerCase();
    return !search.trim() || haystack.includes(search.trim().toLowerCase());
  }), [classes, search, statusFilter]);

  const toggleSelected = (id: string) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  const removeClass = async (cls: ClassItem) => {
    if (!window.confirm(`Delete ${cls.title}${cls.section ? ` - ${cls.section}` : ''}?`)) return;
    try {
      await api.delete(`/classes/${cls._id}`);
      setSelectedIds((ids) => ids.filter((id) => id !== cls._id));
      await loadClasses(false);
    } catch (err) { setError(errorMessage(err)); }
  };

  const deleteSelected = async () => {
    if (!selectedIds.length || !window.confirm(`Delete ${selectedIds.length} selected class(es)?`)) return;
    try {
      await api.delete('/classes/bulk', { data: { ids: selectedIds } });
      setSelectedIds([]);
      await loadClasses(false);
    } catch (err) { setError(errorMessage(err)); }
  };

  const updateStatus = async (cls: ClassItem) => {
    const next = cls.status === 'active' ? 'inactive' : 'active';
    try { await api.patch(`/classes/${cls._id}/status`, { status: next }); await loadClasses(false); }
    catch (err) { setError(errorMessage(err)); }
  };

  const exportClasses = async () => {
    try {
      const res = await api.get('/classes/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `classes-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(errorMessage(err)); }
  };

  const importClasses = async (file: File) => {
    setImporting(true);
    try {
      const data = new FormData(); data.append('file', file);
      await api.post('/classes/import', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadClasses(false);
    } catch (err) { setError(errorMessage(err)); }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const promoteAll = async () => {
    if (isUniversity) return;
    const targetAcademicYear = window.prompt('Target academic year (e.g. 2027-2028):');
    if (!targetAcademicYear?.trim()) return;
    if (!window.confirm(`Promote all eligible classes to ${targetAcademicYear.trim()}?`)) return;
    try { await api.post('/classes/promote-all', { targetAcademicYear: targetAcademicYear.trim() }); await loadClasses(false); }
    catch (err) { setError(errorMessage(err)); }
  };

  return (
    <div className="min-h-full bg-slate-50 p-3 sm:p-5 lg:p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><BookOpen size={20} className="text-slate-700 dark:text-slate-200" /><h1 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">Manage Classes</h1></div>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{isUniversity ? 'University academic classes and cohorts' : 'School classes, grades and academic batches'}</p>
            {organization && <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"><span>{organization.name}</span><span className="text-slate-400">•</span><span>{organizationTypeLabel(organization.organizationType)}</span></div>}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button type="button" onClick={() => setModal({ open: true })} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 sm:flex-none dark:bg-white dark:text-slate-900"><Plus size={16} /> {isUniversity ? 'Add Academic Class' : 'Add Class'}</button>
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((v) => !v)} className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Class actions"><MoreVertical size={18} /></button>
              {menuOpen && <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <button type="button" onClick={() => { setMenuOpen(false); setModal({ open: true }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><Plus size={15} /> Add Class</button>
                <button type="button" onClick={() => { setMenuOpen(false); exportClasses(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><Download size={15} /> Export Classes to Excel</button>
                <button type="button" onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><Upload size={15} /> Import Classes via Excel</button>
                {!isUniversity && <button type="button" onClick={() => { setMenuOpen(false); promoteAll(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><GraduationCap size={15} /> Promote All Classes</button>}
                {selectedIds.length > 0 && <button type="button" onClick={() => { setMenuOpen(false); deleteSelected(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={15} /> Bulk Delete ({selectedIds.length})</button>}
              </div>}
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && importClasses(e.target.files[0])} />
          </div>
        </div>

        {error && <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] text-slate-500">Total</p><p className="mt-1 text-xl font-bold">{classes.length}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] text-slate-500">Active</p><p className="mt-1 text-xl font-bold">{classes.filter((c) => c.status === 'active').length}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] text-slate-500">Inactive</p><p className="mt-1 text-xl font-bold">{classes.filter((c) => c.status === 'inactive').length}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] text-slate-500">Departments</p><p className="mt-1 text-xl font-bold">{departments.length}</p></div>
        </div>

        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row dark:border-slate-800 dark:bg-slate-900">
          <div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isUniversity ? 'Search program, cohort, department...' : 'Search class, grade, room, department...'} /></div>
          <select className={`${inputClass} sm:w-36`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}><option value="all">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="completed">Completed</option></select>
          <button type="button" onClick={() => loadClasses(false)} className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} /></button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loading ? <div className="flex items-center justify-center py-16 text-sm text-slate-500">Loading classes...</div> : filtered.length === 0 ? <div className="flex flex-col items-center justify-center px-4 py-16 text-center"><Users size={30} className="text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">No classes found</p><p className="mt-1 text-xs text-slate-500">Create the first {isUniversity ? 'academic class / cohort' : 'class'} for this organization.</p></div> : (
            <>
              <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950"><tr><th className="w-10 px-4 py-3"><input type="checkbox" checked={filtered.length > 0 && filtered.every((c) => selectedIds.includes(c._id))} onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((c) => c._id) : [])} /></th><th className="px-4 py-3">{isUniversity ? 'Program / Cohort' : 'Class'}</th><th className="px-4 py-3">Department</th>{isUniversity ? <th className="px-4 py-3">Academic Year</th> : <><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Batch</th></>}<th className="px-4 py-3">Section</th><th className="px-4 py-3">Room</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filtered.map((cls) => { const dept = departmentMap.get(cls.departmentId || ''); return <tr key={cls._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-950/50"><td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(cls._id)} onChange={() => toggleSelected(cls._id)} /></td><td className="px-4 py-3"><div className="font-semibold text-slate-900 dark:text-white">{cls.title}</div><div className="text-xs text-slate-500">{cls.shiftMode || 'Morning'}</div></td><td className="px-4 py-3"><div>{cls.department || dept?.name || '—'}</div>{isUniversity && dept && <div className="text-[11px] text-slate-500">{typeof dept.facultyId === 'object' ? dept.facultyId?.name : ''}</div>}</td>{isUniversity ? <td className="px-4 py-3">{cls.academicYear || '—'}</td> : <><td className="px-4 py-3">{cls.gradeLevel ?? '—'}</td><td className="px-4 py-3">{cls.batch || '—'}</td></>}<td className="px-4 py-3">{cls.section || '—'}</td><td className="px-4 py-3">{cls.room}</td><td className="px-4 py-3"><button onClick={() => updateStatus(cls)} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cls.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : cls.status === 'completed' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}><CheckCircle2 size={12} />{cls.status}</button></td><td className="px-4 py-3"><div className="flex items-center gap-1"><button title="Edit" onClick={() => setModal({ open: true, cls })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil size={15} /></button><button title="Delete" onClick={() => removeClass(cls)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div>
              <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">{filtered.map((cls) => <div key={cls._id} className="p-4"><div className="flex items-start gap-3"><input type="checkbox" checked={selectedIds.includes(cls._id)} onChange={() => toggleSelected(cls._id)} className="mt-1" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="truncate font-semibold text-slate-900 dark:text-white">{cls.title}</h3><p className="mt-0.5 text-xs text-slate-500">{cls.department || 'No department'}{cls.section ? ` • Section ${cls.section}` : ''}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${cls.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{cls.status}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950"><span className="text-slate-500">{isUniversity ? 'Academic Year' : 'Grade'}</span><div className="mt-0.5 font-semibold">{isUniversity ? (cls.academicYear || '—') : (cls.gradeLevel ?? '—')}</div></div><div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950"><span className="text-slate-500">Room</span><div className="mt-0.5 font-semibold">{cls.room}</div></div></div><div className="mt-3 flex gap-2"><button onClick={() => setModal({ open: true, cls })} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-slate-700"><Pencil size={13} className="mr-1 inline" /> Edit</button><button onClick={() => removeClass(cls)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 dark:border-red-900/50"><Trash2 size={13} className="mr-1 inline" /> Delete</button></div></div></div>)}</div>
            </>
          )}
        </div>

        {importing && <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl"><FileSpreadsheet size={16} /> Importing classes...</div>}
      </div>

      {modal.open && <ClassModal cls={modal.cls} organization={organization} faculties={faculties} departments={departments} onClose={() => setModal({ open: false })} onSaved={async () => { setModal({ open: false }); await loadClasses(false); }} />}
    </div>
  );
}
