/**
 * Class Management — Admin Full CRUD
 * Lists, creates, edits, views schedule, manages classes via /api/v1/classes
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseBrief { _id: string; title: { en: string }; slug: string; category: string; }

interface TeacherBrief { _id: string; teacherId: string; profile?: { firstName: string; lastName: string }; }

interface ClassItem {
  _id: string;
  title: string;
  course: { _id: string; title: { en: string }; slug: string; category: string };
  teacher?: { _id: string; teacherId: string; profile?: { firstName: string; lastName: string } };
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  endTime: string;
  room: string;
  meetingLink: string;
  status: 'active' | 'inactive' | 'completed';
  createdAt: string;
}

interface ClassForm {
  title: string;
  course: string;
  teacher: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
  meetingLink: string;
  status: string;
}

interface ScheduleDay { day: string; dayIndex: number; classes: ClassItem[]; }

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const emptyForm: ClassForm = {
  title: '',
  course: '',
  teacher: '',
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '09:30',
  room: '',
  meetingLink: '',
  status: 'active',
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
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || colors.inactive}`}>{status}</span>;
}

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function ClassModal({
  cls,
  courses,
  teachers,
  onClose,
  onSaved,
}: {
  cls?: ClassItem;
  courses: CourseBrief[];
  teachers: TeacherBrief[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!cls;
  const [form, setForm] = useState<ClassForm>(
    cls
      ? {
          title: cls.title,
          course: cls.course?._id || '',
          teacher: cls.teacher?._id || '',
          dayOfWeek: cls.dayOfWeek,
          startTime: cls.startTime,
          endTime: cls.endTime,
          room: cls.room || '',
          meetingLink: cls.meetingLink || '',
          status: cls.status,
        }
      : emptyForm
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: keyof ClassForm, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        course: form.course || undefined,
        teacher: form.teacher || null,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
        room: form.room || undefined,
        meetingLink: form.meetingLink || undefined,
        ...(isEdit ? { status: form.status } : {}),
      };

      if (isEdit) {
        await api.patch(`/classes/${cls._id}`, payload);
      } else {
        await api.post('/classes', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save class');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Class' : '➕ Add Class'}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Class Title *</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.title} onChange={(e) => handleChange('title', e.target.value)} required />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Course *</label>
            <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.course} onChange={(e) => handleChange('course', e.target.value)} required>
              <option value="">Select Course</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>{c.title.en} ({c.category})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Teacher</label>
            <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.teacher} onChange={(e) => handleChange('teacher', e.target.value)}>
              <option value="">None</option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>{t.teacherId} — {t.profile?.firstName} {t.profile?.lastName}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Day</label>
              <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.dayOfWeek} onChange={(e) => handleChange('dayOfWeek', Number(e.target.value))}>
                {days.map((d, i) => (<option key={i} value={i}>{d}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Start</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="time" value={form.startTime} onChange={(e) => handleChange('startTime', e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">End</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="time" value={form.endTime} onChange={(e) => handleChange('endTime', e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Room</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="e.g. Room 101" value={form.room} onChange={(e) => handleChange('room', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Meeting Link</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="Zoom/Google Meet URL" value={form.meetingLink} onChange={(e) => handleChange('meetingLink', e.target.value)} />
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Status</label>
              <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.status} onChange={(e) => handleChange('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}

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

export function ClassesManage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [teachers, setTeachers] = useState<TeacherBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | undefined>(undefined);

  // Schedule state
  const [scheduleCourse, setScheduleCourse] = useState('');
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const [classesRes, coursesRes, teachersRes] = await Promise.all([
        api.get('/classes', { params }),
        api.get('/courses/admin'),
        api.get('/teachers'),
      ]);

      setClasses(classesRes.data.data || []);
      setCourses(coursesRes.data.data || []);
      setTeachers(teachersRes.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadSchedule = async () => {
    if (!scheduleCourse) return;
    try {
      const { data } = await api.get(`/classes/schedule/${scheduleCourse}`);
      setSchedule(data.data || []);
      setShowSchedule(true);
    } catch {}
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/classes/${id}/status`, { status: newStatus });
      setClasses((prev) => prev.map((c) => (c._id === id ? { ...c, status: newStatus as ClassItem['status'] } : c)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this class?')) return;
    try {
      await api.delete(`/classes/${id}`);
      setClasses((prev) => prev.filter((c) => c._id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete');
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🏫 Manage Classes</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {classes.length} total — {activeCount} active, {inactiveCount} inactive, {completedCount} completed
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowCreate(true); }} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">+ Add Class</button>
            <button onClick={() => { if (!showSchedule) loadSchedule(); else setShowSchedule(false); }} className="rounded-xl border border-[var(--color-border-default)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">
              {showSchedule ? '📋 List View' : '📅 Schedule'}
            </button>
          </div>
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
            <button onClick={fetchData} className="text-primary-600 font-medium text-sm hover:underline">Retry</button>
          </div>
        )}

        {/* Condition: Schedule View or List View */}
        {showSchedule ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <select
                value={scheduleCourse}
                onChange={(e) => setScheduleCourse(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
              >
                <option value="">Select a course to view schedule...</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>{c.title.en} ({c.category})</option>
                ))}
              </select>
              <button onClick={loadSchedule} disabled={!scheduleCourse} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">Load</button>
            </div>

            {schedule.length > 0 && (
              <div className="space-y-3">
                {schedule.map((day) => (
                  <div key={day.dayIndex} className={`rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 ${day.classes.length === 0 ? 'opacity-50' : ''}`}>
                    <h3 className="font-bold text-sm mb-2 text-[var(--color-text-primary)]">{day.day}</h3>
                    {day.classes.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-tertiary)]">No classes</p>
                    ) : (
                      <div className="space-y-1.5">
                        {day.classes.map((c: any) => (
                          <div key={c._id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-[var(--color-surface-secondary)] text-sm">
                            <div className="min-w-0 flex-1">
                              <span className="font-medium">{c.title}</span>
                              {c.room && <span className="text-xs text-[var(--color-text-tertiary)] ml-2">({c.room})</span>}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className="font-mono text-xs text-[var(--color-text-tertiary)]">{c.startTime} - {c.endTime}</span>
                              {/* @ts-ignore - dayName comes from backend */}
                              <StatusBadge status={c.status || 'active'} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Search & Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Search by title, room, or course name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
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
                      <th className="text-left px-5 py-3 font-semibold">Class</th>
                      <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Course</th>
                      <th className="text-center px-5 py-3 font-semibold hidden lg:table-cell">Day</th>
                      <th className="text-center px-5 py-3 font-semibold">Time</th>
                      <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Room</th>
                      <th className="text-center px-5 py-3 font-semibold">Status</th>
                      <th className="text-center px-5 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-16 text-[var(--color-text-tertiary)]">
                        <p className="text-lg mb-1">🏫 No classes found</p>
                        <p className="text-sm">Click "+ Add Class" to create one.</p>
                      </td></tr>
                    ) : (
                      classes.map((c) => (
                        <tr key={c._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                          <td className="px-5 py-4">
                            <p className="font-semibold">{c.title}</p>
                            {c.teacher && (
                              <p className="text-xs text-[var(--color-text-tertiary)]">{c.teacher.teacherId}</p>
                            )}
                          </td>
                          <td className="px-5 py-4 hidden md:table-cell">
                            <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
                              {c.course?.title?.en}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center hidden lg:table-cell text-sm">{c.dayName || days[c.dayOfWeek]}</td>
                          <td className="px-5 py-4 text-center">
                            <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{c.startTime} - {c.endTime}</code>
                          </td>
                          <td className="px-5 py-4 text-center hidden sm:table-cell text-sm text-[var(--color-text-tertiary)]">{c.room || '—'}</td>
                          <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={c.status}
                              onChange={(e) => handleStatusChange(c._id, e.target.value)}
                              className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer"
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                              <option value="completed">Completed</option>
                            </select>
                          </td>
                          <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setEditingClass(c)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30" title="Edit">✏️</button>
                              <button onClick={() => handleDelete(c._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <ClassModal
          courses={courses}
          teachers={teachers}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); fetchData(); }}
        />
      )}
      {editingClass && (
        <ClassModal
          cls={editingClass}
          courses={courses}
          teachers={teachers}
          onClose={() => setEditingClass(undefined)}
          onSaved={() => { setEditingClass(undefined); fetchData(); }}
        />
      )}
    </div>
  );
}

export default ClassesManage;