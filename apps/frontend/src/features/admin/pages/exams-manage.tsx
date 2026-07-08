/**
 * Exam Management — Admin Full CRUD
 * Lists, creates, edits, deletes exams via /api/v1/exams
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseBrief {
  _id: string;
  title: { en: string };
  slug: string;
  category: string;
  enrolledStudents: number;
}

interface Exam {
  _id: string;
  title: string;
  course: CourseBrief;
  examDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  room: string;
  instructions: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  createdBy?: { _id: string; email: string };
  createdAt: string;
}

interface ExamForm {
  title: string;
  course: string;
  examDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  room: string;
  instructions: string;
  status: string;
}

const emptyForm: ExamForm = {
  title: '',
  course: '',
  examDate: new Date().toISOString().split('T')[0],
  startTime: '09:00',
  endTime: '10:30',
  duration: 90,
  totalMarks: 100,
  passingMarks: 50,
  room: '',
  instructions: '',
  status: 'scheduled',
};

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    ongoing: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function ExamModal({
  exam,
  courses,
  onClose,
  onSaved,
}: {
  exam?: Exam;
  courses: CourseBrief[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!exam;
  const [form, setForm] = useState<ExamForm>(
    exam
      ? {
          title: exam.title,
          course: exam.course?._id || '',
          examDate: exam.examDate ? new Date(exam.examDate).toISOString().split('T')[0] : '',
          startTime: exam.startTime,
          endTime: exam.endTime,
          duration: exam.duration,
          totalMarks: exam.totalMarks,
          passingMarks: exam.passingMarks,
          room: exam.room || '',
          instructions: exam.instructions || '',
          status: exam.status,
        }
      : emptyForm
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: keyof ExamForm, value: string | number) => {
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
        examDate: form.examDate,
        startTime: form.startTime,
        endTime: form.endTime,
        duration: Number(form.duration),
        totalMarks: Number(form.totalMarks),
        passingMarks: Number(form.passingMarks),
        room: form.room || undefined,
        instructions: form.instructions || undefined,
        ...(isEdit ? { status: form.status } : {}),
      };

      if (isEdit) {
        await api.patch(`/exams/${exam._id}`, payload);
      } else {
        await api.post('/exams', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save exam');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Exam' : '➕ Schedule Exam'}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Exam Title *</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.title} onChange={(e) => handleChange('title', e.target.value)} placeholder="e.g. Midterm Exam" required />
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Exam Date *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="date" value={form.examDate} onChange={(e) => handleChange('examDate', e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Duration (min) *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={1} value={form.duration} onChange={(e) => handleChange('duration', Number(e.target.value))} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Start Time *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="time" value={form.startTime} onChange={(e) => handleChange('startTime', e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">End Time *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="time" value={form.endTime} onChange={(e) => handleChange('endTime', e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Total Marks *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={1} value={form.totalMarks} onChange={(e) => handleChange('totalMarks', Number(e.target.value))} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Passing Marks *</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={1} value={form.passingMarks} onChange={(e) => handleChange('passingMarks', Number(e.target.value))} required />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Room</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="e.g. Hall A" value={form.room} onChange={(e) => handleChange('room', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Instructions</label>
            <textarea className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" rows={2} value={form.instructions} onChange={(e) => handleChange('instructions', e.target.value)} placeholder="Any special instructions for students..." />
          </div>

          {isEdit && (
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Status</label>
              <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.status} onChange={(e) => handleChange('status', e.target.value)}>
                <option value="scheduled">Scheduled</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Schedule'}
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

function ViewModal({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">📝 Exam Details</h2>
          <button onClick={onClose} className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button>
        </div>

        <div className="space-y-3">
          <div className="text-center pb-3 border-b border-[var(--color-border-subtle)]">
            <p className="text-lg font-bold">{exam.title}</p>
            <p className="text-sm text-[var(--color-text-tertiary)]">{exam.course?.title?.en}</p>
          </div>

          <DetailRow label="Status" value={<StatusBadge status={exam.status} />} />
          <DetailRow label="Date" value={new Date(exam.examDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} />
          <DetailRow label="Time" value={`${exam.startTime} — ${exam.endTime}`} />
          <DetailRow label="Duration" value={`${exam.duration} minutes`} />
          <DetailRow label="Total Marks" value={exam.totalMarks} />
          <DetailRow label="Passing Marks" value={`${exam.passingMarks} (${Math.round((exam.passingMarks / exam.totalMarks) * 100)}%)`} />
          <DetailRow label="Room" value={exam.room || '—'} />
          <DetailRow label="Instructions" value={exam.instructions || '—'} />
          <DetailRow label="Created By" value={exam.createdBy?.email || '—'} />
          <DetailRow label="Created" value={new Date(exam.createdAt).toLocaleString()} />
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

export function ExamsManage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | undefined>(undefined);
  const [viewingExam, setViewingExam] = useState<Exam | undefined>(undefined);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const [examsRes, coursesRes] = await Promise.all([
        api.get('/exams', { params }),
        api.get('/courses/admin'),
      ]);

      setExams(examsRes.data.data || []);
      setCourses(coursesRes.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/exams/${id}/status`, { status: newStatus });
      setExams((prev) => prev.map((e) => (e._id === id ? { ...e, status: newStatus as Exam['status'] } : e)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this exam?')) return;
    try {
      await api.delete(`/exams/${id}`);
      setExams((prev) => prev.filter((e) => e._id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const scheduledCount = exams.filter((e) => e.status === 'scheduled').length;
  const ongoingCount = exams.filter((e) => e.status === 'ongoing').length;
  const completedCount = exams.filter((e) => e.status === 'completed').length;
  const cancelledCount = exams.filter((e) => e.status === 'cancelled').length;

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
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📝 Manage Exams</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {exams.length} total — {scheduledCount} scheduled, {ongoingCount} ongoing, {completedCount} completed, {cancelledCount} cancelled
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">
            + Schedule Exam
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{scheduledCount}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Scheduled</p>
          </div>
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{ongoingCount}</p>
            <p className="text-xs text-green-600 dark:text-green-400">Ongoing</p>
          </div>
          <div className="rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{completedCount}</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">Completed</p>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{cancelledCount}</p>
            <p className="text-xs text-red-600 dark:text-red-400">Cancelled</p>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by title, course, or room..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center">
            <p className="text-red-600 text-sm mb-2">{error}</p>
            <button onClick={fetchData} className="text-primary-600 font-medium text-sm hover:underline">Retry</button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Exam</th>
                  <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Course</th>
                  <th className="text-center px-5 py-3 font-semibold hidden lg:table-cell">Date</th>
                  <th className="text-center px-5 py-3 font-semibold">Time</th>
                  <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Marks</th>
                  <th className="text-center px-5 py-3 font-semibold">Status</th>
                  <th className="text-center px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-16 text-[var(--color-text-tertiary)]">
                    <p className="text-lg mb-1">📝 No exams found</p>
                    <p className="text-sm">Click "+ Schedule Exam" to create one.</p>
                  </td></tr>
                ) : (
                  exams.map((exam) => (
                    <tr key={exam._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer" onClick={() => setViewingExam(exam)}>
                      <td className="px-5 py-4">
                        <p className="font-semibold">{exam.title}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">{exam.duration} min</p>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
                          {exam.course?.title?.en}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center hidden lg:table-cell text-sm">
                        {new Date(exam.examDate).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{exam.startTime} - {exam.endTime}</code>
                      </td>
                      <td className="px-5 py-4 text-center hidden sm:table-cell">
                        <span className="text-xs">
                          <span className="font-medium">{exam.totalMarks}</span>
                          <span className="text-[var(--color-text-tertiary)]"> / {exam.passingMarks} pass</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={exam.status}
                          onChange={(e) => handleStatusChange(exam._id, e.target.value)}
                          className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer"
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="ongoing">Ongoing</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setEditingExam(exam)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30" title="Edit">✏️</button>
                          <button onClick={() => handleDelete(exam._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete">🗑️</button>
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
        <ExamModal
          courses={courses}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); fetchData(); }}
        />
      )}
      {editingExam && (
        <ExamModal
          exam={editingExam}
          courses={courses}
          onClose={() => setEditingExam(undefined)}
          onSaved={() => { setEditingExam(undefined); fetchData(); }}
        />
      )}
      {viewingExam && (
        <ViewModal
          exam={viewingExam}
          onClose={() => setViewingExam(undefined)}
        />
      )}
    </div>
  );
}

export default ExamsManage;