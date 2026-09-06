import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Pencil, Plus, ShieldCheck, Trash2, UsersRound, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';
import { StaffAttendance } from './staff-attendance';

type Faculty = { _id: string; name: string; code?: string };
type Department = { _id: string; name: string; code?: string; facultyId?: Faculty | null };
type Program = { _id: string; name: string; code?: string; department?: Department | null };
type OnboardingStage = 'not_started' | 'in_progress' | 'ready_to_complete' | 'completed';
type OnboardingStatus = { onboardingCompleted: boolean; stage: OnboardingStage; structureCounts: { faculties: number; departments: number; programs: number; classes: number } };

const STAGE_COPY: Record<OnboardingStage, { label: string; hint: string; tone: string }> = {
  not_started: { label: 'Not started', hint: 'Add at least one Department (and Faculty, if this institution uses one) to get going.', tone: 'bg-slate-100 text-slate-700' },
  in_progress: { label: 'In progress', hint: 'Keep going — a few more pieces of structure and you can mark onboarding complete.', tone: 'bg-amber-100 text-amber-800' },
  ready_to_complete: { label: 'Ready to complete', hint: 'The basics are in place. Mark onboarding complete when you’re ready.', tone: 'bg-primary-100 text-primary-800' },
  completed: { label: 'Completed', hint: 'This organization has finished onboarding.', tone: 'bg-emerald-100 text-emerald-800' },
};

function OnboardingBanner({ organizationId }: { organizationId: string }) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get(`/schools/${organizationId}/onboarding`);
      setStatus(data.data);
    } catch {
      setStatus(null);
    }
  };
  useEffect(() => { load(); }, [organizationId]);

  const complete = async () => {
    setCompleting(true); setError('');
    try {
      await api.patch(`/schools/${organizationId}/complete-onboarding`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to complete onboarding');
    } finally { setCompleting(false); }
  };

  if (!status || status.onboardingCompleted) return null;
  const copy = STAGE_COPY[status.stage];

  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${copy.tone}`}>{copy.label}</span>
          <p className="text-sm text-[var(--color-text-secondary)]">{copy.hint}</p>
        </div>
        {status.stage === 'ready_to_complete' && (
          <button onClick={complete} disabled={completing} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {completing ? 'Completing...' : 'Mark Onboarding Complete'}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const cards = [
  { title: 'Staff Directory', description: 'Create, edit, import and manage staff accounts.', to: '/admin/staff', icon: UserRound },
  { title: 'Staff Attendance', description: 'Mark daily staff attendance: present, absent, late or excused.', to: '/admin/hr?tab=attendance', icon: UsersRound },
  { title: 'Access & Permissions', description: 'Control staff sidebar access and page actions.', to: '/admin/hr/access', icon: ShieldCheck },
  { title: 'Institution Structure', description: 'Manage departments and, where enabled, faculties.', to: '/admin/hr?tab=structure', icon: Building2 },
];

const inputClass = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm';

function InstitutionStructure() {
  const { user } = useAuth();
  const [usesFaculty, setUsesFaculty] = useState(false);
  const [institutionType, setInstitutionType] = useState('school');
  const [structureLoaded, setStructureLoaded] = useState(false);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [editingFaculty, setEditingFaculty] = useState<string | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [departmentFacultyId, setDepartmentFacultyId] = useState('');
  const [editingProgram, setEditingProgram] = useState<string | null>(null);
  const [programName, setProgramName] = useState('');
  const [programCode, setProgramCode] = useState('');
  const [programDepartmentId, setProgramDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'faculty' | 'department' | 'program'>('faculty');
  const schoolQuery = user?.organizationId ? `?school=${encodeURIComponent(user.organizationId)}` : '';
  // Programs are meaningful for College/University (Department → Program →
  // Cohort) and Training Center (top-level, no Department needed) — not for
  // a plain School, which never uses this layer.
  const showPrograms = institutionType !== 'school';

  useEffect(() => {
    let cancelled = false;
    const loadStructureConfig = async () => {
      if (!user?.organizationId) {
        setUsesFaculty(false);
        setStructureLoaded(false);
        return;
      }
      try {
        const [structureRes, schoolRes] = await Promise.all([
          api.get('/classes/academic-structure', { params: { schoolId: user.organizationId } }),
          api.get(`/schools/${user.organizationId}`),
        ]);
        if (!cancelled) {
          setUsesFaculty(!!structureRes.data?.data?.usesFaculty);
          setInstitutionType(schoolRes.data?.data?.institutionType || 'school');
          setStructureLoaded(true);
        }
      } catch (err: any) {
        if (!cancelled) {
          setUsesFaculty(false);
          setStructureLoaded(true);
          setError(err.response?.data?.message || 'Failed to load institution structure settings');
        }
      }
    };
    loadStructureConfig();
    return () => { cancelled = true; };
  }, [user?.organizationId]);

  useEffect(() => {
    if (!usesFaculty && activeTab === 'faculty') setActiveTab(showPrograms ? 'program' : 'department');
  }, [usesFaculty, showPrograms]);

  const load = async () => {
    if (!structureLoaded) return;
    setLoading(true); setError('');
    try {
      const [departmentResponse, facultyResponse, programResponse] = await Promise.all([
        api.get(`/departments${schoolQuery}`),
        usesFaculty ? api.get(`/departments/faculties${schoolQuery}`) : Promise.resolve({ data: { data: [] } }),
        showPrograms ? api.get(`/programs${schoolQuery}`) : Promise.resolve({ data: { data: [] } }),
      ]);
      setDepartments(departmentResponse.data?.data || []);
      setFaculties(facultyResponse.data?.data || []);
      setPrograms(programResponse.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load institution structure');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [structureLoaded, usesFaculty, showPrograms, user?.organizationId]);

  const saveFaculty = async () => {
    if (!name.trim()) return setError('Faculty name is required');
    setSaving(true); setError('');
    try {
      const payload = { name: name.trim(), code: code.trim() || undefined, tenantId: user?.organizationId || undefined };
      if (editingFaculty) await api.patch(`/departments/faculties/${editingFaculty}`, payload);
      else await api.post('/departments/faculties', payload);
      setName(''); setCode(''); setEditingFaculty(null); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save faculty'); }
    finally { setSaving(false); }
  };

  const saveDepartment = async () => {
    if (!departmentName.trim()) return setError('Department name is required');
    if (usesFaculty && !departmentFacultyId) return setError('Select a faculty for this department');
    setSaving(true); setError('');
    try {
      const payload = { name: departmentName.trim(), code: departmentCode.trim() || undefined, facultyId: usesFaculty ? departmentFacultyId : undefined, tenantId: user?.organizationId || undefined };
      if (editingDepartment) await api.patch(`/departments/${editingDepartment}`, payload);
      else await api.post('/departments', payload);
      setDepartmentName(''); setDepartmentCode(''); setDepartmentFacultyId(''); setEditingDepartment(null); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save department'); }
    finally { setSaving(false); }
  };

  const editFaculty = (faculty: Faculty) => { setEditingFaculty(faculty._id); setName(faculty.name); setCode(faculty.code || ''); setError(''); };
  const editDepartment = (department: Department) => { setEditingDepartment(department._id); setDepartmentName(department.name); setDepartmentCode(department.code || ''); setDepartmentFacultyId(department.facultyId?._id || ''); setError(''); };
  const removeFaculty = async (id: string) => { if (!window.confirm('Delete this faculty? Departments must be reassigned first.')) return; try { await api.delete(`/departments/faculties/${id}`); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete faculty'); } };
  const removeDepartment = async (id: string) => { if (!window.confirm('Delete this department? Linked classes must be reassigned first.')) return; try { await api.delete(`/departments/${id}`); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete department'); } };

  const saveProgram = async () => {
    if (!programName.trim()) return setError('Program name is required');
    setSaving(true); setError('');
    try {
      const payload = { name: programName.trim(), code: programCode.trim() || undefined, department: programDepartmentId || undefined, school: user?.organizationId || undefined };
      if (editingProgram) await api.patch(`/programs/${editingProgram}`, payload);
      else await api.post('/programs', payload);
      setProgramName(''); setProgramCode(''); setProgramDepartmentId(''); setEditingProgram(null); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save program'); }
    finally { setSaving(false); }
  };
  const editProgram = (program: Program) => { setEditingProgram(program._id); setProgramName(program.name); setProgramCode(program.code || ''); setProgramDepartmentId(program.department?._id || ''); setError(''); };
  const removeProgram = async (id: string) => { if (!window.confirm('Delete this program? Linked classes/cohorts must be reassigned first.')) return; try { await api.delete(`/programs/${id}`); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete program'); } };

  return <div className="space-y-6 p-4 sm:p-6">
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Institution Structure</p>
      <h1 className="mt-1 text-2xl font-bold">{usesFaculty ? 'Faculty & Department Management' : 'Department Management'}</h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{usesFaculty ? 'This institution uses Institution → Faculty → Department.' : 'This institution uses Institution → Department. Faculties are not used.'}</p>
    </div>
    {user?.organizationId && <OnboardingBanner organizationId={user.organizationId} />}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

    {(usesFaculty || showPrograms) && (
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm">
        <div className={`grid gap-1 ${usesFaculty && showPrograms ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {usesFaculty && <button
            type="button"
            onClick={() => { setActiveTab('faculty'); setError(''); }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeTab === 'faculty' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
          >
            Faculty
          </button>}
          <button
            type="button"
            onClick={() => { setActiveTab('department'); setError(''); }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeTab === 'department' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
          >
            Department
          </button>
          {showPrograms && <button
            type="button"
            onClick={() => { setActiveTab('program'); setError(''); }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeTab === 'program' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
          >
            Program
          </button>}
        </div>
      </div>
    )}

    {activeTab === 'faculty' && usesFaculty && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Faculties</h2><p className="text-xs text-[var(--color-text-tertiary)]">University faculties only.</p></div><Building2 className="h-5 w-5 text-[var(--color-text-tertiary)]" /></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <input className={inputClass} placeholder="Faculty name" value={name} onChange={e => setName(e.target.value)} />
        <input className={inputClass} placeholder="Code" value={code} onChange={e => setCode(e.target.value)} />
        <button onClick={saveFaculty} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="mr-1 inline h-4 w-4" />{editingFaculty ? 'Save' : 'Add'}</button>
      </div>
      {editingFaculty && <button className="mt-2 text-xs text-[var(--color-text-tertiary)]" onClick={() => { setEditingFaculty(null); setName(''); setCode(''); }}>Cancel edit</button>}
      <div className="mt-4 divide-y rounded-xl border">{faculties.map(f => <div key={f._id} className="flex items-center justify-between gap-3 px-3 py-3"><div><p className="text-sm font-medium">{f.name}</p>{f.code && <p className="text-xs text-[var(--color-text-tertiary)]">{f.code}</p>}</div><div className="flex gap-1"><button className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]" onClick={() => editFaculty(f)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => removeFaculty(f._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></div>)}{!loading && faculties.length === 0 && <p className="px-3 py-6 text-center text-sm text-[var(--color-text-tertiary)]">No faculties yet.</p>}</div>
    </section>}

    {activeTab === 'department' && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Departments</h2><p className="text-xs text-[var(--color-text-tertiary)]">{usesFaculty ? 'Every department must belong to a faculty.' : institutionType === 'training_center' ? 'Optional — a training center may organize purely by Program instead.' : 'Departments belong directly to the institution.'}</p></div><UsersRound className="h-5 w-5 text-[var(--color-text-tertiary)]" /></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <input className={inputClass} placeholder="Department name" value={departmentName} onChange={e => setDepartmentName(e.target.value)} />
        <input className={inputClass} placeholder="Code" value={departmentCode} onChange={e => setDepartmentCode(e.target.value)} />
        {usesFaculty && <select className={`${inputClass} sm:col-span-2`} value={departmentFacultyId} onChange={e => setDepartmentFacultyId(e.target.value)}><option value="">Select faculty...</option>{faculties.map(f => <option key={f._id} value={f._id}>{f.name}{f.code ? ` (${f.code})` : ''}</option>)}</select>}
        <button onClick={saveDepartment} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="mr-1 inline h-4 w-4" />{editingDepartment ? 'Save Department' : 'Add Department'}</button>
        {editingDepartment && <button className="rounded-xl border px-4 py-2.5 text-sm" onClick={() => { setEditingDepartment(null); setDepartmentName(''); setDepartmentCode(''); setDepartmentFacultyId(''); }}>Cancel</button>}
      </div>
      <div className="mt-4 divide-y rounded-xl border">{departments.map(d => <div key={d._id} className="flex items-center justify-between gap-3 px-3 py-3"><div><p className="text-sm font-medium">{d.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{d.code || 'No code'}{usesFaculty && d.facultyId ? ` · ${d.facultyId.name}` : ''}</p></div><div className="flex gap-1"><button className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]" onClick={() => editDepartment(d)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => removeDepartment(d._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></div>)}{!loading && departments.length === 0 && <p className="px-3 py-6 text-center text-sm text-[var(--color-text-tertiary)]">No departments yet.</p>}</div>
    </section>}

    {activeTab === 'program' && showPrograms && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Programs</h2><p className="text-xs text-[var(--color-text-tertiary)]">{institutionType === 'training_center' ? 'What learners enroll in — a Department is optional.' : 'Sits under a Department — the specific degree/course of study a Cohort belongs to.'}</p></div><Building2 className="h-5 w-5 text-[var(--color-text-tertiary)]" /></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <input className={inputClass} placeholder="Program name" value={programName} onChange={e => setProgramName(e.target.value)} />
        <input className={inputClass} placeholder="Code" value={programCode} onChange={e => setProgramCode(e.target.value)} />
        <select className={`${inputClass} sm:col-span-2`} value={programDepartmentId} onChange={e => setProgramDepartmentId(e.target.value)}><option value="">No department{institutionType !== 'training_center' ? ' (optional)' : ''}</option>{departments.map(d => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}</select>
        <button onClick={saveProgram} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="mr-1 inline h-4 w-4" />{editingProgram ? 'Save Program' : 'Add Program'}</button>
        {editingProgram && <button className="rounded-xl border px-4 py-2.5 text-sm" onClick={() => { setEditingProgram(null); setProgramName(''); setProgramCode(''); setProgramDepartmentId(''); }}>Cancel</button>}
      </div>
      <div className="mt-4 divide-y rounded-xl border">{programs.map(p => <div key={p._id} className="flex items-center justify-between gap-3 px-3 py-3"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{p.code || 'No code'}{p.department ? ` · ${p.department.name}` : ''}</p></div><div className="flex gap-1"><button className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]" onClick={() => editProgram(p)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => removeProgram(p._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></div>)}{!loading && programs.length === 0 && <p className="px-3 py-6 text-center text-sm text-[var(--color-text-tertiary)]">No programs yet.</p>}</div>
    </section>}
  </div>;
}

export function HrManagement() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  if (searchParams.get('tab') === 'attendance') return <StaffAttendance />;
  if (searchParams.get('tab') === 'structure') return <InstitutionStructure />;
  return <div className="space-y-6 p-4 sm:p-6"><div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-sm"><div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300"><UsersRound className="h-6 w-6" /></div><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Human Resources</p><h1 className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">HR Management</h1><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Manage your institution workforce, staff accounts, attendance and access from one place.</p><p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Signed in as {user?.email || 'administrator'}</p></div></div></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{cards.map(({ title, description, to, icon: Icon }) => <Link key={to} to={to} className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between gap-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]"><Icon className="h-5 w-5" /></div><ArrowRight className="h-4 w-4 text-[var(--color-text-tertiary)] transition group-hover:translate-x-1" /></div><h2 className="mt-4 font-semibold text-[var(--color-text-primary)]">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">{description}</p></Link>)}</div></div>;
}