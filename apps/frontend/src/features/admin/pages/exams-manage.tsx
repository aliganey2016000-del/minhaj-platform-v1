/**
 * Exam Management — Admin Full CRUD
 * Lists, creates, edits, deletes exams via /api/v1/exams
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { CalendarClock, PlayCircle, CheckCircle2, MoreVertical, Pencil, Trash2, Eye, Search, LayoutGrid, Upload, Download, X, Building2, Users, FileCheck2, Percent } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { toTitleCase } from '../../../lib/format';
import { BackButton } from '../../shared/components/back-button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseBrief {
  _id: string;
  title: { en: string };
  slug: string;
  category: string;
  enrolledStudents: number | unknown[];
  class?: {
    _id?: string;
    title?: string;
    section?: string;
    department?: { _id?: string; name?: string } | null;
  } | null;
}

interface SchoolBrief { _id: string; name: string; status?: string; }
interface DepartmentBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; }

interface Exam {
  _id: string;
  title: string;
  course: CourseBrief;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  room: string;
  instructions: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  autoSchedule?: boolean;
  milestone?: 'mid' | 'final' | null;
  autoScheduleDelayDays?: number;
  autoScheduleWindowDays?: number;
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
  autoSchedule: boolean;
  milestone: 'mid' | 'final' | '';
  autoScheduleDelayDays: number;
  autoScheduleWindowDays: number;
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
  autoSchedule: false,
  milestone: '',
  autoScheduleDelayDays: 1,
  autoScheduleWindowDays: 2,
};

/**
 * Display-only status derived from the exam's actual clock instead of the
 * stored `status` field — that field is a manual label nobody reliably
 * flips the moment an exam's window opens or closes, so a fixed-schedule
 * exam whose end time already passed would otherwise still read
 * "Scheduled"/"Ongoing" indefinitely. Self-paced exams have no single
 * shared window (each student gets their own), so those fall back to the
 * stored status as-is. Doesn't touch the underlying value — only what's
 * shown/counted/filtered by.
 */
function getEffectiveStatus(exam: Exam): string {
  if (exam.status === 'cancelled' || exam.status === 'completed') return exam.status;
  if (exam.autoSchedule || !exam.examDate || !exam.startTime || !exam.endTime) return exam.status;

  const datePart = new Date(exam.examDate).toISOString().split('T')[0];
  const start = new Date(`${datePart}T${exam.startTime}`);
  const end = new Date(`${datePart}T${exam.endTime}`);
  const now = new Date();
  if (now >= start && now <= end) return 'ongoing';
  if (now > end) return 'completed';
  return exam.status;
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

const STATUS_PILL_CLASSES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ongoing: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL_CLASSES[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// A <select> styled to read as a soft pill badge rather than a form
// control — still a real dropdown (keyboard/native accessible), just
// skinned to match the status colors used everywhere else on the page.
function StatusPillSelect({ status, onChange }: { status: string; onChange: (value: string) => void }) {
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-full border-0 pl-3 pr-7 py-1.5 text-xs font-semibold capitalize cursor-pointer appearance-none bg-[right_0.5rem_center] bg-no-repeat focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${STATUS_PILL_CLASSES[status] || 'bg-gray-100 text-gray-600'}`}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='currentColor'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E")`, backgroundSize: '14px 14px' }}
    >
      <option value="scheduled">Scheduled</option>
      <option value="ongoing">Ongoing</option>
      <option value="completed">Completed</option>
      <option value="cancelled">Cancelled</option>
    </select>
  );
}

// Three-dot row action menu — replaces the bare ✏️/🗑️ icon pair with a
// single compact trigger, closing itself on an outside click.
function RowActionsMenu({ onView, onEdit, onDelete }: { onView: () => void; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-36 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-lg py-1 text-left">
          <button onClick={() => { setOpen(false); onView(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} /> View Details
          </button>
          <button onClick={() => { setOpen(false); onEdit(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} /> Edit
          </button>
          <button onClick={() => { setOpen(false); onDelete(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Header Actions — all page-level actions live behind one compact
// three-dot trigger beside the Exam Schedule heading.
// ---------------------------------------------------------------------------

function ExamsActionsMenu({ onSchedule, onImport, onExport, exporting, onBulkDelete, selectedCount }: {
  onSchedule: () => void;
  onImport: () => void;
  onExport: () => void;
  exporting: boolean;
  onBulkDelete: () => void;
  selectedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-[var(--color-text-secondary)] shadow-sm hover:bg-[var(--color-surface-tertiary)] transition-colors"
        title="More Actions"
      >
        <MoreVertical className="h-5 w-5" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-lg py-1 text-left">
          <button onClick={() => { setOpen(false); onSchedule(); }} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} /> Schedule Exam
          </button>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button onClick={() => { setOpen(false); onImport(); }} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
            <Upload className="h-3.5 w-3.5" strokeWidth={1.75} /> Import Exams
          </button>
          <button onClick={() => { setOpen(false); onExport(); }} disabled={exporting} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-50 transition-colors">
            <Download className="h-3.5 w-3.5" strokeWidth={1.75} /> {exporting ? 'Exporting...' : 'Export Data'}
          </button>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button onClick={() => { setOpen(false); onBulkDelete(); }} disabled={selectedCount === 0} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Bulk Delete{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function ExamModal({
  exam,
  onClose,
  onSaved,
}: {
  exam?: Exam;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'admin';
  const isOrgAdmin = currentUser?.role === 'org_admin';

  const isEdit = !!exam;
  const [form, setForm] = useState<ExamForm>(
    exam
      ? {
          title: exam.title,
          course: exam.course?._id || '',
          examDate: exam.examDate ? new Date(exam.examDate).toISOString().split('T')[0] : '',
          startTime: exam.startTime || '',
          endTime: exam.endTime || '',
          duration: exam.duration,
          totalMarks: exam.totalMarks,
          passingMarks: exam.passingMarks,
          room: exam.room || '',
          instructions: exam.instructions || '',
          status: exam.status,
          autoSchedule: !!exam.autoSchedule,
          milestone: exam.milestone || '',
          autoScheduleDelayDays: exam.autoScheduleDelayDays ?? 1,
          autoScheduleWindowDays: exam.autoScheduleWindowDays ?? 2,
        }
      : emptyForm
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ---------------------------------------------------------------------
  // Organization -> Department -> Class -> Course cascade. Narrows the
  // Course dropdown to courses actually taught in the chosen class, instead
  // of a flat list of every course the caller can see.
  // ---------------------------------------------------------------------
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [departments, setDepartments] = useState<DepartmentBrief[]>([]);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [organization, setOrganization] = useState('');
  const [department, setDepartment] = useState('');
  const [classId, setClassId] = useState('');
  const [cascadeLoading, setCascadeLoading] = useState(isEdit);

  const fetchDepartments = async (school: string) => {
    try {
      const { data } = await api.get('/departments', { params: { school, limit: 200 } });
      setDepartments(data.data || []);
    } catch { setDepartments([]); }
  };
  const fetchClasses = async (dept: string) => {
    try {
      const { data } = await api.get('/classes', { params: { department: dept, status: 'active', limit: 200 } });
      setClasses(data.data || []);
    } catch { setClasses([]); }
  };
  const fetchCourses = async (cls: string) => {
    try {
      const { data } = await api.get('/courses/admin', { params: { classId: cls, limit: 200 } });
      setCourses(data.data || []);
    } catch { setCourses([]); }
  };

  // Super admin: load the organization list. Org admin: auto-scope.
  useEffect(() => {
    if (isSuperAdmin) {
      api.get('/schools', { params: { limit: 100 } })
        .then(({ data }) => setSchools((data.data || []).filter((s: SchoolBrief) => s.status === 'active')))
        .catch(() => {});
    } else if (isOrgAdmin && currentUser?.organizationId) {
      setOrganization(currentUser.organizationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, isOrgAdmin]);

  // Editing an existing exam: reverse-populate the cascade from its course
  // so the dropdowns open already showing where that course actually lives.
  useEffect(() => {
    if (!isEdit || !exam?.course?._id) { setCascadeLoading(false); return; }
    (async () => {
      try {
        const { data } = await api.get(`/courses/${exam.course._id}/admin`);
        const c = data.data;
        const schoolId: string = c.school?._id || '';
        const deptId: string = c.class?.department?._id || '';
        const clsId: string = c.class?._id || '';

        if (isSuperAdmin && schoolId) setOrganization(schoolId);
        if (deptId) {
          setDepartment(deptId);
          if (schoolId) await fetchDepartments(schoolId);
        }
        if (clsId) {
          setClassId(clsId);
          if (deptId) await fetchClasses(deptId);
        }
        if (clsId) await fetchCourses(clsId);
      } catch {
        // Non-fatal — the course is still pre-selected in `form.course`,
        // just without the cascade filters populated above it.
      } finally {
        setCascadeLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  const handleChange = (field: keyof ExamForm, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleOrgChange = (value: string) => {
    setOrganization(value);
    setDepartment(''); setClassId(''); handleChange('course', '');
    setDepartments([]); setClasses([]); setCourses([]);
    if (value) fetchDepartments(value);
  };
  const handleDeptChange = (value: string) => {
    setDepartment(value);
    setClassId(''); handleChange('course', '');
    setClasses([]); setCourses([]);
    if (value) fetchClasses(value);
  };
  const handleClassChange = (value: string) => {
    setClassId(value);
    handleChange('course', '');
    setCourses([]);
    if (value) fetchCourses(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        course: form.course || undefined,
        autoSchedule: form.autoSchedule,
        // Auto-scheduled exams have no calendar window at all — omit these
        // entirely rather than send empty strings, which would fail the
        // schema's HH:MM format validation.
        ...(form.autoSchedule
          ? {
              milestone: form.milestone || null,
              autoScheduleDelayDays: Number(form.autoScheduleDelayDays),
              autoScheduleWindowDays: Number(form.autoScheduleWindowDays),
            }
          : { examDate: form.examDate, startTime: form.startTime, endTime: form.endTime }),
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

          {isSuperAdmin && (
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Organization</label>
              <select
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm disabled:opacity-60"
                value={organization}
                onChange={(e) => handleOrgChange(e.target.value)}
                disabled={cascadeLoading}
              >
                <option value="">Select an organization...</option>
                {schools.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Department</label>
              <select
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm disabled:opacity-60"
                value={department}
                onChange={(e) => handleDeptChange(e.target.value)}
                disabled={cascadeLoading || (isSuperAdmin && !organization)}
              >
                <option value="">{isSuperAdmin && !organization ? 'Select an organization first' : 'Select department...'}</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Class</label>
              <select
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm disabled:opacity-60"
                value={classId}
                onChange={(e) => handleClassChange(e.target.value)}
                disabled={cascadeLoading || !department}
              >
                <option value="">{!department ? 'Select a department first' : 'Select class...'}</option>
                {classes.map((c) => <option key={c._id} value={c._id}>{c.title}{c.section ? ` - ${c.section}` : ''}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Course *</label>
            <select
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm disabled:opacity-60"
              value={form.course}
              onChange={(e) => handleChange('course', e.target.value)}
              disabled={cascadeLoading || !classId}
              required
            >
              <option value="">{!classId ? 'Select a class first' : 'Select course...'}</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>{c.title.en} ({c.category})</option>
              ))}
            </select>
          </div>

          {/* Manual vs. Automatic scheduling */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Scheduling</label>
            <div className="inline-flex w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-1">
              <button
                type="button"
                onClick={() => handleChange('autoSchedule', false)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${!form.autoSchedule ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)]'}`}
              >
                📅 Manual
              </button>
              <button
                type="button"
                onClick={() => handleChange('autoSchedule', true)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${form.autoSchedule ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)]'}`}
              >
                🤖 Automatic
              </button>
            </div>
            {form.autoSchedule && (
              <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
                No fixed date/time — this exam unlocks for each student individually once they finish the required lessons.
              </p>
            )}
          </div>

          {form.autoSchedule ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Unlocks After</label>
                <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.milestone} onChange={(e) => handleChange('milestone', e.target.value)}>
                  <option value="">Select milestone...</option>
                  <option value="mid">Modules tagged "Before Mid Exam"</option>
                  <option value="final">The entire course</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Duration (min) *</label>
                <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={1} value={form.duration} onChange={(e) => handleChange('duration', Number(e.target.value))} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Opens After (days)</label>
                <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={0} value={form.autoScheduleDelayDays} onChange={(e) => handleChange('autoScheduleDelayDays', Number(e.target.value))} required />
                <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">Days after a student finishes the required lessons before their exam becomes active.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Window Stays Open (days)</label>
                <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={1} value={form.autoScheduleWindowDays} onChange={(e) => handleChange('autoScheduleWindowDays', Number(e.target.value))} required />
                <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">How many days the student has to take it once it opens, before it's marked missed.</p>
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}

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
            <p className="text-lg font-bold" dir="auto">{toTitleCase(exam.title)}</p>
            <p className="text-sm text-[var(--color-text-tertiary)]">{exam.course?.title?.en || '⚠️ Course missing'}</p>
          </div>

          <DetailRow label="Status" value={<StatusBadge status={getEffectiveStatus(exam)} />} />
          {exam.autoSchedule ? (
            <>
              <DetailRow label="Scheduling" value={`🤖 Automatic — unlocks after ${exam.milestone === 'mid' ? 'tagged modules' : 'the whole course'}`} />
              <DetailRow label="Personal Window" value={`Opens ${exam.autoScheduleDelayDays ?? 1} day(s) after eligible, stays open ${exam.autoScheduleWindowDays ?? 2} day(s)`} />
            </>
          ) : (
            <>
              <DetailRow label="Date" value={exam.examDate ? new Date(exam.examDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—'} />
              <DetailRow label="Time" value={exam.startTime && exam.endTime ? `${exam.startTime} — ${exam.endTime}` : '—'} />
            </>
          )}
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
// Bulk Import Modal — Excel/CSV upload or manual paste, mirroring the same
// shell used by the other admin importers (Students, Class Schedules).
// ---------------------------------------------------------------------------

interface ImportResult { totalRows: number; created: number; failed: number; errors: { row: number; message: string }[]; }

function ExamsImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/exams/template`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'exams-template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download template');
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const submitImport = async (file: File) => {
    setImporting(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/exams/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(data.data);
      if (data.data?.created > 0) {
        onImported();
        if (!data.data?.failed) onClose();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const submitFileImport = () => { if (selectedFile) submitImport(selectedFile); };

  const parsePastedRows = (): string[][] => {
    if (!pasteText.trim()) return [];
    return pasteText.trim().split(/\r?\n/).map((l) => l.split('\t').map((c) => c.trim())).filter((r) => r.length > 0 && r.some((c) => c !== ''));
  };

  const submitPasteImport = () => {
    const rows = parsePastedRows();
    if (rows.length === 0) { setPasteError('Please paste at least one row of data before submitting.'); return; }
    if (rows[0].length < 2) { setPasteError("That doesn't look like tabular data — make sure each row has more than one tab-separated column."); return; }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], 'pasted-exams.csv', { type: 'text/csv' });
    setPasteError('');
    submitImport(file);
  };

  const parsedRows = parsePastedRows();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="border-b border-[var(--color-border-subtle)] px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Import Exams</h2>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Bulk-create manually-scheduled exams from a spreadsheet.</p>
            </div>
            <button onClick={onClose} disabled={importing} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors">
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          <button onClick={handleDownloadTemplate} className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📥</span>
                <div>
                  <p className="text-sm font-bold text-primary-700 dark:text-primary-300 group-hover:text-primary-800 dark:group-hover:text-primary-200">Download Excel Template</p>
                  <p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">Pre-formatted .xlsx file with the correct column structure</p>
                </div>
              </div>
              <Download className="h-5 w-5 text-primary-500 group-hover:translate-y-0.5 transition-transform" strokeWidth={1.75} />
            </div>
          </button>
          <p className="text-xs text-[var(--color-text-tertiary)] -mt-3">
            💡 Only manually-scheduled exams can be bulk-imported — an auto-scheduled exam has no fixed date/time of its own, so set those up individually via "+ Schedule Exam".
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setMode('upload'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${mode === 'upload' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}>
              <span className="text-2xl block mb-1">📁</span>
              <p className={`text-sm font-bold ${mode === 'upload' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Upload Excel File</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Drag and drop your .xlsx file</p>
            </button>
            <button onClick={() => { setMode('paste'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${mode === 'paste' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}>
              <span className="text-2xl block mb-1">📋</span>
              <p className={`text-sm font-bold ${mode === 'paste' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Manual Copy &amp; Paste</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Paste tabular data from your clipboard</p>
            </button>
          </div>

          {mode === 'upload' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}
            >
              {selectedFile ? (
                <div className="space-y-3">
                  <span className="text-3xl">✅</span>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedFile.name}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  <button onClick={() => setSelectedFile(null)} className="text-xs text-red-500 hover:underline">Remove file</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="text-3xl">📂</span>
                  <p className="text-sm font-medium text-[var(--color-text-secondary)]">Drag and drop your Excel file here, or</p>
                  <label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">
                    Browse Files
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }} className="hidden" />
                  </label>
                  <p className="text-xs text-[var(--color-text-tertiary)]">Supported formats: .xlsx, .xls, .csv (max 10 MB)</p>
                </div>
              )}
            </div>
          )}

          {mode === 'paste' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Paste your spreadsheet data below, including the header row (tab-separated columns):</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mb-3 font-mono">
                  Organization &nbsp; Course Title &nbsp; Exam Title &nbsp; Exam Date &nbsp; Start Time &nbsp; End Time &nbsp; Duration &nbsp; Total Marks &nbsp; Passing Marks &nbsp; Room &nbsp; Instructions
                  <span className="italic"> (Organization only needed if you manage more than one)</span>
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => { setPasteText(e.target.value); setPasteError(''); }}
                  rows={8}
                  placeholder={"Paste data from Excel here, including the header row..."}
                  className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y"
                />
              </div>
              {pasteError && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{pasteError}</div>}
              {parsedRows.length > 0 && (
                <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
                  <div className="bg-[var(--color-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-tertiary)]">Preview — {parsedRows.length} row{parsedRows.length !== 1 ? '' : ''} parsed</div>
                  <div className="max-h-40 overflow-auto">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-[var(--color-border-subtle)]">
                        {parsedRows.slice(0, 20).map((row, ri) => (
                          <tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--color-surface-primary)]' : 'bg-[var(--color-surface-secondary)]'}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-1.5 text-[var(--color-text-secondary)] whitespace-nowrap border-r border-[var(--color-border-subtle)] last:border-r-0">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}
        </div>

        <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between">
          <button onClick={onClose} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Close</button>
          <button
            onClick={mode === 'upload' ? submitFileImport : submitPasteImport}
            disabled={importing || (mode === 'upload' && !selectedFile) || (mode === 'paste' && !pasteText.trim())}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {importing ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importing...</> : 'Import Exams'}
          </button>
        </div>

        {result && (
          <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 space-y-2">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {result.created} of {result.totalRows} rows imported successfully
              {result.failed > 0 && ` — ${result.failed} failed`}
            </p>
            {result.errors.length > 0 && (
              <div className="max-h-36 overflow-auto rounded-lg border border-red-200 dark:border-red-900/40">
                <table className="w-full text-xs">
                  <thead className="bg-red-50 dark:bg-red-950/30 text-left text-red-700 dark:text-red-300">
                    <tr><th className="px-3 py-1.5">Row</th><th className="px-3 py-1.5">Error</th></tr>
                  </thead>
                  <tbody className="divide-y divide-red-100 dark:divide-red-900/30">
                    {result.errors.map((e, idx) => (
                      <tr key={idx}><td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{e.row || '—'}</td><td className="px-3 py-1.5 text-red-600 dark:text-red-400">{e.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ExamsManage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'manual' | 'auto'>('all');
  const [classFilter, setClassFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'schedule' | 'tools'>('schedule');
  const [showCreate, setShowCreate] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | undefined>(undefined);
  const [viewingExam, setViewingExam] = useState<Exam | undefined>(undefined);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { limit: 200 };
      if (search) params.search = search;
      const { data } = await api.get('/exams', { params });
      setExams(data.data || []);
      setSelected(new Set());
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch('/exams/' + id + '/status', { status: newStatus });
      setExams((prev) => prev.map((e) => (e._id === id ? { ...e, status: newStatus as Exam['status'] } : e)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this exam?')) return;
    try {
      await api.delete('/exams/' + id);
      setExams((prev) => prev.filter((e) => e._id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const scheduledCount = exams.filter((e) => getEffectiveStatus(e) === 'scheduled').length;
  const ongoingCount = exams.filter((e) => getEffectiveStatus(e) === 'ongoing').length;
  const completedCount = exams.filter((e) => getEffectiveStatus(e) === 'completed').length;
  const cancelledCount = exams.filter((e) => getEffectiveStatus(e) === 'cancelled').length;
  const manualCount = exams.filter((e) => !e.autoSchedule).length;
  const autoCount = exams.filter((e) => e.autoSchedule).length;

  const classOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const exam of exams) {
      const cls = exam.course?.class;
      if (!cls?._id || !cls.title) continue;
      values.set(cls._id, cls.section ? cls.title + ' - ' + cls.section : cls.title);
    }
    return Array.from(values.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [exams]);

  const departmentOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const exam of exams) {
      const dept = exam.course?.class?.department;
      if (!dept?._id || !dept.name) continue;
      values.set(dept._id, dept.name);
    }
    return Array.from(values.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [exams]);

  const visibleExams = exams.filter((exam) => {
    const cls = exam.course?.class;
    const dept = cls?.department;
    if (scheduleFilter === 'manual' && exam.autoSchedule) return false;
    if (scheduleFilter === 'auto' && !exam.autoSchedule) return false;
    if (statusFilter && getEffectiveStatus(exam) !== statusFilter) return false;
    if (classFilter && cls?._id !== classFilter) return false;
    if (departmentFilter && dept?._id !== departmentFilter) return false;
    if (dateFilter) {
      if (!exam.examDate || exam.autoSchedule) return false;
      const key = new Date(exam.examDate).toISOString().slice(0, 10);
      if (key !== dateFilter) return false;
    }
    return true;
  });

  const allVisibleSelected = visibleExams.length > 0 && visibleExams.every((e) => selected.has(e._id));
  const toggleSelected = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(visibleExams.map((e) => e._id)));
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const { data } = await api.post('/exams/bulk-delete', { ids: Array.from(selected) });
      setExams((prev) => prev.filter((e) => !selected.has(e._id)));
      setSelected(new Set());
      setShowBulkDeleteModal(false);
      alert(data?.message || 'Selected exams deleted');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(api.defaults.baseURL + '/exams/export', { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'exams-export-' + new Date().toISOString().slice(0, 10) + '.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const setCalendarDate = (value: string) => {
    setDateFilter(value);
  };

  const clearFilters = () => {
    setStatusFilter('');
    setScheduleFilter('all');
    setClassFilter('');
    setDepartmentFilter('');
    setDateFilter('');
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  const statCards = [
    { key: '', label: 'Total Exams', count: exams.length, icon: LayoutGrid, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
    { key: 'scheduled', label: 'Scheduled', count: scheduledCount, icon: CalendarClock, tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300' },
    { key: 'ongoing', label: 'Ongoing', count: ongoingCount, icon: PlayCircle, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300' },
    { key: 'completed', label: 'Completed', count: completedCount, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300' },
  ] as const;

  return (
    <div className="p-4 pt-20 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-[1700px]">
        <div>
          <main className="min-w-0 space-y-5">
            <div>
              <BackButton fallback="/admin/exams" />
              <div className="mt-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Exam Schedule</h1>
                  <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Plan, manage and track all school examinations from one workspace.</p>
                </div>
                <div className="shrink-0">
                  <ExamsActionsMenu
                    onSchedule={() => setShowCreate(true)}
                    onImport={() => setShowImportModal(true)}
                    onExport={handleExport}
                    exporting={exporting}
                    onBulkDelete={() => setShowBulkDeleteModal(true)}
                    selectedCount={selected.size}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {statCards.map((card) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => setStatusFilter(card.key)}
                  className={'group rounded-2xl border bg-[var(--color-surface-primary)] p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ' + (statusFilter === card.key ? 'border-primary-400 ring-2 ring-primary-500/10' : 'border-[var(--color-border-default)]')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={'flex h-10 w-10 items-center justify-center rounded-2xl ' + card.tone}><card.icon className="h-5 w-5" /></span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{statusFilter === card.key ? 'Active' : 'View'}</span>
                  </div>
                  <p className="mt-4 text-2xl font-bold text-[var(--color-text-primary)]">{card.count}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--color-text-tertiary)]">{card.label}</p>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setScheduleFilter('auto'); setStatusFilter(''); }}
                className={'group rounded-2xl border bg-[var(--color-surface-primary)] p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ' + (scheduleFilter === 'auto' ? 'border-violet-400 ring-2 ring-violet-500/10' : 'border-[var(--color-border-default)]')}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300"><CalendarDays className="h-5 w-5" /></span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Auto</span>
                </div>
                <p className="mt-4 text-2xl font-bold text-[var(--color-text-primary)]">{autoCount}</p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--color-text-tertiary)]">Auto Scheduled</p>
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(130px,.7fr))]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search exams, subjects or rooms..."
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20">
                  <option value="">All Status</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20">
                  <option value="">All Classes</option>
                  {classOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20">
                  <option value="">All Departments</option>
                  {departmentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <input type="date" value={dateFilter} onChange={(e) => setCalendarDate(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-xl bg-[var(--color-surface-secondary)] p-1">
                  {([
                    { key: 'all', label: 'All', count: exams.length },
                    { key: 'manual', label: 'Manual', count: manualCount },
                    { key: 'auto', label: 'Automatic', count: autoCount },
                  ] as const).map((tab) => (
                    <button key={tab.key} type="button" onClick={() => setScheduleFilter(tab.key)} className={'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ' + (scheduleFilter === tab.key ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]')}>
                      {tab.label} <span className="ml-1 opacity-75">{tab.count}</span>
                    </button>
                  ))}
                </div>
                {(statusFilter || scheduleFilter !== 'all' || classFilter || departmentFilter || dateFilter) && (
                  <button type="button" onClick={clearFilters} className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Clear filters</button>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm">
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--color-surface-secondary)] p-1">
                <button
                  type="button"
                  onClick={() => setActiveWorkspaceTab('schedule')}
                  className={'flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ' + (activeWorkspaceTab === 'schedule' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-primary)]')}
                >
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  <span className="truncate">Exam Schedule</span>
                  <span className={'rounded-full px-1.5 py-0.5 text-[10px] font-bold ' + (activeWorkspaceTab === 'schedule' ? 'bg-white/20 text-white' : 'bg-[var(--color-surface-primary)] text-[var(--color-text-tertiary)]')}>{visibleExams.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkspaceTab('tools')}
                  className={'flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ' + (activeWorkspaceTab === 'tools' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-primary)]')}
                >
                  <LayoutGrid className="h-4 w-4 shrink-0" />
                  <span className="truncate">Quick Tools</span>
                  <span className={'rounded-full px-1.5 py-0.5 text-[10px] font-bold ' + (activeWorkspaceTab === 'tools' ? 'bg-white/20 text-white' : 'bg-[var(--color-surface-primary)] text-[var(--color-text-tertiary)]')}>4</span>
                </button>
              </div>
            </div>

            {activeWorkspaceTab === 'tools' && (
              <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
                <div className="mb-4">
                  <h2 className="font-bold text-[var(--color-text-primary)]">Quick Tools</h2>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Choose the exam tool you need.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <a href="/admin/exams/rooms" className="group flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Building2 className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="text-sm font-bold text-[var(--color-text-primary)]">Room Allocation</p><p className="truncate text-[11px] text-[var(--color-text-tertiary)]">Assign halls and seats</p></div>
                  </a>
                  <a href="/admin/exams/attendance" className="group flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><Users className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="text-sm font-bold text-[var(--color-text-primary)]">Exam Attendance</p><p className="truncate text-[11px] text-[var(--color-text-tertiary)]">Track student attendance</p></div>
                  </a>
                  <a href="/admin/exams/papers" className="group flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white"><FileCheck2 className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="text-sm font-bold text-[var(--color-text-primary)]">Paper Approval</p><p className="truncate text-[11px] text-[var(--color-text-tertiary)]">Review question papers</p></div>
                  </a>
                  <a href="/admin/exams/grading-rules" className="group flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-sm dark:border-violet-900/40 dark:bg-violet-950/20">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><Percent className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="text-sm font-bold text-[var(--color-text-primary)]">Grading Rules</p><p className="truncate text-[11px] text-[var(--color-text-tertiary)]">Configure marks and grades</p></div>
                  </a>
                </div>
              </section>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30">
                <p>{error}</p>
                <button onClick={fetchData} className="mt-1 font-bold text-primary-600 hover:underline">Retry</button>
              </div>
            )}

            {activeWorkspaceTab === 'schedule' && (
              <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
                <div className="flex flex-col gap-2 border-b border-[var(--color-border-subtle)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-bold text-[var(--color-text-primary)]">Scheduled Exams <span className="text-[var(--color-text-tertiary)]">({visibleExams.length})</span></h2>
                    <p className="text-xs text-[var(--color-text-tertiary)]">Click any row to see the full exam details.</p>
                  </div>
                  {selected.size > 0 && <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">{selected.size} selected</span>}
                </div>
  
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[940px] text-sm">
                    <thead className="bg-[var(--color-surface-secondary)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                      <tr>
                        <th className="w-12 px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30" /></th>
                        <th className="px-4 py-3">Exam Title</th>
                        <th className="px-4 py-3">Class</th>
                        <th className="px-4 py-3">Course</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3">Room</th>
                        <th className="px-4 py-3 text-center">Marks</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="w-16 px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-subtle)]">
                      {visibleExams.length === 0 ? (
                        <tr><td colSpan={10} className="px-4 py-14 text-center text-[var(--color-text-tertiary)]"><p className="font-semibold">No exams found</p><p className="mt-1 text-xs">Change the filters or schedule a new exam.</p></td></tr>
                      ) : visibleExams.map((exam) => {
                        const cls = exam.course?.class;
                        const classLabel = cls?.title ? (cls.section ? cls.title + ' - ' + cls.section : cls.title) : '—';
                        return (
                          <tr key={exam._id} onClick={() => setViewingExam(exam)} className="cursor-pointer transition-colors hover:bg-[var(--color-surface-secondary)]">
                            <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(exam._id)} onChange={() => toggleSelected(exam._id)} className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30" /></td>
                            <td className="px-4 py-3.5"><p className="font-bold text-[var(--color-text-primary)]" dir="auto">{toTitleCase(exam.title)}</p><p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{exam.autoSchedule ? 'Automatic exam window' : exam.duration + ' minutes'}</p></td>
                            <td className="px-4 py-3.5 text-[var(--color-text-secondary)]">{classLabel}</td>
                            <td className="px-4 py-3.5"><span className="font-medium text-[var(--color-text-secondary)]">{exam.course?.title?.en || 'Course missing'}</span></td>
                            <td className="px-4 py-3.5 text-[var(--color-text-secondary)]">{exam.autoSchedule ? 'Automatic' : exam.examDate ? new Date(exam.examDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                            <td className="px-4 py-3.5 text-[var(--color-text-secondary)]">{exam.autoSchedule ? 'Personal window' : exam.startTime && exam.endTime ? exam.startTime + ' – ' + exam.endTime : '—'}</td>
                            <td className="px-4 py-3.5 text-[var(--color-text-secondary)]">{exam.room || '—'}</td>
                            <td className="px-4 py-3.5 text-center font-semibold">{exam.totalMarks}</td>
                            <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}><StatusPillSelect status={getEffectiveStatus(exam)} onChange={(value) => handleStatusChange(exam._id, value)} /></td>
                            <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}><RowActionsMenu onView={() => setViewingExam(exam)} onEdit={() => setEditingExam(exam)} onDelete={() => handleDelete(exam._id)} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
  
                <div className="divide-y divide-[var(--color-border-subtle)] md:hidden">
                  {visibleExams.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">No exams found.</div>
                  ) : visibleExams.map((exam) => {
                    const cls = exam.course?.class;
                    const classLabel = cls?.title ? (cls.section ? cls.title + ' - ' + cls.section : cls.title) : '—';
                    return (
                      <button key={exam._id} type="button" onClick={() => setViewingExam(exam)} className="w-full p-4 text-left transition-colors hover:bg-[var(--color-surface-secondary)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="truncate font-bold text-[var(--color-text-primary)]">{toTitleCase(exam.title)}</p><p className="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)]">{classLabel} · {exam.course?.title?.en || 'Course missing'}</p></div>
                          <StatusBadge status={getEffectiveStatus(exam)} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><p className="text-[10px] uppercase text-[var(--color-text-tertiary)]">Date</p><p className="mt-1 text-xs font-semibold">{exam.autoSchedule ? 'Automatic' : exam.examDate ? new Date(exam.examDate).toLocaleDateString() : '—'}</p></div>
                          <div className="rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><p className="text-[10px] uppercase text-[var(--color-text-tertiary)]">Time / Marks</p><p className="mt-1 text-xs font-semibold">{exam.autoSchedule ? 'Personal window' : exam.startTime || '—'} · {exam.totalMarks}</p></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
              )}
          </main>

        </div>
      </div>

      {showCreate && <ExamModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchData(); }} />}
      {editingExam && <ExamModal exam={editingExam} onClose={() => setEditingExam(undefined)} onSaved={() => { setEditingExam(undefined); fetchData(); }} />}
      {viewingExam && <ViewModal exam={viewingExam} onClose={() => setViewingExam(undefined)} />}
      {showImportModal && <ExamsImportModal onClose={() => setShowImportModal(false)} onImported={fetchData} />}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setShowBulkDeleteModal(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-primary)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/30"><Trash2 className="h-5 w-5" /></div>
              <h2 className="text-lg font-bold">Bulk Delete Exams</h2>
            </div>
            <p className="mb-5 text-sm text-[var(--color-text-secondary)]">Delete the selected <strong>{selected.size}</strong> exam{selected.size !== 1 ? 's' : ''}? This action cannot be undone.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowBulkDeleteModal(false)} disabled={bulkDeleting} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium">Cancel</button>
              <button type="button" onClick={handleBulkDelete} disabled={bulkDeleting} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{bulkDeleting ? 'Deleting...' : 'Delete ' + selected.size}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default ExamsManage;