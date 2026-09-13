import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Download,
  GraduationCap,
  Layers,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { type InstitutionType, resolveInstitutionType } from '../../../lib/institution-type';
import { useNavigate } from 'react-router-dom';

type StudentStatus = 'active' | 'inactive' | 'graduated' | 'suspended';
type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type Organization = { _id: string; name: string; institutionType?: InstitutionType; organizationType?: InstitutionType };
type ClassItem = {
  _id: string;
  title: string;
  section?: string;
  room?: string;
  status?: string;
  academicYear?: string;
  batch?: string;
  gradeLevel?: number;
  department?: string;
  departmentId?: string;
  program?: string;
  programId?: string;
  shiftMode?: string;
};
type Student = {
  _id: string;
  studentId: string;
  status: StudentStatus;
  approvalStatus: ApprovalStatus;
  enrollmentDate: string;
  school?: { _id: string; name: string };
  class?: { _id: string; title: string; section?: string };
  profile?: { firstName?: string; lastName?: string; gender?: string; avatar?: string };
  user?: { email?: string; phone?: string };
  parent?: {
    phone?: string;
    relationship?: string;
    user?: { email?: string; phone?: string };
    profile?: { firstName?: string; lastName?: string };
  };
  department?: string;
  shiftMode?: string;
  grade?: string;
  medicalNotes?: string;
  attendancePercentage?: number;
  gpa?: number;
  totalFeesPaid?: number;
  totalFeesDue?: number;
};

type FormState = {
  firstName: string;
  lastName: string;
  gender: string;
  email: string;
  classId: string;
  enrollmentDate: string;
  medicalNotes: string;
  guardianFullName: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianRelationship: string;
};

type ImportPreviewRow = {
  row: number;
  action: 'new' | 'update' | 'duplicate' | 'class_not_found' | 'invalid';
  studentId: string;
  name: string;
  className: string;
  section: string;
  message: string;
};

type ImportPreview = {
  totalRows: number;
  newStudents: number;
  updates: number;
  duplicates: number;
  classNotFound: number;
  invalid: number;
  ready: number;
  rows: ImportPreviewRow[];
};

type ImportResult = ImportPreview & {
  created: number;
  updated: number;
  failed: number;
  errors: { row: number; action?: string; message: string }[];
};

/**
 * One editable registration contract across Add, Edit, Excel/CSV Import and
 * Copy/Paste. Export adds only Student ID + Organization metadata so the same
 * workbook can be imported back and safely update existing students.
 */
const STUDENT_IMPORT_HEADERS = [
  'First Name',
  'Last Name',
  'Gender',
  'Email',
  'Class Name',
  'Section',
  'Enrollment Date',
  'Medical Notes',
  'Guardian Name',
  'Guardian Email',
  'Guardian Phone',
  'Relationship',
];

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  gender: 'male',
  email: '',
  classId: '',
  enrollmentDate: new Date().toISOString().slice(0, 10),
  medicalNotes: '',
  guardianFullName: '',
  guardianEmail: '',
  guardianPhone: '',
  guardianRelationship: 'Father',
};

const statusOptions: { value: StudentStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'suspended', label: 'Suspended' },
];

const statusBadge: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  inactive: 'bg-slate-50 text-slate-600 border-slate-200',
  graduated: 'bg-sky-50 text-sky-700 border-sky-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
};

const previewBadge: Record<ImportPreviewRow['action'], string> = {
  new: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update: 'bg-sky-50 text-sky-700 border-sky-200',
  duplicate: 'bg-amber-50 text-amber-700 border-amber-200',
  class_not_found: 'bg-red-50 text-red-700 border-red-200',
  invalid: 'bg-red-50 text-red-700 border-red-200',
};

function dataOf<T>(response: any): T {
  return (response?.data?.data ?? response?.data ?? []) as T;
}

function relationshipTitle(value?: string): string {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'mother') return 'Mother';
  if (normalized === 'guardian') return 'Guardian';
  if (normalized === 'other') return 'Other';
  return 'Father';
}

function classOptionLabel(cls: ClassItem, showStatus = true): string {
  const parts = [
    cls.title,
    cls.section ? `Section ${cls.section}` : '',
    cls.academicYear || '',
    cls.batch ? `Batch ${cls.batch}` : '',
  ].filter(Boolean);
  const suffix = showStatus && cls.status && cls.status !== 'active' ? ` [${cls.status}]` : '';
  return `${parts.join(' · ')}${suffix}`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-[var(--color-text-primary)]">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{hint}</p>}
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

function StudentModal({
  student,
  organization,
  classes,
  onClose,
  onSaved,
}: {
  student?: Student;
  organization: Organization;
  classes: ClassItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(student);
  const [form, setForm] = useState<FormState>(() => student ? {
    firstName: student.profile?.firstName || '',
    lastName: student.profile?.lastName || '',
    gender: student.profile?.gender || 'male',
    email: student.user?.email || '',
    classId: student.class?._id || '',
    enrollmentDate: student.enrollmentDate?.slice(0, 10) || '',
    medicalNotes: student.medicalNotes || '',
    guardianFullName: `${student.parent?.profile?.firstName || ''} ${student.parent?.profile?.lastName || ''}`.trim(),
    guardianEmail: student.parent?.user?.email || '',
    guardianPhone: student.parent?.user?.phone || student.parent?.phone || '',
    guardianRelationship: relationshipTitle(student.parent?.relationship),
  } : { ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const currentClassId = student?.class?._id || '';
  const availableClasses = useMemo(
    () => classes.filter((cls) => cls.status === 'active' || cls._id === currentClassId),
    [classes, currentClassId],
  );
  const selectedClass = classes.find((cls) => cls._id === form.classId);

  const change = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.firstName.trim() || !form.classId || !form.guardianFullName.trim() || !form.guardianPhone.trim()) {
      setError('First Name, Class, Guardian Name and Guardian Phone are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        gender: form.gender,
        email: form.email.trim() || undefined,
        school: organization._id,
        classId: form.classId,
        enrollmentDate: form.enrollmentDate || undefined,
        medicalNotes: form.medicalNotes.trim(),
        guardianFullName: form.guardianFullName.trim(),
        guardianEmail: form.guardianEmail.trim() || undefined,
        guardianPhone: form.guardianPhone.trim(),
        guardianRelationship: form.guardianRelationship || 'Father',
      };
      if (editing) await api.patch(`/students/${student!._id}`, payload);
      else await api.post('/students', payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save student.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{editing ? 'Edit Student' : 'Quick Add Student'}</h2>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{organization.name} · one registration format everywhere</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--color-surface-secondary)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-4 sm:p-6">
          {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <strong>System managed:</strong> Student ID, organization, grade, academic year, batch, student password, guardian password and new-student status. Email is also generated automatically when left blank.
          </div>

          {editing && (
            <div className="rounded-xl bg-[var(--color-surface-secondary)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              Student ID: <span className="font-mono font-semibold text-[var(--color-text-primary)]">{student?.studentId}</span>
            </div>
          )}

          <section>
            <h3 className="mb-3 text-sm font-bold text-[var(--color-text-primary)]">Student information</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First Name *"><input className={inputClass} name="firstName" value={form.firstName} onChange={change} required /></Field>
              <Field label="Last Name" hint="Optional"><input className={inputClass} name="lastName" value={form.lastName} onChange={change} /></Field>
              <Field label="Gender *"><select className={inputClass} name="gender" value={form.gender} onChange={change} required><option value="male">Male</option><option value="female">Female</option></select></Field>
              <Field label="Email" hint="Optional — the system creates one if blank"><input className={inputClass} type="email" name="email" value={form.email} onChange={change} /></Field>
              <Field label="Enrollment Date" hint="Optional — defaults to today"><input className={inputClass} type="date" name="enrollmentDate" value={form.enrollmentDate} onChange={change} /></Field>
              <Field label="Medical Notes" hint="Optional"><input className={inputClass} name="medicalNotes" value={form.medicalNotes} onChange={change} placeholder="Allergy, condition, or note" /></Field>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border-default)] p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary-600" /><div><h3 className="text-sm font-bold">Class placement</h3><p className="text-xs text-[var(--color-text-tertiary)]">Choose the class once; grade, room, department, batch and academic year are inherited automatically.</p></div></div>
            <Field label="Class / Section *">
              <select className={inputClass} name="classId" value={form.classId} onChange={change} required>
                <option value="">Select class and section...</option>
                {availableClasses.map((cls) => <option key={cls._id} value={cls._id}>{classOptionLabel(cls)}</option>)}
              </select>
            </Field>
            {selectedClass && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs sm:grid-cols-3">
                <div><span className="text-[var(--color-text-tertiary)]">Class</span><div className="font-semibold">{selectedClass.title}</div></div>
                <div><span className="text-[var(--color-text-tertiary)]">Section</span><div className="font-semibold">{selectedClass.section || '—'}</div></div>
                <div><span className="text-[var(--color-text-tertiary)]">Grade</span><div className="font-semibold">{selectedClass.gradeLevel ?? selectedClass.title}</div></div>
                <div><span className="text-[var(--color-text-tertiary)]">Academic Year</span><div className="font-semibold">{selectedClass.academicYear || '—'}</div></div>
                <div><span className="text-[var(--color-text-tertiary)]">Batch</span><div className="font-semibold">{selectedClass.batch || '—'}</div></div>
                <div><span className="text-[var(--color-text-tertiary)]">Room</span><div className="font-semibold">{selectedClass.room || '—'}</div></div>
                {selectedClass.department && <div><span className="text-[var(--color-text-tertiary)]">Department</span><div className="font-semibold">{selectedClass.department}</div></div>}
                {selectedClass.shiftMode && <div><span className="text-[var(--color-text-tertiary)]">Shift</span><div className="font-semibold">{selectedClass.shiftMode}</div></div>}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-[var(--color-text-primary)]">Guardian information</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Guardian Name *"><input className={inputClass} name="guardianFullName" value={form.guardianFullName} onChange={change} required /></Field>
              <Field label="Guardian Phone *"><input className={inputClass} name="guardianPhone" value={form.guardianPhone} onChange={change} required placeholder="+252..." /></Field>
              <Field label="Guardian Email" hint="Optional — the system creates one if needed"><input className={inputClass} type="email" name="guardianEmail" value={form.guardianEmail} onChange={change} /></Field>
              <Field label="Relationship"><select className={inputClass} name="guardianRelationship" value={form.guardianRelationship} onChange={change}><option>Father</option><option>Mother</option><option>Guardian</option><option>Other</option></select></Field>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border-subtle)] pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-secondary)] disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{saving && <RefreshCw className="h-4 w-4 animate-spin" />}{editing ? 'Save Changes' : 'Add Student'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StudentProfileModal({ student, classes, onClose }: { student: Student; classes: ClassItem[]; onClose: () => void }) {
  const navigate = useNavigate();
  const fullName = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || 'Student';
  const cls = classes.find((item) => item._id === student.class?._id);
  const classLabel = cls ? classOptionLabel(cls, false) : `${student.class?.title || '-'}${student.class?.section ? ` · Section ${student.class.section}` : ''}`;
  const guardianName = `${student.parent?.profile?.firstName || ''} ${student.parent?.profile?.lastName || ''}`.trim();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="relative bg-gradient-to-br from-primary-700 via-primary-600 to-emerald-600 px-6 py-7 text-white">
          <button onClick={onClose} className="absolute right-3 top-3 rounded-lg p-2 hover:bg-white/15"><X className="h-5 w-5" /></button>
          <div className="flex items-center gap-4"><div className="h-16 w-16 overflow-hidden rounded-2xl bg-white/20 text-center text-xl font-bold leading-[4rem] ring-4 ring-white/20">{student.profile?.avatar ? <img src={student.profile.avatar} className="h-full w-full object-cover" alt={fullName} /> : `${student.profile?.firstName?.[0] || ''}${student.profile?.lastName?.[0] || ''}`.toUpperCase()}</div><div><p className="text-xs uppercase tracking-widest text-white/70">Student</p><h2 className="text-xl font-bold">{fullName}</h2><p className="font-mono text-sm text-white/80">{student.studentId}</p></div></div>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--color-border-default)] p-3"><p className="text-xs text-[var(--color-text-tertiary)]">Class</p><p className="mt-1 font-semibold">{classLabel}</p><p className="mt-1 text-xs text-[var(--color-text-secondary)]">{student.department || student.grade || ''}</p></div>
            <div className="rounded-xl border border-[var(--color-border-default)] p-3"><p className="text-xs text-[var(--color-text-tertiary)]">Status</p><span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadge[student.status] || statusBadge.inactive}`}>{student.status}</span></div>
          </div>
          <div className="rounded-xl border border-[var(--color-border-default)] p-3"><p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Guardian</p><p className="mt-2 font-semibold">{guardianName || 'No guardian linked'}</p><p className="text-sm text-[var(--color-text-secondary)]">{student.parent?.user?.phone || student.parent?.phone || '-'}</p></div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs"><button onClick={() => navigate(`/admin/students/${student._id}/personal-report`, { state: { section: 'attendance' } })} className="rounded-xl bg-emerald-50 p-3 text-emerald-800"><strong className="block text-base">{student.attendancePercentage ?? 0}%</strong>Attendance</button><button onClick={() => navigate(`/admin/students/${student._id}/personal-report`, { state: { section: 'exams' } })} className="rounded-xl bg-sky-50 p-3 text-sky-800"><strong className="block text-base">{student.gpa ?? '-'}</strong>GPA</button><button onClick={() => navigate(`/admin/payments/balances/${student._id}`)} className="rounded-xl bg-amber-50 p-3 text-amber-800"><strong className="block text-base">{student.totalFeesDue ?? 0}</strong>Due</button></div>
        </div>
      </div>
    </div>
  );
}

function ResponsiveStudentsManage() {
  const { user } = useAuth();
  const organizationId = user?.organizationId || '';
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; student?: Student }>({ open: false });
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const limit = 20;
  const pages = Math.max(1, Math.ceil(total / limit));
  const type = resolveInstitutionType(organization);
  const activeClasses = useMemo(() => classes.filter((item) => item.status === 'active'), [classes]);

  const classLabel = useCallback((student: Student) => {
    if (!student.class) return '-';
    const enriched = classes.find((item) => item._id === student.class?._id);
    return enriched ? classOptionLabel(enriched, false) : `${student.class.title}${student.class.section ? ` · Section ${student.class.section}` : ''}`;
  }, [classes]);

  const loadMeta = useCallback(async () => {
    if (!organizationId) {
      setError('Your account is not assigned to an organization.');
      return;
    }
    try {
      const [orgResponse] = await Promise.all([api.get(`/schools/${organizationId}`)]);
      setOrganization(dataOf<Organization>(orgResponse));

      const allClasses: ClassItem[] = [];
      const pageSize = 200;
      for (let classPage = 1; classPage <= 50; classPage += 1) {
        const response = await api.get('/classes', { params: { schoolId: organizationId, page: classPage, limit: pageSize } });
        const batch = dataOf<ClassItem[]>(response) || [];
        allClasses.push(...batch);
        const payload = response.data;
        const reportedTotal = Number(payload.pagination?.total ?? payload.meta?.total ?? 0);
        const reportedPages = Number(payload.pagination?.pages ?? payload.pagination?.totalPages ?? payload.meta?.pages ?? 0);
        if (batch.length === 0 || batch.length < pageSize || (reportedPages > 0 && classPage >= reportedPages) || (reportedTotal > 0 && allClasses.length >= reportedTotal)) break;
      }
      setClasses(allClasses);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load organization structure.');
    }
  }, [organizationId]);

  const loadStudents = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit, school: organizationId };
      if (search.trim()) params.search = search.trim();
      if (status) params.status = status;
      if (classFilter) params.classId = classFilter;
      const response = await api.get('/students', { params });
      setStudents(response.data?.data || []);
      setTotal(response.data?.pagination?.total ?? response.data?.meta?.total ?? 0);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, search, status, classFilter]);

  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadStudents(); }, 250);
    return () => window.clearTimeout(timer);
  }, [loadStudents]);

  const removeStudent = async (id: string) => {
    if (!window.confirm('Move this student to Trash?')) return;
    try {
      await api.delete(`/students/${id}`);
      setSelected((value) => value.filter((studentId) => studentId !== id));
      await loadStudents();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete student.');
    }
  };

  const bulkDelete = async () => {
    if (!selected.length || !window.confirm(`Move ${selected.length} selected students to Trash?`)) return;
    try {
      await api.delete('/students/bulk', { data: { ids: selected } });
      setSelected([]);
      await loadStudents();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Bulk delete failed.');
    }
  };

  const downloadBlob = (data: BlobPart, filename: string) => {
    const url = URL.createObjectURL(new Blob([data]));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportStudents = async (report = false) => {
    try {
      const response = await api.get(report ? '/students/report/export' : '/students/export', {
        params: { school: organizationId },
        responseType: 'blob',
      });
      downloadBlob(response.data, report ? 'student-report.xlsx' : 'students.xlsx');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Export failed.');
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/students/template', { params: { school: organizationId }, responseType: 'blob' });
      downloadBlob(response.data, 'students-template.xlsx');
    } catch {
      setError('Failed to download template.');
    }
  };

  const resetImportState = () => {
    setSelectedFile(null);
    setPasteText('');
    setPasteError('');
    setImportPreview(null);
    setImportResult(null);
  };

  const openImportModal = () => {
    resetImportState();
    setImportMode('upload');
    setShowImportModal(true);
    setError('');
  };

  const closeImportModal = () => {
    if (importing || previewing) return;
    setShowImportModal(false);
    resetImportState();
  };

  const acceptFile = (file?: File | null) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setPasteError('File must be 25 MB or smaller.');
      return;
    }
    setSelectedFile(file);
    setImportPreview(null);
    setImportResult(null);
    setPasteError('');
  };

  const handleFileDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  const parsePastedRows = (): string[][] => pasteText.trim()
    ? pasteText.trim().split(/\r?\n/).map((line) => line.split('\t').map((cell) => cell.trim())).filter((row) => row.some((cell) => cell !== ''))
    : [];

  const pasteFile = (): File | null => {
    const rows = parsePastedRows();
    if (!rows.length) {
      setPasteError('Paste at least one student row from Excel or Google Sheets.');
      return null;
    }
    const firstRowNormalized = rows[0].map((cell) => cell.trim().toLowerCase());
    const hasHeaders = firstRowNormalized.includes('first name') && firstRowNormalized.includes('class name');
    const csvRows = hasHeaders ? rows : [STUDENT_IMPORT_HEADERS, ...rows];
    const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    setPasteError('');
    return new File([`\uFEFF${csv}`], 'pasted-students.csv', { type: 'text/csv' });
  };

  const currentImportFile = (): File | null => importMode === 'upload' ? selectedFile : pasteFile();

  const previewImport = async () => {
    const file = currentImportFile();
    if (!file) return;
    setPreviewing(true);
    setImportResult(null);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('school', organizationId);
      const response = await api.post('/students/import/preview', body, {
        params: { school: organizationId },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportPreview(dataOf<ImportPreview>(response));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not preview this import.');
    } finally {
      setPreviewing(false);
    }
  };

  const submitImport = async () => {
    const file = currentImportFile();
    if (!file || !importPreview?.ready) return;
    setImporting(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('school', organizationId);
      const response = await api.post('/students/import', body, {
        params: { school: organizationId },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result = dataOf<ImportResult>(response);
      setImportResult(result);
      await loadStudents();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Student import failed.');
    } finally {
      setImporting(false);
    }
  };

  const renderRowActions = (student: Student) => (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-[var(--color-surface-secondary)] [&::-webkit-details-marker]:hidden" aria-label="Student actions"><MoreVertical className="h-5 w-5" /></summary>
      <div className="absolute right-0 top-10 z-30 w-36 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-xl">
        <button onClick={() => setProfileStudent(student)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-secondary)]"><GraduationCap className="h-4 w-4" /> View</button>
        <button onClick={() => setModal({ open: true, student })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-secondary)]"><Pencil className="h-4 w-4" /> Edit</button>
        <button onClick={() => void removeStudent(student._id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>
      </div>
    </details>
  );

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">Manage Students</h1><p className="mt-1 truncate text-sm text-[var(--color-text-tertiary)]">{organization?.name || 'Organization'} · {total} students</p></div>
        <div className="relative">
          <button aria-label="Student actions" onClick={() => setMenuOpen((value) => !value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm hover:bg-[var(--color-surface-secondary)]"><MoreVertical className="h-5 w-5" /></button>
          {menuOpen && <><button className="fixed inset-0 z-20 cursor-default" aria-label="Close actions" onClick={() => setMenuOpen(false)} /><div className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-xl"><button onClick={() => { setMenuOpen(false); setModal({ open: true }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-secondary)]"><Plus className="h-4 w-4" /> Quick Add Student</button><button onClick={() => { setMenuOpen(false); openImportModal(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Upload className="h-4 w-4" /> Import Students</button><button onClick={() => { setMenuOpen(false); void exportStudents(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Download className="h-4 w-4" /> Export Students</button><button onClick={() => { setMenuOpen(false); void exportStudents(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Layers className="h-4 w-4" /> Student Report</button>{selected.length > 0 && <button onClick={() => { setMenuOpen(false); void bulkDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete selected ({selected.length})</button>}</div></>}
        </div>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span><button className="ml-auto" onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input className={`${inputClass} pl-9`} placeholder="Search student, ID, email or phone..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
        <select className={`${inputClass} lg:w-44`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All Status</option>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <select className={`${inputClass} lg:w-72`} value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setPage(1); }}><option value="">All active {type === 'school' ? 'Classes' : 'Cohorts'}</option>{activeClasses.map((item) => <option key={item._id} value={item._id}>{classOptionLabel(item, false)}</option>)}</select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-3 py-3 sm:px-4"><span className="text-xs text-[var(--color-text-tertiary)]">Registration fields are consistent across Add, Edit, Import and Export.</span>{selected.length > 0 && <button onClick={() => void bulkDelete()} className="text-xs font-semibold text-red-600">Delete selected ({selected.length})</button>}</div>
        {loading ? <div className="flex items-center justify-center py-16 text-sm text-[var(--color-text-tertiary)]"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Loading students...</div> : students.length === 0 ? <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">No students found.</div> : <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[var(--color-surface-secondary)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><tr><th className="w-10 px-4 py-3" /><th className="px-4 py-3">Student</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Status</th><th className="w-16 px-4 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">{students.map((student) => <tr key={student._id} onClick={() => setProfileStudent(student)} className="cursor-pointer hover:bg-[var(--color-surface-secondary)]"><td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.includes(student._id)} onChange={() => setSelected((value) => value.includes(student._id) ? value.filter((id) => id !== student._id) : [...value, student._id])} /></td><td className="px-4 py-3"><div className="font-semibold text-[var(--color-text-primary)]">{student.profile?.firstName} {student.profile?.lastName}</div><div className="font-mono text-xs text-[var(--color-text-tertiary)]">{student.studentId}</div></td><td className="px-4 py-3 text-xs"><div className="max-w-[240px] truncate">{student.user?.email || 'System email'}</div><div className="text-[var(--color-text-tertiary)]">{student.parent?.user?.phone || student.parent?.phone || '-'}</div></td><td className="px-4 py-3"><div className="font-medium">{classLabel(student)}</div><div className="text-xs text-[var(--color-text-tertiary)]">{student.department || student.grade || ''}</div></td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadge[student.status] || statusBadge.inactive}`}>{student.status}</span></td><td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>{renderRowActions(student)}</td></tr>)}</tbody>
            </table>
          </div>

          <div className="divide-y divide-[var(--color-border-subtle)] lg:hidden">
            {students.map((student) => <article key={student._id} onClick={() => setProfileStudent(student)} className="p-4 hover:bg-[var(--color-surface-secondary)]"><div className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={selected.includes(student._id)} onClick={(event) => event.stopPropagation()} onChange={() => setSelected((value) => value.includes(student._id) ? value.filter((id) => id !== student._id) : [...value, student._id])} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate font-semibold text-[var(--color-text-primary)]">{student.profile?.firstName} {student.profile?.lastName}</h3><p className="font-mono text-xs text-[var(--color-text-tertiary)]">{student.studentId}</p></div><div onClick={(event) => event.stopPropagation()}>{renderRowActions(student)}</div></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-[var(--color-surface-secondary)] p-2"><span className="block text-[var(--color-text-tertiary)]">Class</span><strong className="line-clamp-2">{classLabel(student)}</strong></div><div className="rounded-lg bg-[var(--color-surface-secondary)] p-2"><span className="block text-[var(--color-text-tertiary)]">Guardian</span><strong className="block truncate">{student.parent?.user?.phone || student.parent?.phone || '-'}</strong></div></div><div className="mt-3 flex items-center justify-between gap-2"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadge[student.status] || statusBadge.inactive}`}>{student.status}</span><span className="max-w-[60%] truncate text-xs text-[var(--color-text-tertiary)]">{student.user?.email || 'System email'}</span></div></div></div></article>)}
          </div>
        </>}
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row"><p className="text-xs text-[var(--color-text-tertiary)]">Page {page} of {pages}</p><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-sm disabled:opacity-40">Previous</button><button disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} className="rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-sm disabled:opacity-40">Next</button></div></div>

      {modal.open && organization && <StudentModal student={modal.student} organization={organization} classes={classes} onClose={() => setModal({ open: false })} onSaved={() => { void loadStudents(); }} />}
      {profileStudent && <StudentProfileModal student={profileStudent} classes={classes} onClose={() => setProfileStudent(null)} />}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-4 py-4 sm:px-6"><div><h2 className="text-xl font-bold">Import Students</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Upload Excel/CSV or paste directly from Excel/Google Sheets. Preview is required before import.</p></div><button onClick={closeImportModal} disabled={importing || previewing} className="rounded-lg p-2 hover:bg-[var(--color-surface-secondary)]"><X className="h-5 w-5" /></button></div>

            <div className="space-y-5 p-4 sm:p-6">
              <button onClick={() => void downloadTemplate()} className="w-full rounded-xl border-2 border-dashed border-primary-300 bg-primary-50 px-4 py-4 text-left hover:bg-primary-100"><div className="flex items-center gap-3"><Download className="h-6 w-6 text-primary-600" /><div><p className="text-sm font-bold text-primary-800">Download simplified 12-column template</p><p className="text-xs text-primary-700/80">No Student ID, organization, grade, academic year, batch or passwords required.</p></div></div></button>

              <div className="grid grid-cols-2 gap-3"><button onClick={() => { setImportMode('upload'); setImportPreview(null); setImportResult(null); }} className={`rounded-xl border-2 p-4 text-left ${importMode === 'upload' ? 'border-primary-500 bg-primary-50' : 'border-[var(--color-border-default)]'}`}><Upload className="mb-1 h-5 w-5" /><p className="text-sm font-bold">Upload Excel/CSV</p><p className="text-xs text-[var(--color-text-tertiary)]">Template or exported workbook</p></button><button onClick={() => { setImportMode('paste'); setImportPreview(null); setImportResult(null); }} className={`rounded-xl border-2 p-4 text-left ${importMode === 'paste' ? 'border-primary-500 bg-primary-50' : 'border-[var(--color-border-default)]'}`}><Clipboard className="mb-1 h-5 w-5" /><p className="text-sm font-bold">Copy &amp; Paste</p><p className="text-xs text-[var(--color-text-tertiary)]">Excel / Google Sheets rows</p></button></div>

              {importMode === 'upload' ? (
                <div onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop} className={`rounded-xl border-2 border-dashed p-8 text-center ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}>
                  {selectedFile ? <div className="space-y-2"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="font-semibold">{selectedFile.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p><button onClick={() => { setSelectedFile(null); setImportPreview(null); setImportResult(null); }} className="text-xs font-semibold text-red-600">Remove</button></div> : <div className="space-y-3"><Upload className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" /><p className="text-sm">Drag and drop a file here</p><label className="inline-flex cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white">Browse File<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => acceptFile(event.target.files?.[0])} /></label><p className="text-xs text-[var(--color-text-tertiary)]">XLSX, XLS or CSV · max 25 MB</p></div>}
                </div>
              ) : (
                <div className="space-y-2"><p className="text-xs text-[var(--color-text-tertiary)]">Columns: <span className="font-mono">{STUDENT_IMPORT_HEADERS.join(' · ')}</span></p><textarea rows={9} className={`${inputClass} font-mono text-xs`} value={pasteText} onChange={(event) => { setPasteText(event.target.value); setPasteError(''); setImportPreview(null); setImportResult(null); }} placeholder={'Ahmed\tAli\tmale\t\tGrade 5\tA\t2026-09-13\t\tMohamed Ali\t\t+252612345678\tFather'} /></div>
              )}

              {pasteError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{pasteError}</div>}

              {!importPreview && <button onClick={() => void previewImport()} disabled={previewing || (importMode === 'upload' ? !selectedFile : !pasteText.trim())} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{previewing && <RefreshCw className="h-4 w-4 animate-spin" />}{previewing ? 'Validating...' : 'Preview & Validate'}</button>}

              {importPreview && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"><div className="rounded-xl bg-emerald-50 p-3"><p className="text-lg font-bold text-emerald-700">{importPreview.newStudents}</p><p className="text-xs text-emerald-700">New</p></div><div className="rounded-xl bg-sky-50 p-3"><p className="text-lg font-bold text-sky-700">{importPreview.updates}</p><p className="text-xs text-sky-700">Updates</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-lg font-bold text-amber-700">{importPreview.duplicates}</p><p className="text-xs text-amber-700">Duplicates</p></div><div className="rounded-xl bg-red-50 p-3"><p className="text-lg font-bold text-red-700">{importPreview.classNotFound}</p><p className="text-xs text-red-700">Class missing</p></div><div className="rounded-xl bg-red-50 p-3"><p className="text-lg font-bold text-red-700">{importPreview.invalid}</p><p className="text-xs text-red-700">Invalid</p></div><div className="rounded-xl bg-primary-50 p-3"><p className="text-lg font-bold text-primary-700">{importPreview.ready}</p><p className="text-xs text-primary-700">Ready</p></div></div>

                  <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)]"><div className="border-b bg-[var(--color-surface-secondary)] px-3 py-2 text-xs font-semibold">Preview · {importPreview.totalRows} rows</div><div className="max-h-64 overflow-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="sticky top-0 bg-[var(--color-surface-primary)]"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Message</th></tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{importPreview.rows.map((row) => <tr key={`${row.row}-${row.studentId}-${row.name}`}><td className="px-3 py-2">{row.row}</td><td className="px-3 py-2"><strong>{row.name || '-'}</strong>{row.studentId && <div className="font-mono text-[10px] text-[var(--color-text-tertiary)]">{row.studentId}</div>}</td><td className="px-3 py-2">{row.className}{row.section ? ` · ${row.section}` : ''}</td><td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-1 font-semibold ${previewBadge[row.action]}`}>{row.action.replace('_', ' ')}</span></td><td className="px-3 py-2 text-red-600">{row.message}</td></tr>)}</tbody></table></div></div>

                  {!importResult && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button onClick={() => { setImportPreview(null); setImportResult(null); }} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold">Change file</button><button onClick={() => void submitImport()} disabled={importing || importPreview.ready === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{importing && <RefreshCw className="h-4 w-4 animate-spin" />}{importing ? 'Importing...' : `Import ${importPreview.ready} Ready Rows`}</button></div>}
                </div>
              )}

              {importResult && <div className={`rounded-xl border p-4 ${importResult.failed ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><p className="font-bold">Import complete</p><p className="mt-1 text-sm">Created {importResult.created}, updated {importResult.updated}, failed/skipped {importResult.failed}.</p>{importResult.errors.length > 0 && <div className="mt-3 max-h-32 overflow-auto rounded-lg bg-white/70 p-2 text-xs">{importResult.errors.map((item, index) => <p key={`${item.row}-${index}`} className="py-1"><strong>Row {item.row}:</strong> {item.message}</p>)}</div>}<button onClick={closeImportModal} className="mt-3 rounded-lg bg-[var(--color-text-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-surface-primary)]">Done</button></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResponsiveStudentsManage;
