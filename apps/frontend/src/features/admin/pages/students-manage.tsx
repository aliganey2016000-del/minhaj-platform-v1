import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Clipboard, Download, GraduationCap, Layers, MoreVertical, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { type InstitutionType, resolveInstitutionType, isHigherEdInstitutionType } from '../../../lib/institution-type';
import { useNavigate } from 'react-router-dom';

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
type StudentDocumentType = { _id: string; name: string; isRequired: boolean; allowedMimeTypes: string[] };
type AttachmentDraft = { id: number; documentType: string; file: File | null };
type EducationBackground = { previousInstitution: string; previousQualification: string; graduationYear: string; notes: string };

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

// Column-for-column with student-import.controller.ts. Academic Year and Batch
// Number disambiguate repeat cohorts from new intakes after year-end promotion.
const STUDENT_IMPORT_HEADERS = [
  'Student ID', 'First Name', 'Last Name', 'Gender', 'Email', 'Password',
  'Organization', 'Class Name', 'Section', 'Academic Year', 'Batch Number', 'Grade', 'Enrollment Date', 'Medical Notes',
  'Guardian Name', 'Guardian Email', 'Guardian Password', 'Guardian Phone', 'Relationship',
];

function dataOf<T>(response: any): T {
  return (response?.data?.data ?? response?.data ?? []) as T;
}

function classOptionLabel(cls: ClassItem, showStatus = true): string {
  const parts = [
    cls.title,
    cls.section ? `Section ${cls.section}` : '',
    cls.academicYear || '',
    cls.batch ? `Batch ${cls.batch}` : '',
  ].filter(Boolean);
  const statusLabel = showStatus && cls.status && cls.status !== 'active' ? ` [${cls.status}]` : '';
  return `${parts.join(' · ')}${statusLabel}`;
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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [documentTypes, setDocumentTypes] = useState<StudentDocumentType[]>([]);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [educationBackground, setEducationBackground] = useState<EducationBackground>({ previousInstitution: '', previousQualification: '', graduationYear: '', notes: '' });

  const type = resolveInstitutionType(organization);
  const higherEd = isHigherEdInstitutionType(type);
  const usesFaculty = higherEd && Boolean(structure?.usesFaculty);
  const currentClassId = student?.class?._id || '';

  useEffect(() => {
    api.get('/students/document-types', { params: { schoolId: organization._id } })
      .then(response => setDocumentTypes(dataOf<StudentDocumentType[]>(response) || []))
      .catch(() => setDocumentTypes([]));
  }, [organization._id]);

  useEffect(() => {
    if (!student?._id) return;
    api.get(`/students/${student._id}/registration`).then(response => {
      const registration = dataOf<any>(response);
      if (registration) setEducationBackground({
        previousInstitution: registration.previousInstitution || '',
        previousQualification: registration.previousQualification || '',
        graduationYear: registration.graduationYear ? String(registration.graduationYear) : '',
        notes: registration.notes || '',
      });
    }).catch(() => undefined);
  }, [student?._id]);

  const selectedClass = classes.find(c => c._id === form.classId);
  const facultyForDepartment = (d?: Department) => !d ? undefined : (typeof d.facultyId === 'object' ? d.facultyId?._id : d.facultyId);
  const filteredDepartments = useMemo(() => facultyId ? departments.filter(d => facultyForDepartment(d) === facultyId) : departments, [departments, facultyId]);
  const filteredPrograms = useMemo(() => departmentId ? programs.filter(p => String(typeof p.department === 'object' ? p.department?._id : p.department) === departmentId) : programs, [programs, departmentId]);
  const filteredClasses = useMemo(() => classes.filter(c => {
    // New placement is active-only. While editing, keep the student's own
    // completed historical class visible so a graduate can be edited without
    // being forced into another class merely to save their profile.
    if (c.status !== 'active' && c._id !== currentClassId) return false;
    if (type === 'school') return true;
    if (usesFaculty && facultyId && c.departmentId) {
      const d = departments.find(x => x._id === c.departmentId); if (d && facultyForDepartment(d) !== facultyId) return false;
    }
    if (departmentId && c.departmentId !== departmentId) return false;
    if (programId && c.programId !== programId) return false;
    return true;
  }), [classes, currentClassId, type, usesFaculty, facultyId, departmentId, programId, departments]);

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
    if (photoFile && photoFile.size > 10 * 1024 * 1024) { setError('Profile photo must be 10 MB or smaller.'); return; }
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
      const response = await (editing ? api.patch(`/students/${student!._id}`, payload) : api.post('/students', payload));
      const savedStudentId = editing ? student!._id : response.data?.data?._id;
      if (!savedStudentId) throw new Error('Student was saved but no student ID was returned');
      if (photoFile) {
        const photoBody = new FormData(); photoBody.append('photo', photoFile);
        await api.post(`/students/${savedStudentId}/photo`, photoBody);
      }
      for (const attachment of attachments) {
        if (!attachment.file || !attachment.documentType) continue;
        const documentBody = new FormData();
        documentBody.append('documentType', attachment.documentType);
        documentBody.append('file', attachment.file);
        await api.post(`/students/${savedStudentId}/documents`, documentBody);
      }
      await api.post(`/students/${savedStudentId}/registration`, {
        previousInstitution: educationBackground.previousInstitution.trim() || undefined,
        previousQualification: educationBackground.previousQualification.trim() || undefined,
        graduationYear: educationBackground.graduationYear ? Number(educationBackground.graduationYear) : undefined,
        notes: educationBackground.notes.trim() || undefined,
        applicationStatus: 'draft',
      });
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
          <Field label="Profile Photo (Optional)"><input className={inputClass} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={e => setPhotoFile(e.target.files?.[0] || null)} /><span className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">JPEG, PNG, GIF, or WebP. Maximum 10 MB.</span></Field>
        </div>

        <section className="rounded-2xl border border-[var(--color-border-default)] p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary-600" /><div><h3 className="font-semibold">Academic Placement</h3><p className="text-xs text-[var(--color-text-tertiary)]">Academic structure is inherited from Organization Management and the selected class.</p></div></div>
          {selectedClass?.status && selectedClass.status !== 'active' && <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><strong>Historical class:</strong> this student may remain linked to {classOptionLabel(selectedClass)}. Choose an active class only if you intend to move the student.</div>}
          {type === 'school' && <Field label="Class *"><select className={inputClass} name="classId" value={form.classId} onChange={change} required><option value="">Select grade/class...</option>{filteredClasses.map(c => <option key={c._id} value={c._id}>{classOptionLabel(c)}</option>)}</select></Field>}
          {higherEd && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {usesFaculty && <Field label="Faculty *"><select className={inputClass} value={facultyId} onChange={e => { setFacultyId(e.target.value); setDepartmentId(''); setProgramId(''); setForm(f => ({ ...f, classId: '' })); }}><option value="">Select faculty...</option>{faculties.map(f => <option key={f._id} value={f._id}>{f.name}{f.code ? ` (${f.code})` : ''}</option>)}</select></Field>}
            <Field label="Department *"><select className={inputClass} value={departmentId} onChange={e => { setDepartmentId(e.target.value); setProgramId(''); setForm(f => ({ ...f, classId: '' })); }} disabled={usesFaculty && !facultyId}><option value="">Select department...</option>{filteredDepartments.map(d => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}</select></Field>
            <Field label="Program *"><select className={inputClass} value={programId} onChange={e => { setProgramId(e.target.value); setForm(f => ({ ...f, classId: '' })); }} disabled={!departmentId}><option value="">Select program...</option>{filteredPrograms.map(p => <option key={p._id} value={p._id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}</select></Field>
            <Field label="Class / Cohort *"><select className={inputClass} name="classId" value={form.classId} onChange={change} required disabled={!departmentId || (usesFaculty && !facultyId)}><option value="">Select cohort/class...</option>{filteredClasses.map(c => <option key={c._id} value={c._id}>{classOptionLabel(c)}</option>)}</select></Field>
          </div>}
          {type === 'training_center' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Program"><select className={inputClass} value={programId} onChange={e => { setProgramId(e.target.value); setForm(f => ({ ...f, classId: '' })); }}><option value="">All programs...</option>{programs.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field><Field label="Batch / Cohort *"><select className={inputClass} name="classId" value={form.classId} onChange={change} required><option value="">Select batch/cohort...</option>{filteredClasses.map(c => <option key={c._id} value={c._id}>{classOptionLabel(c)}</option>)}</select></Field></div>}
          {selectedClass && <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs sm:grid-cols-4">
            {academic?.faculty && <div><span className="text-[var(--color-text-tertiary)]">Faculty</span><div className="font-semibold">{academic.faculty}</div></div>}
            {academic?.department && <div><span className="text-[var(--color-text-tertiary)]">Department</span><div className="font-semibold">{academic.department}</div></div>}
            {academic?.program && <div><span className="text-[var(--color-text-tertiary)]">Program</span><div className="font-semibold">{academic.program}</div></div>}
            <div><span className="text-[var(--color-text-tertiary)]">Academic Year</span><div className="font-semibold">{selectedClass.academicYear || '—'}</div></div>
            {selectedClass.batch && <div><span className="text-[var(--color-text-tertiary)]">Batch</span><div className="font-semibold">{selectedClass.batch}</div></div>}
            {type === 'school' && <div><span className="text-[var(--color-text-tertiary)]">Grade</span><div className="font-semibold">{selectedClass.gradeLevel ?? (selectedClass.title || '—')}</div></div>}
            {higherEd && selectedClass.studyYear && <div><span className="text-[var(--color-text-tertiary)]">Study Year</span><div className="font-semibold">Year {selectedClass.studyYear}</div></div>}
            {higherEd && structure?.academicSystem === 'semester' && selectedClass.semesterNumber && <div><span className="text-[var(--color-text-tertiary)]">Semester</span><div className="font-semibold">S{selectedClass.semesterNumber} · {selectedClass.semesterInYear ? `Term ${selectedClass.semesterInYear}` : ''}</div></div>}
            {selectedClass.shiftMode && <div><span className="text-[var(--color-text-tertiary)]">Shift</span><div className="font-semibold">{selectedClass.shiftMode}</div></div>}
          </div>}
        </section>

        <section className="rounded-2xl border border-[var(--color-border-default)] p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary-600" /><div><h3 className="font-semibold">Previous Education / Background</h3><p className="text-xs text-[var(--color-text-tertiary)]">Add the school, university, or training center the student attended before this organization.</p></div></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Previous school / university"><input className={inputClass} value={educationBackground.previousInstitution} onChange={e => setEducationBackground(value => ({ ...value, previousInstitution: e.target.value }))} placeholder="Institution name" /></Field>
            <Field label="Previous qualification / certificate"><input className={inputClass} value={educationBackground.previousQualification} onChange={e => setEducationBackground(value => ({ ...value, previousQualification: e.target.value }))} placeholder="e.g. High School Certificate" /></Field>
            <Field label="Graduation year"><input className={inputClass} type="number" min="1900" max="2200" value={educationBackground.graduationYear} onChange={e => setEducationBackground(value => ({ ...value, graduationYear: e.target.value }))} placeholder="e.g. 2025" /></Field>
            <Field label="Additional background notes"><textarea className={inputClass} rows={2} value={educationBackground.notes} onChange={e => setEducationBackground(value => ({ ...value, notes: e.target.value }))} placeholder="Transfer details, level, or other relevant information" /></Field>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-border-default)] p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Documents & Attachments</h3><p className="text-xs text-[var(--color-text-tertiary)]">Add one or more student documents. Required types are marked with *.</p></div><button type="button" onClick={() => setAttachments(value => [...value, { id: Date.now(), documentType: '', file: null }])} className="rounded-lg border border-primary-200 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50">+ Add document</button></div>
          {attachments.length === 0 && <p className="rounded-xl border border-dashed border-[var(--color-border-default)] p-3 text-xs text-[var(--color-text-tertiary)]">No new documents selected.</p>}
          <div className="space-y-2">{attachments.map(attachment => <div key={attachment.id} className="grid gap-2 rounded-xl bg-[var(--color-surface-secondary)] p-2 sm:grid-cols-[1fr_1fr_auto]"><select className={inputClass} value={attachment.documentType} onChange={e => setAttachments(value => value.map(item => item.id === attachment.id ? { ...item, documentType: e.target.value } : item))}><option value="">Select document type...</option>{documentTypes.map(documentType => <option key={documentType._id} value={documentType._id}>{documentType.name}{documentType.isRequired ? ' *' : ''}</option>)}</select><input className={inputClass} type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setAttachments(value => value.map(item => item.id === attachment.id ? { ...item, file: e.target.files?.[0] || null } : item))} /><button type="button" onClick={() => setAttachments(value => value.filter(item => item.id !== attachment.id))} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button></div>)}</div>
        </section>

        <Field label="Medical Notes"><textarea className={inputClass} rows={2} name="medicalNotes" value={form.medicalNotes} onChange={change} /></Field>
        <section className="rounded-2xl border border-[var(--color-border-default)] p-3 sm:p-4"><h3 className="mb-3 font-semibold">Parent / Guardian (Optional)</h3><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Full Name"><input className={inputClass} name="guardianFullName" value={form.guardianFullName} onChange={change} /></Field><Field label="Relationship"><select className={inputClass} name="guardianRelationship" value={form.guardianRelationship} onChange={change}><option>Father</option><option>Mother</option><option>Guardian</option><option>Other</option></select></Field><Field label="Email"><input className={inputClass} type="email" name="guardianEmail" value={form.guardianEmail} onChange={change} /></Field><Field label="Phone"><input className={inputClass} type="tel" name="guardianPhone" value={form.guardianPhone} onChange={change} /></Field><Field label="Guardian Password"><input className={inputClass} type="password" name="guardianPassword" value={form.guardianPassword} onChange={change} placeholder="Optional" /></Field></div></section>
        {editing && <section className="rounded-2xl border border-[var(--color-border-default)] p-3 sm:p-4"><h3 className="mb-3 font-semibold">Academic / Finance Summary</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Field label="Attendance %"><input className={inputClass} type="number" min="0" max="100" name="attendancePercentage" value={form.attendancePercentage} onChange={change} /></Field><Field label="GPA"><input className={inputClass} type="number" min="0" max="4" step="0.1" name="gpa" value={form.gpa} onChange={change} /></Field><Field label="Fees Paid"><input className={inputClass} type="number" min="0" name="totalFeesPaid" value={form.totalFeesPaid} onChange={change} /></Field><Field label="Fees Due"><input className={inputClass} type="number" min="0" name="totalFeesDue" value={form.totalFeesDue} onChange={change} /></Field></div></section>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={saving} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Student'}</button></div>
      </form>
    </div>
  </div>;
}

function StudentProfileModal({ student, organization, classLabel, onClose }: { student: Student; organization: Organization | null; classLabel: (student: Student) => string; onClose: () => void }) {
  const navigate = useNavigate();
  const fullName = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || 'Student';
  const initials = `${student.profile?.firstName?.[0] || ''}${student.profile?.lastName?.[0] || ''}`.toUpperCase();
  const openReport = (metric: string) => {
    if (metric === 'balance') navigate(`/admin/payments/balances/${student._id}`);
    else navigate(`/admin/students/${student._id}/personal-report`, { state: { section: metric === 'gpa' ? 'exams' : 'attendance' } });
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-emerald-600 px-6 py-7 text-white sm:px-8"><button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-white/80 hover:bg-white/15" aria-label="Close profile"><X className="h-5 w-5" /></button><div className="flex items-center gap-4"><div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-white/20 text-center text-2xl font-bold leading-[6rem] ring-4 ring-white/25">{student.profile?.avatar ? <img src={student.profile.avatar} alt={fullName} className="h-full w-full object-cover" /> : initials}</div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Student profile</p><h2 className="mt-1 truncate text-2xl font-bold">{fullName}</h2><p className="mt-1 font-mono text-sm text-white/80">{student.studentId}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{student.status}</span><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{organization?.name || student.school?.name || 'Organization'}</span></div></div></div></div>
      <div className="space-y-4 p-5 sm:p-7"><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-[var(--color-border-default)] p-4"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Contact</p><p className="text-sm"><span className="text-[var(--color-text-tertiary)]">Email</span><br /><strong className="break-all">{student.user?.email || '-'}</strong></p><p className="mt-3 text-sm"><span className="text-[var(--color-text-tertiary)]">Phone</span><br /><strong>{student.user?.phone || '-'}</strong></p></div><div className="rounded-xl border border-[var(--color-border-default)] p-4"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Academic</p><p className="text-sm"><span className="text-[var(--color-text-tertiary)]">Department / Grade</span><br /><strong>{student.department || student.grade || '-'}</strong></p><p className="mt-3 text-sm"><span className="text-[var(--color-text-tertiary)]">Class / Cohort</span><br /><strong>{classLabel(student)}</strong></p></div></div><div className="grid gap-3 sm:grid-cols-3"><div role="button" tabIndex={0} onClick={() => openReport('attendance')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openReport('attendance'); }} className="cursor-pointer rounded-xl bg-emerald-50 p-4 text-center text-emerald-800 transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-xl font-bold">{student.attendancePercentage ?? 0}%</p><p className="text-xs font-semibold">Attendance</p></div><div role="button" tabIndex={0} onClick={() => openReport('gpa')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openReport('gpa'); }} className="cursor-pointer rounded-xl bg-sky-50 p-4 text-center text-sky-800 transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-xl font-bold">{student.gpa ?? '-'}</p><p className="text-xs font-semibold">GPA</p></div><div role="button" tabIndex={0} onClick={() => openReport('balance')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openReport('balance'); }} className="cursor-pointer rounded-xl bg-amber-50 p-4 text-center text-amber-800 transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-xl font-bold">{student.totalFeesPaid ?? 0} / {student.totalFeesDue ?? 0}</p><p className="text-xs font-semibold">Balance</p></div></div><div className="rounded-xl border border-[var(--color-border-default)] p-4"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Guardian</p><p className="text-sm font-semibold">{student.parent?.profile ? `${student.parent.profile.firstName || ''} ${student.parent.profile.lastName || ''}`.trim() : 'No guardian linked'}</p><p className="mt-1 text-sm text-[var(--color-text-secondary)]">{student.parent?.user?.phone || '-'}</p></div><button onClick={onClose} className="w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-secondary)]">Close profile</button></div>
    </div>
  </div>;
}

function ResponsiveStudentsManage() {
  const { user } = useAuth();
  const organizationId = user?.organizationId || '';
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [structure, setStructure] = useState<AcademicStructure | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectingAll, setSelectingAll] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; student?: Student }>({ open: false });
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteError, setPasteError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ totalRows: number; created: number; failed: number; errors: { row: number; message: string }[] } | null>(null);

  const type = resolveInstitutionType(organization);
  const higherEd = isHigherEdInstitutionType(type);
  const limit = 20;
  const pages = Math.max(1, Math.ceil(total / limit));
  const activeClasses = useMemo(() => classes.filter(item => item.status === 'active'), [classes]);
  const classLabel = useCallback((student: Student) => {
    if (!student.class) return '-';
    const enriched = classes.find(item => item._id === student.class?._id);
    return enriched ? classOptionLabel(enriched, false) : `${student.class.title}${student.class.section ? ` · Section ${student.class.section}` : ''}`;
  }, [classes]);
  const academicLabel = (student: Student) => higherEd ? student.department || 'No department' : type === 'training_center' ? classLabel(student) : student.grade || 'No grade';

  const loadMeta = useCallback(async () => {
    if (!organizationId) return;
    try {
      const orgResponse = await api.get(`/schools/${organizationId}`);
      const org = dataOf<Organization>(orgResponse);
      const orgType = resolveInstitutionType(org);
      const higherEducation = isHigherEdInstitutionType(orgType);
      // Load active + historical classes. New assignments are filtered to
      // active classes in the UI, while a graduate's own completed class must
      // remain available when editing their non-academic profile fields.
      const requests: Promise<any>[] = [api.get('/classes', { params: { schoolId: organizationId, limit: 500 } })];
      if (higherEducation || orgType === 'training_center') requests.push(api.get('/programs', { params: { school: organizationId } }));
      if (higherEducation) {
        requests.push(api.get('/departments', { params: { school: organizationId } }));
        requests.push(api.get('/departments/faculties', { params: { school: organizationId } }));
        requests.push(api.get('/classes/academic-structure', { params: { schoolId: organizationId } }));
      }
      const results = await Promise.all(requests);
      setOrganization(org);
      setClasses(dataOf<ClassItem[]>(results[0]) || []);
      setPrograms(higherEducation || orgType === 'training_center' ? dataOf<Program[]>(results[1]) || [] : []);
      if (higherEducation) {
        setDepartments(dataOf<Department[]>(results[2]) || []);
        setFaculties(dataOf<Faculty[]>(results[3]) || []);
        setStructure(dataOf<AcademicStructure>(results[4]) || null);
      } else {
        setDepartments([]); setFaculties([]); setStructure(null);
      }
    } catch (err: any) {
      const endpoint = err.config?.url ? ` (${err.config.url})` : '';
      setError(err.response?.data?.message || `Failed to load organization structure${endpoint}.`);
    }
  }, [organizationId]);

  const loadStudents = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError('');
    try {
      const params: Record<string, string | number> = { page, limit, school: organizationId };
      if (search.trim()) params.search = search.trim();
      if (status) params.status = status;
      if (classFilter) params.classId = classFilter;
      const response = await api.get('/students', { params });
      const payload = response.data;
      setStudents(payload.data || []);
      setTotal(payload.pagination?.total ?? payload.meta?.total ?? 0);
    } catch (err: any) {
      const endpoint = err.config?.url ? ` (${err.config.url})` : '';
      setError(err.response?.data?.message || `Failed to load students${endpoint}.`);
    } finally { setLoading(false); }
  }, [organizationId, page, search, status, classFilter]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { const timer = window.setTimeout(loadStudents, 250); return () => window.clearTimeout(timer); }, [loadStudents]);

  const allSelected = total > 0 && selected.length === total;
  const toggleAll = async () => {
    if (selectingAll) return;
    if (allSelected) { setSelected([]); return; }
    setSelectingAll(true);
    try {
      const ids = new Set<string>();
      let currentPage = 1;
      const fetchLimit = 100;
      const baseParams: Record<string, string | number> = { limit: fetchLimit, school: organizationId };
      if (search.trim()) baseParams.search = search.trim();
      if (status) baseParams.status = status;
      if (classFilter) baseParams.classId = classFilter;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const response = await api.get('/students', { params: { ...baseParams, page: currentPage } });
        const payload: any = response.data;
        const batch: Student[] = payload.data || [];
        batch.forEach(student => ids.add(student._id));
        const reportedTotal = Number(payload.pagination?.total ?? payload.meta?.total ?? 0);
        const reportedPages = Number(payload.pagination?.pages ?? payload.pagination?.totalPages ?? payload.meta?.pages ?? 0);
        if (batch.length === 0 || (reportedPages > 0 && currentPage >= reportedPages) || batch.length < fetchLimit || (reportedTotal > 0 && ids.size >= reportedTotal)) break;
        currentPage += 1;
      }
      setSelected(Array.from(ids));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to select all students.');
    } finally { setSelectingAll(false); }
  };

  const removeStudent = async (id: string) => {
    if (!window.confirm('Move this student to Trash?')) return;
    try { await api.delete(`/students/${id}`); await loadStudents(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete student.'); }
  };
  const bulkDelete = async () => {
    if (!selected.length || !window.confirm(`Move ${selected.length} selected students to Trash?`)) return;
    try { await api.delete('/students/bulk', { data: { ids: selected } }); await loadStudents(); } catch (err: any) { setError(err.response?.data?.message || 'Bulk delete failed.'); }
  };
  const exportStudents = async (report = false) => {
    try {
      const response = await api.get(report ? '/students/report/export' : '/students/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data]));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = report ? 'student-report.xlsx' : 'students.xlsx'; anchor.click(); URL.revokeObjectURL(url);
    } catch (err: any) { setError(err.response?.data?.message || 'Export failed.'); }
  };
  const downloadTemplate = async () => {
    try {
      const response = await api.get('/students/template', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data]));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'students-template.xlsx'; anchor.click(); URL.revokeObjectURL(url);
    } catch { setError('Failed to download template.'); }
  };

  const openImportModal = () => { setShowImportModal(true); setImportMode('upload'); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); setError(''); };
  const closeImportModal = () => { setShowImportModal(false); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };
  const handleFileDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragOver(false); const file = event.dataTransfer.files?.[0]; if (file) setSelectedFile(file); };
  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) setSelectedFile(file); };
  const submitStudentImport = async (file: File) => {
    setImporting(true); setError(''); setImportResult(null);
    try {
      const body = new FormData(); body.append('file', file);
      const { data } = await api.post('/students/import', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(data.data);
      if (data.data?.created > 0) await loadStudents();
      // Keep partial-success imports open so row-level cohort/validation errors
      // are visible instead of disappearing as soon as one row succeeds.
      if ((data.data?.failed ?? 0) === 0) closeImportModal();
    } catch (err: any) { setError(err.response?.data?.message || 'Import failed.'); }
    finally { setImporting(false); }
  };
  const submitFileImport = () => { if (selectedFile) void submitStudentImport(selectedFile); };
  const parsePastedRows = (): string[][] => pasteText.trim()
    ? pasteText.trim().split(/\r?\n/).map(line => line.split('\t').map(cell => cell.trim())).filter(row => row.length > 0 && row.some(cell => cell !== ''))
    : [];
  const submitPasteImport = () => {
    const rows = parsePastedRows();
    if (rows.length === 0) { setPasteError('Please paste at least one row of data before submitting.'); return; }
    // Through Section (index 8) at minimum: Class Name + Section are required.
    if (rows[0].length < 9) { setPasteError(`Expected columns: ${STUDENT_IMPORT_HEADERS.join(', ')}. Found ${rows[0].length}.`); return; }
    setPasteError('');
    const csvRows = [STUDENT_IMPORT_HEADERS, ...rows];
    const csv = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    void submitStudentImport(new File([blob], 'pasted-students.csv', { type: 'text/csv' }));
  };

  const renderActions = (student: Student, desktop = false) => desktop ? <details className="relative flex justify-end" onClick={event => event.stopPropagation()}>
    <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] [&::-webkit-details-marker]:hidden" aria-label="Student actions" title="Student actions"><MoreVertical className="h-5 w-5" /></summary>
    <div className="absolute right-0 top-10 z-50 w-36 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-xl">
      <button onClick={event => { event.stopPropagation(); setModal({ open: true, student }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-secondary)]"><Pencil className="h-4 w-4" /> Edit</button>
      <button onClick={event => { event.stopPropagation(); setProfileStudent(student); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-secondary)]"><GraduationCap className="h-4 w-4" /> View</button>
      <button onClick={event => { event.stopPropagation(); removeStudent(student._id); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>
    </div>
  </details> : <div className="flex items-center justify-end gap-1">
    <div className="mr-2 h-9 w-9 overflow-hidden rounded-full bg-primary-50 text-center text-xs font-bold leading-9 text-primary-700" title="Profile photo">{student.profile?.avatar ? <img src={student.profile.avatar} alt="" className="h-full w-full object-cover" /> : [student.profile?.firstName?.[0] || '', student.profile?.lastName?.[0] || ''].join('').toUpperCase()}</div>
    <button title="View profile" onClick={event => { event.stopPropagation(); setProfileStudent(student); }} className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"><GraduationCap className="h-4 w-4" /></button><button title="Edit" onClick={event => { event.stopPropagation(); setModal({ open: true, student }); }} className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"><Pencil className="h-4 w-4" /></button>
    <button title="Delete" onClick={event => { event.stopPropagation(); removeStudent(student._id); }} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
  </div>;

  return <div className="space-y-5 p-4 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">Manage Students</h1><p className="mt-1 truncate text-sm text-[var(--color-text-tertiary)]">{organization?.name || 'Organization'} - {total} total students</p></div><div className="relative"><button aria-label="Student actions" onClick={() => setMenuOpen(value => !value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm hover:bg-[var(--color-surface-secondary)]"><MoreVertical className="h-5 w-5" /></button>{menuOpen && <><button className="fixed inset-0 z-30 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close actions" /><div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-xl"><button onClick={() => { setMenuOpen(false); setModal({ open: true }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-secondary)]"><Plus className="h-4 w-4" /> Add Student</button><button onClick={() => { setMenuOpen(false); openImportModal(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Upload className="h-4 w-4" /> Import</button><button onClick={() => { setMenuOpen(false); exportStudents(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Download className="h-4 w-4" /> Export</button><button onClick={() => { setMenuOpen(false); exportStudents(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Layers className="h-4 w-4" /> Student Report</button>{selected.length > 0 && <button onClick={() => { setMenuOpen(false); bulkDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete selected ({selected.length})</button>}</div></>}</div></div>

    {showImportModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
          <div className="border-b border-[var(--color-border-subtle)] px-6 py-5"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold text-[var(--color-text-primary)]">Import Students</h2><p className="text-sm text-[var(--color-text-tertiary)] mt-1">Select your preferred method to import multiple students into the system.</p></div><button onClick={closeImportModal} disabled={importing} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"><X className="h-5 w-5" /></button></div></div>
          <div className="px-6 py-5 space-y-6">
            <button onClick={downloadTemplate} className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><Download className="h-6 w-6 text-primary-500" /><div><p className="text-sm font-bold text-primary-700 dark:text-primary-300 group-hover:text-primary-800 dark:group-hover:text-primary-200">Download Excel Student Template</p><p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">Includes Academic Year and Batch Number for repeat/new-intake cohorts</p></div></div></div></button>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setImportMode('upload'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'upload' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}><Upload className={`h-6 w-6 mb-1 ${importMode === 'upload' ? 'text-primary-600' : 'text-[var(--color-text-tertiary)]'}`} /><p className={`text-sm font-bold ${importMode === 'upload' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Upload Excel File</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Drag and drop your .xlsx file</p></button>
              <button onClick={() => { setImportMode('paste'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'paste' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}><Clipboard className={`h-6 w-6 mb-1 ${importMode === 'paste' ? 'text-primary-600' : 'text-[var(--color-text-tertiary)]'}`} /><p className={`text-sm font-bold ${importMode === 'paste' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Manual Copy &amp; Paste</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Paste tabular data from your clipboard</p></button>
            </div>
            {importMode === 'upload' && <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop} className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}>{selectedFile ? <div className="space-y-3"><p className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedFile.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p><button onClick={() => setSelectedFile(null)} className="text-xs text-red-500 hover:underline">Remove file</button></div> : <div className="space-y-3"><Upload className="h-8 w-8 mx-auto text-[var(--color-text-tertiary)]" /><p className="text-sm font-medium text-[var(--color-text-secondary)]">Drag and drop your Excel file here, or</p><label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">Browse Files<input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInputChange} className="hidden" /></label><p className="text-xs text-[var(--color-text-tertiary)]">Supported formats: .xlsx, .xls, .csv (max 10 MB)</p></div>}</div>}
            {importMode === 'paste' && <div className="space-y-3"><div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4"><p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Paste your spreadsheet data below (tab-separated columns, one row per line):</p><p className="text-xs text-[var(--color-text-tertiary)] mb-3 font-mono">{STUDENT_IMPORT_HEADERS.join('   ')}</p><textarea value={pasteText} onChange={e => { setPasteText(e.target.value); setPasteError(''); }} rows={8} placeholder={"Paste data from Excel here...\n\nExample:\n\tAhmed\tAli\tmale\tahmed@example.com\t\tMadrasa Al-Noor\tGrade 3\tA\t2026-2027\t2026\t3\t2026-01-15\t\tMohamed Ali\tparent@example.com\t\t+252612345678\tFather"} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y" /></div>{pasteError && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{pasteError}</div>}{parsePastedRows().length > 0 && (() => { const previewRows = parsePastedRows(); return <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden"><div className="bg-[var(--color-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-tertiary)]">Preview — {previewRows.length} row{previewRows.length !== 1 ? 's' : ''} parsed</div><div className="max-h-40 overflow-auto"><table className="w-full text-xs"><tbody className="divide-y divide-[var(--color-border-subtle)]">{previewRows.slice(0, 20).map((row, ri) => <tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--color-surface-primary)]' : 'bg-[var(--color-surface-secondary)]'}>{row.map((cell, ci) => <td key={ci} className="px-3 py-1.5 text-[var(--color-text-secondary)] whitespace-nowrap border-r border-[var(--color-border-subtle)] last:border-r-0">{cell}</td>)}</tr>)}</tbody></table></div></div>; })()}</div>}
            {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}
          </div>
          <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between"><button onClick={closeImportModal} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button><button onClick={importMode === 'upload' ? submitFileImport : submitPasteImport} disabled={importing || (importMode === 'upload' && !selectedFile) || (importMode === 'paste' && !pasteText.trim())} className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2">{importing ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importing...</> : 'Import Students'}</button></div>
          {importResult && <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 space-y-2"><p className="text-sm font-semibold text-[var(--color-text-primary)]">{importResult.created} of {importResult.totalRows} rows imported successfully{importResult.failed > 0 && ` — ${importResult.failed} failed`}</p>{importResult.errors.length > 0 && <div className="max-h-36 overflow-auto rounded-lg border border-red-200 dark:border-red-900/40"><table className="w-full text-xs"><thead className="bg-red-50 dark:bg-red-950/30 text-left text-red-700 dark:text-red-300"><tr><th className="px-3 py-1.5">Row</th><th className="px-3 py-1.5">Error</th></tr></thead><tbody className="divide-y divide-red-100 dark:divide-red-900/30">{importResult.errors.map((entry, index) => <tr key={index}><td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{entry.row}</td><td className="px-3 py-1.5 text-red-600 dark:text-red-400">{entry.message}</td></tr>)}</tbody></table></div>}</div>}
        </div>
      </div>
    )}

    {error && !showImportModal && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span><button className="ml-auto" onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}
    <div className="flex flex-col gap-3 lg:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input className={`${inputClass} pl-9`} placeholder="Search student, ID, email or phone..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div><select className={`${inputClass} lg:w-44`} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All Status</option>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select className={`${inputClass} lg:w-72`} value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(1); }}><option value="">All active {type === 'school' ? 'Classes' : type === 'training_center' ? 'Batches' : 'Cohorts'}</option>{activeClasses.map(item => <option key={item._id} value={item._id}>{classOptionLabel(item, false)}</option>)}</select></div>
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
      <div className="flex items-center justify-between border-b px-3 py-3 sm:px-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allSelected} onChange={() => { void toggleAll(); }} disabled={selectingAll} /> {selectingAll ? 'Selecting all…' : allSelected ? 'Unselect all students' : 'Select all students'}</label><span className="text-xs text-[var(--color-text-tertiary)]">{type.replace('_', ' ')} students</span>{selected.length > 0 && <button onClick={bulkDelete} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Delete selected ({selected.length})</button>}</div>
      {loading ? <div className="flex items-center justify-center py-16 text-sm text-[var(--color-text-tertiary)]"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading students...</div> : students.length === 0 ? <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">No students found.</div> : <>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[900px] table-fixed text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><tr><th className="w-10 px-4 py-3" /><th className="w-[22%] px-4 py-3">Name / ID</th><th className="w-[24%] px-4 py-3">Email / Phone</th><th className="w-[25%] px-4 py-3">Depart / Class</th><th className="w-[12%] px-4 py-3">Status</th><th className="w-[12%] px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{students.map(student => <tr key={student._id} onClick={() => setProfileStudent(student)} className="cursor-pointer hover:bg-[var(--color-surface-secondary)]"><td className="px-4 py-3"><input type="checkbox" checked={selected.includes(student._id)} onClick={event => event.stopPropagation()} onChange={() => setSelected(value => value.includes(student._id) ? value.filter(id => id !== student._id) : [...value, student._id])} /></td><td className="px-4 py-3 align-middle"><div className="font-semibold text-[var(--color-text-primary)]">{student.profile?.firstName} {student.profile?.lastName}</div><div className="font-mono text-xs text-[var(--color-text-secondary)]">{student.studentId}</div></td><td className="px-4 py-3 align-middle text-xs text-[var(--color-text-tertiary)]"><div className="truncate">{student.user?.email || 'No email'}</div><div className="truncate">{student.user?.phone || 'No phone'}</div></td><td className="px-4 py-3 align-middle"><div className="font-medium text-[var(--color-text-primary)]">{academicLabel(student)}</div><div className="text-xs text-[var(--color-text-tertiary)]">{classLabel(student)}</div></td><td className="px-4 py-3 align-middle"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadge[student.status] || statusBadge.inactive}`}>{student.status}</span></td><td className="px-4 py-3 align-middle">{renderActions(student, true)}</td></tr>)}</tbody></table></div>
        <div className="divide-y divide-[var(--color-border-subtle)] lg:hidden">{students.map(student => <div key={student._id} onClick={() => setProfileStudent(student)} className="cursor-pointer p-4"><div className="flex items-start gap-3"><input className="mt-1" type="checkbox" checked={selected.includes(student._id)} onClick={event => event.stopPropagation()} onChange={() => setSelected(value => value.includes(student._id) ? value.filter(id => id !== student._id) : [...value, student._id])} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="font-semibold hover:text-primary-600">{student.profile?.firstName} {student.profile?.lastName}</div><span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusBadge[student.status] || statusBadge.inactive}`}>{student.status}</span></div><div className="mt-1 font-mono text-xs text-[var(--color-text-secondary)]">{student.studentId}</div><div className="truncate text-xs text-[var(--color-text-tertiary)]">{student.user?.email || 'No email'} / {student.user?.phone || 'No phone'}</div><dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs"><div><dt className="text-[var(--color-text-tertiary)]">{higherEd ? 'Department' : type === 'training_center' ? 'Batch' : 'Grade'}</dt><dd>{academicLabel(student)}</dd></div><div><dt className="text-[var(--color-text-tertiary)]">Class</dt><dd>{classLabel(student)}</dd></div></dl></div>{renderActions(student)}</div></div>)}</div>
      </>}
      <div className="flex flex-col gap-2 border-t px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-[var(--color-text-tertiary)]">Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={page >= pages} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
    </div>
    {modal.open && organization && <StudentModal student={modal.student} organization={organization} classes={classes} faculties={faculties} departments={departments} programs={programs} structure={structure} onClose={() => setModal({ open: false })} onSaved={loadStudents} />}
    {profileStudent && <StudentProfileModal student={profileStudent} organization={organization} classLabel={classLabel} onClose={() => setProfileStudent(null)} />}
  </div>;
}

export function StudentsManage() {
  return <ResponsiveStudentsManage />;
}
