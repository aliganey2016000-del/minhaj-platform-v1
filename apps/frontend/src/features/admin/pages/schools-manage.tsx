/**
 * Organization Management Page
 *
 * Full CRUD interface for organization management.
 * - Register new organizations via modal form
 * - View all organizations in a table
 * - Edit and delete existing organizations
 * - Search, filter by status, and paginate
 */

import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface School {
  _id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  principalName: string;
  establishedYear: number;
  website?: string;
  status: 'active' | 'inactive';
  createdBy?: { _id: string; email: string };
  createdAt: string;
  updatedAt: string;
}

interface SchoolFormData {
  name: string;
  address: string;
  phone: string;
  email: string;
  principalName: string;
  establishedYear: string;
  website: string;
  status: 'active' | 'inactive';
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

type ToastType = 'success' | 'error' | null;

const INITIAL_FORM: SchoolFormData = {
  name: '',
  address: '',
  phone: '',
  email: '',
  principalName: '',
  establishedYear: '',
  website: '',
  status: 'active',
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function getCurrentYear(): number {
  return new Date().getFullYear();
}

// ---------------------------------------------------------------------------
// Toast Component
// ---------------------------------------------------------------------------

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg animate-slide-in ${
        type === 'success'
          ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
          : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
      }`}
    >
      <span>{type === 'success' ? '✅' : '❌'}</span>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 text-lg leading-none opacity-60 hover:opacity-100">&times;</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm Dialog Component
// ---------------------------------------------------------------------------

function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-[var(--color-surface-primary)] p-6 shadow-elevated border border-[var(--color-border-default)]">
        <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{title}</h3>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Input Field — extracted outside main component to keep stable identity
// ---------------------------------------------------------------------------

function FormInput({
  label,
  name,
  type = 'text',
  placeholder,
  required,
  maxLength,
  value,
  error,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  value: string;
  error?: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${
          error ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-border-default)]'
        }`}
      />
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SchoolsManage() {
  // Only the true super admin can register new organizations, or
  // activate/deactivate/delete existing ones — an org_admin only ever
  // sees and edits their own organization (enforced by the backend too).
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  // ── Data state ──
  const [schools, setSchools] = useState<School[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dataLoading, setDataLoading] = useState(true);

  // ── Modal state ──
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [form, setForm] = useState<SchoolFormData>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof SchoolFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  // ── Delete state ──
  const [deleteTarget, setDeleteTarget] = useState<School | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Toast state ──
  const [toast, setToast] = useState<{ message: string; type: ToastType }>({ message: '', type: null });

  // ── Fetch schools ──
  const fetchSchools = useCallback(async () => {
    setDataLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(pagination.page),
        limit: String(pagination.limit),
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;

      const { data } = await api.get('/schools', { params });

      if (data.success) {
        setSchools(data.data || []);
        if (data.pagination) {
          setPagination((prev) => ({ ...prev, ...data.pagination }));
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to fetch schools', 'error');
    } finally {
      setDataLoading(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter]);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  // ── Toast helper ──
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  // ── Validation ──
  const validate = (): boolean => {
    const errors: Partial<Record<keyof SchoolFormData, string>> = {};

    if (!form.name.trim()) errors.name = 'Organization name is required';
    else if (form.name.length > 200) errors.name = 'Name cannot exceed 200 characters';

    if (!form.address.trim()) errors.address = 'Address is required';
    else if (form.address.length > 500) errors.address = 'Address cannot exceed 500 characters';

    if (!form.phone.trim()) errors.phone = 'Phone number is required';
    else if (!/^[+]?[\d\s()-]{7,20}$/.test(form.phone.trim())) errors.phone = 'Enter a valid phone number';

    if (!form.email.trim()) errors.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Enter a valid email address';

    if (!form.principalName.trim()) errors.principalName = 'Principal name is required';
    else if (form.principalName.length > 100) errors.principalName = 'Name cannot exceed 100 characters';

    if (!form.establishedYear) errors.establishedYear = 'Established year is required';
    else {
      const year = parseInt(form.establishedYear, 10);
      if (isNaN(year) || year < 1900 || year > getCurrentYear()) {
        errors.establishedYear = `Year must be between 1900 and ${getCurrentYear()}`;
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Field change handler ──
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (formErrors[name as keyof SchoolFormData]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name as keyof SchoolFormData];
        return next;
      });
    }
  };

  // ── Open create modal ──
  const openCreate = () => {
    setEditingSchool(null);
    setForm(INITIAL_FORM);
    setFormErrors({});
    setModalOpen(true);
  };

  // ── Open edit modal ──
  const openEdit = (school: School) => {
    setEditingSchool(school);
    setForm({
      name: school.name,
      address: school.address,
      phone: school.phone,
      email: school.email,
      principalName: school.principalName,
      establishedYear: String(school.establishedYear),
      website: school.website || '',
      status: school.status,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  // ── Submit form ──
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        establishedYear: parseInt(form.establishedYear, 10),
      };

      if (editingSchool) {
        // Update
        const { data } = await api.patch(`/schools/${editingSchool._id}`, payload);
        if (data.success) {
          showToast(data.message || 'Organization updated successfully', 'success');
          setModalOpen(false);
          fetchSchools();
        } else {
          throw new Error(data.message || 'Update failed');
        }
      } else {
        // Create
        const { data } = await api.post('/schools', payload);
        if (data.success) {
          showToast(data.message || 'Organization registered successfully', 'success');
          setModalOpen(false);
          fetchSchools();
        } else {
          throw new Error(data.message || 'Registration failed');
        }
      }
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'An error occurred';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/schools/${deleteTarget._id}`);
      if (data.success) {
        showToast(data.message || 'Organization deleted', 'success');
        setDeleteTarget(null);
        fetchSchools();
      } else {
        throw new Error(data.message || 'Delete failed');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to delete organization', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Toggle status ──
  const toggleStatus = async (school: School) => {
    const newStatus = school.status === 'active' ? 'inactive' : 'active';
    try {
      const { data } = await api.patch(`/schools/${school._id}/status`, { status: newStatus });
      if (data.success) {
        showToast(data.message || `Organization ${newStatus === 'active' ? 'activated' : 'deactivated'}`, 'success');
        fetchSchools();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update status', 'error');
    }
  };

  // ── Render ──
  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] pt-20 px-4 lg:pl-72">
      <div className="mx-auto max-w-7xl">
        {/* ── Toast ── */}
        {toast.type && (
          <Toast message={toast.message} type={toast.type as 'success' | 'error'} onClose={() => setToast({ message: '', type: null })} />
        )}

        {/* ── Header ── */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🏛️ Organization Management</h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
              Register and manage organizations in the system
            </p>
          </div>
          {isSuperAdmin && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span> Register Organization
            </button>
          )}
        </div>

        {/* ── Search & Filter Bar ── */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            placeholder="Search organizations..."
            className="w-full sm:w-80 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* ── Table ── */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]">
                  <th className="px-6 py-4 font-semibold text-[var(--color-text-primary)] whitespace-nowrap">Organization Name</th>
                  <th className="px-6 py-4 font-semibold text-[var(--color-text-primary)] whitespace-nowrap hidden md:table-cell">Address</th>
                  <th className="px-6 py-4 font-semibold text-[var(--color-text-primary)] whitespace-nowrap hidden lg:table-cell">Phone</th>
                  <th className="px-6 py-4 font-semibold text-[var(--color-text-primary)] whitespace-nowrap hidden xl:table-cell">Email</th>
                  <th className="px-6 py-4 font-semibold text-[var(--color-text-primary)] whitespace-nowrap">Principal</th>
                  <th className="px-6 py-4 font-semibold text-[var(--color-text-primary)] whitespace-nowrap hidden lg:table-cell">Est.</th>
                  <th className="px-6 py-4 font-semibold text-[var(--color-text-primary)] whitespace-nowrap">Status</th>
                  <th className="px-6 py-4 font-semibold text-[var(--color-text-primary)] whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
                        <p className="text-sm text-[var(--color-text-tertiary)]">Loading organizations...</p>
                      </div>
                    </td>
                  </tr>
                ) : schools.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">🏛️</span>
                        <p className="text-lg font-medium text-[var(--color-text-primary)]">No organizations registered yet</p>
                        <p className="text-sm text-[var(--color-text-tertiary)]">
                          Click the "Register Organization" button above to add your first organization.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  schools.map((school) => (
                    <tr
                      key={school._id}
                      className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-[var(--color-text-primary)]">{school.name}</td>
                      <td className="px-6 py-4 text-[var(--color-text-secondary)] hidden md:table-cell max-w-[200px] truncate" title={school.address}>
                        {school.address}
                      </td>
                      <td className="px-6 py-4 text-[var(--color-text-secondary)] hidden lg:table-cell">{school.phone}</td>
                      <td className="px-6 py-4 text-[var(--color-text-secondary)] hidden xl:table-cell">{school.email}</td>
                      <td className="px-6 py-4 text-[var(--color-text-secondary)]">{school.principalName}</td>
                      <td className="px-6 py-4 text-[var(--color-text-secondary)] hidden lg:table-cell">{school.establishedYear}</td>
                      <td className="px-6 py-4">
                        {isSuperAdmin ? (
                          <button
                            onClick={() => toggleStatus(school)}
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                              school.status === 'active'
                                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                            }`}
                          >
                            {school.status}
                          </button>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              school.status === 'active'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}
                          >
                            {school.status}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(school)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors"
                          >
                            Edit
                          </button>
                          {isSuperAdmin && (
                            <button
                              onClick={() => setDeleteTarget(school)}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {pagination.total > pagination.limit && (
            <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] px-6 py-3">
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page * pagination.limit >= pagination.total}
                  className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-10 pb-10 bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-[var(--color-surface-primary)] shadow-elevated border border-[var(--color-border-default)]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-6 py-4">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                {editingSchool ? '✏️ Edit Organization' : '🏛️ Register New Organization'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <FormInput label="Organization Name" name="name" value={form.name} error={formErrors.name} onChange={handleChange} placeholder="e.g., Al-Huda International" required maxLength={200} />
              <FormInput label="Address" name="address" value={form.address} error={formErrors.address} onChange={handleChange} placeholder="Full organization address" required maxLength={500} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput label="Phone" name="phone" type="tel" value={form.phone} error={formErrors.phone} onChange={handleChange} placeholder="+252 61 2345678" required />
                <FormInput label="Email" name="email" type="email" value={form.email} error={formErrors.email} onChange={handleChange} placeholder="org@example.com" required />
              </div>
              <FormInput label="Principal Name" name="principalName" value={form.principalName} error={formErrors.principalName} onChange={handleChange} placeholder="Full name of the principal" required maxLength={100} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput label="Established Year" name="establishedYear" type="number" value={form.establishedYear} error={formErrors.establishedYear} onChange={handleChange} placeholder={`e.g., ${getCurrentYear() - 10}`} required />
                {isSuperAdmin && (
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                )}
              </div>
              <FormInput label="Website (optional)" name="website" type="url" value={form.website} error={formErrors.website} onChange={handleChange} placeholder="https://www.example.org.so" />

              {/* Form Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                  className="rounded-xl border border-[var(--color-border-default)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {submitting && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  {editingSchool ? 'Update Organization' : 'Register Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Dialog ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Organization"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}

export default SchoolsManage;