/**
 * User Management — Admin CRUD
 * Manage users across all organizations (super admin) or within own org (org_admin).
 *
 * Roles:
 *   - Super admin: views/searches all users, can filter by organization, can
 *     create/edit/delete users with any role in any organization.
 *   - Org admin: auto-scoped to own organization, can only create/delete
 *     teacher/student/parent roles, cannot change roles or organization.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserProfile {
  _id?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
}

interface UserOrg {
  _id: string;
  name: string;
}

interface UserRecord {
  _id: string;
  email: string;
  role: 'admin' | 'org_admin' | 'teacher' | 'student' | 'parent';
  organizationId?: UserOrg | null;
  isActive: boolean;
  isVerified: boolean;
  profile?: UserProfile | null;
  createdAt: string;
}

interface School {
  _id: string;
  name: string;
  status: 'active' | 'inactive';
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const roleLabels: Record<string, { label: string; color: string }> = {
  admin:      { label: 'Super Admin',   color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  org_admin:  { label: 'Org Admin',     color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  teacher:    { label: 'Teacher',       color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  student:    { label: 'Student',       color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  parent:     { label: 'Parent',        color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
};

// ---------------------------------------------------------------------------
// User Modal (Create / Edit)
// ---------------------------------------------------------------------------

function UserModal({
  user,
  schools,
  onClose,
  onSaved,
}: {
  user?: UserRecord;
  schools: School[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user: currentUser } = useAuth();
  const isEdit = !!user;
  const isSuperAdmin = currentUser?.role === 'admin';
  const isOrgAdmin = currentUser?.role === 'org_admin';

  const [form, setForm] = useState({
    firstName: user?.profile?.firstName || '',
    lastName: user?.profile?.lastName || '',
    email: user?.email || '',
    password: '',
    gender: user?.profile?.gender || 'male',
    role: user?.role || 'student',
    organizationId: isOrgAdmin
      ? (currentUser?.organizationId || '')
      : (user?.organizationId?._id || user?.organizationId as any || ''),
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const orgName = schools.find(s => s._id === form.organizationId)?.name || user?.organizationId?.name || '';

  const update = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload: any = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        role: form.role,
        gender: form.gender,
      };

      if (!isEdit) {
        payload.password = form.password;
      }

      // Organization: org_admin always uses own org, super admin can choose
      if (isOrgAdmin) {
        payload.organizationId = currentUser?.organizationId;
      } else if (form.organizationId) {
        payload.organizationId = form.organizationId;
      }

      // For edit, build payload from form fields that are relevant
      if (isEdit) {
        // Include all fields — backend will only update allowed ones
        if (!isOrgAdmin) {
          payload.role = form.role;
          payload.organizationId = form.organizationId || undefined;
        }
      }

      if (isEdit) {
        await api.patch(`/users/${user!._id}`, payload);
      } else {
        await api.post('/users', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit User' : '➕ Create User'}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* First & Last Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">First Name *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Last Name *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Email *</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
          </div>

          {/* Password (create only) */}
          {!isEdit && (
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Password *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={8} />
            </div>
          )}

          {/* Gender */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Gender *</label>
            <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.gender} onChange={(e) => update('gender', e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          {/* Role */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Role *</label>
            {isOrgAdmin && isEdit ? (
              <div className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                {roleLabels[form.role]?.label || form.role}
              </div>
            ) : (
              <select
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
                value={form.role}
                onChange={(e) => update('role', e.target.value)}
                disabled={isOrgAdmin && isEdit}
              >
                {isSuperAdmin && <option value="admin">Super Admin</option>}
                {isSuperAdmin && <option value="org_admin">Org Admin</option>}
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
                <option value="parent">Parent</option>
              </select>
            )}
          </div>

          {/* Organization */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Organization</label>
            {isOrgAdmin ? (
              <div className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                {orgName || 'Your Organization'}
              </div>
            ) : (
              <select
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
                value={form.organizationId}
                onChange={(e) => update('organizationId', e.target.value)}
              >
                <option value="">-- Select Organization --</option>
                {schools.map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            )}
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
// Main Component
// ---------------------------------------------------------------------------

export function UsersManage() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'admin';
  const isOrgAdmin = currentUser?.role === 'org_admin';

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [myOrgName, setMyOrgName] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | undefined>(undefined);

  // Load schools list for super admin filter dropdown.
  // For org_admin, also fetch the user's own school so we can display the
  // organization name in the filter bar and header.
  useEffect(() => {
    if (isSuperAdmin) {
      (async () => {
        try {
          const { data } = await api.get('/schools', { params: { limit: '100' } });
          setSchools((data.data || []).filter((s: School) => s.status === 'active'));
        } catch { /* non-fatal */ }
      })();
      return;
    }

    if (isOrgAdmin && currentUser?.organizationId) {
      (async () => {
        try {
          const { data } = await api.get(`/schools/${currentUser.organizationId}`);
          const school = data.data;
          if (school && school.status === 'active') {
            setSchools([school]);
            setMyOrgName(school.name);
          }
        } catch { /* non-fatal */ }
      })();
    }
  }, [isSuperAdmin, isOrgAdmin, currentUser?.organizationId]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { limit: '100' };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;
      // org_admin: backend already scopes by the JWT's organizationId —
      // no need to pass an additional school param.
      // super admin can optionally filter by school.
      if (!isOrgAdmin && filterSchool && filterSchool !== 'all') {
        params.school = filterSchool;
      } else if (isSuperAdmin && !filterSchool) {
        // Super admin with no selection = fetch all users
        params.school = 'all';
      }

      const { data } = await api.get('/users', { params });
      setUsers(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, filterSchool, isSuperAdmin, isOrgAdmin]);

  // Initial fetch on mount
  useEffect(() => {
    fetchUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deactivate this user? They will no longer be able to log in.')) return;
    try {
      await api.delete(`/users/${id}`);
      setUsers(prev => prev.map(u => u._id === id ? { ...u, isActive: false } : u));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to deactivate user');
    }
  };

  const handleEdit = (user: UserRecord) => {
    setEditingUser(user);
  };

  const fullName = (u: UserRecord) =>
    u.profile?.firstName && u.profile?.lastName
      ? `${u.profile.firstName} ${u.profile.lastName}`
      : (u.profile?.firstName || u.profile?.lastName || '—');

  const orgName = (u: UserRecord) =>
    u.organizationId && typeof u.organizationId === 'object'
      ? (u.organizationId as UserOrg).name
      : '—';

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">👥 User Management</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {users.length} users
              {isOrgAdmin && ' — your organization'}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
          >
            + Create User
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Organization filter */}
          {isOrgAdmin ? (
            <div className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)]">
              {myOrgName || 'Your Organization'}
            </div>
          ) : (
            <select
              className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
            >
              <option value="">Select an Organization...</option>
              {schools.map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          )}

          <input
            className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            {isSuperAdmin && <option value="admin">Super Admin</option>}
            {isSuperAdmin && <option value="org_admin">Org Admin</option>}
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
            <option value="parent">Parent</option>
          </select>

          <select
            className="flex-1 sm:flex-none sm:w-36 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button
            onClick={fetchUsers}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            Apply Filters
          </button>
        </div>

        {/* Content area */}
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          </div>
        ) : error && users.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
            <div className="text-center py-16 text-[var(--color-text-tertiary)]">
              <p className="text-4xl mb-3">👥</p>
              <p className="text-lg font-medium mb-1">{error}</p>
              <p className="text-sm">
                {isSuperAdmin
                  ? 'Select an organization and click "Apply Filters" to load users.'
                  : 'Click "Apply Filters" to load users for your organization.'}
              </p>
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
            <div className="text-center py-16 text-[var(--color-text-tertiary)]">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-lg font-medium mb-1">No users found</p>
              <p className="text-sm">Click "+ Create User" to add one.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]">
                    <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Name</th>
                    <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Email</th>
                    <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Role</th>
                    <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)] hidden md:table-cell">Organization</th>
                    <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Status</th>
                    <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {users.map(u => (
                    <tr key={u._id} className="hover:bg-[var(--color-surface-tertiary)]/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-[var(--color-text-primary)] whitespace-nowrap">
                        {fullName(u)}
                      </td>
                      <td className="px-5 py-3 text-[var(--color-text-secondary)]">
                        {u.email}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${roleLabels[u.role]?.color || 'bg-gray-100 text-gray-600'}`}>
                          {roleLabels[u.role]?.label || u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[var(--color-text-secondary)] hidden md:table-cell">
                        {orgName(u)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(u)}
                            className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                          >
                            Edit
                          </button>
                          {u.isActive && u._id !== currentUser?.id && (
                            <button
                              onClick={() => handleDelete(u._id)}
                              className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <UserModal
          schools={schools}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            fetchUsers();
          }}
        />
      )}

      {/* Edit Modal */}
      {editingUser && (
        <UserModal
          user={editingUser}
          schools={schools}
          onClose={() => setEditingUser(undefined)}
          onSaved={() => {
            setEditingUser(undefined);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

export default UsersManage;