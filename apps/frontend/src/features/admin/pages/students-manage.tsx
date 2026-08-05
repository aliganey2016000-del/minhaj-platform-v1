/**
 * Student Management — Admin Full CRUD
 * Tabs: All | Approved | Pending | Rejected
 * Self-registered students → Pending → auto-assigned Public School/Class
 * Admin-created students → Approved (default)
 */

import { useEffect, useState, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, Users, Building2, BookOpen, School, Pencil, Trash2, Layers, CheckCircle2, Clock, XCircle, MoreVertical, Mail, ShieldCheck, Wallet, AlertTriangle, CalendarDays, Activity, type LucideIcon } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchoolBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; department?: string; shiftMode?: string; }

interface StudentProfile { _id: string; firstName: string; lastName: string; avatar?: string; gender: string; }
interface StudentUser { _id: string; email: string; role: string; isActive: boolean; isVerified: boolean; preferredLanguage: string; }
interface EnrolledCourse { _id: string; title: { en: string }; slug: string; }
interface GuardianInfo {
  _id: string;
  relationship?: string;
  user?: { email: string; phone?: string };
  profile?: { firstName: string; lastName: string };
}

interface StudentStats {
  total: number;
  byStatus: { active: number; inactive: number; graduated: number; suspended: number };
  byGender: { gender: string; count: number }[];
  byClass: { classId: string | null; label: string; count: number }[];
  byDepartment: { department: string; count: number }[];
  byOrganization: { schoolId: string | null; name: string; count: number }[];
}

interface Student {
  _id: string;
  studentId: string;
  user?: StudentUser;
  profile?: StudentProfile;
  school?: { _id: string; name: string };
  class?: { _id: string; title: string; section: string };
  department?: string;
  shiftMode?: string;
  parent?: GuardianInfo;
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
  email: string; password: string; firstName: string; lastName: string; gender: string;
  school: string; classId: string; grade: string; medicalNotes: string;
  enrollmentDate: string; attendancePercentage: number; gpa: number;
  totalFeesPaid: number; totalFeesDue: number;
  guardianFullName: string; guardianEmail: string; guardianPassword: string;
  guardianPhone: string; guardianRelationship: string;
}

const emptyForm: StudentForm = {
  email: '', password: '', firstName: '', lastName: '', gender: 'male',
  school: '', classId: '', grade: '', medicalNotes: '',
  enrollmentDate: new Date().toISOString().split('T')[0],
  attendancePercentage: 0, gpa: 0, totalFeesPaid: 0, totalFeesDue: 0,
  guardianFullName: '', guardianEmail: '', guardianPassword: '',
  guardianPhone: '', guardianRelationship: 'Father',
};

type TabKey = 'all' | 'approved' | 'pending' | 'rejected';

const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'all', label: 'All', icon: Layers },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'rejected', label: 'Rejected', icon: XCircle },
];

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50',
  inactive: 'bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800',
  graduated: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900/50',
  suspended: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/50',
};

const STATUS_DOT_COLORS: Record<string, string> = {
  active: 'bg-emerald-500',
  inactive: 'bg-slate-400',
  graduated: 'bg-sky-500',
  suspended: 'bg-red-500',
};

const STATUS_OPTIONS: { value: Student['status']; label: string; icon: LucideIcon }[] = [
  { value: 'active', label: 'Set Active', icon: CheckCircle2 },
  { value: 'inactive', label: 'Set Inactive', icon: XCircle },
  { value: 'graduated', label: 'Set Graduated', icon: GraduationCap },
  { value: 'suspended', label: 'Set Suspended', icon: AlertTriangle },
];

function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.inactive}`}>{status}</span>;
}

const APPROVAL_COLORS: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50',
  pending: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50',
  rejected: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/50',
};

function ApprovalBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${APPROVAL_COLORS[status] || APPROVAL_COLORS.pending}`}>{status}</span>;
}

// ---------------------------------------------------------------------------
// Password Input
// ---------------------------------------------------------------------------

function PasswordInput({ className, name, value, onChange, placeholder, required }: {
  className: string; name: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; placeholder?: string; required?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <input className={`${className} pr-10`} name={name} type={revealed ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} required={required} minLength={required ? 8 : undefined} />
      <button type="button" tabIndex={-1} onClick={() => setRevealed(r => !r)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
        {revealed ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function StudentModal({ student, schools, onClose, onSaved }: {
  student?: Student; schools: SchoolBrief[]; onClose: () => void; onSaved: () => void;
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
    guardianFullName: student.parent ? `${student.parent.profile?.firstName || ''} ${student.parent.profile?.lastName || ''}`.trim() : '',
    guardianEmail: student.parent?.user?.email || '', guardianPassword: '',
    guardianPhone: student.parent?.user?.phone || '',
    guardianRelationship: (() => { const map: Record<string, string> = { father: 'Father', mother: 'Mother', guardian: 'Guardian', other: 'Other' }; return map[student.parent?.relationship || 'father'] || 'Father'; })(),
  } : emptyForm);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof StudentForm, string>>>({});

  useEffect(() => {
    if (!form.school) { setClasses([]); if (!isEdit) setForm(p => ({ ...p, classId: '' })); return; }
    (async () => { try { const { data } = await api.get('/classes', { params: { schoolId: form.school, limit: '200' } }); setClasses(data.data || []); } catch { setClasses([]); } })();
  }, [form.school, isEdit]);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof StudentForm, string>> = {};
    if (!form.email.trim()) errs.email = 'Email is required'; else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email';
    if (!isEdit) { if (!form.password) errs.password = 'Password is required'; else if (form.password.length < 8) errs.password = 'Min 8 characters'; }
    else if (form.password && form.password.length < 8) errs.password = 'Min 8 characters';
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    if (!form.school) errs.school = 'Organization is required';
    if (!form.classId) errs.classId = 'Class is required';
    if (form.guardianFullName.trim()) {
      if (!form.guardianPhone.trim()) errs.guardianPhone = 'Guardian phone number is required when a guardian name is provided';
      if (form.guardianEmail.trim() && !/^\S+@\S+\.\S+$/.test(form.guardianEmail.trim())) errs.guardianEmail = 'Enter a valid guardian email';
    }
    if (form.guardianPassword && form.guardianPassword.length < 8) errs.guardianPassword = 'Min 8 characters';
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target; setForm(p => ({ ...p, [name]: value }));
    if (errors[name as keyof StudentForm]) setErrors(p => { const n = { ...p }; delete n[name as keyof StudentForm]; return n; });
  };

  const handleSubmit = async (e: FormEvent) => { e.preventDefault(); if (!validate()) return; setLoading(true); setError('');
    try {
      const guardian = form.guardianFullName.trim() ? { guardianFullName: form.guardianFullName.trim(), guardianEmail: form.guardianEmail.trim() || undefined, guardianPassword: form.guardianPassword || undefined, guardianPhone: form.guardianPhone.trim() || undefined, guardianRelationship: form.guardianRelationship } : {};
      const payload: Record<string, unknown> = { firstName: form.firstName, lastName: form.lastName, gender: form.gender, school: form.school, classId: form.classId, grade: form.grade || undefined, medicalNotes: form.medicalNotes || undefined, enrollmentDate: form.enrollmentDate, attendancePercentage: Number(form.attendancePercentage), gpa: Number(form.gpa), totalFeesPaid: Number(form.totalFeesPaid), totalFeesDue: Number(form.totalFeesDue), email: form.email, ...guardian };
      if (!isEdit || form.password) payload.password = form.password;
      const { data } = isEdit ? await api.patch(`/students/${student._id}`, payload) : await api.post('/students', payload);
      if (data?.message && !/^Student (created|updated) successfully$/.test(data.message)) alert(data.message);
      onSaved(); onClose();
    } catch (err: any) { setError(err.response?.data?.message || err.message || 'Failed to save student'); } finally { setLoading(false); }
  };

  const ic = (f: keyof StudentForm) => `w-full rounded-xl border px-3 py-2 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${errors[f] ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-border-default)]'}`;

  // Read-only cascade source for the Department/Shift badges below the Class selector.
  const selectedClass = classes.find(c => c._id === form.classId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold text-[var(--color-text-primary)]">{isEdit ? '✏️ Edit Student' : '➕ Add Student'}</h2><button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">First Name *</label><input className={ic('firstName')} name="firstName" value={form.firstName} onChange={handleChange} required />{errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>}</div><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Last Name *</label><input className={ic('lastName')} name="lastName" value={form.lastName} onChange={handleChange} required />{errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>}</div></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Gender *</label><select className={ic('gender')} name="gender" value={form.gender} onChange={handleChange}><option value="male">Male</option><option value="female">Female</option></select></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Email *</label><input className={ic('email')} name="email" type="email" value={form.email} onChange={handleChange} required />{errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}</div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">{isEdit ? 'Reset Password' : 'Password *'}</label><PasswordInput className={ic('password')} name="password" value={form.password} onChange={handleChange} required={!isEdit} placeholder={isEdit ? 'Leave blank to keep current password' : undefined} />{errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}</div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Organization *</label><select className={ic('school')} name="school" value={form.school} onChange={handleChange}><option value="">Select an organization...</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>{errors.school && <p className="mt-1 text-xs text-red-500">{errors.school}</p>}</div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Class *</label>
            <select className={ic('classId')} name="classId" value={form.classId} onChange={handleChange} disabled={!form.school}><option value="">{form.school ? 'Select a class...' : 'Select an organization first'}</option>{classes.map(c => <option key={c._id} value={c._id}>{c.title} — Section {c.section}</option>)}</select>
            {errors.classId && <p className="mt-1 text-xs text-red-500">{errors.classId}</p>}
            {/* Read-only cascade — Department + Shift/Learning Mode are inherited
                from the selected Class, never edited directly here. */}
            {selectedClass && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedClass.department && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-950/30 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">
                    🏛️ Department: {selectedClass.department}
                  </span>
                )}
                {selectedClass.shiftMode && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    🕐 Shift: {selectedClass.shiftMode}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Grade</label><input className={ic('grade')} name="grade" placeholder="e.g. Level 3" value={form.grade} onChange={handleChange} /></div><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Enrollment Date</label><input className={ic('enrollmentDate')} name="enrollmentDate" type="date" value={form.enrollmentDate} onChange={handleChange} /></div></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Medical Notes</label><textarea className={ic('medicalNotes')} name="medicalNotes" rows={2} value={form.medicalNotes} onChange={handleChange} /></div>
          <div className="border-t border-[var(--color-border-subtle)] pt-3"><p className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">👨‍👩‍👧 Parent / Guardian Information (Optional)</p>
            <div className="space-y-3">
              <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Guardian Full Name</label><input className={ic('guardianFullName')} name="guardianFullName" placeholder="e.g. Mohamed Ali" value={form.guardianFullName} onChange={handleChange} />{errors.guardianFullName && <p className="mt-1 text-xs text-red-500">{errors.guardianFullName}</p>}</div>
              <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Guardian Email</label><input className={ic('guardianEmail')} name="guardianEmail" type="email" placeholder="guardian@example.com" value={form.guardianEmail} onChange={handleChange} />{errors.guardianEmail && <p className="mt-1 text-xs text-red-500">{errors.guardianEmail}</p>}</div><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">{student?.parent ? 'Reset Guardian Password' : 'Guardian Password'}</label><PasswordInput className={ic('guardianPassword')} name="guardianPassword" value={form.guardianPassword} onChange={handleChange} placeholder={student?.parent ? 'Leave blank to keep current password' : 'Min 8 characters'} />{errors.guardianPassword && <p className="mt-1 text-xs text-red-500">{errors.guardianPassword}</p>}</div></div>
              <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Guardian Phone Number</label><input className={ic('guardianPhone')} name="guardianPhone" type="tel" placeholder="+252XXXXXXXXX" value={form.guardianPhone} onChange={handleChange} />{errors.guardianPhone && <p className="mt-1 text-xs text-red-500">{errors.guardianPhone}</p>}<p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">Used to find or link this family's existing parent account</p></div><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Relationship to Student</label><select className={ic('guardianRelationship')} name="guardianRelationship" value={form.guardianRelationship} onChange={handleChange}><option value="Father">Father</option><option value="Mother">Mother</option><option value="Guardian">Guardian</option><option value="Other">Other</option></select>{errors.guardianRelationship && <p className="mt-1 text-xs text-red-500">{errors.guardianRelationship}</p>}</div></div>
            </div>
          </div>
          {isEdit && <><div className="border-t border-[var(--color-border-subtle)] pt-3"><p className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Academic Summary</p><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Attendance %</label><input className={ic('attendancePercentage')} name="attendancePercentage" type="number" min={0} max={100} value={form.attendancePercentage} onChange={handleChange} /></div><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">GPA</label><input className={ic('gpa')} name="gpa" type="number" min={0} max={4} step={0.1} value={form.gpa} onChange={handleChange} /></div></div><div className="grid grid-cols-2 gap-3 mt-2"><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Fees Paid ($)</label><input className={ic('totalFeesPaid')} name="totalFeesPaid" type="number" min={0} value={form.totalFeesPaid} onChange={handleChange} /></div><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Fees Due ($)</label><input className={ic('totalFeesDue')} name="totalFeesDue" type="number" min={0} value={form.totalFeesDue} onChange={handleChange} /></div></div></div></>}
          <div className="flex gap-2 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button><button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}{isEdit ? 'Update' : 'Create'}</button></div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approve Modal
// ---------------------------------------------------------------------------

function ApproveModal({ student, schools, onClose, onDone }: { student: Student; schools: SchoolBrief[]; onClose: () => void; onDone: () => void }) {
  const [school, setSchool] = useState(''); const [classId, setClassId] = useState(''); const [classes, setClasses] = useState<ClassBrief[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!school) { setClasses([]); setClassId(''); return; } (async () => { try { const { data } = await api.get('/classes', { params: { schoolId: school, limit: '200' } }); setClasses(data.data || []); } catch { setClasses([]); } })(); }, [school]);
  const handleSubmit = async (e: FormEvent) => { e.preventDefault(); if (!school) { setError('Organization is required'); return; } if (!classId) { setError('Class is required'); return; } setLoading(true); setError(''); try { await api.patch(`/students/${student._id}/approve`, { school, classId }); onDone(); onClose(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to approve'); } finally { setLoading(false); } };
  const ic = 'w-full rounded-xl border px-3 py-2 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors border-[var(--color-border-default)]';
  return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}><div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-[var(--color-text-primary)]">✅ Approve Student</h2><button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div><p className="text-sm text-[var(--color-text-secondary)] mb-3">Approve <strong>{student.profile?.firstName} {student.profile?.lastName}</strong></p>{error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}<form onSubmit={handleSubmit} className="space-y-3"><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Organization *</label><select className={ic} value={school} onChange={e => setSchool(e.target.value)}><option value="">Select organization...</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Class *</label><select className={ic} value={classId} onChange={e => setClassId(e.target.value)} disabled={!school}><option value="">{school ? 'Select class...' : 'Select an organization first'}</option>{classes.map(c => <option key={c._id} value={c._id}>{c.title} — Section {c.section}</option>)}</select></div><div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button><button type="submit" disabled={loading} className="flex-1 rounded-xl bg-green-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}Approve</button></div></form></div></div>);
}

// ---------------------------------------------------------------------------
// View Details Modal
// ---------------------------------------------------------------------------

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4">
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, tone = 'default', wide = false }: {
  icon: LucideIcon; label: string; value: React.ReactNode; tone?: 'default' | 'good' | 'bad' | 'muted'; wide?: boolean;
}) {
  const toneClass = {
    default: 'text-[var(--color-text-primary)]',
    good: 'text-green-600 dark:text-green-400',
    bad: 'text-red-600 dark:text-red-400',
    muted: 'text-[var(--color-text-tertiary)]',
  }[tone];

  // Long values (emails, etc.) get their own full-width row with the value
  // wrapped underneath the label instead of squeezed into a half-width
  // column and truncated — nothing important should ever be cut off here.
  if (wide) {
    return (
      <div className="sm:col-span-2 min-w-0">
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
          <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />
          {label}
        </span>
        <p className={`mt-0.5 text-sm font-semibold break-all ${toneClass}`}>{value}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] flex-shrink-0">
        <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />
        {label}
      </span>
      <span className={`text-sm font-semibold text-right truncate ${toneClass}`}>{value}</span>
    </div>
  );
}

function DetailStatTile({ label, value, tone }: { label: string; value: React.ReactNode; tone: 'emerald' | 'sky' | 'violet' }) {
  const toneClass = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300',
    sky: 'bg-sky-50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-300',
    violet: 'bg-violet-50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-300',
  }[tone];
  return (
    <div className={`flex-1 rounded-xl p-3 text-center ${toneClass}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

function ViewModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const fullName = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || 'Unknown Student';
  const initials = `${student.profile?.firstName?.[0] || ''}${student.profile?.lastName?.[0] || ''}`.toUpperCase();
  const feesDue = student.totalFeesDue ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Banner — avatar, name and badges live inside it, not overlapping into the card below */}
        <div className="relative rounded-t-2xl bg-gradient-to-br from-primary-500 to-primary-700 px-6 pt-5 pb-6">
          <button onClick={onClose} className="absolute top-4 right-4 rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/70 mb-4">
            <GraduationCap className="h-3.5 w-3.5" strokeWidth={2} /> Student Details
          </p>

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold text-white ring-2 ring-white/30">
              {initials || <GraduationCap className="h-7 w-7" strokeWidth={1.75} />}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-white truncate">{fullName}</p>
              <p className="text-xs font-mono text-white/70">{student.studentId}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <ApprovalBadge status={student.approvalStatus} />
            <StatusBadge status={student.status} />
          </div>
        </div>

        <div className="px-6 pt-5 pb-6">

          {/* Headline stats */}
          <div className="flex gap-2 mb-4">
            <DetailStatTile label="Attendance" value={student.attendancePercentage != null ? `${student.attendancePercentage}%` : '—'} tone="emerald" />
            <DetailStatTile label="GPA" value={student.gpa != null ? student.gpa.toFixed(1) : '—'} tone="sky" />
            <DetailStatTile label="Courses" value={student.enrolledCourses?.length || 0} tone="violet" />
          </div>

          <InfoCard title="Academic">
            <InfoRow icon={Building2} label="Organization" value={student.school?.name || '—'} />
            <InfoRow icon={School} label="Class" value={student.class ? `${student.class.title} — ${student.class.section}` : '—'} />
            <InfoRow icon={Layers} label="Department" value={student.department || '—'} />
            <InfoRow icon={Clock} label="Shift" value={student.shiftMode || '—'} />
            <InfoRow icon={GraduationCap} label="Grade" value={student.grade || '—'} />
            <InfoRow icon={Users} label="Gender" value={student.profile?.gender || '—'} />
            <InfoRow icon={CalendarDays} label="Enrolled" value={new Date(student.enrollmentDate).toLocaleDateString()} />
          </InfoCard>

          <InfoCard title="Account">
            <InfoRow icon={Mail} label="Email" value={student.user?.email || '—'} wide />
            <InfoRow icon={ShieldCheck} label="Verified" value={student.user?.isVerified ? 'Yes' : 'No'} tone={student.user?.isVerified ? 'good' : 'muted'} />
            <InfoRow icon={Activity} label="Account Active" value={student.user?.isActive ? 'Yes' : 'No'} tone={student.user?.isActive ? 'good' : 'bad'} />
          </InfoCard>

          <InfoCard title="Fees">
            <InfoRow icon={Wallet} label="Paid" value={student.totalFeesPaid != null ? `$${student.totalFeesPaid.toLocaleString()}` : '—'} tone="good" />
            <InfoRow icon={Wallet} label="Due" value={student.totalFeesDue != null ? `$${student.totalFeesDue.toLocaleString()}` : '—'} tone={feesDue > 0 ? 'bad' : 'muted'} />
          </InfoCard>

          {student.medicalNotes && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3.5 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" strokeWidth={2} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-0.5">Medical Notes</p>
                <p className="text-sm text-amber-800 dark:text-amber-300">{student.medicalNotes}</p>
              </div>
            </div>
          )}

          <button onClick={onClose} className="mt-4 w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Three-Dot Actions Dropdown
// ---------------------------------------------------------------------------

function ActionsDropdown({ onImport, onExport, exporting }: { onImport: () => void; onExport: () => void; exporting: boolean }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);

  const toggle = (e: React.MouseEvent) => { e.stopPropagation(); setOpen(!open); };

  return (<>
    <button ref={btnRef} onClick={toggle} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors" title="More Actions">
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 16 16">
        <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
      </svg>
    </button>
    {open && btnRef.current && createPortal(
      <div ref={menuRef} style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().bottom + 4, right: window.innerWidth - btnRef.current.getBoundingClientRect().right, zIndex: 100 }} className="w-52 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-elevated py-1">
        <button onClick={() => { setOpen(false); onImport(); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] flex items-center gap-2 transition-colors">↑ Import via Excel</button>
        <button onClick={() => { setOpen(false); onExport(); }} disabled={exporting} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-50 flex items-center gap-2 transition-colors">{exporting ? <div className="h-3 w-3 animate-spin rounded-full border border-[var(--color-border-default)] border-t-primary-600" /> : '↓ Export to Excel'}</button>
      </div>,
      document.body,
    )}
  </>);
}

// ---------------------------------------------------------------------------
// Stats / Analytics Section
// ---------------------------------------------------------------------------

// Fixed categorical order (never cycled per-entity) — series-1..8 map to the
// validated 8-hue palette (light + dark steps declared once in .viz-root below).
const VIZ_STYLE = `
  .viz-root {
    --series-1: #2a78d6; --series-2: #eb6834; --series-3: #1baf7a; --series-4: #eda100;
    --series-5: #e87ba4; --series-6: #008300; --series-7: #4a3aa7; --series-8: #e34948;
    --status-good: #0ca30c; --status-warning: #fab219; --status-serious: #ec835a; --status-critical: #d03b3b;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70; --series-4: #c98500;
      --series-5: #d55181; --series-6: #008300; --series-7: #9085e9; --series-8: #e66767;
    }
  }
  :root[data-theme="dark"] .viz-root {
    --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70; --series-4: #c98500;
    --series-5: #d55181; --series-6: #008300; --series-7: #9085e9; --series-8: #e66767;
  }
`;

function foldTop(rows: { label: string; count: number }[], max = 7): { label: string; count: number }[] {
  const sorted = [...rows].filter(r => r.count > 0).sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, max);
  const restCount = sorted.slice(max).reduce((s, r) => s + r.count, 0);
  if (restCount > 0) head.push({ label: 'Other', count: restCount });
  return head;
}

function StatTile({ label, value, colorVar }: { label: string; value: number; colorVar: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-4 shadow-sm flex flex-col gap-1">
      <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider truncate">{label}</span>
      <span className="text-2xl font-bold tabular-nums" style={{ color: `var(${colorVar})` }}>{value.toLocaleString()}</span>
    </div>
  );
}

/** Slice color for index i — same fixed-order formula the legend rows below use, so a slice and its legend row are always the same hue. */
function seriesColor(label: string, i: number, colorOffset: number): string {
  return label === 'Other' ? 'var(--color-text-tertiary)' : `var(--series-${((i + colorOffset) % 8) + 1})`;
}

function BreakdownDonut({ items, colorOffset, size = 92 }: { items: { label: string; count: number }[]; colorOffset: number; size?: number }) {
  const data = items.map((item, i) => ({ name: item.label, value: item.count, fill: seriesColor(item.label, i, colorOffset) }));
  return (
    <PieChart width={size} height={size} className="flex-shrink-0">
      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={size * 0.32} outerRadius={size * 0.48} paddingAngle={data.length > 1 ? 2 : 0} strokeWidth={2} stroke="var(--color-surface-primary)" isAnimationActive={false}>
        {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
      </Pie>
      <RechartsTooltip
        formatter={(value, name) => [typeof value === 'number' ? value.toLocaleString() : String(value ?? ''), String(name)]}
        contentStyle={{ fontSize: 12, borderRadius: 8, background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
      />
    </PieChart>
  );
}

function BarList({ title, icon: Icon, items, colorOffset = 0, emptyLabel }: {
  title: string; icon: LucideIcon; items: { label: string; count: number }[]; colorOffset?: number; emptyLabel?: string;
}) {
  const max = Math.max(1, ...items.map(i => i.count));
  return (
    <div className="viz-root rounded-2xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)] mb-4">
        <Icon className="h-[18px] w-[18px] text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-text-tertiary)]">{emptyLabel || 'No data yet'}</p>
      ) : (
        <div className="flex items-center gap-4">
          {items.length > 1 && <BreakdownDonut items={items} colorOffset={colorOffset} />}
          <div className="flex-1 min-w-0 space-y-2.5">
            {items.map((item, i) => {
              const colorVar = seriesColor(item.label, i, colorOffset);
              return (
                <div key={item.label + i}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: colorVar }} />
                    <span className="text-xs font-medium text-[var(--color-text-secondary)] truncate flex-1">{item.label}</span>
                    <span className="text-xs font-semibold text-[var(--color-text-primary)] tabular-nums flex-shrink-0">{item.count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden" title={`${item.label}: ${item.count}`}>
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(3, (item.count / max) * 100)}%`, backgroundColor: colorVar }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatsSection({ stats, loading }: { stats: StudentStats | null; loading: boolean }) {
  if (loading && !stats) {
    return <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }
  if (!stats) return null;

  const genderLabels: Record<string, string> = { male: 'Male', female: 'Female' };
  const genderRows = foldTop(stats.byGender.map(g => ({ label: genderLabels[g.gender] || 'Unspecified', count: g.count })), 8);
  const classRows = foldTop(stats.byClass.map(c => ({ label: c.label, count: c.count })));
  const deptRows = foldTop(stats.byDepartment.map(d => ({ label: d.department, count: d.count })));
  const orgRows = foldTop(stats.byOrganization.map(o => ({ label: o.name, count: o.count })));

  return (
    <div className="viz-root space-y-4">
      <style>{VIZ_STYLE}</style>

      {/* Stat tiles — Total / Active / Inactive / Graduated / Suspended */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile label="Total Students" value={stats.total} colorVar="--series-1" />
        <StatTile label="Active" value={stats.byStatus.active} colorVar="--status-good" />
        <StatTile label="Inactive" value={stats.byStatus.inactive} colorVar="--color-text-tertiary" />
        <StatTile label="Graduated" value={stats.byStatus.graduated} colorVar="--series-1" />
        <StatTile label="Suspended" value={stats.byStatus.suspended} colorVar="--status-critical" />
      </div>

      {/* Breakdown charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BarList title="By Gender" icon={Users} items={genderRows} />
        <BarList title="By Department" icon={Building2} items={deptRows} colorOffset={2} emptyLabel="No department data" />
        <BarList title="By Class" icon={BookOpen} items={classRows} colorOffset={4} emptyLabel="No class data" />
        <BarList title="By Organization" icon={School} items={orgRows} colorOffset={6} emptyLabel="No organization data" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row Actions — single "⋮" dropdown replacing individual per-row icon
// buttons; content varies (Approve/Reject for pending, Edit/Delete
// otherwise) but the trigger is always the same uniform button.
// ---------------------------------------------------------------------------

interface RowAction { label: string; icon: LucideIcon; onClick: () => void; tone: 'default' | 'danger' | 'success'; }

const rowActionTone: Record<RowAction['tone'], string> = {
  default: 'text-primary-600',
  success: 'text-green-600',
  danger: 'text-red-600',
};

function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (<>
    <button
      ref={btnRef}
      onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      className="rounded-lg border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-1.5 text-[var(--color-text-secondary)] shadow-sm hover:bg-[var(--color-surface-tertiary)] transition-colors"
      title="More Actions"
    >
      <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
    </button>
    {open && btnRef.current && createPortal(
      <div
        ref={menuRef}
        style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().bottom + 4, right: window.innerWidth - btnRef.current.getBoundingClientRect().right, zIndex: 100 }}
        className="w-40 rounded-xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] shadow-md py-1"
      >
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick(); }}
            className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors ${rowActionTone[a.tone]}`}
          >
            <a.icon className="h-3.5 w-3.5" strokeWidth={1.75} /> {a.label}
          </button>
        ))}
      </div>,
      document.body,
    )}
  </>);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StudentsManage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const isOrgAdmin = user?.role === 'org_admin';

  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [hasFetched, setHasFetched] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    // Lets the Quick Actions header button jump straight into "Add Student"
    // instead of just landing on the list — see dashboard-header.tsx.
    if ((location.state as any)?.openCreate) {
      setShowCreate(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editingStudent, setEditingStudent] = useState<Student | undefined>(undefined);
  const [viewingStudent, setViewingStudent] = useState<Student | undefined>(undefined);
  const [approvingStudent, setApprovingStudent] = useState<Student | undefined>(undefined);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const limit = 15;

  // ── Import / Export state ──
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteError, setPasteError] = useState('');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ totalRows: number; created: number; failed: number; errors: { row: number; message: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load schools on mount ──
  useEffect(() => { (async () => { try { const { data } = await api.get('/schools', { params: { limit: '100' } }); setSchools(data.data || []); } catch { /* ignore */ } })(); }, []);

  // ── Fetch students — overrides let a filter chip's "✕" apply its own
  // clearing immediately instead of waiting a render for state to settle
  // before reading it back out of the closure. ──
  const fetchStudents = useCallback(async (pageNum = 1, overrides?: { search?: string; statusFilter?: string; filterSchool?: string }) => {
    setLoading(true); setError('');
    try {
      const s = overrides?.search !== undefined ? overrides.search : search;
      const st = overrides?.statusFilter !== undefined ? overrides.statusFilter : statusFilter;
      const sc = overrides?.filterSchool !== undefined ? overrides.filterSchool : filterSchool;
      const params: any = { page: String(pageNum), limit: String(limit) };
      if (s) params.search = s;
      if (st) params.status = st;
      if (activeTab === 'pending') params.approvalStatus = 'pending';
      else if (activeTab === 'approved') params.approvalStatus = 'approved';
      else if (activeTab === 'rejected') params.approvalStatus = 'rejected';
      if (sc) params.school = sc;
      const { data } = await api.get('/students', { params });
      setStudents(data.data || []);
      setTotal(data.meta?.total || 0);
      setHasFetched(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, activeTab, filterSchool]);

  const clearFilter = (key: 'search' | 'statusFilter' | 'filterSchool') => {
    if (key === 'search') setSearch('');
    if (key === 'statusFilter') setStatusFilter('');
    if (key === 'filterSchool') setFilterSchool('');
    setPage(1);
    fetchStudents(1, { [key]: '' });
  };

  // ── Fetch stats ──
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const params: any = {};
      if (filterSchool) params.school = filterSchool;
      const { data } = await api.get('/students/stats', { params });
      setStats(data.data);
    } catch { /* non-critical — leave prior stats in place */ } finally { setStatsLoading(false); }
  }, [filterSchool]);

  useEffect(() => { if (isOrgAdmin) { fetchStudents(1); fetchStats(); } }, [isOrgAdmin]);

  const handleApplyFilters = () => { if (isSuperAdmin && !filterSchool) { setError('Please select an organization to view students.'); return; } setPage(1); fetchStudents(1); fetchStats(); };
  const handlePageChange = (newPage: number) => { setPage(newPage); fetchStudents(newPage); };
  const handleStatusChange = async (id: string, newStatus: string) => { try { await api.patch(`/students/${id}/status`, { status: newStatus }); setStudents(p => p.map(s => s._id === id ? { ...s, status: newStatus as Student['status'] } : s)); fetchStats(); } catch (err: any) { alert(err.response?.data?.message || 'Failed to update status'); } };
  const handleDelete = async (id: string) => { if (!window.confirm('Deactivate this student?')) return; try { await api.delete(`/students/${id}`); fetchStudents(page); fetchStats(); } catch (err: any) { alert(err.response?.data?.message || 'Failed to deactivate'); } };
  const handleReject = async (id: string) => { if (!window.confirm('Reject this student?')) return; try { await api.patch(`/students/${id}/reject`); fetchStudents(page); fetchStats(); } catch (err: any) { alert(err.response?.data?.message || 'Failed to reject'); } };
  const totalPages = Math.ceil(total / limit);

  // Row actions — status changes, Edit, and Deactivate all live in one kebab
  // menu instead of a separate inline status <select> next to it.
  const buildRowActions = (st: Student): RowAction[] => {
    if (st.approvalStatus === 'pending') {
      return [
        { label: 'Approve', icon: CheckCircle2, onClick: () => setApprovingStudent(st), tone: 'success' },
        { label: 'Reject', icon: XCircle, onClick: () => handleReject(st._id), tone: 'danger' },
      ];
    }
    return [
      { label: 'Edit', icon: Pencil, onClick: () => setEditingStudent(st), tone: 'default' },
      ...STATUS_OPTIONS.filter((o) => o.value !== st.status).map((o) => ({
        label: o.label, icon: o.icon, onClick: () => handleStatusChange(st._id, o.value), tone: 'default' as const,
      })),
      { label: 'Deactivate', icon: Trash2, onClick: () => handleDelete(st._id), tone: 'danger' },
    ];
  };

  // ───────────────────────────────────────────────────────────────────────
  // Import Modal Logic
  // ───────────────────────────────────────────────────────────────────────

  const openImportModal = () => { setShowImportModal(true); setImportMode('upload'); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };
  const closeImportModal = () => { setShowImportModal(false); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };

  const handleDownloadTemplate = async () => { try { const token = localStorage.getItem('accessToken') || ''; const response = await fetch(`${api.defaults.baseURL}/students/template`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Download failed'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'students-template.xlsx'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); } catch { setError('Failed to download template'); } };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) setSelectedFile(file); };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) setSelectedFile(file); };

  const submitFileImport = async () => { if (!selectedFile) return; setImporting(true); setError(''); setImportResult(null); try { const formData = new FormData(); formData.append('file', selectedFile); const { data } = await api.post('/students/import', formData); setImportResult(data.data); if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} students`); fetchStudents(page); fetchStats(); closeImportModal(); } } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); } };

  const parsePastedRows = (): string[][] => { if (!pasteText.trim()) return []; const lines = pasteText.trim().split(/\r?\n/); return lines.map(line => line.split('\t').map(cell => cell.trim())).filter(row => row.length > 0 && row.some(cell => cell !== '')); };

  const submitPasteImport = async () => { const rows = parsePastedRows(); if (rows.length === 0) { setPasteError('Please paste at least one row of data before submitting.'); return; } if (rows[0].length < 11) { setPasteError(`Expected 12-13 columns (First Name, Last Name, Gender, Email, Password, Organization, Grade/Class, Enrollment Date, Medical Notes, Guardian Name, Guardian Email, Guardian Phone, Relationship). Found ${rows[0].length}.`); return; } const csvContent = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n'); const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); const file = new File([blob], 'pasted-students.csv', { type: 'text/csv' }); setImporting(true); setError(''); setImportResult(null); setPasteError(''); try { const formData = new FormData(); formData.append('file', file); const { data } = await api.post('/students/import', formData); setImportResult(data.data); if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} students`); fetchStudents(page); fetchStats(); closeImportModal(); } } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); } };

  // ── Export ──
  const handleExport = async () => { setExporting(true); setError(''); try { const token = localStorage.getItem('accessToken') || ''; const response = await fetch(`${api.defaults.baseURL}/students/export`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Export failed'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `students-export-${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); setMessage('Export downloaded successfully'); } catch (err: any) { setError(err.message || 'Export failed'); } finally { setExporting(false); } };

  const parsedRows = parsePastedRows();

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* ── Header + Action Buttons ── */}
        {/* Buttons stay top-right of the title on every screen size, mobile
            included — not stacked below it as a separate row. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">
              <GraduationCap className="h-7 w-7 sm:h-8 sm:w-8 text-primary-600" strokeWidth={1.75} />
              Manage Students
            </h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{hasFetched ? `${total} total students` : 'Apply a filter to view students'}</p>
          </div>
          <div className="flex gap-2 sm:gap-3 items-center flex-shrink-0">
            <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelectedFile(f); submitFileImport(); } }} className="hidden" />
            <ActionsDropdown onImport={openImportModal} onExport={handleExport} exporting={exporting} />
            <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm whitespace-nowrap">+ Add Student</button>
          </div>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}

        {/* ── Stats / Analytics ── */}
        {hasFetched && <StatsSection stats={stats} loading={statsLoading} />}

        {/* ═══════════════════════════════════════════════════════════════
            Import Modal
           ═══════════════════════════════════════════════════════════════ */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
              <div className="border-b border-[var(--color-border-subtle)] px-6 py-5">
                <div className="flex items-start justify-between">
                  <div><h2 className="text-xl font-bold text-[var(--color-text-primary)]">Import Students</h2><p className="text-sm text-[var(--color-text-tertiary)] mt-1">Select your preferred method to import multiple students into the system.</p></div>
                  <button onClick={closeImportModal} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors" disabled={importing}><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              </div>
              <div className="px-6 py-5 space-y-6">
                <button onClick={handleDownloadTemplate} className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="text-2xl">📥</span><div><p className="text-sm font-bold text-primary-700 dark:text-primary-300 group-hover:text-primary-800 dark:group-hover:text-primary-200">Download Excel Student Template</p><p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">Pre-formatted .xlsx file with the correct column structure</p></div></div><svg className="h-5 w-5 text-primary-500 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></div></button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setImportMode('upload'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'upload' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}><span className="text-2xl block mb-1">📁</span><p className={`text-sm font-bold ${importMode === 'upload' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Upload Excel File</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Drag and drop your .xlsx file</p></button>
                  <button onClick={() => { setImportMode('paste'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'paste' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}><span className="text-2xl block mb-1">📋</span><p className={`text-sm font-bold ${importMode === 'paste' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Manual Copy & Paste</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Paste tabular data from your clipboard</p></button>
                </div>
                {importMode === 'upload' && (<div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop} className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}>{selectedFile ? (<div className="space-y-3"><span className="text-3xl">✅</span><p className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedFile.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p><button onClick={() => setSelectedFile(null)} className="text-xs text-red-500 hover:underline">Remove file</button></div>) : (<div className="space-y-3"><span className="text-3xl">📂</span><p className="text-sm font-medium text-[var(--color-text-secondary)]">Drag and drop your Excel file here, or</p><label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">Browse Files<input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInputChange} className="hidden" /></label><p className="text-xs text-[var(--color-text-tertiary)]">Supported formats: .xlsx, .xls, .csv (max 10 MB)</p></div>)}</div>)}
                {importMode === 'paste' && (<div className="space-y-3"><div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4"><p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Paste your spreadsheet data below (tab-separated columns, one row per line):</p><p className="text-xs text-[var(--color-text-tertiary)] mb-3 font-mono">First Name &nbsp; Last Name &nbsp; Gender &nbsp; Email &nbsp; Password &nbsp; Organization &nbsp; Grade/Class &nbsp; Enrollment Date &nbsp; Medical Notes &nbsp; Guardian Name &nbsp; Guardian Email &nbsp; Guardian Phone &nbsp; Relationship <span className="italic">(Organization only needed for super admin — leave blank if you manage a single organization)</span></p><textarea value={pasteText} onChange={(e) => { setPasteText(e.target.value); setPasteError(''); }} rows={8} placeholder={"Paste data from Excel here...\n\nExample:\nAhmed\tAli\tmale\tahmed@example.com\t\tMadrasa Al-Noor\tQuran Beginners A\t2026-01-15\t\tMohamed Ali\tparent@example.com\t+252612345678\tFather\nFatima\tOmar\tfemale\tfatima@example.com\t\tMadrasa Al-Noor\tFiqh Level 1\t2026-02-01\t\tAisha Omar\tparent2@example.com\t+252698765432\tMother"} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y" /></div>{pasteError && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{pasteError}</div>}{parsedRows.length > 0 && (<div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden"><div className="bg-[var(--color-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-tertiary)]">Preview — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed</div><div className="max-h-40 overflow-auto"><table className="w-full text-xs"><tbody className="divide-y divide-[var(--color-border-subtle)]">{parsedRows.slice(0, 20).map((row, ri) => (<tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--color-surface-primary)]' : 'bg-[var(--color-surface-secondary)]'}>{row.map((cell, ci) => (<td key={ci} className="px-3 py-1.5 text-[var(--color-text-secondary)] whitespace-nowrap border-r border-[var(--color-border-subtle)] last:border-r-0">{cell}</td>))}</tr>))}</tbody></table></div></div>)}</div>)}
                {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}
              </div>
              <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between"><button onClick={closeImportModal} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button><button onClick={importMode === 'upload' ? submitFileImport : submitPasteImport} disabled={importing || (importMode === 'upload' && !selectedFile) || (importMode === 'paste' && !pasteText.trim())} className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2">{importing ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importing...</> : 'Import Students'}</button></div>
              {importResult && (<div className="border-t border-[var(--color-border-subtle)] px-6 py-4 space-y-2"><p className="text-sm font-semibold text-[var(--color-text-primary)]">{importResult.created} of {importResult.totalRows} rows imported successfully{importResult.failed > 0 && ` — ${importResult.failed} failed`}</p>{importResult.errors.length > 0 && (<div className="max-h-36 overflow-auto rounded-lg border border-red-200 dark:border-red-900/40"><table className="w-full text-xs"><thead className="bg-red-50 dark:bg-red-950/30 text-left text-red-700 dark:text-red-300"><tr><th className="px-3 py-1.5">Row</th><th className="px-3 py-1.5">Error</th></tr></thead><tbody className="divide-y divide-red-100 dark:divide-red-900/30">{importResult.errors.map((e, idx) => (<tr key={idx}><td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{e.row}</td><td className="px-3 py-1.5 text-red-600 dark:text-red-400">{e.message}</td></tr>))}</tbody></table></div>)}</div>)}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            Unified control panel — status tabs, search/filters, and active-
            filter chips all in one card above the table (was 2 separate bars).
           ═══════════════════════════════════════════════════════════════ */}

        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-4 shadow-sm space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 -mt-1">
            {tabs.map(t => (<button key={t.key} onClick={() => { setActiveTab(t.key); setHasFetched(false); }} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === t.key ? 'bg-primary-600 text-white shadow-sm' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}><t.icon className="h-4 w-4" strokeWidth={1.75} /> {t.label}</button>))}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {isOrgAdmin ? (<div className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)]">{schools[0]?.name || 'Your Organization'}</div>) : (<select value={filterSchool} onChange={e => { setFilterSchool(e.target.value); setHasFetched(false); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">{isSuperAdmin ? 'Select an Organization...' : 'Select Organization...'}</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>)}
            <input type="text" placeholder="Search by name, email, or student ID..." value={search} onChange={e => { setSearch(e.target.value); setHasFetched(false); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" onKeyDown={e => { if (e.key === 'Enter') handleApplyFilters(); }} />
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setHasFetched(false); }} className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option><option value="suspended">Suspended</option></select>
            <button onClick={handleApplyFilters} className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors whitespace-nowrap">🔍 Apply Filters</button>
          </div>
          {hasFetched && (filterSchool || search || statusFilter) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-xs font-medium text-[var(--color-text-tertiary)]">Active filters:</span>
              {filterSchool && (
                <button onClick={() => clearFilter('filterSchool')} className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-950/30 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                  {schools.find(s => s._id === filterSchool)?.name || 'Organization'} ✕
                </button>
              )}
              {search && (
                <button onClick={() => clearFilter('search')} className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-950/30 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                  "{search}" ✕
                </button>
              )}
              {statusFilter && (
                <button onClick={() => clearFilter('statusFilter')} className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-950/30 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors capitalize">
                  {statusFilter} ✕
                </button>
              )}
            </div>
          )}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm mb-2">{error}</p><button onClick={() => handleApplyFilters()} className="text-primary-600 font-medium text-sm hover:underline">Retry</button></div>}
        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}
        {!loading && !hasFetched && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card"><p className="text-4xl mb-4">🔍</p><p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Please apply a filter to view records.</p><p className="text-sm text-[var(--color-text-tertiary)]">{isSuperAdmin ? 'Select an organization and click "Apply Filters" to load students.' : 'Click "Apply Filters" to load students for your organization.'}</p></div>}
        {!loading && hasFetched && students.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card"><p className="text-4xl mb-4">🎓</p><p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No students found</p><p className="text-sm text-[var(--color-text-tertiary)]">Try adjusting your filters or click "+ Add Student" to create one.</p></div>}

        {!loading && hasFetched && students.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="sticky top-0 z-10 bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]"><tr><th className="text-left px-5 py-3 font-semibold">Student</th><th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Organization</th><th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Class</th><th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Department</th><th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Shift</th><th className="text-center px-5 py-3 font-semibold">Approval</th><th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Status</th><th className="text-center px-5 py-3 font-semibold">Actions</th></tr></thead>
              <tbody>{students.map(st => (<tr key={st._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer" onClick={() => setViewingStudent(st)}><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="relative flex-shrink-0"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-sm font-bold text-primary-600">{st.profile?.firstName?.[0]}{st.profile?.lastName?.[0]}</div><span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-surface-primary)] ${STATUS_DOT_COLORS[st.status] || STATUS_DOT_COLORS.inactive}`} title={st.status} /></div><div className="min-w-0"><p className="font-semibold text-[var(--color-text-primary)] truncate">{st.profile?.firstName} {st.profile?.lastName}</p><p className="text-xs text-[var(--color-text-tertiary)] truncate">{st.user?.email}</p></div></div></td><td className="px-5 py-4 hidden md:table-cell text-sm text-[var(--color-text-secondary)]">{st.school?.name || '—'}</td><td className="px-5 py-4 hidden lg:table-cell">{st.class ? <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{st.class.title} — {st.class.section}</span> : '—'}</td><td className="px-5 py-4 hidden lg:table-cell text-sm text-[var(--color-text-secondary)]">{st.department || '—'}</td><td className="px-5 py-4 hidden lg:table-cell text-sm text-[var(--color-text-secondary)]">{st.shiftMode || '—'}</td><td className="px-5 py-4 text-center"><ApprovalBadge status={st.approvalStatus} /></td><td className="px-5 py-4 text-center hidden md:table-cell"><StatusBadge status={st.status} /></td><td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><RowActionsMenu actions={buildRowActions(st)} /></td></tr>))}</tbody></table></div>
          </div>
        )}

        {totalPages > 1 && (<div className="flex items-center justify-center gap-3"><button disabled={page <= 1} onClick={() => handlePageChange(page - 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Prev</button><span className="text-sm text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button></div>)}
      </div>

      {/* Modals */}
      {showCreate && <StudentModal schools={schools} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchStudents(page); fetchStats(); }} />}
      {editingStudent && <StudentModal student={editingStudent} schools={schools} onClose={() => setEditingStudent(undefined)} onSaved={() => { setEditingStudent(undefined); fetchStudents(page); fetchStats(); }} />}
      {viewingStudent && <ViewModal student={viewingStudent} onClose={() => setViewingStudent(undefined)} />}
      {approvingStudent && <ApproveModal student={approvingStudent} schools={schools} onClose={() => setApprovingStudent(undefined)} onDone={() => fetchStudents(page)} />}
    </div>
  );
}

export default StudentsManage;