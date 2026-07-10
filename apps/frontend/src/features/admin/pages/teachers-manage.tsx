/**
 * Teacher Management — Admin CRUD
 * Lists, creates, edits, deletes teachers via /api/v1/teachers
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeacherProfile {
  _id: string;
  firstName: string;
  lastName: string;
  gender: string;
}

interface TeacherUser {
  _id: string;
  email: string;
  isVerified: boolean;
  isActive: boolean;
}

interface TeacherCourse {
  _id: string;
  title: { en: string };
  slug: string;
}

interface TeacherSchool {
  _id: string;
  name: string;
}

interface Teacher {
  _id: string;
  teacherId: string;
  user: TeacherUser;
  profile: TeacherProfile;
  school?: TeacherSchool;
  qualification: string;
  specialization: string[];
  experience: number;
  bio: string;
  courses: TeacherCourse[];
  status: 'active' | 'inactive' | 'on_leave';
  joiningDate: string;
  createdAt: string;
}

interface TeacherForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  gender: string;
  phone: string;
  school: string;
  qualification: string;
  specialization: string;
  experience: number;
  bio: string;
  joiningDate: string;
}

interface School {
  _id: string;
  name: string;
  status: 'active' | 'inactive';
}

const emptyForm: TeacherForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  gender: 'male',
  phone: '',
  school: '',
  qualification: '',
  specialization: '',
  experience: 0,
  bio: '',
  joiningDate: new Date().toISOString().split('T')[0],
};

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function TeacherModal({
  teacher,
  onClose,
  onSaved,
}: {
  teacher?: Teacher;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!teacher;
  const [form, setForm] = useState<TeacherForm>(
    teacher
      ? {
          email: teacher.user?.email || '',
          password: '',
          firstName: teacher.profile?.firstName || '',
          lastName: teacher.profile?.lastName || '',
          gender: teacher.profile?.gender || 'male',
          phone: '',
          school: teacher.school?._id || '',
          qualification: teacher.qualification || '',
          specialization: (teacher.specialization || []).join(', '),
          experience: teacher.experience || 0,
          bio: teacher.bio || '',
          joiningDate: teacher.joiningDate
            ? new Date(teacher.joiningDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
        }
      : emptyForm
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);

  // Load schools for dropdown
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const { data } = await api.get('/schools', { params: { limit: '100' } });
        setSchools(data.data || []);
      } catch {
        // Silently fail — dropdown will just be empty
      } finally {
        setSchoolsLoading(false);
      }
    };
    fetchSchools();
  }, []);

  const handleChange = (field: keyof TeacherForm, value: string | number) => {
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
        school: form.school || undefined,
        qualification: form.qualification,
        specialization: form.specialization
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        experience: Number(form.experience),
        bio: form.bio,
        joiningDate: form.joiningDate,
        ...(isEdit ? {} : { email: form.email, password: form.password, phone: form.phone || undefined }),
      };

      if (isEdit) {
        await api.patch(`/teachers/${teacher._id}`, payload);
      } else {
        if (!form.email || !form.password) {
          throw new Error('Email and password are required');
        }
        await api.post('/teachers', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save teacher');
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
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Teacher' : '➕ Add Teacher'}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
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

          {/* School */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Organization *</label>
            <select
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
              value={form.school}
              onChange={(e) => handleChange('school', e.target.value)}
              required
              disabled={schoolsLoading}
            >
              <option value="">{schoolsLoading ? 'Loading organizations...' : '-- Select Organization --'}</option>
              {schools
                .filter((s) => s.status === 'active')
                .map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
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
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Phone</label>
                <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} />
              </div>
            </>
          )}

          {/* Qualification */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Qualification</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="e.g. Bachelor's in Islamic Studies" value={form.qualification} onChange={(e) => handleChange('qualification', e.target.value)} />
          </div>

          {/* Specialization */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Specialization (comma separated)</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="e.g. Tajweed, Fiqh, Hadith" value={form.specialization} onChange={(e) => handleChange('specialization', e.target.value)} />
          </div>

          {/* Row: Experience + Joining Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Experience (years)</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={0} value={form.experience} onChange={(e) => handleChange('experience', Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Joining Date</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="date" value={form.joiningDate} onChange={(e) => handleChange('joiningDate', e.target.value)} />
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Bio</label>
            <textarea className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" rows={2} value={form.bio} onChange={(e) => handleChange('bio', e.target.value)} />
          </div>

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

function ViewModal({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">👨‍🏫 Teacher Details</h2>
          <button onClick={onClose} className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button>
        </div>

        <div className="space-y-3">
          <div className="text-center pb-3 border-b">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-2xl font-bold text-primary-600 mb-2">
              {teacher.profile?.firstName?.[0]}{teacher.profile?.lastName?.[0]}
            </div>
            <p className="text-lg font-bold">{teacher.profile?.firstName} {teacher.profile?.lastName}</p>
            <p className="text-sm text-[var(--color-text-tertiary)]">{teacher.teacherId}</p>
          </div>

          <DetailRow label="Email" value={teacher.user?.email} />
          <DetailRow label="Organization" value={teacher.school?.name || '—'} />
          <DetailRow label="Qualification" value={teacher.qualification || '—'} />
          <DetailRow label="Specialization" value={teacher.specialization?.length ? teacher.specialization.join(', ') : '—'} />
          <DetailRow label="Experience" value={teacher.experience ? `${teacher.experience} years` : '—'} />
          <DetailRow label="Status" value={<StatusBadge status={teacher.status} />} />
          <DetailRow label="Courses" value={teacher.courses?.length ? `${teacher.courses.length} course(s)` : 'None assigned'} />
          <DetailRow label="Joined" value={teacher.joiningDate ? new Date(teacher.joiningDate).toLocaleDateString() : '—'} />
          <DetailRow label="Bio" value={teacher.bio || '—'} />
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    inactive: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    on_leave: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TeachersManage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | undefined>(undefined);
  const [viewingTeacher, setViewingTeacher] = useState<Teacher | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchTeachers = useCallback(async () => {
    try {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const { data } = await api.get('/teachers', { params });
      setTeachers(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load teachers');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete teacher "${name}"? This will also remove their user account.`)) return;
    try {
      await api.delete(`/teachers/${id}`);
      setTeachers((prev) => prev.filter((t) => t._id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await api.patch(`/teachers/${id}/status`, { status: nextStatus });
      setTeachers((prev) =>
        prev.map((t) => (t._id === id ? { ...t, status: nextStatus as Teacher['status'] } : t))
      );
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={fetchTeachers} className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700">Retry</button>
        </div>
      </div>
    );
  }

  const activeCount = teachers.filter((t) => t.status === 'active').length;
  const inactiveCount = teachers.filter((t) => t.status === 'inactive').length;
  const onLeaveCount = teachers.filter((t) => t.status === 'on_leave').length;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">👨‍🏫 Manage Teachers</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {teachers.length} total — {activeCount} active, {inactiveCount} inactive, {onLeaveCount} on leave
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
          >
            + Add Teacher
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            placeholder="Search by name, email, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_leave">On Leave</option>
          </select>
        </div>

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{activeCount}</p>
            <p className="text-xs text-green-600 dark:text-green-400">Active</p>
          </div>
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{onLeaveCount}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">On Leave</p>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{inactiveCount}</p>
            <p className="text-xs text-red-600 dark:text-red-400">Inactive</p>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Teacher</th>
                  <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">ID</th>
                  <th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Specialization</th>
                  <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Courses</th>
                  <th className="text-center px-5 py-3 font-semibold">Status</th>
                  <th className="text-center px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teachers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-[var(--color-text-tertiary)]">
                      <p className="text-lg mb-1">👨‍🏫 No teachers found</p>
                      <p className="text-sm">Click "+ Add Teacher" to create one.</p>
                    </td>
                  </tr>
                ) : (
                  teachers.map((teacher) => (
                    <tr
                      key={teacher._id}
                      className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer"
                      onClick={() => setViewingTeacher(teacher)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-sm font-bold text-primary-600 flex-shrink-0">
                            {teacher.profile?.firstName?.[0]}{teacher.profile?.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{teacher.profile?.firstName} {teacher.profile?.lastName}</p>
                            <p className="text-xs text-[var(--color-text-tertiary)] truncate">{teacher.user?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{teacher.teacherId}</code>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(teacher.specialization || []).slice(0, 3).map((s) => (
                            <span key={s} className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
                              {s}
                            </span>
                          ))}
                          {(teacher.specialization || []).length > 3 && (
                            <span className="text-xs text-[var(--color-text-tertiary)]">+{teacher.specialization.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center hidden sm:table-cell">
                        <span className="font-medium">{teacher.courses?.length || 0}</span>
                      </td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleStatusToggle(teacher._id, teacher.status)}
                          className="cursor-pointer"
                          title="Click to toggle active/inactive"
                        >
                          <StatusBadge status={teacher.status} />
                        </button>
                      </td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditingTeacher(teacher)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(teacher._id, `${teacher.profile?.firstName} ${teacher.profile?.lastName}`)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Delete"
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
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <TeacherModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            fetchTeachers();
          }}
        />
      )}

      {editingTeacher && (
        <TeacherModal
          teacher={editingTeacher}
          onClose={() => setEditingTeacher(undefined)}
          onSaved={() => {
            setEditingTeacher(undefined);
            fetchTeachers();
          }}
        />
      )}

      {viewingTeacher && (
        <ViewModal
          teacher={viewingTeacher}
          onClose={() => setViewingTeacher(undefined)}
        />
      )}
    </div>
  );
}

export default TeachersManage;