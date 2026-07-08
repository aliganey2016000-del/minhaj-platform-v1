/**
 * Parent Management — Admin Full CRUD
 * Lists, creates, edits, views, links children, deletes parents via /api/v1/parents
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParentProfile {
  _id: string;
  firstName: string;
  lastName: string;
  gender: string;
}

interface ParentUser {
  _id: string;
  email: string;
  isVerified: boolean;
  isActive: boolean;
}

interface ChildBrief {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  status?: string;
}

interface Parent {
  _id: string;
  parentId: string;
  user: ParentUser;
  profile: ParentProfile;
  children: ChildBrief[];
  occupation: string;
  relationship: string;
  address: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface ParentForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  gender: string;
  occupation: string;
  relationship: string;
  address: string;
}

const emptyForm: ParentForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  gender: 'male',
  occupation: '',
  relationship: 'father',
  address: '',
};

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
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

function ParentModal({
  parent,
  onClose,
  onSaved,
}: {
  parent?: Parent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!parent;
  const [form, setForm] = useState<ParentForm>(
    parent
      ? {
          email: parent.user?.email || '',
          password: '',
          firstName: parent.profile?.firstName || '',
          lastName: parent.profile?.lastName || '',
          gender: parent.profile?.gender || 'male',
          occupation: parent.occupation || '',
          relationship: parent.relationship || 'father',
          address: parent.address || '',
        }
      : emptyForm
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: keyof ParentForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload: any = {
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        occupation: form.occupation,
        relationship: form.relationship,
        address: form.address,
      };
      if (!isEdit) {
        payload.email = form.email;
        payload.password = form.password;
      }

      if (isEdit) {
        await api.patch(`/parents/${parent._id}`, payload);
      } else {
        if (!form.email || !form.password) {
          throw new Error('Email and password are required');
        }
        await api.post('/parents', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save parent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Parent' : '➕ Add Parent'}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
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
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Gender *</label>
            <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.gender} onChange={(e) => handleChange('gender', e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
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
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Relationship</label>
            <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.relationship} onChange={(e) => handleChange('relationship', e.target.value)}>
              <option value="father">Father</option>
              <option value="mother">Mother</option>
              <option value="guardian">Guardian</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Occupation</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.occupation} onChange={(e) => handleChange('occupation', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Address</label>
            <textarea className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" rows={2} value={form.address} onChange={(e) => handleChange('address', e.target.value)} />
          </div>
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
// View Details + Children Modal
// ---------------------------------------------------------------------------

function ViewModal({ parent, onClose }: { parent: Parent; onClose: () => void }) {
  const [children, setChildren] = useState<ChildBrief[]>(parent.children || []);
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');

  const fetchChildren = async () => {
    try {
      const { data } = await api.get(`/parents/${parent._id}/children`);
      setChildren(data.data || []);
    } catch {}
  };

  const handleLink = async () => {
    if (!linkStudentId.trim()) return;
    setLinkLoading(true);
    setLinkError('');
    try {
      await api.post(`/parents/${parent._id}/link-child`, { childId: linkStudentId.trim() });
      setLinkStudentId('');
      await fetchChildren();
    } catch (err: any) {
      setLinkError(err.response?.data?.message || 'Failed to link child');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleUnlink = async (childId: string) => {
    if (!window.confirm('Unlink this child from parent?')) return;
    try {
      await api.post(`/parents/${parent._id}/unlink-child`, { childId });
      await fetchChildren();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to unlink');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">👨‍👩‍👧‍👦 Parent Details</h2>
          <button onClick={onClose} className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button>
        </div>

        <div className="space-y-3">
          <div className="text-center pb-3 border-b">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-2xl font-bold text-primary-600 mb-2">
              {parent.profile?.firstName?.[0]}{parent.profile?.lastName?.[0]}
            </div>
            <p className="text-lg font-bold">{parent.profile?.firstName} {parent.profile?.lastName}</p>
            <p className="text-sm text-[var(--color-text-tertiary)]">{parent.parentId}</p>
          </div>

          <DetailRow label="Email" value={parent.user?.email} />
          <DetailRow label="Status" value={<StatusBadge status={parent.status} />} />
          <DetailRow label="Relationship" value={parent.relationship} />
          <DetailRow label="Occupation" value={parent.occupation || '—'} />
          <DetailRow label="Address" value={parent.address || '—'} />
          <DetailRow label="Children" value={`${children.length} linked`} />
        </div>

        {/* Children Section */}
        <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
          <h3 className="text-sm font-bold mb-3">👶 Linked Children</h3>

          {/* Link a child */}
          <div className="flex gap-2 mb-3">
            <input
              className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs"
              placeholder="Student ID (e.g. STU-2026-0001)"
              value={linkStudentId}
              onChange={(e) => setLinkStudentId(e.target.value)}
            />
            <button
              onClick={handleLink}
              disabled={linkLoading || !linkStudentId.trim()}
              className="rounded-xl bg-primary-600 text-white px-4 py-2 text-xs font-semibold hover:bg-primary-700 disabled:opacity-50"
            >
              {linkLoading ? '...' : 'Link'}
            </button>
          </div>
          {linkError && <p className="text-red-500 text-xs mb-2">{linkError}</p>}

          {children.length === 0 ? (
            <p className="text-xs text-[var(--color-text-tertiary)] text-center py-3">No children linked yet.</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {children.map((child: any) => (
                <div key={child._id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--color-surface-secondary)] text-sm">
                  <div>
                    <span className="font-medium">{child.studentId}</span>
                    {child.profile && (
                      <span className="text-[var(--color-text-tertiary)] ml-2">
                        {child.profile.firstName} {child.profile.lastName}
                      </span>
                    )}
                    {child.status && (
                      <span className="ml-2">
                        <StatusBadge status={child.status} />
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleUnlink(child._id)}
                    className="text-red-500 text-xs hover:underline"
                  >
                    Unlink
                  </button>
                </div>
              ))}
            </div>
          )}
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

export function ParentsManage() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingParent, setEditingParent] = useState<Parent | undefined>(undefined);
  const [viewingParent, setViewingParent] = useState<Parent | undefined>(undefined);

  const limit = 15;

  const fetchParents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page: String(page), limit: String(limit) };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const { data } = await api.get('/parents', { params });
      setParents(data.data || []);
      setTotal(data.meta?.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load parents');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchParents(); }, [fetchParents]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/parents/${id}/status`, { status: newStatus });
      setParents((prev) => prev.map((p) => (p._id === id ? { ...p, status: newStatus as Parent['status'] } : p)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this parent? Their children will be unlinked.')) return;
    try {
      await api.delete(`/parents/${id}`);
      if (parents.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        fetchParents();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const totalPages = Math.ceil(total / limit);
  const activeCount = parents.filter((p) => p.status === 'active').length;
  const inactiveCount = parents.filter((p) => p.status === 'inactive').length;
  const totalChildren = parents.reduce((sum, p) => sum + (p.children?.length || 0), 0);

  if (loading && parents.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">👨‍👩‍👧‍👦 Manage Parents</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {total} total — {activeCount} active, {inactiveCount} inactive, {totalChildren} children linked
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">
            + Add Parent
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{activeCount}</p>
            <p className="text-xs text-green-600 dark:text-green-400">Active</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 p-4 text-center">
            <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{inactiveCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Inactive</p>
          </div>
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalChildren}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Children</p>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name, email, or parent ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
          />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center">
            <p className="text-red-600 text-sm mb-2">{error}</p>
            <button onClick={fetchParents} className="text-primary-600 font-medium text-sm hover:underline">Retry</button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Parent</th>
                  <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">ID</th>
                  <th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Relationship</th>
                  <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Children</th>
                  <th className="text-center px-5 py-3 font-semibold">Status</th>
                  <th className="text-center px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {parents.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-16 text-[var(--color-text-tertiary)]">
                    <p className="text-lg mb-1">👨‍👩‍👧‍👦 No parents found</p>
                    <p className="text-sm">Click "+ Add Parent" to create one.</p>
                  </td></tr>
                ) : (
                  parents.map((p) => (
                    <tr key={p._id} className="border-b hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer" onClick={() => setViewingParent(p)}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-sm font-bold text-primary-600 flex-shrink-0">
                            {p.profile?.firstName?.[0]}{p.profile?.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{p.profile?.firstName} {p.profile?.lastName}</p>
                            <p className="text-xs text-[var(--color-text-tertiary)] truncate">{p.user?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell"><code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{p.parentId}</code></td>
                      <td className="px-5 py-4 hidden lg:table-cell capitalize">{p.relationship}</td>
                      <td className="px-5 py-4 text-center hidden sm:table-cell"><span className="font-medium">{p.children?.length || 0}</span></td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <select value={p.status} onChange={(e) => handleStatusChange(p._id, e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer">
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setEditingParent(p)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30" title="Edit">✏️</button>
                          <button onClick={() => handleDelete(p._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete">🗑️</button>
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
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed">← Prev</button>
            <span className="text-sm text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed">Next →</button>
          </div>
        )}
      </div>

      {showCreate && <ParentModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchParents(); }} />}
      {editingParent && <ParentModal parent={editingParent} onClose={() => setEditingParent(undefined)} onSaved={() => { setEditingParent(undefined); fetchParents(); }} />}
      {viewingParent && <ViewModal parent={viewingParent} onClose={() => setViewingParent(undefined)} />}
    </div>
  );
}

export default ParentsManage;