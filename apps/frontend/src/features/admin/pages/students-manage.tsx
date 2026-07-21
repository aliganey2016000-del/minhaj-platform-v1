/**
 * Student Management — Admin Full CRUD
 * Tabs: All | Approved | Pending | Rejected
 * Self-registered students → Pending → auto-assigned Public School/Class
 * Admin-created students → Approved (default)
 */

import { useEffect, useState, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
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

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '👥' },
  { key: 'approved', label: 'Approved', icon: '✅' },
  { key: 'pending', label: 'Pending', icon: '⏳' },
  { key: 'rejected', label: 'Rejected', icon: '❌' },
];

// ---------------------------------------------------------------------------
// Badges
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
    if (form.guardianFullName.trim() && form.guardianEmail.trim() && !/^\S+@\S+\.\S+$/.test(form.guardianEmail.trim())) errs.guardianEmail = 'Enter a valid guardian email';
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
              <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Guardian Phone Number</label><input className={ic('guardianPhone')} name="guardianPhone" type="tel" placeholder="+252XXXXXXXXX" value={form.guardianPhone} onChange={handleChange} />{errors.guardianPhone && <p className="mt-1 text-xs text-red-500">{errors.guardianPhone}</p>}</div><div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Relationship to Student</label><select className={ic('guardianRelationship')} name="guardianRelationship" value={form.guardianRelationship} onChange={handleChange}><option value="Father">Father</option><option value="Mother">Mother</option><option value="Guardian">Guardian</option><option value="Other">Other</option></select>{errors.guardianRelationship && <p className="mt-1 text-xs text-red-500">{errors.guardianRelationship}</p>}</div></div>
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

function ViewModal({ student, onClose }: { student: Student; onClose: () => void }) {
  return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}><div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold">🎓 Student Details</h2><button onClick={onClose} className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button></div><div className="space-y-3"><div className="text-center pb-3 border-b border-[var(--color-border-subtle)]"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-2xl font-bold text-primary-600 mb-2">{student.profile?.firstName?.[0]}{student.profile?.lastName?.[0]}</div><p className="text-lg font-bold">{student.profile?.firstName} {student.profile?.lastName}</p><p className="text-sm text-[var(--color-text-tertiary)]">{student.studentId}</p></div><DR label="Email" value={student.user?.email} /><DR label="Approval" value={<ApprovalBadge status={student.approvalStatus} />} /><DR label="Status" value={<StatusBadge status={student.status} />} /><DR label="Gender" value={student.profile?.gender || '—'} /><DR label="Organization" value={student.school?.name || '—'} /><DR label="Class" value={student.class ? `${student.class.title} — Section ${student.class.section}` : '—'} /><DR label="Department" value={student.department || '—'} /><DR label="Shift" value={student.shiftMode || '—'} /><DR label="Grade" value={student.grade || '—'} /><DR label="Enrolled" value={new Date(student.enrollmentDate).toLocaleDateString()} /><DR label="Courses" value={student.enrolledCourses?.length ? `${student.enrolledCourses.length} course(s)` : 'None'} /><DR label="Attendance" value={student.attendancePercentage != null ? `${student.attendancePercentage}%` : '—'} /><DR label="GPA" value={student.gpa != null ? student.gpa.toFixed(1) : '—'} /><DR label="Fees Paid" value={student.totalFeesPaid != null ? `$${student.totalFeesPaid.toLocaleString()}` : '—'} /><DR label="Fees Due" value={student.totalFeesDue != null ? `$${student.totalFeesDue.toLocaleString()}` : '—'} /><DR label="Medical Notes" value={student.medicalNotes || '—'} /><DR label="Verified" value={student.user?.isVerified ? '✅ Yes' : '❌ No'} /><DR label="Active" value={student.user?.isActive ? '✅ Yes' : '❌ No'} /></div><button onClick={onClose} className="mt-5 w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Close</button></div></div>);
}

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)] last:border-0"><span className="text-sm text-[var(--color-text-tertiary)]">{label}</span><span className="text-sm font-medium text-[var(--color-text-primary)] text-right max-w-[60%]">{value}</span></div>;
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
  const [editingStudent, setEditingStudent] = useState<Student | undefined>(undefined);
  const [viewingStudent, setViewingStudent] = useState<Student | undefined>(undefined);
  const [approvingStudent, setApprovingStudent] = useState<Student | undefined>(undefined);
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

  // ── Fetch students ──
  const fetchStudents = useCallback(async (pageNum = 1) => { setLoading(true); setError(''); try { const params: any = { page: String(pageNum), limit: String(limit) }; if (search) params.search = search; if (statusFilter) params.status = statusFilter; if (activeTab === 'pending') params.approvalStatus = 'pending'; else if (activeTab === 'approved') params.approvalStatus = 'approved'; else if (activeTab === 'rejected') params.approvalStatus = 'rejected'; if (filterSchool) params.school = filterSchool; const { data } = await api.get('/students', { params }); setStudents(data.data || []); setTotal(data.meta?.total || 0); setHasFetched(true); } catch (err: any) { setError(err.response?.data?.message || 'Failed to load students'); } finally { setLoading(false); } }, [search, statusFilter, activeTab, filterSchool]);

  useEffect(() => { if (isOrgAdmin) fetchStudents(1); }, [isOrgAdmin]);

  const handleApplyFilters = () => { if (isSuperAdmin && !filterSchool) { setError('Please select an organization to view students.'); return; } setPage(1); fetchStudents(1); };
  const handlePageChange = (newPage: number) => { setPage(newPage); fetchStudents(newPage); };
  const handleStatusChange = async (id: string, newStatus: string) => { try { await api.patch(`/students/${id}/status`, { status: newStatus }); setStudents(p => p.map(s => s._id === id ? { ...s, status: newStatus as Student['status'] } : s)); } catch (err: any) { alert(err.response?.data?.message || 'Failed to update status'); } };
  const handleDelete = async (id: string) => { if (!window.confirm('Deactivate this student?')) return; try { await api.delete(`/students/${id}`); fetchStudents(page); } catch (err: any) { alert(err.response?.data?.message || 'Failed to deactivate'); } };
  const handleReject = async (id: string) => { if (!window.confirm('Reject this student?')) return; try { await api.patch(`/students/${id}/reject`); fetchStudents(page); } catch (err: any) { alert(err.response?.data?.message || 'Failed to reject'); } };
  const totalPages = Math.ceil(total / limit);

  // ───────────────────────────────────────────────────────────────────────
  // Import Modal Logic
  // ───────────────────────────────────────────────────────────────────────

  const openImportModal = () => { setShowImportModal(true); setImportMode('upload'); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };
  const closeImportModal = () => { setShowImportModal(false); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };

  const handleDownloadTemplate = async () => { try { const token = localStorage.getItem('accessToken') || ''; const response = await fetch(`${api.defaults.baseURL}/students/template`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Download failed'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'students-template.xlsx'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); } catch { setError('Failed to download template'); } };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) setSelectedFile(file); };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) setSelectedFile(file); };

  const submitFileImport = async () => { if (!selectedFile) return; setImporting(true); setError(''); setImportResult(null); try { const formData = new FormData(); formData.append('file', selectedFile); const { data } = await api.post('/students/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }); setImportResult(data.data); if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} students`); fetchStudents(page); closeImportModal(); } } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); } };

  const parsePastedRows = (): string[][] => { if (!pasteText.trim()) return []; const lines = pasteText.trim().split(/\r?\n/); return lines.map(line => line.split('\t').map(cell => cell.trim())).filter(row => row.length > 0 && row.some(cell => cell !== '')); };

  const submitPasteImport = async () => { const rows = parsePastedRows(); if (rows.length === 0) { setPasteError('Please paste at least one row of data before submitting.'); return; } if (rows[0].length < 11) { setPasteError(`Expected 11-12 columns (First Name, Last Name, Gender, Email, Password, Grade/Class, Enrollment Date, Medical Notes, Guardian Name, Guardian Email, Guardian Phone, Relationship). Found ${rows[0].length}.`); return; } const csvContent = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n'); const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); const file = new File([blob], 'pasted-students.csv', { type: 'text/csv' }); setImporting(true); setError(''); setImportResult(null); setPasteError(''); try { const formData = new FormData(); formData.append('file', file); const { data } = await api.post('/students/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }); setImportResult(data.data); if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} students`); fetchStudents(page); closeImportModal(); } } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); } };

  // ── Export ──
  const handleExport = async () => { setExporting(true); setError(''); try { const token = localStorage.getItem('accessToken') || ''; const response = await fetch(`${api.defaults.baseURL}/students/export`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Export failed'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `students-export-${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); setMessage('Export downloaded successfully'); } catch (err: any) { setError(err.message || 'Export failed'); } finally { setExporting(false); } };

  const parsedRows = parsePastedRows();

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* ── Header + Action Buttons ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🎓 Manage Students</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{hasFetched ? `${total} total students` : 'Apply a filter to view students'}</p>
          </div>
          <div className="flex gap-3 items-center">
            <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelectedFile(f); submitFileImport(); } }} className="hidden" />
            <ActionsDropdown onImport={openImportModal} onExport={handleExport} exporting={exporting} />
            <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">+ Add Student</button>
          </div>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}

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
                {importMode === 'paste' && (<div className="space-y-3"><div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4"><p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Paste your spreadsheet data below (tab-separated columns, one row per line):</p><p className="text-xs text-[var(--color-text-tertiary)] mb-3 font-mono">First Name &nbsp; Last Name &nbsp; Gender &nbsp; Email &nbsp; Password &nbsp; Grade/Class &nbsp; Enrollment Date &nbsp; Medical Notes &nbsp; Guardian Name &nbsp; Guardian Email &nbsp; Guardian Phone &nbsp; Relationship</p><textarea value={pasteText} onChange={(e) => { setPasteText(e.target.value); setPasteError(''); }} rows={8} placeholder={"Paste data from Excel here...\n\nExample:\nAhmed\tAli\tmale\tahmed@example.com\t\tQuran Beginners A\t2026-01-15\t\tMohamed Ali\tparent@example.com\t+252612345678\tFather\nFatima\tOmar\tfemale\tfatima@example.com\t\tFiqh Level 1\t2026-02-01\t\tAisha Omar\tparent2@example.com\t+252698765432\tMother"} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y" /></div>{pasteError && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{pasteError}</div>}{parsedRows.length > 0 && (<div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden"><div className="bg-[var(--color-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-tertiary)]">Preview — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed</div><div className="max-h-40 overflow-auto"><table className="w-full text-xs"><tbody className="divide-y divide-[var(--color-border-subtle)]">{parsedRows.slice(0, 20).map((row, ri) => (<tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--color-surface-primary)]' : 'bg-[var(--color-surface-secondary)]'}>{row.map((cell, ci) => (<td key={ci} className="px-3 py-1.5 text-[var(--color-text-secondary)] whitespace-nowrap border-r border-[var(--color-border-subtle)] last:border-r-0">{cell}</td>))}</tr>))}</tbody></table></div></div>)}</div>)}
                {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}
              </div>
              <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between"><button onClick={closeImportModal} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button><button onClick={importMode === 'upload' ? submitFileImport : submitPasteImport} disabled={importing || (importMode === 'upload' && !selectedFile) || (importMode === 'paste' && !pasteText.trim())} className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2">{importing ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importing...</> : 'Import Students'}</button></div>
              {importResult && (<div className="border-t border-[var(--color-border-subtle)] px-6 py-4 space-y-2"><p className="text-sm font-semibold text-[var(--color-text-primary)]">{importResult.created} of {importResult.totalRows} rows imported successfully{importResult.failed > 0 && ` — ${importResult.failed} failed`}</p>{importResult.errors.length > 0 && (<div className="max-h-36 overflow-y-auto rounded-lg border border-red-200 dark:border-red-900/40"><table className="w-full text-xs"><thead className="bg-red-50 dark:bg-red-950/30 text-left text-red-700 dark:text-red-300"><tr><th className="px-3 py-1.5">Row</th><th className="px-3 py-1.5">Error</th></tr></thead><tbody className="divide-y divide-red-100 dark:divide-red-900/30">{importResult.errors.map((e, idx) => (<tr key={idx}><td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{e.row}</td><td className="px-3 py-1.5 text-red-600 dark:text-red-400">{e.message}</td></tr>))}</tbody></table></div>)}</div>)}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            Tabs + Filters + Table (existing)
           ═══════════════════════════════════════════════════════════════ */}

        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map(t => (<button key={t.key} onClick={() => { setActiveTab(t.key); setHasFetched(false); }} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === t.key ? 'bg-primary-600 text-white shadow-sm' : 'bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><span>{t.icon}</span> {t.label}</button>))}
        </div>

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {isOrgAdmin ? (<div className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)]">{schools[0]?.name || 'Your Organization'}</div>) : (<select value={filterSchool} onChange={e => { setFilterSchool(e.target.value); setHasFetched(false); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">{isSuperAdmin ? 'Select an Organization...' : 'Select Organization...'}</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>)}
            <input type="text" placeholder="Search by name, email, or student ID..." value={search} onChange={e => { setSearch(e.target.value); setHasFetched(false); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" onKeyDown={e => { if (e.key === 'Enter') handleApplyFilters(); }} />
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setHasFetched(false); }} className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option><option value="suspended">Suspended</option></select>
            <button onClick={handleApplyFilters} className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors whitespace-nowrap">🔍 Apply Filters</button>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm mb-2">{error}</p><button onClick={() => handleApplyFilters()} className="text-primary-600 font-medium text-sm hover:underline">Retry</button></div>}
        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}
        {!loading && !hasFetched && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card"><p className="text-4xl mb-4">🔍</p><p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Please apply a filter to view records.</p><p className="text-sm text-[var(--color-text-tertiary)]">{isSuperAdmin ? 'Select an organization and click "Apply Filters" to load students.' : 'Click "Apply Filters" to load students for your organization.'}</p></div>}
        {!loading && hasFetched && students.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card"><p className="text-4xl mb-4">🎓</p><p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No students found</p><p className="text-sm text-[var(--color-text-tertiary)]">Try adjusting your filters or click "+ Add Student" to create one.</p></div>}

        {!loading && hasFetched && students.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]"><tr><th className="text-left px-5 py-3 font-semibold">Student</th><th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Organization</th><th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Class</th><th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Department</th><th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Shift</th><th className="text-center px-5 py-3 font-semibold">Approval</th><th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Status</th><th className="text-center px-5 py-3 font-semibold">Actions</th></tr></thead>
              <tbody>{students.map(st => (<tr key={st._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer" onClick={() => setViewingStudent(st)}><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-sm font-bold text-primary-600 flex-shrink-0">{st.profile?.firstName?.[0]}{st.profile?.lastName?.[0]}</div><div className="min-w-0"><p className="font-semibold text-[var(--color-text-primary)] truncate">{st.profile?.firstName} {st.profile?.lastName}</p><p className="text-xs text-[var(--color-text-tertiary)] truncate">{st.user?.email}</p></div></div></td><td className="px-5 py-4 hidden md:table-cell text-sm text-[var(--color-text-secondary)]">{st.school?.name || '—'}</td><td className="px-5 py-4 hidden lg:table-cell">{st.class ? <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{st.class.title} — {st.class.section}</span> : '—'}</td><td className="px-5 py-4 hidden lg:table-cell text-sm text-[var(--color-text-secondary)]">{st.department || '—'}</td><td className="px-5 py-4 hidden lg:table-cell text-sm text-[var(--color-text-secondary)]">{st.shiftMode || '—'}</td><td className="px-5 py-4 text-center"><ApprovalBadge status={st.approvalStatus} /></td><td className="px-5 py-4 text-center hidden md:table-cell" onClick={e => e.stopPropagation()}><select value={st.status} onChange={e => handleStatusChange(st._id, e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500/30"><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option><option value="suspended">Suspended</option></select></td><td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><div className="flex items-center justify-center gap-1">{st.approvalStatus === 'pending' ? (<><button onClick={() => setApprovingStudent(st)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors" title="Approve">✅</button><button onClick={() => handleReject(st._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Reject">❌</button></>) : (<><button onClick={() => setEditingStudent(st)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors" title="Edit">✏️</button><button onClick={() => handleDelete(st._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Deactivate">🗑️</button></>)}</div></td></tr>))}</tbody></table></div>
          </div>
        )}

        {totalPages > 1 && (<div className="flex items-center justify-center gap-3"><button disabled={page <= 1} onClick={() => handlePageChange(page - 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Prev</button><span className="text-sm text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button></div>)}
      </div>

      {/* Modals */}
      {showCreate && <StudentModal schools={schools} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchStudents(page); }} />}
      {editingStudent && <StudentModal student={editingStudent} schools={schools} onClose={() => setEditingStudent(undefined)} onSaved={() => { setEditingStudent(undefined); fetchStudents(page); }} />}
      {viewingStudent && <ViewModal student={viewingStudent} onClose={() => setViewingStudent(undefined)} />}
      {approvingStudent && <ApproveModal student={approvingStudent} schools={schools} onClose={() => setApprovingStudent(undefined)} onDone={() => fetchStudents(page)} />}
    </div>
  );
}

export default StudentsManage;