import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Pencil, Plus, ShieldCheck, Trash2, UsersRound, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';
import { StaffAttendance } from './staff-attendance';

type Faculty = { _id: string; name: string; code?: string };
type Department = { _id: string; name: string; code?: string; facultyId?: Faculty | null };

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
  const [structureLoaded, setStructureLoaded] = useState(false);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [editingFaculty, setEditingFaculty] = useState<string | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [departmentFacultyId, setDepartmentFacultyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'faculty' | 'department'>('faculty');
  const schoolQuery = user?.organizationId ? `?school=${encodeURIComponent(user.organizationId)}` : '';

  useEffect(() => {
    let cancelled = false;
    const loadStructureConfig = async () => {
      if (!user?.organizationId) {
        setUsesFaculty(false);
        setStructureLoaded(false);
        return;
      }
      try {
        const { data } = await api.get('/classes/academic-structure', { params: { schoolId: user.organizationId } });
        if (!cancelled) { setUsesFaculty(!!data?.data?.usesFaculty); setStructureLoaded(true); }
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
    if (!usesFaculty) setActiveTab('department');
  }, [usesFaculty]);

  const load = async () => {
    if (!structureLoaded) return;
    setLoading(true); setError('');
    try {
      const [departmentResponse, facultyResponse] = await Promise.all([
        api.get(`/departments${schoolQuery}`),
        usesFaculty ? api.get(`/departments/faculties${schoolQuery}`) : Promise.resolve({ data: { data: [] } }),
      ]);
      setDepartments(departmentResponse.data?.data || []);
      setFaculties(facultyResponse.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load institution structure');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [structureLoaded, usesFaculty, user?.organizationId]);

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

  return <div className="space-y-6 p-4 sm:p-6">
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Institution Structure</p>
      <h1 className="mt-1 text-2xl font-bold">{usesFaculty ? 'Faculty & Department Management' : 'Department Management'}</h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{usesFaculty ? 'This institution uses Institution → Faculty → Department.' : 'This institution uses Institution → Department. Faculties are not used.'}</p>
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

    {usesFaculty && (
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => { setActiveTab('faculty'); setError(''); }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeTab === 'faculty' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
          >
            Faculty
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('department'); setError(''); }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeTab === 'department' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
          >
            Department
          </button>
        </div>
      </div>
    )}

    {(!usesFaculty || activeTab === 'faculty') && usesFaculty && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Faculties</h2><p className="text-xs text-[var(--color-text-tertiary)]">University faculties only.</p></div><Building2 className="h-5 w-5 text-[var(--color-text-tertiary)]" /></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <input className={inputClass} placeholder="Faculty name" value={name} onChange={e => setName(e.target.value)} />
        <input className={inputClass} placeholder="Code" value={code} onChange={e => setCode(e.target.value)} />
        <button onClick={saveFaculty} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="mr-1 inline h-4 w-4" />{editingFaculty ? 'Save' : 'Add'}</button>
      </div>
      {editingFaculty && <button className="mt-2 text-xs text-[var(--color-text-tertiary)]" onClick={() => { setEditingFaculty(null); setName(''); setCode(''); }}>Cancel edit</button>}
      <div className="mt-4 divide-y rounded-xl border">{faculties.map(f => <div key={f._id} className="flex items-center justify-between gap-3 px-3 py-3"><div><p className="text-sm font-medium">{f.name}</p>{f.code && <p className="text-xs text-[var(--color-text-tertiary)]">{f.code}</p>}</div><div className="flex gap-1"><button className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]" onClick={() => editFaculty(f)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => removeFaculty(f._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></div>)}{!loading && faculties.length === 0 && <p className="px-3 py-6 text-center text-sm text-[var(--color-text-tertiary)]">No faculties yet.</p>}</div>
    </section>}

    {(!usesFaculty || activeTab === 'department') && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Departments</h2><p className="text-xs text-[var(--color-text-tertiary)]">{usesFaculty ? 'Every department must belong to a faculty.' : 'Departments belong directly to the institution.'}</p></div><UsersRound className="h-5 w-5 text-[var(--color-text-tertiary)]" /></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <input className={inputClass} placeholder="Department name" value={departmentName} onChange={e => setDepartmentName(e.target.value)} />
        <input className={inputClass} placeholder="Code" value={departmentCode} onChange={e => setDepartmentCode(e.target.value)} />
        {usesFaculty && <select className={`${inputClass} sm:col-span-2`} value={departmentFacultyId} onChange={e => setDepartmentFacultyId(e.target.value)}><option value="">Select faculty...</option>{faculties.map(f => <option key={f._id} value={f._id}>{f.name}{f.code ? ` (${f.code})` : ''}</option>)}</select>}
        <button onClick={saveDepartment} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="mr-1 inline h-4 w-4" />{editingDepartment ? 'Save Department' : 'Add Department'}</button>
        {editingDepartment && <button className="rounded-xl border px-4 py-2.5 text-sm" onClick={() => { setEditingDepartment(null); setDepartmentName(''); setDepartmentCode(''); setDepartmentFacultyId(''); }}>Cancel</button>}
      </div>
      <div className="mt-4 divide-y rounded-xl border">{departments.map(d => <div key={d._id} className="flex items-center justify-between gap-3 px-3 py-3"><div><p className="text-sm font-medium">{d.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{d.code || 'No code'}{usesFaculty && d.facultyId ? ` · ${d.facultyId.name}` : ''}</p></div><div className="flex gap-1"><button className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]" onClick={() => editDepartment(d)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => removeDepartment(d._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></div>)}{!loading && departments.length === 0 && <p className="px-3 py-6 text-center text-sm text-[var(--color-text-tertiary)]">No departments yet.</p>}</div>
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