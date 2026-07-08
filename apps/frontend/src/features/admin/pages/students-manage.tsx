/**
 * Student Management — Admin Full CRUD
 * Lists, creates, edits, views, deletes students via /api/v1/students
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudentProfile {
  _id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  gender: string;
}

interface StudentUser {
  _id: string;
  email: string;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  preferredLanguage: string;
}

interface EnrolledCourse {
  _id: string;
  title: { en: string };
  slug: string;
}

interface Student {
  _id: string;
  studentId: string;
  user?: StudentUser;
  profile?: StudentProfile;
  enrolledCourses?: EnrolledCourse[];
  status: 'active' | 'inactive' | 'graduated' | 'suspended';
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
  grade: string;
  medicalNotes: string;
  enrollmentDate: string;
  attendancePercentage: number;
  gpa: number;
  totalFeesPaid: number;
  totalFeesDue: number;
}

const emptyForm: StudentForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  gender: 'male',
  grade: '',
  medicalNotes: '',
  enrollmentDate: new Date().toISOString().split('T')[0],
  attendancePercentage: 0,
  gpa: 0,
  totalFeesPaid: 0,
  totalFeesDue: 0,
};

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
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || colors.inactive}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function StudentModal({
  student,
  onClose,
  onSaved,
}: {
  student?: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!student;
  const [form, setForm] = useState<StudentForm>(
    student
      ? {
          email: student.user?.email || '',
          password: '',
          firstName: student.profile?.firstName || '',
          lastName: student.profile?.lastName || '',
          gender: student.profile?.gender || 'male',
          grade: student.grade || '',
          medicalNotes: student.medicalNotes || '',
          enrollmentDate: student.enrollmentDate
            ? new Date(student.enrollmentDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          attendancePercentage: student.attendancePercentage ?? 0,
          gpa: student.gpa ?? 0,
          totalFeesPaid: student.totalFeesPaid ?? 0,
          totalFeesDue: student.totalFeesDue ?? 0,
        }
      : emptyForm
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: keyof StudentForm, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        grade: form.grade || undefined,
        medicalNotes: form.medicalNotes || undefined,
        enrollmentDate: form.enrollmentDate,
        attendancePercentage: Number(form.attendancePercentage),
        gpa: Number(form.gpa),
        totalFeesPaid: Number(form.totalFeesPaid),
        totalFeesDue: Number(form.totalFeesDue),
        ...(isEdit ? {} : { email: form.email, password: form.password }),
      };

      if (isEdit) {
        await api.patch(`/students/${student._id}`, payload);
      } else {
        if (!form.email || !form.password) {
          throw new Error('Email and password are required');
        }
        await api.post('/students', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Student' : '➕ Add Student'}</h2>
        {error && (
          <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Row: First + Last */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">First Name *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.firstName} onChange={(e) => handleChange('firstName', e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Last Name *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.lastName} onChange={(e) => handleChange('lastName', e.target.value)} required />
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Gender *</label>
            <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.gender} onChange={(e) => handleChange('gender', e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          {/* Email + Password (create only) */}
          {!isEdit && (
            <>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Email *</label>
                <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Password *</label>
                <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="password" value={form.password} onChange={(e) => handleChange('password', e.target.value)} required minLength={8} />
              </div>
            </>
          )}

          {/* Row: Grade + Enrollment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Grade</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="e.g. Level 3" value={form.grade} onChange={(e) => handleChange('grade', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Enrollment Date</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="date" value={form.enrollmentDate} onChange={(e) => handleChange('enrollmentDate', e.target.value)} />
            </div>
          </div>

          {/* Medical Notes */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Medical Notes</label>
            <textarea className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" rows={2} value={form.medicalNotes} onChange={(e) => handleChange('medicalNotes', e.target.value)} />
          </div>

          {/* Academic Summary (edit mode only) */}
          {isEdit && (
            <>
              <div className="border-t border-[var(--color-border-subtle)] pt-3">
                <p className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Academic Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Attendance %</label>
                    <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={0} max={100} value={form.attendancePercentage} onChange={(e) => handleChange('attendancePercentage', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">GPA</label>
                    <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={0} max={4} step={0.1} value={form.gpa} onChange={(e) => handleChange('gpa', Number(e.target.value))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Fees Paid ($)</label>
                    <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={0} value={form.totalFeesPaid} onChange={(e) => handleChange('totalFeesPaid', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Fees Due ($)</label>
                    <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={0} value={form.totalFeesDue} onChange={(e) => handleChange('totalFeesDue', Number(e.target.value))} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
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
      <div
        className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">🎓 Student Details</h2>
          <button onClick={onClose} className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button>
        </div>

        <div className="space-y-3">
          <div className="text-center pb-3 border-b border-[var(--color-border-subtle)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-2xl font-bold text-primary-600 mb-2">
              {student.profile?.firstName?.[0]}{student.profile?.lastName?.[0]}
            </div>
            <p className="text-lg font-bold">{student.profile?.firstName} {student.profile?.lastName}</p>
            <p className="text-sm text-[var(--color-text-tertiary)]">{student.studentId}</p>
          </div>

          <DetailRow label="Email" value={student.user?.email} />
          <DetailRow label="Status" value={<StatusBadge status={student.status} />} />
          <DetailRow label="Gender" value={student.profile?.gender || '—'} />
          <DetailRow label="Grade" value={student.grade || '—'} />
          <DetailRow label="Enrolled" value={new Date(student.enrollmentDate).toLocaleDateString()} />
          <DetailRow label="Courses" value={student.enrolledCourses?.length ? `${student.enrolledCourses.length} course(s)` : 'None'} />
          <DetailRow label="Attendance" value={student.attendancePercentage != null ? `${student.attendancePercentage}%` : '—'} />
          <DetailRow label="GPA" value={student.gpa != null ? student.gpa.toFixed(1) : '—'} />
          <DetailRow label="Fees Paid" value={student.totalFeesPaid != null ? `$${student.totalFeesPaid.toLocaleString()}` : '—'} />
          <DetailRow label="Fees Due" value={student.totalFeesDue != null ? `$${student.totalFeesDue.toLocaleString()}` : '—'} />
          <DetailRow label="Medical Notes" value={student.medicalNotes || '—'} />
          <DetailRow label="Verified" value={student.user?.isVerified ? '✅ Yes' : '❌ No'} />
          <DetailRow label="Active" value={student.user?.isActive ? '✅ Yes' : '❌ No'} />
        </div>

        <button onClick={onClose} className="mt-5 w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Close</button>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)] last:border-0">
      <span className="text-sm text-[var(--color-text-tertiary)]">{label}</span>
      <span className="text-sm font-medium text-[var(--color-text-primary)] text-right max-w-[60%]">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StudentsManage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | undefined>(undefined);
  const [viewingStudent, setViewingStudent] = useState<Student | undefined>(undefined);

  const limit = 15;

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page: String(page), limit: String(limit) };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const { data } = await api.get('/students', { params });
      setStudents(data.data || []);
      setTotal(data.meta?.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/students/${id}/status`, { status: newStatus });
      setStudents((prev) => prev.map((s) => (s._id === id ? { ...s, status: newStatus as Student['status'] } : s)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deactivate this student? This will disable their account.')) return;
    try {
      await api.delete(`/students/${id}`);
      // If this was the last item on the page, go back one page
      if (students.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        fetchStudents();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to deactivate');
    }
  };

  const totalPages = Math.ceil(total / limit);

  // Counts for stats cards
  const activeCount = students.filter((s) => s.status === 'active').length;
  const graduatedCount = students.filter((s) => s.status === 'graduated').length;
  const suspendedCount = students.filter((s) => s.status === 'suspended').length;
  const inactiveCount = students.filter((s) => s.status === 'inactive').length;

  if (loading && students.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🎓 Manage Students</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {total} total — {activeCount} active, {graduatedCount} graduated, {suspendedCount} suspended, {inactiveCount} inactive
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
          >
            + Add Student
          </button>
        </div>

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{activeCount}</p>
            <p className="text-xs text-green-600 dark:text-green-400">Active</p>
          </div>
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{graduatedCount}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Graduated</p>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{suspendedCount}</p>
            <p className="text-xs text-red-600 dark:text-red-400">Suspended</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 p-4 text-center">
            <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{inactiveCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Inactive</p>
          </div>
        </div>

        {/* ── Search & Filter ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name, email, or student ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="graduated">Graduated</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center">
            <p className="text-red-600 text-sm mb-2">{error}</p>
            <button onClick={fetchStudents} className="text-primary-600 font-medium text-sm hover:underline">Retry</button>
          </div>
        )}

        {/* ── Table ── */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Student</th>
                  <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">ID</th>
                  <th className="text-center px-5 py-3 font-semibold hidden lg:table-cell">Courses</th>
                  <th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Att%</th>
                  <th className="text-center px-5 py-3 font-semibold hidden md:table-cell">GPA</th>
                  <th className="text-center px-5 py-3 font-semibold">Status</th>
                  <th className="text-center px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-[var(--color-text-tertiary)]">
                      <p className="text-lg mb-1">🎓 No students found</p>
                      <p className="text-sm">Click "+ Add Student" to create one.</p>
                    </td>
                  </tr>
                ) : (
                  students.map((student) => (
                    <tr
                      key={student._id}
                      className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer"
                      onClick={() => setViewingStudent(student)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-sm font-bold text-primary-600 flex-shrink-0">
                            {student.profile?.firstName?.[0]}{student.profile?.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--color-text-primary)] truncate">{student.profile?.firstName} {student.profile?.lastName}</p>
                            <p className="text-xs text-[var(--color-text-tertiary)] truncate">{student.user?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{student.studentId}</code>
                      </td>
                      <td className="px-5 py-4 text-center hidden lg:table-cell">{student.enrolledCourses?.length || 0}</td>
                      <td className="px-5 py-4 text-center hidden md:table-cell">
                        {student.attendancePercentage != null ? (
                          <span className={student.attendancePercentage >= 75 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                            {student.attendancePercentage}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-4 text-center hidden md:table-cell">
                        {student.gpa != null ? (
                          <span className="font-medium">{student.gpa.toFixed(1)}</span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={student.status}
                          onChange={(e) => handleStatusChange(student._id, e.target.value)}
                          className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="graduated">Graduated</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setEditingStudent(student);
                            }}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(student._id)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Deactivate"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm text-[var(--color-text-tertiary)]">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <StudentModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            fetchStudents();
          }}
        />
      )}

      {editingStudent && (
        <StudentModal
          student={editingStudent}
          onClose={() => setEditingStudent(undefined)}
          onSaved={() => {
            setEditingStudent(undefined);
            fetchStudents();
          }}
        />
      )}

      {viewingStudent && (
        <ViewModal
          student={viewingStudent}
          onClose={() => setViewingStudent(undefined)}
        />
      )}
    </div>
  );
}

export default StudentsManage;