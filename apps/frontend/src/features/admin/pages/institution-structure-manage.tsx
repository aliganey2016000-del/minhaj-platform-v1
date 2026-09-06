import { useEffect, useMemo, useState } from 'react';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

type InstitutionType = 'school' | 'college' | 'university' | 'training_center';
type Faculty = { _id: string; name: string; code?: string; deanName?: string; phone?: string; email?: string; establishedYear?: number };
type Department = { _id: string; name: string; code?: string; headOfDepartment?: string; phone?: string; email?: string; establishedYear?: number; facultyId?: { _id: string; name: string } | null };
type Program = { _id: string; name: string; code?: string; description?: string; department?: { _id: string; name: string } | null };
type OnboardingStage = 'not_started' | 'in_progress' | 'ready_to_complete' | 'completed';
type OnboardingStatus = { onboardingCompleted: boolean; stage: OnboardingStage; structureCounts: { faculties: number; departments: number; programs: number; classes: number } };

const inputClass = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm';

export function InstitutionStructureManage() {
  const { user } = useAuth();
  const organizationId = user?.organizationId || '';
  const [institutionType, setInstitutionType] = useState<InstitutionType>('school');
  const [usesFaculty, setUsesFaculty] = useState(false);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [tab, setTab] = useState<'faculty' | 'department' | 'program'>('department');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [facultyEdit, setFacultyEdit] = useState<string | null>(null);
  const [departmentEdit, setDepartmentEdit] = useState<string | null>(null);
  const [programEdit, setProgramEdit] = useState<string | null>(null);
  const [facultyForm, setFacultyForm] = useState({ name: '', code: '', deanName: '', phone: '', email: '', establishedYear: '' });
  const [departmentForm, setDepartmentForm] = useState({ name: '', code: '', headOfDepartment: '', phone: '', email: '', establishedYear: '', facultyId: '' });
  const [programForm, setProgramForm] = useState({ name: '', code: '', description: '', departmentId: '' });

  const showPrograms = institutionType !== 'school';
  const isHigherEducation = institutionType === 'college' || institutionType === 'university';

  const load = async () => {
    if (!organizationId) return;
    setLoading(true); setError('');
    try {
      const [orgRes, academicRes, departmentRes, facultyRes, programRes, onboardingRes] = await Promise.all([
        api.get(`/schools/${organizationId}`),
        api.get('/classes/academic-structure', { params: { schoolId: organizationId } }),
        api.get('/departments', { params: { school: organizationId } }),
        api.get('/departments/faculties', { params: { school: organizationId } }),
        api.get('/programs', { params: { school: organizationId } }),
        api.get(`/schools/${organizationId}/onboarding`),
      ]);
      const type = (orgRes.data?.data?.institutionType || 'school') as InstitutionType;
      setInstitutionType(type);
      setUsesFaculty(type === 'university' || (type === 'college' && Boolean(academicRes.data?.data?.usesFaculty)));
      setDepartments(departmentRes.data?.data || []);
      setFaculties(facultyRes.data?.data || []);
      setPrograms(programRes.data?.data || []);
      setOnboarding(onboardingRes.data?.data || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load institution structure');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [organizationId]);
  useEffect(() => {
    if (!usesFaculty && tab === 'faculty') setTab(showPrograms ? 'program' : 'department');
  }, [usesFaculty, showPrograms, tab]);

  const saveFaculty = async () => {
    if (!facultyForm.name.trim() || !facultyForm.code.trim() || !facultyForm.deanName.trim() || !facultyForm.phone.trim() || !facultyForm.email.trim() || !facultyForm.establishedYear) {
      setError('Faculty name, code, dean, phone, email and established year are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const payload = { ...facultyForm, name: facultyForm.name.trim(), code: facultyForm.code.trim(), deanName: facultyForm.deanName.trim(), establishedYear: Number(facultyForm.establishedYear) };
      if (facultyEdit) await api.patch(`/departments/faculties/${facultyEdit}`, payload);
      else await api.post('/departments/faculties', payload);
      setFacultyForm({ name: '', code: '', deanName: '', phone: '', email: '', establishedYear: '' }); setFacultyEdit(null); setMessage(facultyEdit ? 'Faculty updated.' : 'Faculty created.'); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save faculty'); }
    finally { setSaving(false); }
  };

  const saveDepartment = async () => {
    if (!departmentForm.name.trim()) { setError('Department name is required.'); return; }
    if (usesFaculty && !departmentForm.facultyId) { setError('Faculty is required for this institution.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { ...departmentForm, name: departmentForm.name.trim(), facultyId: usesFaculty ? departmentForm.facultyId : undefined, establishedYear: departmentForm.establishedYear ? Number(departmentForm.establishedYear) : undefined, school: organizationId };
      if (departmentEdit) await api.patch(`/departments/${departmentEdit}`, payload);
      else await api.post('/departments', payload);
      setDepartmentForm({ name: '', code: '', headOfDepartment: '', phone: '', email: '', establishedYear: '', facultyId: '' }); setDepartmentEdit(null); setMessage(departmentEdit ? 'Department updated.' : 'Department created.'); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save department'); }
    finally { setSaving(false); }
  };

  const saveProgram = async () => {
    if (!programForm.name.trim()) { setError('Program name is required.'); return; }
    if (institutionType !== 'training_center' && !programForm.departmentId) { setError('Department is required for this program.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { name: programForm.name.trim(), code: programForm.code.trim() || undefined, description: programForm.description.trim() || undefined, department: programForm.departmentId || undefined, school: organizationId };
      if (programEdit) await api.patch(`/programs/${programEdit}`, payload);
      else await api.post('/programs', payload);
      setProgramForm({ name: '', code: '', description: '', departmentId: '' }); setProgramEdit(null); setMessage(programEdit ? 'Program updated.' : 'Program created.'); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save program'); }
    finally { setSaving(false); }
  };

  const completeOnboarding = async () => {
    setSaving(true); setError('');
    try { await api.patch(`/schools/${organizationId}/complete-onboarding`); await load(); setMessage('Onboarding marked complete.'); }
    catch (err: any) { setError(err.response?.data?.message || 'The required structure is not complete yet.'); }
    finally { setSaving(false); }
  };

  const title = institutionType === 'university' ? 'University Academic Structure' : institutionType === 'college' ? 'College Academic Structure' : institutionType === 'training_center' ? 'Training Center Structure' : 'School Structure';
  const description = institutionType === 'university' ? 'Faculty → Department → Program → Cohort/Class.' : institutionType === 'college' ? 'Department → Program → Cohort/Class, with Faculty where configured.' : institutionType === 'training_center' ? 'Program → Course/Module → Batch/Cohort.' : 'Departments and school classes; Faculty is not used.';
  const stageLabel = onboarding?.stage === 'ready_to_complete' ? 'Ready to complete' : onboarding?.stage === 'in_progress' ? 'In progress' : onboarding?.stage === 'not_started' ? 'Not started' : onboarding?.stage === 'completed' ? 'Completed' : '';
  const tabs = useMemo(() => ({ faculty: usesFaculty, department: true, program: showPrograms }), [usesFaculty, showPrograms]);

  return <div className="space-y-6 p-4 sm:p-6">
    <header className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-sm">
      <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-surface-tertiary)]"><Building2 className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Institution Management</p><h1 className="mt-1 text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p></div></div>
    </header>
    {onboarding && !onboarding.onboardingCompleted && <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{stageLabel}</span><p className="mt-2 text-sm text-[var(--color-text-secondary)]">Faculties: {onboarding.structureCounts.faculties} · Departments: {onboarding.structureCounts.departments} · Programs: {onboarding.structureCounts.programs} · Classes: {onboarding.structureCounts.classes}</p></div>{onboarding.stage === 'ready_to_complete' && <button disabled={saving} onClick={completeOnboarding} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Completing...' : 'Mark Onboarding Complete'}</button>}</div></div>}
    {message && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm"><div className={`grid gap-1 ${Object.values(tabs).filter(Boolean).length === 3 ? 'grid-cols-3' : Object.values(tabs).filter(Boolean).length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {tabs.faculty && <button onClick={() => setTab('faculty')} className={`rounded-xl px-4 py-3 text-sm font-semibold ${tab === 'faculty' ? 'bg-primary-600 text-white' : 'hover:bg-[var(--color-surface-tertiary)]'}`}>Faculty <span className="ml-1 rounded-full bg-black/10 px-2 py-0.5 text-xs">{faculties.length}</span></button>}
      <button onClick={() => setTab('department')} className={`rounded-xl px-4 py-3 text-sm font-semibold ${tab === 'department' ? 'bg-primary-600 text-white' : 'hover:bg-[var(--color-surface-tertiary)]'}`}>Department <span className="ml-1 rounded-full bg-black/10 px-2 py-0.5 text-xs">{departments.length}</span></button>
      {tabs.program && <button onClick={() => setTab('program')} className={`rounded-xl px-4 py-3 text-sm font-semibold ${tab === 'program' ? 'bg-primary-600 text-white' : 'hover:bg-[var(--color-surface-tertiary)]'}`}>Programs <span className="ml-1 rounded-full bg-black/10 px-2 py-0.5 text-xs">{programs.length}</span></button>}
    </div></div>

    {tab === 'faculty' && usesFaculty && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Faculties</h2><p className="text-xs text-[var(--color-text-tertiary)]">University and configured College faculties.</p></div><button onClick={() => setFacultyEdit('new')} className="rounded-xl bg-primary-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="mr-1 inline h-4 w-4" />Add</button></div>{facultyEdit && <div className="mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2"><input className={inputClass} placeholder="Faculty name *" value={facultyForm.name} onChange={e => setFacultyForm(v => ({ ...v, name: e.target.value }))} /><input className={inputClass} placeholder="Code *" value={facultyForm.code} onChange={e => setFacultyForm(v => ({ ...v, code: e.target.value }))} /><input className={inputClass} placeholder="Dean *" value={facultyForm.deanName} onChange={e => setFacultyForm(v => ({ ...v, deanName: e.target.value }))} /><input className={inputClass} placeholder="Phone *" value={facultyForm.phone} onChange={e => setFacultyForm(v => ({ ...v, phone: e.target.value }))} /><input className={inputClass} type="email" placeholder="Email *" value={facultyForm.email} onChange={e => setFacultyForm(v => ({ ...v, email: e.target.value }))} /><input className={inputClass} type="number" placeholder="Established year *" value={facultyForm.establishedYear} onChange={e => setFacultyForm(v => ({ ...v, establishedYear: e.target.value }))} /><div className="sm:col-span-2 flex justify-end gap-2"><button onClick={() => { setFacultyEdit(null); setFacultyForm({ name: '', code: '', deanName: '', phone: '', email: '', establishedYear: '' }); }} className="rounded-xl border px-4 py-2">Cancel</button><button disabled={saving} onClick={saveFaculty} className="rounded-xl bg-primary-600 px-4 py-2 font-semibold text-white">Save</button></div></div>}
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="px-3 py-3">Faculty</th><th className="px-3 py-3">Code</th><th className="px-3 py-3">Dean</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Established</th><th /></tr></thead><tbody>{faculties.map(f => <tr key={f._id} className="border-b"><td className="px-3 py-3 font-medium">{f.name}</td><td className="px-3 py-3">{f.code || '—'}</td><td className="px-3 py-3">{f.deanName || '—'}</td><td className="px-3 py-3">{f.phone || '—'}</td><td className="px-3 py-3">{f.email || '—'}</td><td className="px-3 py-3">{f.establishedYear || '—'}</td><td className="px-3 py-3"><button onClick={() => { setFacultyEdit(f._id); setFacultyForm({ name: f.name, code: f.code || '', deanName: f.deanName || '', phone: f.phone || '', email: f.email || '', establishedYear: f.establishedYear ? String(f.establishedYear) : '' }); }} className="mr-1 rounded-lg p-2"><Pencil className="h-4 w-4" /></button><button onClick={async () => { if (window.confirm('Delete this faculty?')) { try { await api.delete(`/departments/faculties/${f._id}`); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete faculty'); } } }} className="rounded-lg p-2 text-red-600"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table>{!loading && faculties.length === 0 && <p className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">No faculties yet.</p>}</div></section>}

    {tab === 'department' && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Departments</h2><p className="text-xs text-[var(--color-text-tertiary)]">{usesFaculty ? 'Every department must belong to a faculty.' : 'Departments belong directly to this institution.'}</p></div><button onClick={() => setDepartmentEdit('new')} className="rounded-xl bg-primary-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="mr-1 inline h-4 w-4" />Add</button></div>{departmentEdit && <div className="mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2"><input className={inputClass} placeholder="Department name *" value={departmentForm.name} onChange={e => setDepartmentForm(v => ({ ...v, name: e.target.value }))} /><input className={inputClass} placeholder="Code" value={departmentForm.code} onChange={e => setDepartmentForm(v => ({ ...v, code: e.target.value }))} />{usesFaculty && <select className={inputClass} value={departmentForm.facultyId} onChange={e => setDepartmentForm(v => ({ ...v, facultyId: e.target.value }))}><option value="">Select Faculty *</option>{faculties.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}</select>}<input className={inputClass} placeholder="Head of Department" value={departmentForm.headOfDepartment} onChange={e => setDepartmentForm(v => ({ ...v, headOfDepartment: e.target.value }))} /><input className={inputClass} placeholder="Phone" value={departmentForm.phone} onChange={e => setDepartmentForm(v => ({ ...v, phone: e.target.value }))} /><input className={inputClass} type="email" placeholder="Email" value={departmentForm.email} onChange={e => setDepartmentForm(v => ({ ...v, email: e.target.value }))} /><input className={inputClass} type="number" placeholder="Established year" value={departmentForm.establishedYear} onChange={e => setDepartmentForm(v => ({ ...v, establishedYear: e.target.value }))} /><div className="sm:col-span-2 flex justify-end gap-2"><button onClick={() => setDepartmentEdit(null)} className="rounded-xl border px-4 py-2">Cancel</button><button disabled={saving} onClick={saveDepartment} className="rounded-xl bg-primary-600 px-4 py-2 font-semibold text-white">Save</button></div></div>}
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="px-3 py-3">Department</th><th className="px-3 py-3">Code</th><th className="px-3 py-3">HOD</th>{usesFaculty && <th className="px-3 py-3">Faculty</th>}<th className="px-3 py-3">Phone</th><th className="px-3 py-3">Email</th><th /></tr></thead><tbody>{departments.map(d => <tr key={d._id} className="border-b"><td className="px-3 py-3 font-medium">{d.name}</td><td className="px-3 py-3">{d.code || '—'}</td><td className="px-3 py-3">{d.headOfDepartment || '—'}</td>{usesFaculty && <td className="px-3 py-3">{d.facultyId?.name || '—'}</td>}<td className="px-3 py-3">{d.phone || '—'}</td><td className="px-3 py-3">{d.email || '—'}</td><td className="px-3 py-3"><button onClick={() => { setDepartmentEdit(d._id); setDepartmentForm({ name: d.name, code: d.code || '', headOfDepartment: d.headOfDepartment || '', phone: d.phone || '', email: d.email || '', establishedYear: d.establishedYear ? String(d.establishedYear) : '', facultyId: d.facultyId?._id || '' }); }} className="mr-1 rounded-lg p-2"><Pencil className="h-4 w-4" /></button><button onClick={async () => { if (window.confirm('Delete this department?')) { try { await api.delete(`/departments/${d._id}`); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete department'); } } }} className="rounded-lg p-2 text-red-600"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table>{!loading && departments.length === 0 && <p className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">No departments yet.</p>}</div></section>}

    {tab === 'program' && showPrograms && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Programs</h2><p className="text-xs text-[var(--color-text-tertiary)]">{institutionType === 'training_center' ? 'Department is optional for Training Center programs.' : 'Programs require a Department.'}</p></div><button onClick={() => setProgramEdit('new')} className="rounded-xl bg-primary-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="mr-1 inline h-4 w-4" />Add</button></div>{programEdit && <div className="mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2"><input className={inputClass} placeholder="Program name *" value={programForm.name} onChange={e => setProgramForm(v => ({ ...v, name: e.target.value }))} /><input className={inputClass} placeholder="Code" value={programForm.code} onChange={e => setProgramForm(v => ({ ...v, code: e.target.value }))} /><select className={inputClass} value={programForm.departmentId} onChange={e => setProgramForm(v => ({ ...v, departmentId: e.target.value }))}><option value="">{institutionType === 'training_center' ? 'No department (optional)' : 'Select Department *'}</option>{departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}</select><textarea className={`${inputClass} sm:col-span-2`} rows={3} placeholder="Description" value={programForm.description} onChange={e => setProgramForm(v => ({ ...v, description: e.target.value }))} /><div className="sm:col-span-2 flex justify-end gap-2"><button onClick={() => setProgramEdit(null)} className="rounded-xl border px-4 py-2">Cancel</button><button disabled={saving} onClick={saveProgram} className="rounded-xl bg-primary-600 px-4 py-2 font-semibold text-white">Save</button></div></div>}
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="px-3 py-3">Program</th><th className="px-3 py-3">Code</th><th className="px-3 py-3">Department</th><th /></tr></thead><tbody>{programs.map(p => <tr key={p._id} className="border-b"><td className="px-3 py-3 font-medium">{p.name}</td><td className="px-3 py-3">{p.code || '—'}</td><td className="px-3 py-3">{p.department?.name || '—'}</td><td className="px-3 py-3"><button onClick={() => { setProgramEdit(p._id); setProgramForm({ name: p.name, code: p.code || '', description: p.description || '', departmentId: p.department?._id || '' }); }} className="mr-1 rounded-lg p-2"><Pencil className="h-4 w-4" /></button><button onClick={async () => { if (window.confirm('Delete this program?')) { try { await api.delete(`/programs/${p._id}`); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete program'); } } }} className="rounded-lg p-2 text-red-600"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table>{!loading && programs.length === 0 && <p className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">No programs yet.</p>}</div></section>}
  </div>;
}

export default InstitutionStructureManage;
