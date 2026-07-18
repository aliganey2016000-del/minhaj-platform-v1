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

type OrganizationType = 'school' | 'university' | 'training_center' | 'private';
type EstimatedStudents = '<50' | '50-200' | '200-1000' | '1000+';
type SubscriptionPlan = 'free_trial' | 'basic' | 'premium';

interface School {
  _id: string;
  name: string;
  organizationType: OrganizationType;
  subdomain: string;
  country: string;
  city: string;
  orgId?: string;
  address: string;
  phone: string;
  email: string;
  principalName: string;
  establishedYear: number;
  website?: string;
  estimatedStudents?: EstimatedStudents;
  subscriptionPlan: SubscriptionPlan;
  registrationNo?: string;
  status: 'active' | 'inactive';
  createdBy?: { _id: string; email: string };
  createdAt: string;
  updatedAt: string;
}

interface SchoolFormData {
  name: string;
  organizationType: OrganizationType;
  subdomain: string;
  country: string;
  city: string;
  orgId: string;
  address: string;
  phone: string;
  email: string;
  adminPassword: string;
  principalName: string;
  establishedYear: string;
  website: string;
  estimatedStudents: EstimatedStudents | '';
  subscriptionPlan: SubscriptionPlan;
  registrationNo: string;
  status: 'active' | 'inactive';
}

// Step field groups for the 3-step "Register Organization" wizard.
const STEP_FIELDS: Record<number, (keyof SchoolFormData)[]> = {
  1: ['name', 'organizationType', 'subdomain', 'country', 'city', 'address', 'orgId', 'establishedYear', 'website'],
  2: ['principalName', 'email', 'adminPassword', 'phone'],
  3: ['estimatedStudents', 'subscriptionPlan', 'registrationNo'],
};

const STEP_LABELS = ['Organization Details', 'Org Admin', 'Size & Plan'];

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

type ToastType = 'success' | 'error' | null;

const INITIAL_FORM: SchoolFormData = {
  name: '',
  organizationType: 'school',
  subdomain: '',
  country: '',
  city: '',
  orgId: '',
  address: '',
  phone: '',
  email: '',
  adminPassword: '',
  principalName: '',
  establishedYear: '',
  website: '',
  estimatedStudents: '',
  subscriptionPlan: 'free_trial',
  registrationNo: '',
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
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${
            isPassword ? 'pr-11' : ''
          } ${error ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-border-default)]'}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? '🙈' : '👁️'}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select Field — mirrors FormInput's styling/error handling for <select>
// ---------------------------------------------------------------------------

function FormSelect({
  label,
  name,
  required,
  value,
  error,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  value: string;
  error?: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${
          error ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-border-default)]'
        }`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step Indicator — used by the 3-step "Register Organization" wizard
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 px-6 pt-4">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2 flex-1">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isDone
                    ? 'bg-primary-600 text-white'
                    : isActive
                      ? 'bg-primary-100 text-primary-700 border-2 border-primary-600 dark:bg-primary-950 dark:text-primary-300'
                      : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]'
                }`}
              >
                {isDone ? '✓' : stepNum}
              </span>
              <span
                className={`hidden sm:block text-xs font-medium ${
                  isActive ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'
                }`}
              >
                {label}
              </span>
            </div>
            {stepNum < STEP_LABELS.length && (
              <div className={`h-0.5 flex-1 rounded ${isDone ? 'bg-primary-600' : 'bg-[var(--color-border-default)]'}`} />
            )}
          </div>
        );
      })}
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
  const [step, setStep] = useState(1);

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
  // Builds the full error map; `onlyFields` restricts which keys are
  // actually checked (used by the wizard's per-step Next button) while
  // still returning a boolean for the whole set so callers can short-circuit.
  const collectErrors = (onlyFields?: (keyof SchoolFormData)[]): Partial<Record<keyof SchoolFormData, string>> => {
    const errors: Partial<Record<keyof SchoolFormData, string>> = {};
    const include = (field: keyof SchoolFormData) => !onlyFields || onlyFields.includes(field);

    if (include('name')) {
      if (!form.name.trim()) errors.name = 'Organization name is required';
      else if (form.name.length > 200) errors.name = 'Name cannot exceed 200 characters';
    }

    if (include('organizationType') && !form.organizationType) {
      errors.organizationType = 'Organization type is required';
    }

    if (include('subdomain')) {
      const sub = form.subdomain.trim().toLowerCase();
      if (!sub) errors.subdomain = 'Subdomain is required';
      else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(sub)) errors.subdomain = 'Use lowercase letters, numbers, and hyphens only';
      else if (sub.length < 3 || sub.length > 63) errors.subdomain = 'Subdomain must be 3-63 characters';
    }

    if (include('country') && !form.country.trim()) errors.country = 'Country is required';
    if (include('city') && !form.city.trim()) errors.city = 'City is required';

    if (include('address')) {
      if (!form.address.trim()) errors.address = 'Address is required';
      else if (form.address.length > 500) errors.address = 'Address cannot exceed 500 characters';
    }

    if (include('establishedYear')) {
      if (!form.establishedYear) errors.establishedYear = 'Established year is required';
      else {
        const year = parseInt(form.establishedYear, 10);
        if (isNaN(year) || year < 1900 || year > getCurrentYear()) {
          errors.establishedYear = `Year must be between 1900 and ${getCurrentYear()}`;
        }
      }
    }

    if (include('principalName')) {
      if (!form.principalName.trim()) errors.principalName = 'Admin full name is required';
      else if (form.principalName.length > 100) errors.principalName = 'Name cannot exceed 100 characters';
    }

    if (include('email')) {
      if (!form.email.trim()) errors.email = 'Login email is required';
      else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Enter a valid email address';
    }

    if (include('adminPassword')) {
      if (!editingSchool) {
        if (!form.adminPassword) errors.adminPassword = 'Password is required';
        else if (form.adminPassword.length < 8) errors.adminPassword = 'Password must be at least 8 characters';
      } else if (form.adminPassword && form.adminPassword.length < 8) {
        errors.adminPassword = 'Password must be at least 8 characters';
      }
    }

    if (include('phone')) {
      if (!form.phone.trim()) errors.phone = 'Phone number is required';
      else if (!/^[+]?[\d\s()-]{7,20}$/.test(form.phone.trim())) errors.phone = 'Enter a valid phone number';
    }

    if (include('registrationNo') && ['school', 'university'].includes(form.organizationType) && !form.registrationNo.trim()) {
      errors.registrationNo = 'Registration number is required for schools and universities';
    }

    return errors;
  };

  const validateStep = (stepNum: number): boolean => {
    const stepErrors = collectErrors(STEP_FIELDS[stepNum]);
    setFormErrors((prev) => {
      const next = { ...prev };
      STEP_FIELDS[stepNum].forEach((field) => {
        if (stepErrors[field]) next[field] = stepErrors[field];
        else delete next[field];
      });
      return next;
    });
    return Object.keys(stepErrors).length === 0;
  };

  const validate = (): boolean => {
    const errors = collectErrors();
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
    setStep(1);
    setModalOpen(true);
  };

  // ── Open edit modal ──
  const openEdit = (school: School) => {
    setEditingSchool(school);
    setForm({
      name: school.name,
      organizationType: school.organizationType || 'school',
      subdomain: school.subdomain || '',
      country: school.country || '',
      city: school.city || '',
      orgId: school.orgId || '',
      address: school.address,
      phone: school.phone,
      email: school.email,
      adminPassword: '',
      principalName: school.principalName,
      establishedYear: String(school.establishedYear),
      website: school.website || '',
      estimatedStudents: school.estimatedStudents || '',
      subscriptionPlan: school.subscriptionPlan || 'free_trial',
      registrationNo: school.registrationNo || '',
      status: school.status,
    });
    setFormErrors({});
    setStep(1);
    setModalOpen(true);
  };

  // ── Wizard navigation (create mode only) ──
  const goNext = () => {
    if (validateStep(step)) setStep((s) => Math.min(3, s + 1));
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  // ── Submit form ──
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // The wizard is one <form> spanning all 3 steps, so an Enter keypress on
    // an early step could reach here before the final step — treat that as
    // "advance to next step" instead of submitting.
    if (!editingSchool && step < 3) {
      goNext();
      return;
    }

    if (!validate()) return;

    setSubmitting(true);
    try {
      const { adminPassword, ...rest } = form;
      const payload: Record<string, unknown> = {
        ...rest,
        establishedYear: parseInt(form.establishedYear, 10),
      };
      if (!editingSchool || adminPassword) payload.adminPassword = adminPassword;

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
          <div className="mx-4 w-full max-w-xl rounded-2xl bg-[var(--color-surface-primary)] shadow-elevated border border-[var(--color-border-default)]">
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

            {/* Step Indicator — create mode only; editing is a single flat form */}
            {!editingSchool && <StepIndicator current={step} />}

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* ── Step 1 / Edit: Organization Details ── */}
              {(editingSchool || step === 1) && (
                <>
                  <FormInput label="Organization Name" name="name" value={form.name} error={formErrors.name} onChange={handleChange} placeholder="e.g., Al-Huda International" required maxLength={200} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormSelect
                      label="Organization Type"
                      name="organizationType"
                      value={form.organizationType}
                      error={formErrors.organizationType}
                      onChange={handleChange}
                      required
                      options={[
                        { value: 'school', label: 'School' },
                        { value: 'university', label: 'University' },
                        { value: 'training_center', label: 'Training Center' },
                        { value: 'private', label: 'Private' },
                      ]}
                    />
                    <FormInput label="Subdomain / Slug" name="subdomain" value={form.subdomain} error={formErrors.subdomain} onChange={handleChange} placeholder="e.g., al-huda" required maxLength={63} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormInput label="Country" name="country" value={form.country} error={formErrors.country} onChange={handleChange} placeholder="e.g., Somalia" required />
                    <FormInput label="City" name="city" value={form.city} error={formErrors.city} onChange={handleChange} placeholder="e.g., Mogadishu" required />
                  </div>
                  <FormInput label="Address" name="address" value={form.address} error={formErrors.address} onChange={handleChange} placeholder="Full organization address" required maxLength={500} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormInput label="Organization ID" name="orgId" value={form.orgId} error={formErrors.orgId} onChange={handleChange} placeholder="e.g., ORG-101 (optional)" maxLength={50} />
                    <FormInput label="Established Year" name="establishedYear" type="number" value={form.establishedYear} error={formErrors.establishedYear} onChange={handleChange} placeholder={`e.g., ${getCurrentYear() - 10}`} required />
                  </div>
                  <FormInput label="Website (optional)" name="website" type="url" value={form.website} error={formErrors.website} onChange={handleChange} placeholder="https://www.example.org.so" />
                  {editingSchool && isSuperAdmin && (
                    <FormSelect
                      label="Status"
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                      options={[
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Inactive' },
                      ]}
                    />
                  )}
                </>
              )}

              {/* ── Step 2 / Edit: Org Admin ── */}
              {(editingSchool || step === 2) && (
                <>
                  <FormInput label="Admin Full Name" name="principalName" value={form.principalName} error={formErrors.principalName} onChange={handleChange} placeholder="Full name of the org admin" required maxLength={100} />
                  <FormInput label="Login Email" name="email" type="email" value={form.email} error={formErrors.email} onChange={handleChange} placeholder="org@example.com" required />
                  {!editingSchool ? (
                    <FormInput label="Create Password" name="adminPassword" type="password" value={form.adminPassword} error={formErrors.adminPassword} onChange={handleChange} placeholder="At least 8 characters" required />
                  ) : isSuperAdmin ? (
                    <FormInput label="Reset Password" name="adminPassword" type="password" value={form.adminPassword} error={formErrors.adminPassword} onChange={handleChange} placeholder="Leave blank to keep current password" />
                  ) : null}
                  <FormInput label="Phone Number" name="phone" type="tel" value={form.phone} error={formErrors.phone} onChange={handleChange} placeholder="+252 61 2345678" required />
                </>
              )}

              {/* ── Step 3 / Edit: Size & Plan ── */}
              {(editingSchool || step === 3) && (
                <>
                  <FormSelect
                    label="Estimated Students"
                    name="estimatedStudents"
                    value={form.estimatedStudents}
                    error={formErrors.estimatedStudents}
                    onChange={handleChange}
                    placeholder="Select a range"
                    options={[
                      { value: '<50', label: '<50' },
                      { value: '50-200', label: '50-200' },
                      { value: '200-1000', label: '200-1000' },
                      { value: '1000+', label: '1000+' },
                    ]}
                  />
                  <FormSelect
                    label="Subscription Plan"
                    name="subscriptionPlan"
                    value={form.subscriptionPlan}
                    error={formErrors.subscriptionPlan}
                    onChange={handleChange}
                    options={[
                      { value: 'free_trial', label: 'Free Trial' },
                      { value: 'basic', label: 'Basic' },
                      { value: 'premium', label: 'Premium' },
                    ]}
                  />
                  {['school', 'university'].includes(form.organizationType) && (
                    <FormInput
                      label="Registration No. / Email Domain"
                      name="registrationNo"
                      value={form.registrationNo}
                      error={formErrors.registrationNo}
                      onChange={handleChange}
                      placeholder="e.g., MOE-2024-101 or alhuda.edu.so"
                      required
                    />
                  )}
                </>
              )}

              {/* Form Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
                <button
                  type="button"
                  onClick={() => (!editingSchool && step > 1 ? goBack() : setModalOpen(false))}
                  disabled={submitting}
                  className="rounded-xl border border-[var(--color-border-default)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50"
                >
                  {!editingSchool && step > 1 ? 'Back' : 'Cancel'}
                </button>
                {!editingSchool && step < 3 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
                  >
                    Next
                  </button>
                ) : (
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
                )}
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