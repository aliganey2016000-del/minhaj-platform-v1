import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Download, GraduationCap, Layers, MoreVertical, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { type InstitutionType, resolveInstitutionType, isHigherEdInstitutionType } from '../../../lib/institution-type';

type AcademicSystem = 'annual' | 'semester';
type StudentStatus = 'active' | 'inactive' | 'graduated' | 'suspended';
type ApprovalStatus = 'pending' | 'approved' | 'rejected';

type Organization = { _id: string; name: string; institutionType?: InstitutionType; organizationType?: InstitutionType };
type AcademicStructure = { academicSystem: AcademicSystem; semestersPerAcademicYear: 1 | 2 | 3; usesFaculty?: boolean };
type Faculty = { _id: string; name: string; code?: string };
type Department = { _id: string; name: string; code?: string; facultyId?: string | Faculty | null };
type Program = { _id: string; name: string; code?: string; department?: string | { _id: string; name: string } | null };
type ClassItem = {
  _id: string; title: string; section?: string; room?: string; capacity?: number; shiftMode?: string; batch?: string;
  department?: string; departmentId?: string; program?: string; programId?: string; gradeLevel?: number;
  academicYear?: string; studyYear?: number; semesterNumber?: number; semesterInYear?: number; status?: string;
};
type Student = {
  _id: string; studentId: string; status: StudentStatus; approvalStatus: ApprovalStatus; enrollmentDate: string;
  school?: { _id: string; name: string }; class?: { _id: string; title: string; section?: string };
  profile?: { firstName?: string; lastName?: string; gender?: string; avatar?: string };
  user?: { email?: string; phone?: string; isActive?: boolean; isVerified?: boolean };
  parent?: { relationship?: string; user?: { email?: string; phone?: string }; profile?: { firstName?: string; lastName?: string } };
  department?: string; shiftMode?: string; grade?: string; medicalNotes?: string;
  attendancePercentage?: number; gpa?: number; totalFeesPaid?: number; totalFeesDue?: number;
};

type FormState = {
  studentId: string; firstName: string; lastName: string; gender: string; email: string; password: string;
  school: string; classId: string; enrollmentDate: string; medicalNotes: string;
  guardianFullName: string; guardianEmail: string; guardianPassword: string; guardianPhone: string; guardianRelationship: string;
  attendancePercentage: string; gpa: string; totalFeesPaid: string; totalFeesDue: string;
};

const emptyForm: FormState = {
  studentId: '', firstName: '', lastName: '', gender: 'male', email: '', password: '', school: '', classId: '',
  enrollmentDate: new Date().toISOString().slice(0, 10), medicalNotes: '', guardianFullName: '', guardianEmail: '',
  guardianPassword: '', guardianPhone: '', guardianRelationship: 'Father', attendancePercentage: '0', gpa: '0',
  totalFeesPaid: '0', totalFeesDue: '0',
};

const statusOptions: { value: StudentStatus; label: string }[] = [
  { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'graduated', label: 'Graduated' }, { value: 'suspended', label: 'Suspended' },
];
const statusBadge: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200', inactive: 'bg-slate-50 text-slate-600 border-slate-200',
  graduated: 'bg-sky-50 text-sky-700 border-sky-200', suspended: 'bg-red-50 text-red-700 border-red-200',
};

function dataOf<T>(response: any): T {
  return (response?.data?.data ?? response?.data ?? []) as T;
}

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return <div><label className="mb-1 block text-xs font-semibold text-[var(--color-text-primary)]">{label}</label>{children}{error && <p className="mt-1 text-xs text-red-500">{error}</p>}</div>;
}

const inputClass = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

function StudentModal({ student, organization, classes, faculties, departments, programs, structure, onClose, onSaved }: {
  student?: Student; organization: Organization; classes: ClassItem[]; faculties: Faculty[]; departments: Department[]; programs: Program[]; structure: AcademicStructure | null;
  onClose: () => void; onSaved: () => void;
}) {
  const editing = Boolean(student);
  const [form, setForm] = useState<FormState>(() => student ? {
    ...emptyForm,
    studentId: student.studentId || '', firstName: student.profile?.firstName || '', lastName: student.profile?.lastName || '', gender: student.profile?.gender || 'male',
    email: student.user?.email || '', school: student.school?._id || organization._id, classId: student.class?._id || '', enrollmentDate: student.enrollmentDate?.slice(0, 10) || emptyForm.enrollmentDate,
    medicalNotes: student.medicalNotes || '', guardianFullName: `${student.parent?.profile?.firstName || ''} ${student.parent?.profile?.lastName || ''}`.trim(),
    guardianEmail: student.parent?.user?.email || '', guardianPhone: student.parent?.user?.phone || '', guardianRelationship: student.parent?.relationship || 'Father',
    attendancePercentage: String(student.attendancePercentage ?? 0), gpa: String(student.gpa ?? 0), totalFeesPaid: String(student.totalFeesPaid ?? 0), totalFeesDue: String(student.totalFeesDue ?? 0),
  } : { ...emptyForm, school: organization._id });
  const [facultyId, setFacultyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);

  const type = resolveInstitutionType(organization);
  const higherEd = isHigherEdInstitutionType(type);
  const usesFaculty = higherEd && Boolean(structure?.usesFaculty || type === 'university');

  const selectedClass = classes.find(c => c._id === form.classId);
  const facultyForDepartment = (d?: Department) => !d ? undefined : (typeof d.facultyId === 'object' ? d.facultyId?._id : d.facultyId);
  const filteredDepartments = useMemo(() => facultyId ? departments.filter(d => facultyForDepartment(d) === facultyId) : departments, [departments, facultyId]);
  const filteredPrograms = useMemo(() => departmentId ? programs.filter(p => String(typeof p.department === 'object' ? p.department?._id : p.department) === departmentId) : programs, [programs, departmentId]);
  const filteredClasses = useMemo(() => classes.filter(c => {
    if (type === 'school') return true;
    if (usesFaculty && facultyId && c.departmentId) {
      const d = departments.find(x => x._id === c.departmentId); if (d && facultyForDepartment(d) !== facultyId) return false;
    }
    if (departmentId && c.departmentId !== departmentId) return false;
    if (programId && c.programId !== programId) return false;
    return true;
  }), [classes, type, usesFaculty, facultyId, departmentId, programId, departments]);

  useEffect(() => {
    if (!student?.class?._id) return;
    const cls = classes.find(c => c._id === student.class?._id); if (!cls) return;
    setDepartmentId(cls.departmentId || ''); setProgramId(cls.programId || '');
    if (cls.departmentId) { const d = departments.find(x => x._id === cls.departmentId); if (d) setFacultyId(facultyForDepartment(d) || ''); }
  }, [student, classes, departments]);

  useEffect(() => { if (!higherEd) return; if (facultyId && departmentId && !filteredDepartments.some(d => d._id === departmentId)) setDepartmentId(''); }, [facultyId, departmentId, filteredDepartments, higherEd]);
  useEffect(() => { if (departmentId && programId && !filteredPrograms.some(p => p._id === programId)) setProgramId(''); }, [departmentId, programId, filteredPrograms]);
  useEffect(() => { if (form.classId && !filteredClasses.some(c => c._id === form.classId)) setForm(f => ({ ...f, classId: '' })); }, [filteredClasses, form.classId]);

  const change = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.classId) { setError('First name, last name, email and class/cohort are required.'); return; }
    if (!editing && form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (editing && form.password && form.password.length < 8) { setError('New password must be at least 8 characters.'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        studentId: form.studentId.trim() || undefined, firstName: form.firstName.trim(), lastName: form.lastName.trim(), gender: form.gender,
        email: form.email.trim(), school: form.school, classId: form.classId, enrollmentDate: form.enrollmentDate, medicalNotes: form.medicalNotes || undefined,
        guardianFullName: form.guardianFullName.trim() || undefined, guardianEmail: form.guardianEmail.trim() || undefined, guardianPassword: form.guardianPassword || undefined,
        guardianPhone: form.guardianPhone.trim() || undefined, guardianRelationship: form.guardianRelationship,
        attendancePercentage: Number(form.attendancePercentage) || 0, gpa: Number(form.gpa) || 0, totalFeesPaid: Number(form.totalFeesPaid) || 0, totalFeesDue: Number(form.totalFeesDue) || 0,
      };
      if (!editing) payload.password = form.password;
      else if (form.password) payload.password = form.password;
      await (editing ? api.patch(`/students/${student!._id}`, payload) : api.post('/students', payload));
      onSaved(); onClose();
    } catch (err: any) { setError(err?.response?.data?.message || err?.message || 'Failed to save student.'); }
    finally { setSaving(false); }
  };

  const academic = selectedClass ? {
    faculty: selectedClass.departmentId ? facultyForDepartment(departments.find(d => d._id === selectedClass.departmentId)) ? faculties.find(f => f._id === facultyForDepartment(departments.find(d => d._id === selectedClass.departmentId)))?.name : undefined : undefined,
    department: selectedClass.department || departments.find(d => d._id === selectedClass.departmentId)?.name,
    program: selectedClass.program || programs.find(p => p._id === selectedClass.programId)?.name,
  } : null;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm" onClick={onClose}>
    <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] p-4 shadow-2xl sm:p-6" onClick={e => e.stopPropagation()}>
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-[var(--color-text-primary)]">{editing ? 'Edit Student' : 'Add Student'}</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{organization.name} · {type.replace('_', ' ')}</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]"><X className="h-5 w-5" /></button></div>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Student ID"><input className={inputClass} name="studentId" value={form.studentId} onChange={change} placeholder="Auto-generate if blank" /></Field>
          <Field label="Enrollment Date"><input className={inputClass} type="date" name="enrollmentDate" value={form.enrollmentDate} onChange={change} /></Field>
          <Field label="First Name *"><input className={inputClass} name="firstName" value={form.firstName} onChange={change} required /></Field>
          <Field label="Last Name *"><input className={inputClass} name="lastName" value={form.lastName} onChange={change} required /></Field>
          <Field label="Gender"><select className={inputClass} name="gender" value={form.gender} onChange={change}><option value="male">Male</option><option value="female">Female</option></select></Field>
          <Field label="Email *"><input className={inputClass} type="email" name="email" value={form.email} onChange={change} required /></Field>
          <Field label={editing ? 'Reset Password' : 'Password *'}><input className={inputClass} type="password" name="password" value={form.password} onChange={change} placeholder={editing ? 'Leave blank to keep current' : 'Minimum 8 characters'} required={!editing} /></Field>
        </div>

        <section className="rounded-2xl border border-[var(--color-border-default)] p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary-600" /><div><h3 className="font-semibold">Academic Placement</h3><p className="text-xs text-[var(--color-text-tertiary)]">Academic structure is inherited from Organization Management and the selected class.</p></div></div>
          {type === 'school' && <Field label="Class *"><select className={inputClass} name="classId" value={form.classId} onChange={change} required><option value="">Select grade/class...</option>{classes.map(c => <option key={c._id} value={c._id}>{c.title}{c.section ? ` — Section ${c.section}` : ''}</option>)}</select></Field>}
          {higherEd && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {usesFaculty && <Field label="Faculty *"><select className={inputClass} value={facultyId} onChange={e => { setFacultyId(e.target.value); setDepartmentId(''); setProgramId(''); setForm(f => ({ ...f, classId: '' })); }}><option value="">Select faculty...</option>{faculties.map(f => <option key={f._id} value={f._id}>{f.name}{f.code ? ` (${f.code})` : ''}</option>)}</select></Field>}
            <Field label="Department *"><select className={inputClass} value={departmentId} onChange={e => { setDepartmentId(e.target.value); setProgramId(''); setForm(f => ({ ...f, classId: '' })); }} disabled={usesFaculty && !facultyId}><option value="">Select department...</option>{filteredDepartments.map(d => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}</select></Field>
            <Field label="Program *"><select className={inputClass} value={programId} onChange={e => { setProgramId(e.target.value); setForm(f => ({ ...f, classId: '' })); }} disabled={!departmentId}><option value="">Select program...</option>{filteredPrograms.map(p => <option key={p._id} value={p._id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}</select></Field>
            <Field label="Class / Cohort *"><select className={inputClass} name="classId" value={form.classId} onChange={change} required disabled={!departmentId || (usesFaculty && !facultyId)}><option value="">Select cohort/class...</option>{filteredClasses.map(c => <option key={c._id} value={c._id}>{c.title}{c.section ? ` — Section ${c.section}` : ''}</option>)}</select></Field>
          </div>}
          {type === 'training_center' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Program"><select className={inputClass} value={programId} onChange={e => { setProgramId(e.target.value); setForm(f => ({ ...f, classId: '' })); }}><option value="">All programs...</option>{programs.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field><Field label="Batch / Cohort *"><select className={inputClass} name="classId" value={form.classId} onChange={change} required><option value="">Select batch/cohort...</option>{filteredClasses.map(c => <option key={c._id} value={c._id}>{c.title}{c.batch ? ` · ${c.batch}` : ''}</option>)}</select></Field></div>}
          {selectedClass && <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs sm:grid-cols-4">
            {academic?.faculty && <div><span className="text-[var(--color-text-tertiary)]">Faculty</span><div className="font-semibold">{academic.faculty}</div></div>}
            {academic?.department && <div><span className="text-[var(--color-text-tertiary)]">Department</span><div className="font-semibold">{academic.department}</div></div>}
            {academic?.program && <div><span className="text-[var(--color-text-tertiary)]">Program</span><div className="font-semibold">{academic.program}</div></div>}
            <div><span className="text-[var(--color-text-tertiary)]">Academic Year</span><div className="font-semibold">{selectedClass.academicYear || '—'}</div></div>
            {type === 'school' && <div><span className="text-[var(--color-text-tertiary)]">Grade</span><div className="font-semibold">{selectedClass.gradeLevel ?? '—'}</div></div>}
            {higherEd && selectedClass.studyYear && <div><span className="text-[var(--color-text-tertiary)]">Study Year</span><div className="font-semibold">Year {selectedClass.studyYear}</div></div>}
            {higherEd && structure?.academicSystem === 'semester' && selectedClass.semesterNumber && <div><span className="text-[var(--color-text-tertiary)]">Semester</span><div className="font-semibold">S{selectedClass.semesterNumber} · {selectedClass.semesterInYear ? `Term ${selectedClass.semesterInYear}` : ''}</div></div>}
            {selectedClass.shiftMode && <div><span className="text-[var(--color-text-tertiary)]">Shift</span><div className="font-semibold">{selectedClass.shiftMode}</div></div>}
          </div>}
        </section>

        <Field label="Medical Notes"><textarea className={inputClass} rows={2} name="medicalNotes" value={form.medicalNotes} onChange={change} /></Field>
        <section className="rounded-2xl border border-[var(--color-border-default)] p-3 sm:p-4"><h3 className="mb-3 font-semibold">Parent / Guardian (Optional)</h3><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Full Name"><input className={inputClass} name="guardianFullName" value={form.guardianFullName} onChange={change} /></Field><Field label="Relationship"><select className={inputClass} name="guardianRelationship" value={form.guardianRelationship} onChange={change}><option>Father</option><option>Mother</option><option>Guardian</option><option>Other</option></select></Field><Field label="Email"><input className={inputClass} type="email" name="guardianEmail" value={form.guardianEmail} onChange={change} /></Field><Field label="Phone"><input className={inputClass} type="tel" name="guardianPhone" value={form.guardianPhone} onChange={change} /></Field><Field label="Guardian Password"><input className={inputClass} type="password" name="guardianPassword" value={form.guardianPassword} onChange={change} placeholder="Optional" /></Field></div></section>
        {editing && <section className="rounded-2xl border border-[var(--color-border-default)] p-3 sm:p-4"><h3 className="mb-3 font-semibold">Academic / Finance Summary</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Field label="Attendance %"><input className={inputClass} type="number" min="0" max="100" name="attendancePercentage" value={form.attendancePercentage} onChange={change} /></Field><Field label="GPA"><input className={inputClass} type="number" min="0" max="4" step="0.1" name="gpa" value={form.gpa} onChange={change} /></Field><Field label="Fees Paid"><input className={inputClass} type="number" min="0" name="totalFeesPaid" value={form.totalFeesPaid} onChange={change} /></Field><Field label="Fees Due"><input className={inputClass} type="number" min="0" name="totalFeesDue" value={form.totalFeesDue} onChange={change} /></Field></div></section>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={saving} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Student'}</button></div>
      </form>
    </div>
  </div>;
}

export function StudentsManage() {
  const { user } = useAuth();
  const organizationId = user?.organizationId || '';
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [structure, setStructure] = useState<AcademicStructure | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]); const [faculties, setFaculties] = useState<Faculty[]>([]); const [departments, setDepartments] = useState<Department[]>([]); const [programs, setPrograms] = useState<Program[]>([]);
  const [students, setStudents] = useState<Student[]>([]); const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0); const [limit] = useState(20);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; student?: Student }>({ open: false }); const [view, setView] = useState<Student | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const type = resolveInstitutionType(organization);
  const higherEd = isHigherEdInstitutionType(type);

  const loadMeta = useCallback(async () => {
    if (!organizationId) return;
    try {
      const org = dataOf<Organization>(await api.get(`/schools/${organizationId}`));
      setOrganization(org);

      const orgType = resolveInstitutionType(org);
      const isHigherEd = isHigherEdInstitutionType(orgType);
      const isTrainingCenter = orgType === 'training_center';
      const requests: Promise<any>[] = [api.get(`/classes?schoolId=${organizationId}&status=active&limit=200`)];

      // Schools do not have Program/Department/Faculty routes in their academic model.
      // Only request metadata that belongs to the current institution type.
      if (isHigherEd || isTrainingCenter) requests.push(api.get(`/programs?school=${organizationId}`));
      if (isHigherEd) {
        requests.push(api.get(`/departments?school=${organizationId}`));
        requests.push(api.get(`/faculties?school=${organizationId}`));
        requests.push(api.get('/classes/academic-structure'));
      }

      const results = await Promise.all(requests);
      setClasses(dataOf<ClassItem[]>(results[0]) || []);

      if (isHigherEd || isTrainingCenter) setPrograms(dataOf<Program[]>(results[1]) || []);
      else setPrograms([]);

      if (isHigherEd) {
        setDepartments(dataOf<Department[]>(results[2]) || []);
        setFaculties(dataOf<Faculty[]>(results[3]) || []);
        setStructure(dataOf<AcademicStructure>(results[4]) || null);
      } else {
        setDepartments([]);
        setFaculties([]);
        setStructure(null);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load organization structure.');
    }
  }, [organizationId]);

  const loadStudents = useCallback(async () => {
    if (!organizationId) return; setLoading(true); setError('');
    try {
      const params: Record<string, string | number> = { page, limit, school: organizationId }; if (search.trim()) params.search = search.trim(); if (status) params.status = status; if (classFilter) params.classId = classFilter;
      const res = await api.get('/students', { params }); const payload: any = res.data; setStudents(payload.data || []); setTotal(payload.pagination?.total ?? payload.meta?.total ?? 0); setSelected([]);
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to load students.'); } finally { setLoading(false); }
  }, [organizationId, page, limit, search, status, classFilter]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { const t = window.setTimeout(loadStudents, 250); return () => window.clearTimeout(t); }, [loadStudents]);

  const updateStatus = async (student: Student, next: StudentStatus) => { try { await api.patch(`/students/${student._id}`, { status: next }); await loadStudents(); } catch (err: any) { setError(err?.response?.data?.message || 'Failed to update status.'); } };
  const removeStudent = async (id: string) => { if (!window.confirm('Move this student to Trash?')) return; try { await api.delete(`/students/${id}`); await loadStudents(); } catch (err: any) { setError(err?.response?.data?.message || 'Failed to delete student.'); } };
  const bulkDelete = async () => { if (!selected.length || !window.confirm(`Move ${selected.length} selected students to Trash?`)) return; try { await api.delete('/students/bulk', { data: { ids: selected } }); await loadStudents(); } catch (err: any) { setError(err?.response?.data?.message || 'Bulk delete failed.'); } };
  const approve = async (s: Student) => { try { await api.patch(`/students/${s._id}/approve`); await loadStudents(); } catch (err: any) { setError(err?.response?.data?.message || 'Approval failed.'); } };
  const reject = async (s: Student) => { try { await api.patch(`/students/${s._id}/reject`); await loadStudents(); } catch (err: any) { setError(err?.response?.data?.message || 'Rejection failed.'); } };

  const exportStudents = async (report = false) => { try { const res = await api.get(report ? '/students/report/export' : '/students/export', { responseType: 'blob' }); const blob = new Blob([res.data]); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = report ? 'student-report.xlsx' : 'students.xlsx'; a.click(); URL.revokeObjectURL(url); } catch (err: any) { setError(err?.response?.data?.message || 'Export failed.'); } };
  const importStudents = async (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; const body = new FormData(); body.append('file', file); try { await api.post('/students/import', body, { headers: { 'Content-Type': 'multipart/form-data' } }); await loadStudents(); } catch (err: any) { setError(err?.response?.data?.message || 'Import failed.'); } };

  const allSelected = students.length > 0 && students.every(s => selected.includes(s._id));
  const toggleAll = () => setSelected(allSelected ? [] : students.map(s => s._id));
  const pages = Math.max(1, Math.ceil(total / limit));
  const classLabel = (s: Student) => s.class ? `${s.class.title}${s.class.section ? ` — ${s.class.section}` : ''}` : '—';

  return <div className="space-y-5 p-4 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h1 className="truncate text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">Manage Students</h1><p className="mt-1 truncate text-sm text-[var(--color-text-tertiary)]">{organization?.name || 'Organization'} · {total} total students</p></div><div className="relative shrink-0"><button aria-label="Student actions" onClick={() => setMenuOpen(v => !v)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm hover:bg-[var(--color-surface-secondary)]"><MoreVertical className="h-5 w-5" /></button>{menuOpen && <><button className="fixed inset-0 z-30 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close actions" /><div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-xl border bg-[var(--color-surface-primary)] p-1 shadow-xl"><button onClick={() => { setMenuOpen(false); setModal({ open: true }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-secondary)]"><Plus className="h-4 w-4" /> Add Student</button><button onClick={() => { setMenuOpen(false); fileRef.current?.click(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Upload className="h-4 w-4" /> Import</button><button onClick={() => { setMenuOpen(false); exportStudents(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Download className="h-4 w-4" /> Export</button><button onClick={() => { setMenuOpen(false); exportStudents(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Layers className="h-4 w-4" /> Student Report</button>{selected.length > 0 && <button onClick={() => { setMenuOpen(false); bulkDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete Selected ({selected.length})</button>}</div></>}</div></div>
    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importStudents} />

    {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

    <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input className={`${inputClass} pl-9`} placeholder="Search student, ID, email or phone..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div><select className={`${inputClass} sm:w-44`} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All Status</option>{statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select><select className={`${inputClass} sm:w-60`} value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(1); }}><option value="">All {type === 'school' ? 'Classes' : type === 'training_center' ? 'Batches' : 'Cohorts'}</option>{classes.map(c => <option key={c._id} value={c._id}>{c.title}{c.section ? ` — ${c.section}` : ''}</option>)}</select><button onClick={loadStudents} className="rounded-xl border p-2.5" title="Refresh"><RefreshCw className="h-5 w-5" /></button></div>

    <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
      <div className="flex items-center justify-between border-b px-3 py-3 sm:px-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select page</label><span className="text-xs text-[var(--color-text-tertiary)]">{higherEd ? (type === 'university' ? 'University students' : 'College students') : type === 'training_center' ? 'Training center learners' : 'School students'}</span></div>
      {loading ? <div className="flex items-center justify-center py-16 text-sm text-[var(--color-text-tertiary)]"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading students…</div> : students.length === 0 ? <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">No students found.</div> : <div className="divide-y">{students.map(s => <div key={s._id} className="flex items-start gap-3 p-3 sm:p-4"><input className="mt-1" type="checkbox" checked={selected.includes(s._id)} onChange={() => setSelected(v => v.includes(s._id) ? v.filter(x => x !== s._id) : [...v, s._id])} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><button onClick={() => setView(s)} className="font-semibold hover:text-primary-600">{s.profile?.firstName} {s.profile?.lastName}</button><span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusBadge[s.status] || statusBadge.inactive}`}>{s.status}</span>{s.approvalStatus === 'pending' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">Pending approval</span>}</div><div className="mt-1 grid grid-cols-1 gap-1 text-xs text-[var(--color-text-tertiary)] sm:grid-cols-2 lg:grid-cols-4"><span>{s.studentId}</span><span>{s.user?.email || 'No email'}</span><span>{classLabel(s)}</span><span>{higherEd ? `${s.department || '—'}${s.shiftMode ? ` · ${s.shiftMode}` : ''}` : `${s.grade || 'Grade —'}${s.shiftMode ? ` · ${s.shiftMode}` : ''}`}</span></div></div><div className="flex shrink-0 items-center gap-1"><button title="Edit" onClick={() => setModal({ open: true, student: s })} className="rounded-lg p-2 hover:bg-[var(--color-surface-secondary)]"><Pencil className="h-4 w-4" /></button><button title="Delete" onClick={() => removeStudent(s._id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}
      <div className="flex flex-col gap-2 border-t px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-[var(--color-text-tertiary)]">Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
    </div>

    {modal.open && organization && <StudentModal student={modal.student} organization={organization} classes={classes} faculties={faculties} departments={departments} programs={programs} structure={structure} onClose={() => setModal({ open: false })} onSaved={loadStudents} />}
    {view && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setView(null)}><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}><div className="mb-4 flex items-start justify-between"><div><h2 className="text-xl font-bold">{view.profile?.firstName} {view.profile?.lastName}</h2><p className="text-sm text-[var(--color-text-tertiary)]">{view.studentId}</p></div><button onClick={() => setView(null)}><X className="h-5 w-5" /></button></div><div className="grid grid-cols-2 gap-3 text-sm"><div><span className="text-xs text-[var(--color-text-tertiary)]">Organization</span><div>{view.school?.name || organization?.name}</div></div><div><span className="text-xs text-[var(--color-text-tertiary)]">Class / Cohort</span><div>{classLabel(view)}</div></div>{higherEd && <><div><span className="text-xs text-[var(--color-text-tertiary)]">Department</span><div>{view.department || '—'}</div></div><div><span className="text-xs text-[var(--color-text-tertiary)]">Academic System</span><div>{structure?.academicSystem || '—'}</div></div></>} {!higherEd && <div><span className="text-xs text-[var(--color-text-tertiary)]">Grade</span><div>{view.grade || '—'}</div></div>}<div><span className="text-xs text-[var(--color-text-tertiary)]">Status</span><div>{view.status}</div></div><div><span className="text-xs text-[var(--color-text-tertiary)]">Enrollment</span><div>{view.enrollmentDate ? new Date(view.enrollmentDate).toLocaleDateString() : '—'}</div></div><div><span className="text-xs text-[var(--color-text-tertiary)]">Email</span><div className="break-all">{view.user?.email || '—'}</div></div><div><span className="text-xs text-[var(--color-text-tertiary)]">Guardian</span><div>{view.parent?.profile ? `${view.parent.profile.firstName || ''} ${view.parent.profile.lastName || ''}`.trim() : '—'}</div></div></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><button onClick={() => { setView(null); setModal({ open: true, student: view }); }} className="rounded-xl border px-3 py-2 text-sm font-semibold">Edit</button>{view.approvalStatus === 'pending' && <><button onClick={() => { approve(view); setView(null); }} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Approve</button><button onClick={() => { reject(view); setView(null); }} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white">Reject</button></>}<button onClick={() => { removeStudent(view._id); setView(null); }} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600">Delete</button></div></div></div>}
  </div>;
}
