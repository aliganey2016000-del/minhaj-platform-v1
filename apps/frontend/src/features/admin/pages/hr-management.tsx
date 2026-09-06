import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Building2, MoreVertical, Pencil, Plus, ShieldCheck, Trash2, Upload, UsersRound, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';
import { StaffAttendance } from './staff-attendance';

type Faculty = { _id: string; name: string; code?: string; deanName?: string; phone?: string; email?: string; establishedYear?: number };
type Department = { _id: string; name: string; code?: string; headOfDepartment?: string; phone?: string; email?: string; establishedYear?: number; facultyId?: Faculty | null };
type Program = { _id: string; name: string; code?: string; department?: Department | null; description?: string };
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
  const [deanName, setDeanName] = useState('');
  const [facultyPhone, setFacultyPhone] = useState('');
  const [facultyEmail, setFacultyEmail] = useState('');
  const [facultyEstablishedYear, setFacultyEstablishedYear] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [editingFaculty, setEditingFaculty] = useState<string | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [departmentHod, setDepartmentHod] = useState('');
  const [departmentPhone, setDepartmentPhone] = useState('');
  const [departmentEmail, setDepartmentEmail] = useState('');
  const [departmentEstablishedYear, setDepartmentEstablishedYear] = useState('');
  const [departmentFacultyId, setDepartmentFacultyId] = useState('');
  const [editingProgram, setEditingProgram] = useState<string | null>(null);
  const [programName, setProgramName] = useState('');
  const [programCode, setProgramCode] = useState('');
  const [programDescription, setProgramDescription] = useState('');
  const [programDepartmentId, setProgramDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'faculty' | 'department' | 'program'>('faculty');
  const [facultyActionsOpen, setFacultyActionsOpen] = useState(false);
  const [showFacultyForm, setShowFacultyForm] = useState(false);
  const facultyImportRef = useRef<HTMLInputElement>(null);
  const [departmentActionsOpen, setDepartmentActionsOpen] = useState(false);
  const [showDepartmentForm, setShowDepartmentForm] = useState(false);
  const departmentImportRef = useRef<HTMLInputElement>(null);
  const [programActionsOpen, setProgramActionsOpen] = useState(false);
  const [showProgramForm, setShowProgramForm] = useState(false);
  const programImportRef = useRef<HTMLInputElement>(null);
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
          const nextInstitutionType = schoolRes.data?.data?.institutionType || 'school';
          setInstitutionType(nextInstitutionType);
          setUsesFaculty(nextInstitutionType !== 'school' && nextInstitutionType !== 'training_center' && (!!structureRes.data?.data?.usesFaculty || nextInstitutionType === 'university'));
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

  useEffect(() => {
    document.body.dataset.institutionStructureType = institutionType;
    return () => { delete document.body.dataset.institutionStructureType; };
  }, [institutionType]);

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
    if (!code.trim() || !deanName.trim() || !facultyPhone.trim() || !facultyEmail.trim() || !facultyEstablishedYear) return setError('Faculty name, code, dean, phone, email and established year are required');
    setSaving(true); setError('');
    try {
      const payload = { name: name.trim(), code: code.trim(), deanName: deanName.trim(), phone: facultyPhone.trim(), email: facultyEmail.trim(), establishedYear: Number(facultyEstablishedYear), tenantId: user?.organizationId || undefined };
      if (editingFaculty) await api.patch(`/departments/faculties/${editingFaculty}`, payload);
      else await api.post('/departments/faculties', payload);
      setName(''); setCode(''); setDeanName(''); setFacultyPhone(''); setFacultyEmail(''); setFacultyEstablishedYear(''); setEditingFaculty(null); setShowFacultyForm(false); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save faculty'); }
    finally { setSaving(false); }
  };

  const importFaculties = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSaving(true); setError('');
    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
      const dataRows = rows[0]?.toLowerCase().includes('name') ? rows.slice(1) : rows;
      let imported = 0;
      for (const row of dataRows) {
        const [facultyName, facultyCode] = row.split(',').map((value) => value.trim().replace(/^"|"$/g, ''));
        if (!facultyName) continue;
        await api.post('/departments/faculties', { name: facultyName, code: facultyCode || undefined, tenantId: user?.organizationId || undefined });
        imported += 1;
      }
      setMessage(`Imported ${imported} faculty record${imported === 1 ? '' : 's'}.`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to import faculties. Use a CSV with Name and Code columns.');
    } finally { setSaving(false); }
  };

  const saveDepartment = async () => {
    if (!departmentName.trim()) return setError('Department name is required');
    if (usesFaculty && !departmentFacultyId) return setError('Select a faculty for this department');
    setSaving(true); setError('');
    try {
      const selectedFaculty = usesFaculty ? faculties.find((faculty) => faculty._id === departmentFacultyId) : undefined;
      const inheritFacultyDetails = institutionType === 'university' || institutionType === 'college';
      const payload = {
        name: departmentName.trim(),
        code: departmentCode.trim() || undefined,
        headOfDepartment: departmentHod.trim() || (inheritFacultyDetails ? selectedFaculty?.deanName : undefined),
        phone: departmentPhone.trim() || (inheritFacultyDetails ? selectedFaculty?.phone : undefined),
        email: departmentEmail.trim() || (inheritFacultyDetails ? selectedFaculty?.email : undefined),
        establishedYear: departmentEstablishedYear ? Number(departmentEstablishedYear) : (inheritFacultyDetails ? selectedFaculty?.establishedYear : undefined),
        facultyId: usesFaculty ? departmentFacultyId : undefined,
        tenantId: user?.organizationId || undefined,
      };
      if (editingDepartment) await api.patch(`/departments/${editingDepartment}`, payload);
      else await api.post('/departments', payload);
      setDepartmentName(''); setDepartmentCode(''); setDepartmentHod(''); setDepartmentPhone(''); setDepartmentEmail(''); setDepartmentEstablishedYear(''); setDepartmentFacultyId(''); setEditingDepartment(null); setShowDepartmentForm(false); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save department'); }
    finally { setSaving(false); }
  };

  const editFaculty = (faculty: Faculty) => { setEditingFaculty(faculty._id); setName(faculty.name); setCode(faculty.code || ''); setDeanName(faculty.deanName || ''); setFacultyPhone(faculty.phone || ''); setFacultyEmail(faculty.email || ''); setFacultyEstablishedYear(faculty.establishedYear ? String(faculty.establishedYear) : ''); setShowFacultyForm(true); setError(''); };
  const editDepartment = (department: Department) => { setEditingDepartment(department._id); setDepartmentName(department.name); setDepartmentCode(department.code || ''); setDepartmentHod(department.headOfDepartment || ''); setDepartmentPhone(department.phone || ''); setDepartmentEmail(department.email || ''); setDepartmentEstablishedYear(department.establishedYear ? String(department.establishedYear) : ''); setDepartmentFacultyId(department.facultyId?._id || ''); setShowDepartmentForm(true); setError(''); };
  const removeFaculty = async (id: string) => { if (!window.confirm('Delete this faculty? Departments must be reassigned first.')) return; try { await api.delete(`/departments/faculties/${id}`); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete faculty'); } };
  const removeDepartment = async (id: string) => { if (!window.confirm('Delete this department? Linked classes must be reassigned first.')) return; try { await api.delete(`/departments/${id}`); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete department'); } };

  const saveProgram = async () => {
    if (!programName.trim()) return setError('Program name is required');
    setSaving(true); setError('');
    try {
      const payload = { name: programName.trim(), code: programCode.trim() || undefined, department: programDepartmentId || undefined, description: programDescription.trim() || undefined, school: user?.organizationId || undefined };
      if (editingProgram) await api.patch(`/programs/${editingProgram}`, payload);
      else await api.post('/programs', payload);
      setProgramName(''); setProgramCode(''); setProgramDescription(''); setProgramDepartmentId(''); setEditingProgram(null); setShowProgramForm(false); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save program'); }
    finally { setSaving(false); }
  };
  const editProgram = (program: Program) => { setEditingProgram(program._id); setProgramName(program.name); setProgramCode(program.code || ''); setProgramDescription(program.description || ''); setProgramDepartmentId(program.department?._id || ''); setShowProgramForm(true); setError(''); };
  const removeProgram = async (id: string) => { if (!window.confirm('Delete this program? Linked classes/cohorts must be reassigned first.')) return; try { await api.delete(`/programs/${id}`); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete program'); } };

  const isHigherEducation = institutionType === 'university' || institutionType === 'college';
  const structureTitle = institutionType === 'university'
    ? 'University Academic Structure'
    : institutionType === 'college'
      ? 'College Academic Structure'
      : institutionType === 'training_center'
        ? 'Training Center Structure'
        : 'School Department Management';
  const structureDescription = isHigherEducation
    ? 'This academic management system is designed for higher education: Faculty → Department → Program → Cohort.'
    : institutionType === 'training_center'
      ? 'This training management system organizes learning through Programs and optional Departments.'
      : 'This school management system organizes the institution through Departments.';

  return <div className="space-y-6 p-4 sm:p-6">
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{isHigherEducation ? 'Academic Administration' : 'Institution Administration'}</p>
      <h1 className="mt-1 text-2xl font-bold">{structureTitle}</h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{structureDescription}</p>
    </div>
    {user?.organizationId && <OnboardingBanner organizationId={user.organizationId} />}
    {message && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

    {(usesFaculty || showPrograms) && (
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm">
        <div className={`grid gap-1 ${usesFaculty && showPrograms ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {usesFaculty && <button
            type="button"
            onClick={() => { setActiveTab('faculty'); setError(''); }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeTab === 'faculty' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
          >
            Faculty <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${activeTab === 'faculty' ? 'bg-white/20' : 'bg-[var(--color-surface-tertiary)]'}`}>{faculties.length}</span>
          </button>}
          <button
            type="button"
            onClick={() => { setActiveTab('department'); setError(''); }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeTab === 'department' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
          >
            Department <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${activeTab === 'department' ? 'bg-white/20' : 'bg-[var(--color-surface-tertiary)]'}`}>{departments.length}</span>
          </button>
          {showPrograms && <button
            type="button"
            onClick={() => { setActiveTab('program'); setError(''); }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeTab === 'program' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
          >
            Programs <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${activeTab === 'program' ? 'bg-white/20' : 'bg-[var(--color-surface-tertiary)]'}`}>{programs.length}</span>
          </button>}
        </div>
      </div>
    )}

    {activeTab === 'faculty' && usesFaculty && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Faculties</h2><p className="text-xs text-[var(--color-text-tertiary)]">University and college faculties.</p></div><div className="relative"><button type="button" onClick={() => setFacultyActionsOpen((open) => !open)} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]" title="Faculty actions" aria-label="Faculty actions" aria-expanded={facultyActionsOpen}><MoreVertical className="h-5 w-5" /></button>{facultyActionsOpen && <div className="absolute right-0 top-10 z-20 w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-1 shadow-xl"><button type="button" onClick={() => { setShowFacultyForm(true); setFacultyActionsOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-tertiary)]"><Plus className="h-4 w-4" /> Add</button><button type="button" onClick={() => { facultyImportRef.current?.click(); setFacultyActionsOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-tertiary)]"><Upload className="h-4 w-4" /> Import</button></div>}<input ref={facultyImportRef} type="file" accept=".csv,text/csv" onChange={importFaculties} className="hidden" /></div></div>
      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border-default)]">
        {faculties.length > 0 && <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--color-surface-tertiary)]"><tr className="border-b border-[var(--color-border-default)]"><th className="px-4 py-3 font-semibold">Faculty</th><th className="px-4 py-3 font-semibold">Code</th><th className="px-4 py-3 font-semibold">Dean</th><th className="px-4 py-3 font-semibold">Phone</th><th className="px-4 py-3 font-semibold">Email</th><th className="px-4 py-3 font-semibold">Established</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{faculties.map(f => <tr key={f._id} className="transition-colors hover:bg-[var(--color-surface-tertiary)]"><td className="px-4 py-3 font-medium">{f.name}</td><td className="px-4 py-3 text-[var(--color-text-secondary)]">{f.code || '—'}</td><td className="px-4 py-3 text-[var(--color-text-secondary)]">{f.deanName || '—'}</td><td className="px-4 py-3 text-[var(--color-text-secondary)]">{f.phone || '—'}</td><td className="max-w-[220px] truncate px-4 py-3 text-[var(--color-text-secondary)]" title={f.email}>{f.email || '—'}</td><td className="px-4 py-3 text-[var(--color-text-secondary)]">{f.establishedYear || '—'}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]" onClick={() => editFaculty(f)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => removeFaculty(f._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div>}
        {faculties.length > 0 && <div className="divide-y divide-[var(--color-border-subtle)] md:hidden">{faculties.map(f => <div key={f._id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{f.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{f.code || 'No code'}</p></div><div className="flex gap-1"><button className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]" onClick={() => editFaculty(f)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => removeFaculty(f._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></div><dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><div><dt className="text-xs text-[var(--color-text-tertiary)]">Dean</dt><dd className="truncate">{f.deanName || '—'}</dd></div><div><dt className="text-xs text-[var(--color-text-tertiary)]">Established</dt><dd>{f.establishedYear || '—'}</dd></div><div><dt className="text-xs text-[var(--color-text-tertiary)]">Phone</dt><dd className="truncate">{f.phone || '—'}</dd></div><div><dt className="text-xs text-[var(--color-text-tertiary)]">Email</dt><dd className="truncate">{f.email || '—'}</dd></div></dl></div>)}</div>}
        {!loading && faculties.length === 0 && <p className="px-3 py-8 text-center text-sm text-[var(--color-text-tertiary)]">No faculties yet.</p>}
      </div>
      {showFacultyForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowFacultyForm(false)}><div className="w-full max-w-2xl rounded-2xl bg-[var(--color-surface-primary)] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><h3 className="text-xl font-bold">{editingFaculty ? 'Edit Faculty' : 'Add Faculty'}</h3><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Enter the complete faculty information.</p></div><button type="button" className="text-2xl text-[var(--color-text-tertiary)]" onClick={() => setShowFacultyForm(false)}>&times;</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><input className={inputClass} placeholder="Faculty name *" value={name} onChange={e => setName(e.target.value)} /><input className={inputClass} placeholder="Code *" value={code} onChange={e => setCode(e.target.value)} /><input className={inputClass} placeholder="Dean name *" value={deanName} onChange={e => setDeanName(e.target.value)} /><input className={inputClass} placeholder="Phone *" value={facultyPhone} onChange={e => setFacultyPhone(e.target.value)} /><input className={inputClass} type="email" placeholder="Email *" value={facultyEmail} onChange={e => setFacultyEmail(e.target.value)} /><input className={inputClass} type="number" min="1900" max={new Date().getFullYear()} placeholder="Established year *" value={facultyEstablishedYear} onChange={e => setFacultyEstablishedYear(e.target.value)} /></div><div className="mt-6 flex justify-end gap-2"><button type="button" className="rounded-xl border px-4 py-2.5 text-sm" onClick={() => setShowFacultyForm(false)}>Cancel</button><button type="button" disabled={saving} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" onClick={saveFaculty}>{saving ? 'Saving...' : editingFaculty ? 'Save Faculty' : 'Add Faculty'}</button></div></div></div>}
    </section>}

    {activeTab === 'department' && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Departments</h2><p className="text-xs text-[var(--color-text-tertiary)]">{usesFaculty ? 'Every department must belong to a faculty.' : 'Departments belong directly to the institution.'}</p></div><div className="relative"><button type="button" onClick={() => setDepartmentActionsOpen(v => !v)} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]" title="Department actions"><MoreVertical className="h-5 w-5" /></button>{departmentActionsOpen && <div className="absolute right-0 top-10 z-20 w-40 rounded-xl border bg-[var(--color-surface-primary)] py-1 shadow-xl"><button type="button" onClick={() => { setShowDepartmentForm(true); setDepartmentActionsOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-tertiary)]"><Plus className="h-4 w-4" /> Add</button><button type="button" onClick={() => { departmentImportRef.current?.click(); setDepartmentActionsOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-tertiary)]"><Upload className="h-4 w-4" /> Import</button></div>}<input ref={departmentImportRef} type="file" accept=".csv,text/csv" className="hidden" /></div></div>
      <div className="mt-4 overflow-hidden rounded-xl border"><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--color-surface-tertiary)]"><tr className="border-b"><th className="px-4 py-3">Department</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">HOD</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Established</th>{usesFaculty && <th className="px-4 py-3">Faculty</th>}<th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y">{departments.map(d => <tr key={d._id} className="hover:bg-[var(--color-surface-tertiary)]"><td className="px-4 py-3 font-medium">{d.name}</td><td className="px-4 py-3">{d.code || '—'}</td><td className="px-4 py-3">{d.headOfDepartment || '—'}</td><td className="px-4 py-3">{d.phone || '—'}</td><td className="max-w-[200px] truncate px-4 py-3" title={d.email}>{d.email || '—'}</td><td className="px-4 py-3">{d.establishedYear || '—'}</td>{usesFaculty && <td className="px-4 py-3">{d.facultyId?.name || '—'}</td>}<td className="px-4 py-3"><div className="flex justify-end gap-1"><button className="rounded-lg p-2" onClick={() => editDepartment(d)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600" onClick={() => removeDepartment(d._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div><div className="divide-y md:hidden">{departments.map(d => <div key={d._id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{d.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{d.code || 'No code'} · {d.facultyId?.name || 'No faculty'}</p></div><div className="flex gap-1"><button className="rounded-lg p-2" onClick={() => editDepartment(d)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600" onClick={() => removeDepartment(d._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></div><dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><div><dt className="text-xs text-[var(--color-text-tertiary)]">HOD</dt><dd className="truncate">{d.headOfDepartment || '—'}</dd></div><div><dt className="text-xs text-[var(--color-text-tertiary)]">Established</dt><dd>{d.establishedYear || '—'}</dd></div><div><dt className="text-xs text-[var(--color-text-tertiary)]">Phone</dt><dd className="truncate">{d.phone || '—'}</dd></div><div><dt className="text-xs text-[var(--color-text-tertiary)]">Email</dt><dd className="truncate">{d.email || '—'}</dd></div></dl></div>)}</div>{!loading && departments.length === 0 && <p className="px-3 py-8 text-center text-sm text-[var(--color-text-tertiary)]">No departments yet.</p>}</div>
      {showDepartmentForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDepartmentForm(false)}><div className="w-full max-w-xl rounded-2xl bg-[var(--color-surface-primary)] p-6 shadow-2xl" onClick={e => e.stopPropagation()}><h3 className="text-xl font-bold">{editingDepartment ? 'Edit Department' : 'Add Department'}</h3><div className="mt-5 grid gap-4 sm:grid-cols-2"><input className={inputClass} placeholder="Department name *" value={departmentName} onChange={e => setDepartmentName(e.target.value)} /><input className={inputClass} placeholder="Code" value={departmentCode} onChange={e => setDepartmentCode(e.target.value)} /><input className={inputClass} placeholder="Head of Department (optional)" value={departmentHod} onChange={e => setDepartmentHod(e.target.value)} /><input className={inputClass} placeholder="Phone (optional)" value={departmentPhone} onChange={e => setDepartmentPhone(e.target.value)} /><input className={inputClass} type="email" placeholder="Email (optional)" value={departmentEmail} onChange={e => setDepartmentEmail(e.target.value)} /><input className={inputClass} type="number" min="1900" max={new Date().getFullYear()} placeholder="Established year (optional)" value={departmentEstablishedYear} onChange={e => setDepartmentEstablishedYear(e.target.value)} />{usesFaculty && <select className={`${inputClass} sm:col-span-2`} value={departmentFacultyId} onChange={e => setDepartmentFacultyId(e.target.value)}><option value="">Select faculty *</option>{faculties.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}</select>}</div><p className="mt-3 text-xs text-[var(--color-text-tertiary)]">For universities and colleges, blank department contact fields inherit the selected faculty's Dean details automatically.</p><div className="mt-6 flex justify-end gap-2"><button type="button" className="rounded-xl border px-4 py-2.5" onClick={() => setShowDepartmentForm(false)}>Cancel</button><button type="button" disabled={saving} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50" onClick={saveDepartment}>{saving ? 'Saving...' : editingDepartment ? 'Save Department' : 'Add Department'}</button></div></div></div>}
    </section>}

    {activeTab === 'program' && showPrograms && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Programs</h2><p className="text-xs text-[var(--color-text-tertiary)]">{institutionType === 'training_center' ? 'What learners enroll in — a Department is optional.' : 'Programs sit under a Department.'}</p></div><div className="relative"><button type="button" onClick={() => setProgramActionsOpen(v => !v)} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]" title="Program actions"><MoreVertical className="h-5 w-5" /></button>{programActionsOpen && <div className="absolute right-0 top-10 z-20 w-40 rounded-xl border bg-[var(--color-surface-primary)] py-1 shadow-xl"><button type="button" onClick={() => { setShowProgramForm(true); setProgramActionsOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-tertiary)]"><Plus className="h-4 w-4" /> Add</button><button type="button" onClick={() => { programImportRef.current?.click(); setProgramActionsOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-tertiary)]"><Upload className="h-4 w-4" /> Import</button></div>}<input ref={programImportRef} type="file" accept=".csv,text/csv" className="hidden" /></div></div>
      <div className="mt-4 overflow-hidden rounded-xl border"><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-[var(--color-surface-tertiary)]"><tr className="border-b"><th className="px-4 py-3">Program</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Department</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y">{programs.map(p => <tr key={p._id} className="hover:bg-[var(--color-surface-tertiary)]"><td className="px-4 py-3 font-medium">{p.name}</td><td className="px-4 py-3">{p.code || '—'}</td><td className="px-4 py-3">{p.department?.name || '—'}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button className="rounded-lg p-2" onClick={() => editProgram(p)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600" onClick={() => removeProgram(p._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div><div className="divide-y md:hidden">{programs.map(p => <div key={p._id} className="flex items-start justify-between gap-3 p-4"><div><p className="font-semibold">{p.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{p.code || 'No code'} · {p.department?.name || 'No department'}</p></div><div className="flex gap-1"><button className="rounded-lg p-2" onClick={() => editProgram(p)} title="Edit"><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-600" onClick={() => removeProgram(p._id)} title="Delete"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>{!loading && programs.length === 0 && <p className="px-3 py-8 text-center text-sm text-[var(--color-text-tertiary)]">No programs yet.</p>}</div>
      {showProgramForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowProgramForm(false)}><div className="w-full max-w-xl rounded-2xl bg-[var(--color-surface-primary)] p-6 shadow-2xl" onClick={e => e.stopPropagation()}><h3 className="text-xl font-bold">{editingProgram ? 'Edit Program' : 'Add Program'}</h3><div className="mt-5 grid gap-4 sm:grid-cols-2"><input className={inputClass} placeholder="Program name *" value={programName} onChange={e => setProgramName(e.target.value)} /><input className={inputClass} placeholder="Code" value={programCode} onChange={e => setProgramCode(e.target.value)} /><select className={`${inputClass} sm:col-span-2`} value={programDepartmentId} onChange={e => setProgramDepartmentId(e.target.value)}><option value="">No department{institutionType !== 'training_center' ? ' (optional)' : ''}</option>{departments.map(d => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}</select><textarea className={`${inputClass} sm:col-span-2`} rows={4} placeholder="Description" value={programDescription} onChange={e => setProgramDescription(e.target.value)} /></div><div className="mt-6 flex justify-end gap-2"><button type="button" className="rounded-xl border px-4 py-2.5" onClick={() => setShowProgramForm(false)}>Cancel</button><button type="button" className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white" onClick={saveProgram}>{editingProgram ? 'Save Program' : 'Add Program'}</button></div></div></div>}
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