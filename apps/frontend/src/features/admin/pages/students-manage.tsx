/**
 * Student Management — Admin Full CRUD
 * Tabs: All | Approved | Pending | Rejected
 * Self-registered students → Pending → auto-assigned Public School/Class
 * Admin-created students → Approved (default)
 */

import { useEffect, useState, useCallback, type FormEvent, type ChangeEvent } from 'react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchoolBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; }

interface StudentProfile { _id: string; firstName: string; lastName: string; avatar?: string; gender: string; }
interface StudentUser { _id: string; email: string; role: string; isActive: boolean; isVerified: boolean; preferredLanguage: string; }
interface EnrolledCourse { _id: string; title: { en: string }; slug: string; }

interface Student {
  _id: string;
  studentId: string;
  user?: StudentUser;
  profile?: StudentProfile;
  school?: { _id: string; name: string };
  class?: { _id: string; title: string; section: string };
  enrolledCourses?: EnrolledCourse[];
  status: 'active' | 'inactive' | 'graduated' | 'suspended';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  grade?: string;
  medicalNotes?: string;
  enrollmentDate: string;
  attendancePercentage?: number;
  gpa?: number;
  totalFeesPaid?: number;
  totalFeesDue?: number;
}

interface StudentForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  gender: string;
  school: string;
  classId: string;
  grade: string;
  medicalNotes: string;
  enrollmentDate: string;
  attendancePercentage: number;
  gpa: number;
  totalFeesPaid: number;
  totalFeesDue: number;
}

const emptyForm: StudentForm = {
  email: '', password: '', firstName: '', lastName: '', gender: 'male',
  school: '', classId: '', grade: '', medicalNotes: '',
  enrollmentDate: new Date().toISOString().split('T')[0],
  attendancePercentage: 0, gpa: 0, totalFeesPaid: 0, totalFeesDue: 0,
};

type TabKey = 'all' | 'approved' | 'pending' | 'rejected';

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '👥' },
  { key: 'approved', label: 'Approved', icon: '✅' },
  { key: 'pending', label: 'Pending', icon: '⏳' },
  { key: 'rejected', label: 'Rejected', icon: '❌' },
];

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
    graduated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || colors.inactive}`}>{status}</span>;
}

function ApprovalBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || colors.pending}`}>{status}</span>;
}

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function StudentModal({ student, schools, onClose, onSaved }: {
  student?: Student;
  schools: SchoolBrief[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!student;
  const [form, setForm] = useState<StudentForm>(student ? {
    email: student.user?.email || '', password: '',
    firstName: student.profile?.firstName || '', lastName: student.profile?.lastName || '',
    gender: student.profile?.gender || 'male', school: student.school?._id || '',
    classId: student.class?._id || '', grade: student.grade || '',
    medicalNotes: student.medicalNotes || '',
    enrollmentDate: student.enrollmentDate ? new Date(student.enrollmentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    attendancePercentage: student.attendancePercentage ?? 0, gpa: student.gpa ?? 0,
    totalFeesPaid: student.totalFeesPaid ?? 0, totalFeesDue: student.totalFeesDue ?? 0,
  } : emptyForm);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof StudentForm, string>>>({});

  useEffect(() => {
    if (!form.school) { setClasses([]); if (!isEdit) setForm(p => ({ ...p, classId: '' })); return; }
    (async () => {
      try { const { data } = await api.get('/classes', { params: { schoolId: form.school, limit: '200' } }); setClasses(data.data || []); }
      catch { setClasses([]); }
    })();
  }, [form.school, isEdit]);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof StudentForm, string>> = {};
    if (!isEdit) { if (!form.email.trim()) errs.email = 'Email is required'; else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email'; if (!form.password) errs.password = 'Password is required'; else if (form.password.length < 8) errs.password = 'Min 8 characters'; }
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    if (!form.school) errs.school = 'Organization is required';
    if (!form.classId) errs.classId = 'Class is required';
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    if (errors[name as keyof StudentForm]) setErrors(p => { const n = { ...p }; delete n[name as keyof StudentForm]; return n; });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); if (!validate()) return;
    setLoading(true); setError('');
    try {
      const payload = { firstName: form.firstName, lastName: form.lastName, gender: form.gender, school: form.school, classId: form.classId, grade: form.grade || undefined, medicalNotes: form.medicalNotes || undefined, enrollmentDate: form.enrollmentDate, attendancePercentage: Number(form.attendancePercentage), gpa: Number(form.gpa), totalFeesPaid: Number(form.totalFeesPaid), totalFeesDue: Number(form.totalFeesDue), ...(isEdit ? {} : { email: form.email, password: form.password }) };
      if (isEdit) await api.patch(`/students/${student._id}`, payload);
      else { if (!form.email || !form.password) throw new Error('Email and password are required'); await api.post('/students', payload); }
      onSaved(); onClose();
    } catch (err: any) { setError(err.response?.data?.message || err.message || 'Failed to save student'); }
    finally { setLoading(false); }
  };

  const ic = (f: keyof StudentForm) => `w-full rounded-xl border px-3 py-2 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${errors[f] ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-border-default)]'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{isEdit ? '✏️ Edit Student' : '➕ Add Student'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">First Name *</label><input className={ic('firstName')} name="firstName" value={form.firstName} onChange={handleChange} required />{errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>}</div>
            <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Last Name *</label><input className={ic('lastName')} name="lastName" value={form.lastName} onChange={handleChange} required />{errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>}</div>
          </div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Gender *</label><select className={ic('gender')} name="gender" value={form.gender} onChange={handleChange}><option value="male">Male</option><option value="female">Female</option></select></div>
          {!isEdit && (<>
            <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Email *</label><input className={ic('email')} name="email" type="email" value={form.email} onChange={handleChange} required />{errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}</div>
            <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Password *</label><input className={ic('password')} name="password" type="password" value={form.password} onChange={handleChange} required minLength={8} />{errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}</div>
          </>)}
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Organization *</label><select className={ic('school')} name="school" value={form.school} onChange={handleChange}><option value="">Select an organization...</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>{errors.school && <p className="mt-1 text-xs text-red-500">{errors.school}</p>}</div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Class *</label><select className={ic('classId')} name="classId" value={form.classId} onChange={handleChange} disabled={!form.school}><option value="">{form.school ? 'Select a class...' : 'Select an organization first'}</option>{classes.map(c => <option key={c._id} value={c._id}>{c.title} — Section {c.section}</option>)}</select>{errors.classId && <p className="mt-1 text-xs text-red-500">{errors.classId}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Grade</label><input className={ic('grade')} name="grade" placeholder="e.g. Level 3" value={form.grade} onChange={handleChange} /></div>
            <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Enrollment Date</label><input className={ic('enrollmentDate')} name="enrollmentDate" type="date" value={form.enrollmentDate} onChange={handleChange} /></div>
          </div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Medical Notes</label><textarea className={ic('medicalNotes')} name="medicalNotes" rows={2} value={form.medicalNotes} onChange={handleChange} /></div>
          {isEdit && (<>
            <div className="border-t border-[var(--color-border-subtle)] pt-3"><p className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Academic Summary</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Attendance %</label><input className={ic('attendancePercentage')} name="attendancePercentage" type="number" min={0} max={100} value={form.attendancePercentage} onChange={handleChange} /></div>
                <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">GPA</label><input className={ic('gpa')} name="gpa" type="number" min={0} max={4} step={0.1} value={form.gpa} onChange={handleChange} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Fees Paid ($)</label><input className={ic('totalFeesPaid')} name="totalFeesPaid" type="number" min={0} value={form.totalFeesPaid} onChange={handleChange} /></div>
                <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Fees Due ($)</label><input className={ic('totalFeesDue')} name="totalFeesDue" type="number" min={0} value={form.totalFeesDue} onChange={handleChange} /></div>
              </div>
            </div>
          </>)}
          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}{isEdit ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approve Modal (for Pending students)
// ---------------------------------------------------------------------------

function ApproveModal({ student, schools, onClose, onDone }: {
  student: Student;
  schools: SchoolBrief[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [school, setSchool] = useState('');
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!school) { setClasses([]); setClassId(''); return; }
    (async () => {
      try { const { data } = await api.get('/classes', { params: { schoolId: school, limit: '200' } }); setClasses(data.data || []); }
      catch { setClasses([]); }
    })();
  }, [school]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!school) { setError('Organization is required'); return; }
    if (!classId) { setError('Class is required'); return; }
    setLoading(true); setError('');
    try { await api.patch(`/students/${student._id}/approve`, { school, classId }); onDone(); onClose(); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to approve'); }
    finally { setLoading(false); }
  };

  const ic = 'w-full rounded-xl border px-3 py-2 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors border-[var(--color-border-default)]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">✅ Approve Student</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">Approve <strong>{student.profile?.firstName} {student.profile?.lastName}</strong></p>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Organization *</label><select className={ic} value={school} onChange={e => setSchool(e.target.value)}><option value="">Select organization...</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Class *</label><select className={ic} value={classId} onChange={e => setClassId(e.target.value)} disabled={!school}><option value="">{school ? 'Select class...' : 'Select an organization first'}</option>{classes.map(c => <option key={c._id} value={c._id}>{c.title} — Section {c.section}</option>)}</select></div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-green-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}Approve</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View Details Modal
// ---------------------------------------------------------------------------

function ViewModal({ student, onClose }: { student: Student; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold">🎓 Student Details</h2><button onClick={onClose} className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button></div>
        <div className="space-y-3">
          <div className="text-center pb-3 border-b border-[var(--color-border-subtle)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-2xl font-bold text-primary-600 mb-2">{student.profile?.firstName?.[0]}{student.profile?.lastName?.[0]}</div>
            <p className="text-lg font-bold">{student.profile?.firstName} {student.profile?.lastName}</p>
            <p className="text-sm text-[var(--color-text-tertiary)]">{student.studentId}</p>
          </div>
          <DR label="Email" value={student.user?.email} />
          <DR label="Approval" value={<ApprovalBadge status={student.approvalStatus} />} />
          <DR label="Status" value={<StatusBadge status={student.status} />} />
          <DR label="Gender" value={student.profile?.gender || '—'} />
          <DR label="Organization" value={student.school?.name || '—'} />
          <DR label="Class" value={student.class ? `${student.class.title} — Section ${student.class.section}` : '—'} />
          <DR label="Grade" value={student.grade || '—'} />
          <DR label="Enrolled" value={new Date(student.enrollmentDate).toLocaleDateString()} />
          <DR label="Courses" value={student.enrolledCourses?.length ? `${student.enrolledCourses.length} course(s)` : 'None'} />
          <DR label="Attendance" value={student.attendancePercentage != null ? `${student.attendancePercentage}%` : '—'} />
          <DR label="GPA" value={student.gpa != null ? student.gpa.toFixed(1) : '—'} />
          <DR label="Fees Paid" value={student.totalFeesPaid != null ? `$${student.totalFeesPaid.toLocaleString()}` : '—'} />
          <DR label="Fees Due" value={student.totalFeesDue != null ? `$${student.totalFeesDue.toLocaleString()}` : '—'} />
          <DR label="Medical Notes" value={student.medicalNotes || '—'} />
          <DR label="Verified" value={student.user?.isVerified ? '✅ Yes' : '❌ No'} />
          <DR label="Active" value={student.user?.isActive ? '✅ Yes' : '❌ No'} />
        </div>
        <button onClick={onClose} className="mt-5 w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Close</button>
      </div>
    </div>
  );
}

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)] last:border-0"><span className="text-sm text-[var(--color-text-tertiary)]">{label}</span><span className="text-sm font-medium text-[var(--color-text-primary)] text-right max-w-[60%]">{value}</span></div>;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StudentsManage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | undefined>(undefined);
  const [viewingStudent, setViewingStudent] = useState<Student | undefined>(undefined);
  const [approvingStudent, setApprovingStudent] = useState<Student | undefined>(undefined);
  const limit = 15;

  const fetchStudents = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { page: String(page), limit: String(limit) };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (activeTab === 'pending') params.approvalStatus = 'pending';
      else if (activeTab === 'approved') params.approvalStatus = 'approved';
      else if (activeTab === 'rejected') params.approvalStatus = 'rejected';

      const [studentsRes, schoolsRes] = await Promise.all([api.get('/students', { params }), api.get('/schools', { params: { limit: '100' } })]);
      setStudents(studentsRes.data.data || []);
      setTotal(studentsRes.data.meta?.total || 0);
      setSchools(schoolsRes.data.data || []);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load students'); }
    finally { setLoading(false); }
  }, [page, search, statusFilter, activeTab]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try { await api.patch(`/students/${id}/status`, { status: newStatus }); setStudents(p => p.map(s => s._id === id ? { ...s, status: newStatus as Student['status'] } : s)); }
    catch (err: any) { alert(err.response?.data?.message || 'Failed to update status'); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deactivate this student?')) return;
    try { await api.delete(`/students/${id}`); if (students.length === 1 && page > 1) setPage(p => p - 1); else fetchStudents(); }
    catch (err: any) { alert(err.response?.data?.message || 'Failed to deactivate'); }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm('Reject this student?')) return;
    try { await api.patch(`/students/${id}/reject`); fetchStudents(); }
    catch (err: any) { alert(err.response?.data?.message || 'Failed to reject'); }
  };

  const totalPages = Math.ceil(total / limit);

  if (loading && students.length === 0) return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🎓 Manage Students</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} total students</p></div>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">+ Add Student</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setPage(1); }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === t.key ? 'bg-primary-600 text-white shadow-sm' : 'bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="text" placeholder="Search by name, email, or student ID..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option><option value="suspended">Suspended</option></select>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm mb-2">{error}</p><button onClick={fetchStudents} className="text-primary-600 font-medium text-sm hover:underline">Retry</button></div>}

        {/* Table */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Student</th>
                  <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Organization</th>
                  <th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Class</th>
                  <th className="text-center px-5 py-3 font-semibold">Approval</th>
                  <th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Status</th>
                  <th className="text-center px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">🎓 No students found</p><p className="text-sm">Click "+ Add Student" to create one.</p></td></tr>
                ) : (
                  students.map(st => (
                    <tr key={st._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer" onClick={() => setViewingStudent(st)}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-sm font-bold text-primary-600 flex-shrink-0">{st.profile?.firstName?.[0]}{st.profile?.lastName?.[0]}</div>
                          <div className="min-w-0"><p className="font-semibold text-[var(--color-text-primary)] truncate">{st.profile?.firstName} {st.profile?.lastName}</p><p className="text-xs text-[var(--color-text-tertiary)] truncate">{st.user?.email}</p></div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell text-sm text-[var(--color-text-secondary)]">{st.school?.name || '—'}</td>
                      <td className="px-5 py-4 hidden lg:table-cell">{st.class ? <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{st.class.title} — {st.class.section}</span> : '—'}</td>
                      <td className="px-5 py-4 text-center"><ApprovalBadge status={st.approvalStatus} /></td>
                      <td className="px-5 py-4 text-center hidden md:table-cell" onClick={e => e.stopPropagation()}>
                        <select value={st.status} onChange={e => handleStatusChange(st._id, e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500/30"><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option><option value="suspended">Suspended</option></select>
                      </td>
                      <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {st.approvalStatus === 'pending' ? (<>
                            <button onClick={() => setApprovingStudent(st)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors" title="Approve">✅</button>
                            <button onClick={() => handleReject(st._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Reject">❌</button>
                          </>) : (<>
                            <button onClick={() => setEditingStudent(st)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors" title="Edit">✏️</button>
                            <button onClick={() => handleDelete(st._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Deactivate">🗑️</button>
                          </>)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Prev</button>
            <span className="text-sm text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && <StudentModal schools={schools} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchStudents(); }} />}
      {editingStudent && <StudentModal student={editingStudent} schools={schools} onClose={() => setEditingStudent(undefined)} onSaved={() => { setEditingStudent(undefined); fetchStudents(); }} />}
      {viewingStudent && <ViewModal student={viewingStudent} onClose={() => setViewingStudent(undefined)} />}
      {approvingStudent && <ApproveModal student={approvingStudent} schools={schools} onClose={() => setApprovingStudent(undefined)} onDone={fetchStudents} />}
    </div>
  );
}

export default StudentsManage;