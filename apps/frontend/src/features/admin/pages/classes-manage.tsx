/**
 * Class Management — Admin Full CRUD
 * Simplified: School, Class Name, Section, Room only.
 */

import { useEffect, useState, useCallback, type FormEvent, type ChangeEvent } from 'react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchoolBrief {
  _id: string;
  name: string;
}

interface ClassItem {
  _id: string;
  title: string;
  section: string;
  room: string;
  school?: { _id: string; name: string };
  course?: { _id: string; title: { en: string }; slug: string; category: string };
  teacher?: { _id: string; teacherId: string };
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  meetingLink?: string;
  status: 'active' | 'inactive' | 'completed';
  createdAt: string;
}

interface ClassForm {
  school: string;
  title: string;
  section: string;
  room: string;
}

const emptyForm: ClassForm = {
  school: '',
  title: '',
  section: '',
  room: '',
};

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || colors.inactive}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toast Component
// ---------------------------------------------------------------------------

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
        type === 'success'
          ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
          : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
      }`}
    >
      <span>{type === 'success' ? '✅' : '❌'}</span>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 text-lg leading-none opacity-60 hover:opacity-100">
        &times;
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simplified Create / Edit Modal
// ---------------------------------------------------------------------------

function ClassModal({
  cls,
  schools,
  onClose,
  onSaved,
}: {
  cls?: ClassItem;
  schools: SchoolBrief[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!cls;
  const [form, setForm] = useState<ClassForm>(
    cls
      ? {
          school: cls.school?._id || '',
          title: cls.title || '',
          section: cls.section || '',
          room: cls.room || '',
        }
      : emptyForm,
  );
  const [errors, setErrors] = useState<Partial<Record<keyof ClassForm, string>>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const validate = (): boolean => {
    const errs: Partial<Record<keyof ClassForm, string>> = {};
    if (!form.school) errs.school = 'School is required';
    if (!form.title.trim()) errs.title = 'Class name is required';
    if (!form.section.trim()) errs.section = 'Section is required';
    if (!form.room.trim()) errs.room = 'Room is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof ClassForm]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name as keyof ClassForm];
        return next;
      });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setApiError('');
    try {
      const payload = {
        school: form.school,
        title: form.title.trim(),
        section: form.section.trim(),
        room: form.room.trim(),
      };

      if (isEdit) {
        await api.patch(`/classes/${cls._id}`, payload);
      } else {
        await api.post('/classes', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to save class');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field: keyof ClassForm) =>
    `w-full rounded-xl border px-4 py-2.5 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${
      errors[field] ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-border-default)]'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
            {isEdit ? '✏️ Edit Class' : '➕ Add Class'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* School Dropdown */}
          <div>
            <label htmlFor="school" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">
              School <span className="text-red-500">*</span>
            </label>
            <select
              id="school"
              name="school"
              value={form.school}
              onChange={handleChange}
              className={inputClass('school')}
            >
              <option value="">Select a school...</option>
              {schools.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.school && <p className="mt-1 text-xs text-red-500">{errors.school}</p>}
          </div>

          {/* Class Name */}
          <div>
            <label htmlFor="title" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">
              Class Name <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Grade 3"
              className={inputClass('title')}
            />
            {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
          </div>

          {/* Section */}
          <div>
            <label htmlFor="section" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">
              Section <span className="text-red-500">*</span>
            </label>
            <input
              id="section"
              name="section"
              type="text"
              value={form.section}
              onChange={handleChange}
              placeholder="e.g. A"
              className={inputClass('section')}
            />
            {errors.section && <p className="mt-1 text-xs text-red-500">{errors.section}</p>}
          </div>

          {/* Room */}
          <div>
            <label htmlFor="room" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">
              Room <span className="text-red-500">*</span>
            </label>
            <input
              id="room"
              name="room"
              type="text"
              value={form.room}
              onChange={handleChange}
              placeholder="e.g. Room 5"
              className={inputClass('room')}
            />
            {errors.room && <p className="mt-1 text-xs text-red-500">{errors.room}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {isEdit ? 'Update' : 'Create'}
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

export function ClassesManage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const [classesRes, schoolsRes] = await Promise.all([
        api.get('/classes', { params }),
        api.get('/schools', { params: { limit: '100' } }),
      ]);

      setClasses(classesRes.data.data || []);
      setSchools(schoolsRes.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/classes/${id}/status`, { status: newStatus });
      setClasses((prev) =>
        prev.map((c) => (c._id === id ? { ...c, status: newStatus as ClassItem['status'] } : c)),
      );
      setToast({ message: `Status updated to ${newStatus}`, type: 'success' });
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to update status', type: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this class?')) return;
    try {
      await api.delete(`/classes/${id}`);
      setClasses((prev) => prev.filter((c) => c._id !== id));
      setToast({ message: 'Class deleted', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to delete', type: 'error' });
    }
  };

  const activeCount = classes.filter((c) => c.status === 'active').length;
  const inactiveCount = classes.filter((c) => c.status === 'inactive').length;
  const completedCount = classes.filter((c) => c.status === 'completed').length;

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Toast */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🏫 Manage Classes</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {classes.length} total — {activeCount} active, {inactiveCount} inactive, {completedCount} completed
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
          >
            + Add Class
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
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{completedCount}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Completed</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center">
            <p className="text-red-600 text-sm mb-2">{error}</p>
            <button onClick={fetchData} className="text-primary-600 font-medium text-sm hover:underline">
              Retry
            </button>
          </div>
        )}

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by class name, section, room, or school..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Class</th>
                  <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Section</th>
                  <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)] hidden md:table-cell">School</th>
                  <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Room</th>
                  <th className="text-center px-5 py-3 font-semibold text-[var(--color-text-primary)]">Status</th>
                  <th className="text-center px-5 py-3 font-semibold text-[var(--color-text-primary)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {classes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-[var(--color-text-tertiary)]">
                      <p className="text-lg mb-1">🏫 No classes found</p>
                      <p className="text-sm">Click "+ Add Class" to create one.</p>
                    </td>
                  </tr>
                ) : (
                  classes.map((c) => (
                    <tr
                      key={c._id}
                      className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors"
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[var(--color-text-primary)]">{c.title}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
                          {c.section}
                        </span>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell text-[var(--color-text-secondary)] text-sm">
                        {c.school?.name || '—'}
                      </td>
                      <td className="px-5 py-4 text-[var(--color-text-secondary)] text-sm">{c.room}</td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={c.status}
                          onChange={(e) => handleStatusChange(c._id, e.target.value)}
                          className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer text-[var(--color-text-primary)]"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="completed">Completed</option>
                        </select>
                      </td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditingClass(c)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(c._id)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
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

      {/* Modals */}
      {showCreate && (
        <ClassModal
          schools={schools}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            fetchData();
          }}
        />
      )}
      {editingClass && (
        <ClassModal
          cls={editingClass}
          schools={schools}
          onClose={() => setEditingClass(undefined)}
          onSaved={() => {
            setEditingClass(undefined);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

export default ClassesManage;