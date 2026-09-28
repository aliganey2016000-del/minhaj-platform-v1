/**
 * Exam Management — Admin Full CRUD
 * Lists, creates, edits, deletes exams via /api/v1/exams
 */

import { Fragment, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { CalendarClock, CalendarDays, PlayCircle, CheckCircle2, MoreVertical, Pencil, Trash2, Eye, Search, LayoutGrid, List, Upload, Download, X, ShieldCheck, Building2, Clock3, ArrowLeft, ChevronRight, ChevronDown, Printer, RotateCcw } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { toTitleCase } from '../../../lib/format';
import { BackButton } from '../../shared/components/back-button';
import { AcademicYearSelect } from '../../shared/components/academic-year-select';
import { ExamWorkspaceTabs } from '../components/exam-workspace-tabs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseBrief {
  _id: string;
  title: { en: string };
  slug: string;
  category: string;
  status?: string;
  enrolledStudents: number | unknown[];
  teacher?: {
    _id?: string;
    profile?: { firstName?: string; lastName?: string } | null;
    user?: { email?: string } | null;
  } | null;
  class?: {
    _id?: string;
    title?: string;
    section?: string;
    department?: { _id?: string; name?: string } | null;
  } | null;
}

interface SchoolBrief { _id: string; name: string; status?: string; }
interface DepartmentBrief { _id: string; name: string; }
interface ClassBrief {
  _id: string;
  title: string;
  section: string;
  academicYear?: string;
  department?: { _id?: string; name?: string } | null;
}

interface ExamPeriod {
  _id: string;
  name: string;
  academicYear: string;
  term?: string;
  startDate?: string | null;
  endDate?: string | null;
  status: 'draft' | 'published' | 'closed';
  school?: string | SchoolBrief;
}

interface Exam {
  _id: string;
  title: string;
  course: CourseBrief;
  school?: string | SchoolBrief;
  period?: string | ExamPeriod | null;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  room: string;
  instructions: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  schedulePlaced?: boolean;
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

function CheckboxMultiFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string; count?: number }>;
  selected: string[] | null;
  onChange: (value: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allSelected = selected === null || selected.length === options.length;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggleOption = (value: string) => {
    const current = selected === null ? options.map((option) => option.value) : selected;
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];

    onChange(next.length === options.length ? null : next);
  };

  const summary = selected === null
    ? label
    : selected.length === 0
      ? 'None selected'
      : selected.length === 1
        ? options.find((option) => option.value === selected[0])?.label || label
        : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-left text-sm outline-none transition hover:border-primary-300 focus:ring-2 focus:ring-primary-500/20"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-[90] mt-1 max-h-72 overflow-y-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2 shadow-2xl">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold hover:bg-[var(--color-surface-secondary)]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange(allSelected ? [] : null)}
              className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30"
            />
            <span className="flex-1">All</span>
            <span className="text-xs text-[var(--color-text-tertiary)]">{options.length}</span>
          </label>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          {options.map((option) => {
            const checked = selected === null || selected.includes(option.value);
            return (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-[var(--color-surface-secondary)]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOption(option.value)}
                  className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30"
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.count !== undefined && <span className="text-xs text-[var(--color-text-tertiary)]">{option.count}</span>}
              </label>
            );
          })}
          {options.length === 0 && <p className="px-2.5 py-3 text-xs text-[var(--color-text-tertiary)]">No options available.</p>}
        </div>
      )}
    </div>
  );
}

function AnnualExamActionsMenu({
  onEdit,
  onDelete,
  disabled = false,
}: {
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label="Exam actions"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] shadow-sm transition-all hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-950/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-[80] w-44 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-1 shadow-2xl">
          <button type="button" onClick={(event) => { event.stopPropagation(); run(onEdit); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]">
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button type="button" onClick={(event) => { event.stopPropagation(); run(onDelete); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

type DepartmentCellTarget = {
  date: string;
  shiftIndex: number;
};

function DepartmentalExamView({
  exams,
  period,
  classes,
  onChanged,
}: {
  exams: Exam[];
  period?: ExamPeriod;
  classes: ClassBrief[];
  onChanged: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [selectedDepartmentKey, setSelectedDepartmentKey] = useState('');
  const [printBranding, setPrintBranding] = useState<{ name?: string; branding?: { logo?: string } }>({});
  const [departmentEditMode, setDepartmentEditMode] = useState(false);
  const [cellTarget, setCellTarget] = useState<DepartmentCellTarget | null>(null);
  const [savingCell, setSavingCell] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resettingSchedule, setResettingSchedule] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [moveSuccess, setMoveSuccess] = useState('');

  const departmentSchoolId = useMemo(() => {
    if (typeof period?.school === 'string') return period.school;
    if (period?.school?._id) return period.school._id;
    return String((user as any)?.organizationId?._id || (user as any)?.organizationId || '');
  }, [period?.school, user]);

  useEffect(() => {
    let cancelled = false;
    if (!departmentSchoolId) {
      setPrintBranding({});
      return;
    }
    void api.get(`/schools/${departmentSchoolId}/branding`)
      .then((response) => {
        if (!cancelled) setPrintBranding(response.data?.data?.school || {});
      })
      .catch(() => {
        if (!cancelled) setPrintBranding({});
      });
    return () => { cancelled = true; };
  }, [departmentSchoolId]);

  const allFixed = useMemo(
    () => exams
      .filter((exam) => !exam.autoSchedule && exam.status !== 'cancelled')
      .sort((a, b) => examDateKey(a).localeCompare(examDateKey(b)) || compareExamTimes(a, b)),
    [exams],
  );

  const normalizeDepartmentKey = (id: unknown, name: unknown) => {
    const normalizedId = String(id || '').trim();
    if (normalizedId) return normalizedId;
    const normalizedName = String(name || '').trim().toLowerCase();
    return normalizedName.replace(/[^a-z0-9]+/g, '-') || 'unassigned';
  };

  const departmentOfExam = (exam: Exam) => {
    const department = exam.course?.class?.department;
    const name = String(department?.name || '').trim();
    return {
      key: normalizeDepartmentKey(department?._id, name),
      name: name || 'Unassigned Department',
    };
  };

  const departmentDefinitions = useMemo(() => {
    const values = new Map<string, { key: string; name: string }>();

    for (const cls of classes) {
      const name = String(cls.department?.name || '').trim();
      const key = normalizeDepartmentKey(cls.department?._id, name);
      if (key === 'unassigned') continue;
      if (!values.has(key)) values.set(key, { key, name: name || 'Department' });
    }

    for (const exam of allFixed) {
      const department = departmentOfExam(exam);
      if (!values.has(department.key)) values.set(department.key, department);
    }

    return Array.from(values.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [classes, allFixed]);

  // Keep the grid shape after Reset by deriving its days/shifts from all
  // department exam records, including temporarily unplaced ones.
  const shifts = useMemo(() => {
    const map = new Map<string, { key: string; startTime: string; endTime: string }>();
    allFixed.forEach((exam) => {
      if (!exam.startTime || !exam.endTime) return;
      const key = `${exam.startTime}::${exam.endTime}`;
      if (!map.has(key)) map.set(key, { key, startTime: exam.startTime, endTime: exam.endTime });
    });
    return Array.from(map.values()).sort((a, b) =>
      a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
    );
  }, [allFixed]);

  const dates = useMemo(
    () => Array.from(new Set(allFixed.map(examDateKey).filter(Boolean))).sort(),
    [allFixed],
  );

  const schedules = useMemo(() => departmentDefinitions.map((department) => {
    const departmentExams = allFixed.filter((exam) => departmentOfExam(exam).key === department.key);
    const placedExams = departmentExams.filter((exam) => exam.schedulePlaced !== false && exam.examDate);

    const classIds = new Set(
      classes
        .filter((cls) => normalizeDepartmentKey(cls.department?._id, cls.department?.name) === department.key)
        .map((cls) => cls._id)
        .filter(Boolean),
    );

    departmentExams.forEach((exam) => {
      const classId = exam.course?.class?._id;
      if (classId) classIds.add(classId);
    });

    const subjectGroups = new Map<string, { subject: string; examIds: string[]; placed: boolean }>();
    for (const exam of departmentExams) {
      const subject = exam.course?.title?.en || exam.title || 'Exam';
      const current = subjectGroups.get(subject) || { subject, examIds: [], placed: false };
      current.examIds.push(exam._id);
      if (exam.schedulePlaced !== false && exam.examDate) current.placed = true;
      subjectGroups.set(subject, current);
    }

    const cells = new Map<string, Array<{ subject: string }>>();
    dates.forEach((date) => {
      shifts.forEach((shift) => {
        const subjects = new Set<string>();
        placedExams
          .filter((exam) =>
            examDateKey(exam) === date
            && exam.startTime === shift.startTime
            && exam.endTime === shift.endTime
          )
          .forEach((exam) => subjects.add(exam.course?.title?.en || exam.title || 'Exam'));

        cells.set(
          `${date}::${shift.key}`,
          Array.from(subjects)
            .map((subject) => ({ subject }))
            .sort((a, b) => a.subject.localeCompare(b.subject, undefined, { numeric: true, sensitivity: 'base' })),
        );
      });
    });

    return {
      key: department.key,
      name: department.name,
      title: `${department.name} Schedule`,
      subtitle: `All classes in ${department.name} combined into one exam schedule.`,
      exams: departmentExams,
      placedExams,
      subjects: Array.from(subjectGroups.values()).sort((a, b) =>
        a.subject.localeCompare(b.subject, undefined, { numeric: true, sensitivity: 'base' })
      ),
      classCount: classIds.size,
      cells,
    };
  }), [classes, dates, departmentDefinitions, allFixed, shifts]);

  useEffect(() => {
    if (!schedules.length) {
      if (selectedDepartmentKey) setSelectedDepartmentKey('');
      return;
    }
    if (selectedDepartmentKey && schedules.some((schedule) => schedule.key === selectedDepartmentKey)) return;
    setSelectedDepartmentKey(schedules[0].key);
  }, [schedules, selectedDepartmentKey]);

  const selectedSchedule = useMemo(
    () => schedules.find((schedule) => schedule.key === selectedDepartmentKey) || schedules[0],
    [schedules, selectedDepartmentKey],
  );

  const openCellPicker = (date: string, shiftIndex: number) => {
    if (!departmentEditMode || savingCell || resettingSchedule) return;
    setMoveError('');
    setMoveSuccess('');
    setCellTarget({ date, shiftIndex });
  };

  const assignSubjectToCell = async (subject: string) => {
    if (!period?._id || !departmentSchoolId || !selectedSchedule || !cellTarget) return;
    const shift = shifts[cellTarget.shiftIndex];
    const subjectGroup = selectedSchedule.subjects.find((item) => item.subject === subject);
    if (!shift || !subjectGroup?.examIds.length) return;

    const displacedExamIds = selectedSchedule.placedExams
      .filter((exam) =>
        examDateKey(exam) === cellTarget.date
        && exam.startTime === shift.startTime
        && exam.endTime === shift.endTime
      )
      .map((exam) => exam._id);

    setSavingCell(true);
    setMoveError('');
    setMoveSuccess('');
    try {
      const response = await api.post(`/exams/periods/${period._id}/assign-schedule-cell`, {
        school: departmentSchoolId,
        examIds: subjectGroup.examIds,
        displacedExamIds,
        targetDate: cellTarget.date,
        targetShiftIndex: cellTarget.shiftIndex,
      });
      const placed = Number(response.data?.data?.placed || subjectGroup.examIds.length);
      const displaced = Number(response.data?.data?.displaced || 0);
      setCellTarget(null);
      setMoveSuccess(
        displaced > 0
          ? `${subject} placed here for ${placed} class${placed === 1 ? '' : 'es'}; the previous course is now unassigned.`
          : `${subject} placed here for ${placed} class${placed === 1 ? '' : 'es'}.`
      );
      await onChanged();
    } catch (err: any) {
      setMoveError(err?.response?.data?.message || 'Could not update this timetable cell.');
    } finally {
      setSavingCell(false);
    }
  };

  const resetDepartmentSchedule = async () => {
    if (!period?._id || !departmentSchoolId || !selectedSchedule?.exams.length) return;
    setResettingSchedule(true);
    setMoveError('');
    setMoveSuccess('');
    try {
      const response = await api.post(`/exams/periods/${period._id}/reset-department-schedule`, {
        school: departmentSchoolId,
        examIds: selectedSchedule.exams.map((exam) => exam._id),
      });
      const reset = Number(response.data?.data?.reset || selectedSchedule.exams.length);
      setResetConfirmOpen(false);
      setCellTarget(null);
      setMoveSuccess(`${reset} paper${reset === 1 ? '' : 's'} cleared. All ${selectedSchedule.name} cells are blank and ready to assign.`);
      await onChanged();
    } catch (err: any) {
      setMoveError(err?.response?.data?.message || 'Could not reset this department schedule.');
    } finally {
      setResettingSchedule(false);
    }
  };

  const cellTargetShift = cellTarget ? shifts[cellTarget.shiftIndex] : undefined;
  const cellTargetItems = cellTarget && cellTargetShift && selectedSchedule
    ? selectedSchedule.cells.get(`${cellTarget.date}::${cellTargetShift.key}`) || []
    : [];
  const cellTargetSubjects = new Set(cellTargetItems.map((item) => item.subject));

  const minWidth = Math.max(760, 170 + shifts.length * 260 + Math.max(0, shifts.length - 1) * 110);
  const departmentSchoolName = printBranding.name
    || (typeof period?.school === 'object' ? period.school?.name : '')
    || (user as any)?.organizationName
    || 'Organization';
  const departmentLogo = printBranding.branding?.logo || '';
  const generatedOn = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());

  if (!allFixed.length) {
    return (
      <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center shadow-sm">
        <Building2 className="mx-auto h-9 w-9 text-[var(--color-text-tertiary)]" />
        <h2 className="mt-3 text-base font-bold text-[var(--color-text-primary)]">No departmental schedule yet</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-[var(--color-text-tertiary)]">
          Build the exam schedule first. Departmental View automatically creates one combined schedule for every department.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <style>{`
        .exam-department-print-only { display: none; }

        @media (max-width: 639px) {
          .exam-department-scroll {
            overflow-x: hidden !important;
          }
          .exam-department-table {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
          }
          .exam-department-day-col {
            width: 23% !important;
            max-width: 23% !important;
            padding: 6px 5px !important;
          }
          .exam-department-shift-head {
            padding: 7px 3px !important;
          }
          .exam-department-shift-head > div:first-child {
            font-size: 12px !important;
            line-height: 1.15 !important;
          }
          .exam-department-shift-head > div:last-child {
            margin-top: 2px !important;
            font-size: 9px !important;
            line-height: 1.15 !important;
            white-space: nowrap !important;
          }
          .exam-department-break-col {
            width: 12% !important;
            max-width: 12% !important;
            padding: 4px 2px !important;
          }
          .exam-department-break-col > div:first-child,
          .exam-department-break-label {
            font-size: 9px !important;
            line-height: 1.1 !important;
            letter-spacing: .02em !important;
          }
          .exam-department-break-col > div:last-child {
            font-size: 8px !important;
            line-height: 1.1 !important;
            white-space: normal !important;
          }
          .exam-department-table tbody tr {
            height: auto !important;
          }
          .exam-department-shift-cell {
            height: auto !important;
            padding: 3px !important;
            vertical-align: middle !important;
          }
          .exam-department-shift-cell > div {
            margin: 0 !important;
          }
          .exam-department-subject {
            min-height: 36px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 10px !important;
            padding: 5px 4px !important;
            text-align: center !important;
          }
          .exam-department-subject p {
            font-size: clamp(11px, 3.1vw, 13px) !important;
            line-height: 1.22 !important;
            font-weight: 800 !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
          }
          .exam-department-day-col > div:first-child {
            font-size: 9px !important;
          }
          .exam-department-day-col > div:nth-child(2) {
            margin-top: 2px !important;
            font-size: 12px !important;
            line-height: 1.15 !important;
          }
          .exam-department-day-col > div:last-child {
            font-size: 10px !important;
          }
        }

        @media print {
          @page { size: A4 landscape; margin: 7mm; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden !important; }
          #exam-department-print,
          #exam-department-print * { visibility: visible !important; }
          #exam-department-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #111827 !important;
          }
          #exam-department-print .exam-department-print-only {
            display: block !important;
          }
          #exam-department-print .exam-print-header {
            display: grid !important;
            grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.35fr) minmax(180px, .8fr) !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 2mm 1mm 3.5mm !important;
            border-bottom: 2px solid #0f766e !important;
          }
          #exam-department-print .exam-print-brand {
            display: flex !important;
            align-items: center !important;
            gap: 9px !important;
            min-width: 0 !important;
          }
          #exam-department-print .exam-print-logo,
          #exam-department-print .exam-print-logo-fallback {
            width: 44px !important;
            height: 44px !important;
            flex: 0 0 44px !important;
          }
          #exam-department-print .exam-print-logo {
            object-fit: contain !important;
          }
          #exam-department-print .exam-print-logo-fallback {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border: 2px solid #0f766e !important;
            border-radius: 10px !important;
            background: #ecfdf5 !important;
            font-size: 19px !important;
            font-weight: 900 !important;
          }
          #exam-department-print .exam-print-school-name {
            font-size: 13px !important;
            line-height: 1.15 !important;
            font-weight: 900 !important;
          }
          #exam-department-print .exam-print-kicker {
            margin-top: 3px !important;
            font-size: 7.5px !important;
            line-height: 1.15 !important;
            font-weight: 800 !important;
            letter-spacing: .08em !important;
            text-transform: uppercase !important;
            color: #475569 !important;
          }
          #exam-department-print .exam-print-title {
            text-align: center !important;
          }
          #exam-department-print .exam-print-title h1 {
            margin: 0 !important;
            font-size: 20px !important;
            line-height: 1.05 !important;
            font-weight: 900 !important;
            letter-spacing: -.02em !important;
          }
          #exam-department-print .exam-print-title p {
            margin: 5px 0 0 !important;
            font-size: 10px !important;
            line-height: 1.15 !important;
            font-weight: 800 !important;
            color: #334155 !important;
          }
          #exam-department-print .exam-print-meta {
            display: grid !important;
            gap: 3px !important;
            justify-self: end !important;
            min-width: 180px !important;
            font-size: 8px !important;
            line-height: 1.2 !important;
          }
          #exam-department-print .exam-print-meta-row {
            display: grid !important;
            grid-template-columns: auto 1fr !important;
            gap: 5px !important;
          }
          #exam-department-print .exam-print-meta-label {
            font-weight: 900 !important;
            color: #475569 !important;
          }
          #exam-department-print > div:not(.exam-department-print-only) {
            border-color: #cbd5e1 !important;
          }
          #exam-department-print .exam-department-scroll {
            overflow: visible !important;
          }
          #exam-department-print table {
            min-width: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-size: 9.4px !important;
            color: #111827 !important;
          }
          #exam-department-print thead {
            display: table-header-group !important;
          }
          #exam-department-print tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          #exam-department-print th {
            background: #eaf4fb !important;
            font-size: 9px !important;
            line-height: 1.15 !important;
            font-weight: 900 !important;
          }
          #exam-department-print th,
          #exam-department-print td {
            color: #111827 !important;
            padding: 6px 5px !important;
            border: 1px solid #cbd5e1 !important;
            vertical-align: middle !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }
          #exam-department-print .exam-print-subject-card {
            border: 1px solid #b9d8d1 !important;
            border-radius: 5px !important;
            background: #f0fdfa !important;
            padding: 6px !important;
            break-inside: avoid !important;
          }
          #exam-department-print .exam-print-subject-card p {
            font-size: 10.5px !important;
            line-height: 1.16 !important;
            font-weight: 900 !important;
            color: #0f172a !important;
          }
          #exam-department-print .exam-print-footer {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 10px !important;
            margin-top: 3mm !important;
            padding: 2.5mm 1mm 0 !important;
            border-top: 1px solid #94a3b8 !important;
            font-size: 7.5px !important;
            font-weight: 700 !important;
            color: #475569 !important;
          }
        }
      `}</style>

      <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm sm:gap-3 sm:p-4">
        <label className="min-w-0 flex-1">
          <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Department</span>
          <select
            value={selectedSchedule?.key || ''}
            onChange={(e) => {
              setSelectedDepartmentKey(e.target.value);
              setCellTarget(null);
              setResetConfirmOpen(false);
              setMoveError('');
              setMoveSuccess('');
            }}
            className="w-full min-w-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm font-semibold"
          >
            {schedules.map((schedule) => (
              <option key={schedule.key} value={schedule.key}>{schedule.name}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            setDepartmentEditMode((current) => !current);
            setCellTarget(null);
            setMoveError('');
            setMoveSuccess('');
          }}
          disabled={!selectedSchedule || selectedSchedule.exams.length === 0 || savingCell || resettingSchedule}
          className={`inline-flex h-[40px] shrink-0 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-bold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:h-[42px] sm:gap-2 sm:px-4 sm:text-sm ${
            departmentEditMode
              ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
              : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
          }`}
        >
          <Pencil className="h-4 w-4" />
          <span>{departmentEditMode ? 'Done' : 'Edit'}</span>
        </button>

        <button
          type="button"
          onClick={() => setResetConfirmOpen(true)}
          disabled={!selectedSchedule || selectedSchedule.exams.length === 0 || savingCell || resettingSchedule}
          className="inline-flex h-[40px] shrink-0 items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 text-xs font-bold text-red-700 shadow-sm transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300 sm:h-[42px] sm:gap-2 sm:px-4 sm:text-sm"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset</span>
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          disabled={!selectedSchedule || selectedSchedule.placedExams.length === 0 || departmentEditMode || savingCell || resettingSchedule}
          className="inline-flex h-[40px] shrink-0 items-center justify-center gap-1 rounded-xl bg-primary-600 px-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 sm:h-[42px] sm:gap-2 sm:px-4 sm:text-sm"
        >
          <Printer className="h-4 w-4" />
          <span className="sm:hidden">Print</span>
          <span className="hidden sm:inline">Print Department</span>
        </button>
      </div>

      {departmentEditMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          Tap any Shift cell — filled or blank — then choose a course. A checked course already has a timetable position; an unchecked course is currently unassigned.
        </div>
      )}
      {moveError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {moveError}
        </div>
      )}
      {moveSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          {moveSuccess}
        </div>
      )}

      {!selectedSchedule ? (
        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 text-center text-sm text-[var(--color-text-tertiary)]">
          No departments were found for the active classes in this examination.
        </section>
      ) : (
        <section id="exam-department-print" className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
          <div className="exam-department-print-only exam-print-header">
            <div className="exam-print-brand">
              {departmentLogo ? (
                <img className="exam-print-logo" src={departmentLogo} alt="" />
              ) : (
                <div className="exam-print-logo-fallback">{departmentSchoolName.charAt(0).toUpperCase()}</div>
              )}
              <div>
                <div className="exam-print-school-name">{departmentSchoolName}</div>
                <div className="exam-print-kicker">Official Examination Schedule</div>
              </div>
            </div>
            <div className="exam-print-title">
              <h1>{selectedSchedule.name} Exam Schedule</h1>
              <p>{period?.name || 'Examination'}</p>
            </div>
            <div className="exam-print-meta">
              <div className="exam-print-meta-row"><span className="exam-print-meta-label">Academic Year</span><span>{period?.academicYear || '—'}</span></div>
              <div className="exam-print-meta-row"><span className="exam-print-meta-label">Term</span><span>{period?.term || '—'}</span></div>
              <div className="exam-print-meta-row"><span className="exam-print-meta-label">Generated</span><span>{generatedOn}</span></div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/30 dark:text-primary-300">
                <Building2 className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-bold text-[var(--color-text-primary)]">{selectedSchedule.title}</h2>
                <p className="text-xs text-[var(--color-text-tertiary)]">{selectedSchedule.subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-[var(--color-surface-secondary)] px-3 py-1.5">{selectedSchedule.classCount} classes</span>
              <span className="rounded-full bg-[var(--color-surface-secondary)] px-3 py-1.5">{selectedSchedule.exams.length} papers</span>
            </div>
          </div>

          {selectedSchedule.exams.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">
              This department has active classes, but no exam papers are scheduled yet.
            </div>
          ) : (
            <div className="exam-department-scroll max-w-full overflow-x-hidden overscroll-x-contain sm:overflow-x-auto [scrollbar-width:thin]">
              <table className="exam-department-table w-full border-collapse text-xs sm:text-sm" style={{ minWidth, tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="exam-department-day-col w-40 border-b border-r border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-3 text-left text-[11px] font-extrabold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                      Day / Date
                    </th>
                    {shifts.map((shift, index) => (
                      <Fragment key={shift.key}>
                        <th className="exam-department-shift-head border-b border-r border-[var(--color-border-default)] bg-primary-50/50 px-3 py-3 text-center dark:bg-primary-950/10">
                          <div className="font-extrabold text-primary-700 dark:text-primary-300">Shift {index + 1}</div>
                          <div className="mt-0.5 text-[10px] font-semibold text-[var(--color-text-tertiary)]">{shift.startTime}–{shift.endTime}</div>
                        </th>
                        {index < shifts.length - 1 && (
                          <th className="exam-department-break-col w-28 border-b border-r border-[var(--color-border-default)] bg-amber-50/50 px-2 py-3 text-center dark:bg-amber-950/10">
                            <div className="text-[10px] font-extrabold uppercase text-amber-700 dark:text-amber-300">Break</div>
                            <div className="mt-0.5 text-[9px] font-semibold text-amber-600/80 dark:text-amber-400">
                              {shift.endTime}–{shifts[index + 1].startTime}
                            </div>
                          </th>
                        )}
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((date, dayIndex) => {
                    const parsed = new Date(`${date}T00:00:00`);
                    return (
                      <tr key={date} className="align-top">
                        <td className="exam-department-day-col border-b border-r border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-4">
                          <div className="text-[10px] font-extrabold uppercase tracking-wide text-primary-600">Day {dayIndex + 1}</div>
                          <div className="mt-1 font-bold text-[var(--color-text-primary)]">
                            {parsed.toLocaleDateString(undefined, { weekday: 'short' })}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-tertiary)]">
                            {parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                          </div>
                        </td>
                        {shifts.map((shift, index) => {
                          const items = selectedSchedule.cells.get(`${date}::${shift.key}`) || [];
                          return (
                            <Fragment key={shift.key}>
                              <td
                                className={`exam-department-shift-cell border-b border-r border-[var(--color-border-default)] p-2.5 align-middle transition-colors ${
                                  departmentEditMode
                                    ? 'cursor-pointer bg-primary-50/20 hover:bg-amber-50/70 dark:bg-primary-950/5 dark:hover:bg-amber-950/15'
                                    : ''
                                }`}
                                onClick={() => openCellPicker(date, index)}
                                role={departmentEditMode ? 'button' : undefined}
                                tabIndex={departmentEditMode ? 0 : undefined}
                                onKeyDown={(event) => {
                                  if (!departmentEditMode) return;
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    openCellPicker(date, index);
                                  }
                                }}
                              >
                                {items.length === 0 ? (
                                  <div className={`flex min-h-16 items-center justify-center font-semibold ${
                                    departmentEditMode ? 'text-primary-600' : 'text-[var(--color-text-tertiary)]'
                                  }`}>
                                    {departmentEditMode ? 'Choose' : '—'}
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {items.map((item) => (
                                      <div
                                        key={item.subject}
                                        className={`exam-department-subject exam-print-subject-card w-full rounded-xl border border-primary-100 bg-primary-50/40 p-2.5 dark:border-primary-900/30 dark:bg-primary-950/10 ${
                                          departmentEditMode ? 'ring-1 ring-amber-300/70' : ''
                                        }`}
                                      >
                                        <p className="font-bold text-[var(--color-text-primary)]">{item.subject}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              {index < shifts.length - 1 && (
                                <td className="exam-department-break-col border-b border-r border-[var(--color-border-default)] bg-amber-50/20 p-2 text-center align-middle dark:bg-amber-950/5">
                                  <span className="exam-department-break-label text-[9px] font-bold uppercase tracking-wide text-amber-600">Break</span>
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="exam-department-print-only exam-print-footer">
            <span>{departmentSchoolName} · {selectedSchedule.name}</span>
            <span>{period?.name || 'Exam'} · {period?.academicYear || ''}</span>
          </div>
        </section>
      )}

      {cellTarget && selectedSchedule && cellTargetShift && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-3 sm:items-center" onMouseDown={() => !savingCell && setCellTarget(null)}>
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] p-4 sm:p-5">
              <div>
                <h3 className="text-base font-bold text-[var(--color-text-primary)]">Choose Course</h3>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  {new Date(`${cellTarget.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })}
                  {' · '}Shift {cellTarget.shiftIndex + 1} · {cellTargetShift.startTime}–{cellTargetShift.endTime}
                </p>
              </div>
              <button type="button" onClick={() => !savingCell && setCellTarget(null)} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {cellTargetItems.length > 0 && (
              <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200 sm:mx-5">
                Current: {cellTargetItems.map((item) => item.subject).join(', ')}. Choosing another course removes the current course from this cell and marks it unassigned.
              </div>
            )}

            <div className="max-h-[58vh] overflow-y-auto p-3 sm:p-4">
              <div className="space-y-2">
                {selectedSchedule.subjects.map((group) => {
                  const currentHere = cellTargetSubjects.has(group.subject);
                  return (
                    <button
                      key={group.subject}
                      type="button"
                      onClick={() => void assignSubjectToCell(group.subject)}
                      disabled={savingCell}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition disabled:cursor-wait disabled:opacity-60 ${
                        currentHere
                          ? 'border-primary-300 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/20'
                          : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] hover:border-primary-300 hover:bg-[var(--color-surface-secondary)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={group.placed}
                        readOnly
                        tabIndex={-1}
                        className="h-5 w-5 shrink-0 rounded border-[var(--color-border-default)] accent-primary-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--color-text-primary)]">{group.subject}</span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-[var(--color-text-tertiary)]">
                          {currentHere ? 'Current cell' : group.placed ? 'Already scheduled — tap to move here' : 'Unassigned — tap to place here'}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--color-surface-secondary)] px-2 py-1 text-[10px] font-bold text-[var(--color-text-tertiary)]">
                        {group.examIds.length} classes
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {moveError && (
              <div className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300 sm:mx-5">
                {moveError}
              </div>
            )}
          </div>
        </div>
      )}

      {resetConfirmOpen && selectedSchedule && (
        <div className="fixed inset-0 z-[125] flex items-end justify-center bg-black/45 p-3 sm:items-center" onMouseDown={() => !resettingSchedule && setResetConfirmOpen(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-2xl sm:p-5"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300">
              <RotateCcw className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[var(--color-text-primary)]">Reset {selectedSchedule.name} Schedule?</h3>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
              All timetable cells for this department will become blank. Courses are not deleted; they remain available in Edit so you can assign them again.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
                disabled={resettingSchedule}
                className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-bold text-[var(--color-text-secondary)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void resetDepartmentSchedule()}
                disabled={resettingSchedule}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {resettingSchedule ? 'Resetting…' : 'Reset All Cells'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Header Actions — all page-level actions live behind one compact
// three-dot trigger beside the Exam Schedule heading.
// ---------------------------------------------------------------------------

function ExamsActionsMenu({
  onSchedule,
  onEditSchedule,
  onReuseSchedule,
  onAutoGenerate,
  onPeriodStatus,
  onByDay,
  onByClass,
  onByDepartment,
  departmentViewActive,
  scheduleContext,
  onRules,
  onImport,
  onExport,
  exporting,
  onBulkDelete,
  selectedCount,
}: {
  onSchedule: () => void;
  onEditSchedule: () => void;
  onReuseSchedule: () => void;
  onAutoGenerate: () => void;
  onPeriodStatus: () => void;
  onByDay: () => void;
  onByClass: () => void;
  onByDepartment: () => void;
  departmentViewActive: boolean;
  scheduleContext: {
    hasSelectedPeriod: boolean;
    periodStatus?: ExamPeriod['status'];
    perspective: 'day' | 'class';
    busy: boolean;
  };
  onRules: () => void;
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

  const periodActionDisabled = !scheduleContext.hasSelectedPeriod || scheduleContext.busy;
  const periodStatusLabel = scheduleContext.periodStatus === 'draft'
    ? 'Publish Exam'
    : scheduleContext.periodStatus === 'published'
      ? 'Close Exam'
      : scheduleContext.periodStatus === 'closed'
        ? 'Reopen as Draft'
        : 'Update Exam Status';

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
        <div className="absolute right-0 z-30 mt-1 max-h-[min(78vh,38rem)] w-60 overflow-y-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-1 text-left shadow-xl">
          <button onClick={() => { setOpen(false); onSchedule(); }} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} /> New Exam
          </button>
          <button onClick={() => { setOpen(false); onEditSchedule(); }} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
            <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} /> Edit Schedule
          </button>
          <button onClick={() => { setOpen(false); onReuseSchedule(); }} disabled={periodActionDisabled} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] disabled:cursor-not-allowed disabled:opacity-40 transition-colors">
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} /> Reuse Schedule
          </button>
          <button onClick={() => { setOpen(false); onAutoGenerate(); }} disabled={periodActionDisabled || scheduleContext.periodStatus === 'closed'} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-primary-700 hover:bg-[var(--color-surface-tertiary)] disabled:cursor-not-allowed disabled:opacity-40 dark:text-primary-300 transition-colors">
            <PlayCircle className="h-3.5 w-3.5" strokeWidth={1.75} /> Auto Generate
          </button>
          <button onClick={() => { setOpen(false); onPeriodStatus(); }} disabled={periodActionDisabled} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] disabled:cursor-not-allowed disabled:opacity-40 transition-colors">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} /> {periodStatusLabel}
          </button>

          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button onClick={() => { setOpen(false); onByDay(); }} disabled={periodActionDisabled} className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${scheduleContext.perspective === 'day' && !departmentViewActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/20 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} /> View By Date
          </button>
          <button onClick={() => { setOpen(false); onByClass(); }} disabled={periodActionDisabled} className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${scheduleContext.perspective === 'class' && !departmentViewActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/20 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>
            <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} /> View By Class
          </button>
          <button onClick={() => { setOpen(false); onByDepartment(); }} disabled={periodActionDisabled} className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${departmentViewActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/20 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>
            <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} /> View By Department
          </button>

          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button onClick={() => { setOpen(false); onRules(); }} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} /> Scheduling Rules
          </button>
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
// Exam Scheduling Rules
// ---------------------------------------------------------------------------

interface ExamShiftRule {
  name: string;
  startTime: string;
  endTime: string;
}

interface ExamScheduleRules {
  preventClassOverlap: boolean;
  allowSharedRooms: boolean;
  roomCapacityCheck: boolean;
  maxExamsPerClassPerDay: number;
  minimumGapMinutes: number;
  durationValidation: boolean;
  examShiftCount: number;
  examShifts: ExamShiftRule[];
  allowedExamDays: number[];
}

const DEFAULT_EXAM_SHIFTS: ExamShiftRule[] = [
  { name: 'Shift 1', startTime: '08:00', endTime: '10:00' },
  { name: 'Shift 2', startTime: '10:30', endTime: '12:30' },
  { name: 'Shift 3', startTime: '13:30', endTime: '15:30' },
  { name: 'Shift 4', startTime: '16:00', endTime: '18:00' },
];

const DEFAULT_EXAM_SCHEDULE_RULES: ExamScheduleRules = {
  preventClassOverlap: true,
  allowSharedRooms: true,
  roomCapacityCheck: true,
  maxExamsPerClassPerDay: 1,
  minimumGapMinutes: 30,
  durationValidation: true,
  examShiftCount: 2,
  examShifts: DEFAULT_EXAM_SHIFTS.slice(0, 2).map((shift) => ({ ...shift })),
  allowedExamDays: [0, 1, 2, 3, 4, 5, 6],
};

const EXAM_DAY_OPTIONS = [
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
] as const;

function RulesToggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[var(--color-text-primary)]">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--color-text-tertiary)]">{description}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary-600 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/30 dark:bg-gray-700" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function ExamScheduleRulesModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [rules, setRules] = useState<ExamScheduleRules>(DEFAULT_EXAM_SCHEDULE_RULES);
  const [loading, setLoading] = useState(!isSuperAdmin);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.get('/schools', { params: { limit: 100 } })
      .then(({ data }) => setSchools((data.data || []).filter((s: SchoolBrief) => s.status === 'active')))
      .catch((err: any) => setError(err.response?.data?.message || 'Failed to load organizations'));
  }, [isSuperAdmin]);

  const loadRules = useCallback(async (targetSchool?: string) => {
    if (isSuperAdmin && !targetSchool) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.get('/exams/schedule-rules', {
        params: isSuperAdmin ? { school: targetSchool } : undefined,
      });
      setRules({ ...DEFAULT_EXAM_SCHEDULE_RULES, ...(data.data?.rules || {}) });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load scheduling rules');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) loadRules();
  }, [isSuperAdmin, loadRules]);

  useEffect(() => {
    if (isSuperAdmin && schoolId) loadRules(schoolId);
  }, [isSuperAdmin, schoolId, loadRules]);

  const saveRules = async () => {
    if (isSuperAdmin && !schoolId) {
      setError('Select an organization first.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.patch('/exams/schedule-rules', {
        ...(isSuperAdmin ? { school: schoolId } : {}),
        rules,
      });
      setRules({ ...DEFAULT_EXAM_SCHEDULE_RULES, ...(data.data?.rules || {}) });
      setMessage('Scheduling rules saved successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save scheduling rules');
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof ExamScheduleRules,>(key: K, value: ExamScheduleRules[K]) =>
    setRules((prev) => ({ ...prev, [key]: value }));

  const updateShiftCount = (value: number) => {
    const count = Math.min(4, Math.max(1, Math.trunc(value || 1)));
    setRules((prev) => ({
      ...prev,
      examShiftCount: count,
      examShifts: Array.from({ length: count }, (_, index) => ({
        ...(prev.examShifts[index] || DEFAULT_EXAM_SHIFTS[index] || {
          name: `Shift ${index + 1}`,
          startTime: '08:00',
          endTime: '10:00',
        }),
      })),
    }));
  };

  const updateShift = (index: number, key: keyof ExamShiftRule, value: string) => {
    setRules((prev) => ({
      ...prev,
      examShifts: prev.examShifts.map((shift, shiftIndex) =>
        shiftIndex === index ? { ...shift, [key]: value } : shift
      ),
    }));
  };

  const toggleExamDay = (day: number) => {
    setRules((prev) => {
      const selected = prev.allowedExamDays.includes(day);
      if (selected && prev.allowedExamDays.length === 1) return prev;
      return {
        ...prev,
        allowedExamDays: selected
          ? prev.allowedExamDays.filter((value) => value !== day)
          : [...prev.allowedExamDays, day].sort((a, b) => a - b),
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm sm:p-5" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-[var(--color-surface-primary)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/30">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Exam Scheduling Rules</h2>
                <p className="text-xs text-[var(--color-text-tertiary)]">Hard conflicts are checked automatically before an exam is saved.</p>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {isSuperAdmin && (
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Organization</label>
              <select
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">Select organization...</option>
                {schools.map((school) => <option key={school._id} value={school._id}>{school.name}</option>)}
              </select>
            </div>
          )}

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}

          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
            </div>
          ) : isSuperAdmin && !schoolId ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-8 text-center">
              <Building2 className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" />
              <p className="mt-3 text-sm font-bold">Select an organization</p>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Rules are stored separately for each school.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3">
                <RulesToggle
                  checked={rules.preventClassOverlap}
                  onChange={(v) => update('preventClassOverlap', v)}
                  title="Student / Class Conflict"
                  description="Prevents the same class from having overlapping exams at the same date and time."
                />
                <RulesToggle
                  checked={rules.allowSharedRooms}
                  onChange={(v) => update('allowSharedRooms', v)}
                  title="Allow Shared Rooms"
                  description="Different grades/classes may use the same room in one session. Capacity and seat protection still apply."
                />
                <RulesToggle
                  checked={rules.roomCapacityCheck}
                  onChange={(v) => update('roomCapacityCheck', v)}
                  title="Room Capacity Check"
                  description="Blocks seating assignments once the room's configured capacity is full."
                />
                <RulesToggle
                  checked={rules.durationValidation}
                  onChange={(v) => update('durationValidation', v)}
                  title="Exam Duration Validation"
                  description="The exam duration must fit inside the selected start and end time."
                />
              </div>

              <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)]">
                      <CalendarDays className="h-4 w-4 text-primary-600" />
                      Allowed Exam Days
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">
                      Choose the weekdays on which exams are allowed to be scheduled.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {EXAM_DAY_OPTIONS.map((day) => {
                    const active = rules.allowedExamDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleExamDay(day.value)}
                        aria-pressed={active}
                        className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition-colors ${active
                          ? 'border-primary-500 bg-primary-600 text-white shadow-sm'
                          : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
                  At least one exam day must remain selected.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)]">
                      <Clock3 className="h-4 w-4 text-primary-600" />
                      Exam Shifts
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">
                      Set how many exam shifts the school uses and the start/end time for each shift.
                    </p>
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-text-secondary)]">Number of shifts</span>
                    <select
                      value={rules.examShiftCount}
                      onChange={(e) => updateShiftCount(Number(e.target.value))}
                      className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm font-semibold"
                    >
                      {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid gap-3">
                  {rules.examShifts.slice(0, rules.examShiftCount).map((shift, index) => (
                    <div key={index} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3">
                      <div className="grid gap-3 sm:grid-cols-[minmax(120px,1fr)_1fr_1fr]">
                        <label>
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Shift</span>
                          <input
                            value={shift.name}
                            onChange={(e) => updateShift(index, 'name', e.target.value)}
                            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm font-semibold"
                          />
                        </label>
                        <label>
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Start Time</span>
                          <input
                            type="time"
                            value={shift.startTime}
                            onChange={(e) => updateShift(index, 'startTime', e.target.value)}
                            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm"
                          />
                        </label>
                        <label>
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">End Time</span>
                          <input
                            type="time"
                            value={shift.endTime}
                            onChange={(e) => updateShift(index, 'endTime', e.target.value)}
                            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                {rules.examShiftCount > 1 && (
                  <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
                    Break time is the gap between one shift's end time and the next shift's start time.
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="rounded-2xl border border-[var(--color-border-default)] p-4">
                  <span className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4 text-primary-600" /> Maximum Exams / Class / Day</span>
                  <span className="mt-1 block text-xs text-[var(--color-text-tertiary)]">Default: one exam per class per day.</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={rules.maxExamsPerClassPerDay}
                    onChange={(e) => update('maxExamsPerClassPerDay', Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                    className="mt-3 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="rounded-2xl border border-[var(--color-border-default)] p-4">
                  <span className="flex items-center gap-2 text-sm font-bold"><Clock3 className="h-4 w-4 text-primary-600" /> Minimum Gap</span>
                  <span className="mt-1 block text-xs text-[var(--color-text-tertiary)]">Minutes required between two exams for the same class.</span>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      value={rules.minimumGapMinutes}
                      onChange={(e) => update('minimumGapMinutes', Math.min(1440, Math.max(0, Number(e.target.value) || 0)))}
                      className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm"
                    />
                    <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">minutes</span>
                  </div>
                </label>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Seat Conflict Protection — Always On</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-700 dark:text-emerald-400">The same seat cannot be assigned to two students in the same academic year and exam type, even when several grades share one room.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border-subtle)] pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={onClose} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold">Cancel</button>
                <button type="button" onClick={saveRules} disabled={saving} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save Rules'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
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
          {exam.period && typeof exam.period !== 'string' && (
            <>
              <DetailRow label="Exam Period" value={exam.period.name} />
              <DetailRow label="Academic Year" value={exam.period.academicYear} />
              {exam.period.term && <DetailRow label="Term / Semester" value={exam.period.term} />}
            </>
          )}
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
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Import period-aware schedules into the same records used by List and Table Grid.</p>
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
            💡 Use Exam Period + Academic Year to link imported rows directly to Midterm/Final Table Grid. Grade / Class disambiguates courses with the same title. Legacy files are still supported.
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
                  Organization &nbsp; Exam Period &nbsp; Academic Year &nbsp; Term / Semester &nbsp; Grade / Class &nbsp; Course Title &nbsp; Exam Title &nbsp; Exam Date &nbsp; Shift &nbsp; Start Time &nbsp; End Time &nbsp; Duration &nbsp; Total Marks &nbsp; Passing Marks &nbsp; Room &nbsp; Instructions
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
// Timetable View — generated from Exam Scheduling Rules.
// Rows = active grades/classes. Columns = configured shifts with the rule-defined
// break windows between them. Edit mode lets admins choose a class course in
// every shift cell; the assigned teacher is shown automatically.
// ---------------------------------------------------------------------------

type ExamTimetablePerspective = 'day' | 'class';
type ExamScheduleMenuAction = 'edit-exam' | 'reuse-schedule' | 'auto-generate' | 'period-status' | 'by-day' | 'by-class';

interface ExamScheduleActionRequest {
  id: number;
  action: ExamScheduleMenuAction;
}

interface ExamScheduleMenuContext {
  hasSelectedPeriod: boolean;
  periodId?: string;
  periodStatus?: ExamPeriod['status'];
  perspective: ExamTimetablePerspective;
  busy: boolean;
}

const examDateKey = (exam: Exam): string =>
  exam.examDate && !exam.autoSchedule ? new Date(exam.examDate).toISOString().slice(0, 10) : '';

const examClassLabel = (exam: Exam): string => {
  const cls = exam.course?.class;
  if (!cls?.title) return 'Unassigned Class';
  return cls.section ? `${cls.title} - ${cls.section}` : cls.title;
};

const classBriefLabel = (cls?: ClassBrief): string =>
  cls?.title ? (cls.section ? `${cls.title} - ${cls.section}` : cls.title) : 'Class';

const examTeacherLabel = (exam: Exam): string => {
  const profile = exam.course?.teacher?.profile;
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  return name || exam.course?.teacher?.user?.email || 'Teacher not assigned';
};

const courseTeacherLabel = (course?: CourseBrief): string => {
  const profile = course?.teacher?.profile;
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  return name || course?.teacher?.user?.email || 'Teacher not assigned';
};

const compareExamTimes = (a: Exam, b: Exam) =>
  String(a.startTime || '').localeCompare(String(b.startTime || '')) ||
  String(a.endTime || '').localeCompare(String(b.endTime || ''));

const examSchoolId = (exam: Exam): string =>
  typeof exam.school === 'string' ? exam.school : exam.school?._id || '';

const examPeriodId = (exam: Exam): string =>
  typeof exam.period === 'string' ? exam.period : exam.period?._id || '';

const minutesOf = (value?: string): number => {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
};

const examOverlapsShift = (exam: Exam, shift: ExamShiftRule): boolean => {
  const start = minutesOf(exam.startTime);
  const end = minutesOf(exam.endTime);
  const shiftStart = minutesOf(shift.startTime);
  const shiftEnd = minutesOf(shift.endTime);
  return start >= 0 && end >= 0 && shiftStart >= 0 && shiftEnd >= 0 && start < shiftEnd && shiftStart < end;
};

const isAllowedExamDate = (date: string, allowedDays: number[]): boolean => {
  if (!date) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && allowedDays.includes(parsed.getUTCDay());
};

const nextAllowedExamDate = (allowedDays: number[], start = new Date()): string => {
  const safeDays = allowedDays.length ? allowedDays : [0, 1, 2, 3, 4, 5, 6];
  for (let offset = 0; offset < 21; offset += 1) {
    const candidate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + offset));
    if (safeDays.includes(candidate.getUTCDay())) return candidate.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
};

function ExamTimetableCell({
  exams,
  onOpen,
  editMode = false,
  courses = [],
  value = '',
  onChange,
  loadingCourses = false,
  changed = false,
  usedCourseIds = [],
}: {
  exams: Exam[];
  onOpen: (exam: Exam) => void;
  editMode?: boolean;
  courses?: CourseBrief[];
  value?: string;
  onChange?: (courseId: string) => void;
  loadingCourses?: boolean;
  changed?: boolean;
  usedCourseIds?: string[];
}) {
  if (editMode) {
    const existingCourse = exams[0]?.course;
    const options = existingCourse && !courses.some((course) => course._id === existingCourse._id)
      ? [existingCourse, ...courses]
      : courses;
    const selected = options.find((course) => course._id === value);
    const usedSet = new Set(usedCourseIds);

    return (
      <div className={`min-h-[86px] rounded-xl border p-2.5 transition-colors ${changed ? 'border-primary-400 bg-primary-50/70 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}>
        <select
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={loadingCourses}
          className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2.5 py-2 text-xs font-bold text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-60"
        >
          <option value="">— No exam —</option>
          {options
            .filter((course) => course.status !== 'archived')
            .map((course) => {
              const alreadyUsed = usedSet.has(course._id);
              return (
                <option
                  key={course._id}
                  value={course._id}
                  style={alreadyUsed ? { backgroundColor: '#dcfce7', color: '#166534', fontWeight: 700 } : undefined}
                >
                  {alreadyUsed ? '✓ Used · ' : ''}{course.title?.en || 'Untitled course'}
                </option>
              );
            })}
        </select>
        <div className="mt-2 min-h-4 text-[10px] font-semibold leading-4 text-[var(--color-text-tertiary)] sm:text-xs">
          {loadingCourses ? 'Loading courses…' : selected ? courseTeacherLabel(selected) : 'Green / ✓ Used = already scheduled for this grade'}
        </div>
      </div>
    );
  }

  if (!exams.length) {
    return <div className="exam-timetable-empty py-5 text-center text-xs text-[var(--color-text-tertiary)]">—</div>;
  }

  return (
    <div className="space-y-2">
      {exams.map((exam) => (
        <button
          key={exam._id}
          type="button"
          onClick={() => onOpen(exam)}
          className="exam-timetable-card w-full rounded-xl border border-primary-100 bg-primary-50/80 p-2.5 text-left transition hover:border-primary-300 hover:bg-primary-50 dark:border-primary-900/40 dark:bg-primary-950/20"
        >
          <div className="break-words text-xs font-extrabold leading-4 text-primary-950 dark:text-primary-100 sm:text-sm">
            {exam.course?.title?.en || 'Course missing'}
          </div>
          <div className="mt-1 break-words text-[10px] font-semibold leading-4 text-primary-800/80 dark:text-primary-200/80 sm:text-xs">
            {examTeacherLabel(exam)}
          </div>
        </button>
      ))}
    </div>
  );
}

function ExamBreakCell({ startTime, endTime }: { startTime?: string; endTime?: string }) {
  const hasWindow = !!startTime && !!endTime && minutesOf(endTime) > minutesOf(startTime);
  return (
    <div className="exam-break-card flex min-h-[76px] flex-col items-center justify-center rounded-xl bg-amber-50 px-2 py-3 text-center dark:bg-amber-950/20">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">Break</span>
      <span className="mt-1 text-[9px] font-semibold text-amber-700/70 dark:text-amber-300/70 sm:text-[10px]">
        {hasWindow ? `${startTime} – ${endTime}` : '—'}
      </span>
    </div>
  );
}

function ExamTimetable({
  exams,
  onOpen,
  onChanged,
  editRequest,
  createRequest,
  scheduleActionRequest,
  focusedPeriodId,
  refreshKey,
  onEditRequestHandled,
  onCreateRequestHandled,
  onScheduleActionRequestHandled,
  onScheduleContextChange,
  visibleClassIds,
}: {
  exams: Exam[];
  onOpen: (exam: Exam) => void;
  onChanged: () => Promise<void> | void;
  editRequest: number;
  createRequest: number;
  scheduleActionRequest: ExamScheduleActionRequest | null;
  focusedPeriodId?: string;
  refreshKey: number;
  onEditRequestHandled: () => void;
  onCreateRequestHandled: () => void;
  onScheduleActionRequestHandled: (id: number) => void;
  onScheduleContextChange: (context: ExamScheduleMenuContext) => void;
  visibleClassIds?: string[] | null;
}) {
  const { user } = useAuth();
  const ownOrgId = String((user as any)?.organizationId?._id || (user as any)?.organizationId || '');
  const examSchoolIds = useMemo(
    () => Array.from(new Set(exams.map(examSchoolId).filter(Boolean))),
    [exams],
  );
  const effectiveSchoolId = user?.role === 'org_admin'
    ? ownOrgId
    : examSchoolIds.length === 1
      ? examSchoolIds[0]
      : '';

  const [rules, setRules] = useState<ExamScheduleRules>(DEFAULT_EXAM_SCHEDULE_RULES);
  const [printBranding, setPrintBranding] = useState<{ name?: string; branding?: { logo?: string } }>({});
  const [gridClasses, setGridClasses] = useState<ClassBrief[]>([]);
  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [rulesLoading, setRulesLoading] = useState(Boolean(effectiveSchoolId));
  const [perspective, setPerspective] = useState<ExamTimetablePerspective>('day');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [classResetConfirmOpen, setClassResetConfirmOpen] = useState(false);
  const [classResetting, setClassResetting] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [coursesByClass, setCoursesByClass] = useState<Record<string, CourseBrief[]>>({});
  const [loadingCourses, setLoadingCourses] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [gridError, setGridError] = useState('');
  const [gridSuccess, setGridSuccess] = useState('');
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [showEditPeriod, setShowEditPeriod] = useState(false);
  const [showReusePeriod, setShowReusePeriod] = useState(false);
  const [periodActionBusy, setPeriodActionBusy] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const currentYear = new Date().getFullYear();
  const [periodForm, setPeriodForm] = useState({
    name: '',
    academicYear: `${currentYear}/${String(currentYear + 1).slice(-2)}`,
    term: '',
    startDate: '',
    endDate: '',
  });
  const [editPeriodForm, setEditPeriodForm] = useState({
    name: '',
    academicYear: '',
    term: '',
    startDate: '',
    endDate: '',
  });
  useEffect(() => {
    let cancelled = false;
    if (!effectiveSchoolId) {
      setPrintBranding({});
      return;
    }
    void api.get(`/schools/${effectiveSchoolId}/branding`)
      .then((response) => {
        if (!cancelled) setPrintBranding(response.data?.data?.school || {});
      })
      .catch(() => {
        if (!cancelled) setPrintBranding({});
      });
    return () => { cancelled = true; };
  }, [effectiveSchoolId]);

  const [reusePeriodForm, setReusePeriodForm] = useState({
    name: '',
    academicYear: '',
    term: '',
    startDate: '',
    endDate: '',
  });
  const lastEditRequest = useRef(0);
  const lastCreateRequest = useRef(0);
  const lastScheduleActionRequest = useRef(0);

  const periodIdOf = (exam: Exam): string =>
    typeof exam.period === 'string' ? exam.period : exam.period?._id || '';

  const yearKey = (value?: string): string => String(value || '').match(/\d{4}/)?.[0] || '';

  const nextAcademicYearLabel = (value?: string): string => {
    const start = Number(yearKey(value)) || currentYear;
    return String(value || '').includes('/')
      ? `${start + 1}/${String(start + 2).slice(-2)}`
      : `${start + 1}-${start + 2}`;
  };

  const shiftDateOneYear = (value?: string | null): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    return date.toISOString().slice(0, 10);
  };

  const periodDateValue = (value?: string | null): string =>
    value ? new Date(value).toISOString().slice(0, 10) : '';

  const localTodayKey = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fixedExams = useMemo(
    () => exams
      .filter((exam) => !exam.autoSchedule && exam.examDate && exam.status !== 'cancelled')
      .sort((a, b) => examDateKey(a).localeCompare(examDateKey(b)) || compareExamTimes(a, b)),
    [exams],
  );

  const selectedPeriod = useMemo(
    () => periods.find((period) => period._id === selectedPeriodId),
    [periods, selectedPeriodId],
  );

  const periodExams = useMemo(
    () => selectedPeriodId ? fixedExams.filter((exam) => periodIdOf(exam) === selectedPeriodId) : [],
    [fixedExams, selectedPeriodId],
  );

  const fallbackClasses = useMemo(() => {
    const map = new Map<string, ClassBrief>();
    fixedExams.forEach((exam) => {
      const cls = exam.course?.class;
      if (!cls?._id || !cls.title) return;
      map.set(cls._id, { _id: cls._id, title: cls.title, section: cls.section || '' });
    });
    return Array.from(map.values());
  }, [fixedExams]);

  const classes = useMemo(
    () => (gridClasses.length ? gridClasses : fallbackClasses)
      .slice()
      .sort((a, b) => classBriefLabel(a).localeCompare(classBriefLabel(b), undefined, { numeric: true })),
    [fallbackClasses, gridClasses],
  );

  // Classes are persistent Grade containers reused every year. When the
  // outer schedule filters select specific classes/departments, keep the
  // timetable rows in sync with those selections.
  const periodClasses = useMemo(() => {
    if (visibleClassIds === null || visibleClassIds === undefined) return classes;
    const allowed = new Set(visibleClassIds);
    return classes.filter((cls) => allowed.has(cls._id));
  }, [classes, visibleClassIds]);

  const loadContext = useCallback(async () => {
    if (!effectiveSchoolId) {
      setGridClasses([]);
      setPeriods([]);
      return;
    }
    setRulesLoading(true);
    setGridError('');
    try {
      const [rulesResponse, classesResponse, periodsResponse] = await Promise.all([
        api.get('/exams/schedule-rules', { params: { school: effectiveSchoolId } }),
        api.get('/classes', { params: { schoolId: effectiveSchoolId, status: 'active', limit: 300 } }),
        api.get('/exams/periods', { params: { school: effectiveSchoolId } }),
      ]);
      setRules({ ...DEFAULT_EXAM_SCHEDULE_RULES, ...(rulesResponse.data?.data?.rules || {}) });
      setGridClasses(classesResponse.data?.data || []);
      const nextPeriods: ExamPeriod[] = periodsResponse.data?.data || [];
      setPeriods(nextPeriods);

      let storedPeriodId = '';
      try {
        storedPeriodId = window.localStorage.getItem(`examSchedule:selectedPeriod:${effectiveSchoolId}`) || '';
      } catch {
        storedPeriodId = '';
      }

      setSelectedPeriodId((current) => {
        if (current && nextPeriods.some((period) => period._id === current)) return current;
        if (storedPeriodId && nextPeriods.some((period) => period._id === storedPeriodId)) return storedPeriodId;
        return nextPeriods[0]?._id || '';
      });
    } catch (err: any) {
      setGridError(err?.response?.data?.message || 'Could not load exam scheduling workspace.');
    } finally {
      setRulesLoading(false);
    }
  }, [effectiveSchoolId]);

  useEffect(() => {
    void loadContext();
  }, [loadContext, refreshKey]);

  useEffect(() => {
    if (!effectiveSchoolId || !selectedPeriodId) return;
    try {
      window.localStorage.setItem(
        `examSchedule:selectedPeriod:${effectiveSchoolId}`,
        selectedPeriodId,
      );
    } catch {
      // Storage can be unavailable in restricted/private browser contexts.
    }
  }, [effectiveSchoolId, selectedPeriodId]);

  useEffect(() => {
    if (!focusedPeriodId || rulesLoading || !periods.some((period) => period._id === focusedPeriodId)) return;
    if (focusedPeriodId === selectedPeriodId) return;
    setDraft({});
    setEditMode(false);
    setSelectedPeriodId(focusedPeriodId);
    setGridError('');
    setGridSuccess('');
  }, [focusedPeriodId, periods, rulesLoading, selectedPeriodId]);

  const availableDates = useMemo(
    () => Array.from(new Set(periodExams.map(examDateKey).filter((date) => date && isAllowedExamDate(date, rules.allowedExamDays)))).sort(),
    [periodExams, rules.allowedExamDays],
  );

  const examDayTabs = useMemo(() => {
    if (!selectedPeriod?.startDate) return availableDates;

    const startKey = periodDateValue(selectedPeriod.startDate);
    const endKey = selectedPeriod.endDate ? periodDateValue(selectedPeriod.endDate) : '';
    if (!startKey) return availableDates;

    const dates: string[] = [];
    const cursor = new Date(`${startKey}T00:00:00.000Z`);
    const hardEnd = endKey
      ? new Date(`${endKey}T00:00:00.000Z`)
      : new Date(cursor.getTime() + 31 * 86400000);

    for (let guard = 0; guard < 366 && cursor <= hardEnd; guard += 1) {
      const key = cursor.toISOString().slice(0, 10);
      if (rules.allowedExamDays.includes(cursor.getUTCDay())) dates.push(key);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates.length ? dates : availableDates;
  }, [availableDates, rules.allowedExamDays, selectedPeriod]);

  useEffect(() => {
    if (!selectedPeriod) {
      setSelectedDate('');
      return;
    }
    if (!examDayTabs.length) {
      setSelectedDate('');
      return;
    }
    if (selectedDate && examDayTabs.includes(selectedDate)) return;

    const today = localTodayKey();
    const activeDate = examDayTabs.includes(today)
      ? today
      : examDayTabs.find((date) => date > today) || examDayTabs[examDayTabs.length - 1];

    setSelectedDate(activeDate);
  }, [examDayTabs, selectedDate, selectedPeriod]);

  useEffect(() => {
    if (selectedClassId && periodClasses.some((item) => item._id === selectedClassId)) return;
    setSelectedClassId(periodClasses[0]?._id || '');
  }, [periodClasses, selectedClassId]);

  const cellExams = useCallback((classId: string, shiftIndex: number, date = selectedDate) => {
    const shift = rules.examShifts[shiftIndex];
    if (!shift || !selectedPeriodId) return [];
    return periodExams.filter(
      (exam) =>
        examDateKey(exam) === date &&
        exam.course?.class?._id === classId &&
        examOverlapsShift(exam, shift),
    );
  }, [periodExams, rules.examShifts, selectedDate, selectedPeriodId]);

  const dayRows = useMemo(
    () => periodClasses.map((cls) => ({
      id: cls._id,
      label: classBriefLabel(cls),
      slots: rules.examShifts.map((_, index) => cellExams(cls._id, index)),
    })),
    [periodClasses, rules.examShifts, cellExams],
  );

  const classRows = useMemo(() => {
    if (!selectedClassId) return [];
    const dates = Array.from(new Set(
      periodExams
        .filter((exam) => exam.course?.class?._id === selectedClassId)
        .map(examDateKey)
        .filter(Boolean),
    )).sort();
    return dates.map((date) => ({
      date,
      slots: rules.examShifts.map((_, index) => cellExams(selectedClassId, index, date)),
    }));
  }, [cellExams, periodExams, rules.examShifts, selectedClassId]);

  const selectedClass = useMemo(
    () => periodClasses.find((cls) => cls._id === selectedClassId),
    [periodClasses, selectedClassId],
  );

  const selectedClassExamIds = useMemo(
    () => periodExams
      .filter((exam) => exam.course?.class?._id === selectedClassId)
      .map((exam) => exam._id),
    [periodExams, selectedClassId],
  );

  const resetSelectedClassSchedule = async () => {
    if (!selectedPeriod?._id || !effectiveSchoolId || !selectedClassExamIds.length) return;
    setClassResetting(true);
    setGridError('');
    setGridSuccess('');
    try {
      const response = await api.post(`/exams/periods/${selectedPeriod._id}/reset-department-schedule`, {
        school: effectiveSchoolId,
        examIds: selectedClassExamIds,
      });
      const reset = Number(response.data?.data?.reset || selectedClassExamIds.length);
      setClassResetConfirmOpen(false);
      setGridSuccess(`${reset} paper${reset === 1 ? '' : 's'} cleared from ${selectedClass ? classBriefLabel(selectedClass) : 'this class'}. The class timetable is now blank and can be edited again.`);
      await onChanged();
      await loadContext();
    } catch (err: any) {
      setGridError(err?.response?.data?.message || 'Could not reset this class schedule.');
    } finally {
      setClassResetting(false);
    }
  };

  const loadClassCourses = useCallback(async (classId: string) => {
    if (!effectiveSchoolId || coursesByClass[classId]) return;
    setLoadingCourses((current) => new Set(current).add(classId));
    try {
      const response = await api.get('/courses/admin', {
        params: { school: effectiveSchoolId, classId, limit: 300 },
      });
      const available = (response.data?.data || []).filter((course: CourseBrief) => course.status !== 'archived');
      setCoursesByClass((current) => ({ ...current, [classId]: available }));
    } catch (err: any) {
      setGridError(err?.response?.data?.message || `Could not load courses for ${classBriefLabel(periodClasses.find((item) => item._id === classId))}.`);
    } finally {
      setLoadingCourses((current) => {
        const next = new Set(current);
        next.delete(classId);
        return next;
      });
    }
  }, [coursesByClass, effectiveSchoolId, periodClasses]);

  const draftKey = (classId: string, shiftIndex: number) => `${classId}|${shiftIndex}`;

  const baseCourseId = useCallback((classId: string, shiftIndex: number) =>
    cellExams(classId, shiftIndex)[0]?.course?._id || '', [cellExams]);

  const currentCourseId = useCallback((classId: string, shiftIndex: number) => {
    const key = draftKey(classId, shiftIndex);
    return Object.prototype.hasOwnProperty.call(draft, key)
      ? draft[key]
      : baseCourseId(classId, shiftIndex);
  }, [baseCourseId, draft]);

  const setCellCourse = (classId: string, shiftIndex: number, courseId: string) => {
    const key = draftKey(classId, shiftIndex);
    const base = baseCourseId(classId, shiftIndex);
    setDraft((current) => {
      const next = { ...current };
      if (courseId === base) delete next[key];
      else next[key] = courseId;
      return next;
    });
  };

  // Highlight every course that this grade/class has already used anywhere
  // in the selected exam period. Include the current unsaved draft too, so
  // admins get immediate feedback while building the timetable.
  const usedCourseIdsByClass = useMemo(() => {
    const map: Record<string, Set<string>> = {};

    periodExams.forEach((exam) => {
      const classId = exam.course?.class?._id;
      const courseId = exam.course?._id;
      if (!classId || !courseId) return;
      if (!map[classId]) map[classId] = new Set<string>();
      map[classId].add(courseId);
    });

    Object.entries(draft).forEach(([key, courseId]) => {
      if (!courseId) return;
      const [classId] = key.split('|');
      if (!classId) return;
      if (!map[classId]) map[classId] = new Set<string>();
      map[classId].add(courseId);
    });

    return Object.fromEntries(
      Object.entries(map).map(([classId, ids]) => [classId, Array.from(ids)])
    ) as Record<string, string[]>;
  }, [draft, periodExams]);

  const beginEdit = useCallback(() => {
    if (!effectiveSchoolId) {
      setGridError('Edit Schedule requires one organization/school context.');
      return;
    }
    if (!selectedPeriod) {
      setGridError('Create or select an Exam first, then edit its schedule.');
      return;
    }
    if (selectedPeriod.status === 'closed') {
      setGridError('This exam is closed. Reopen it before editing the schedule.');
      return;
    }
    setPerspective('day');
    setEditMode(true);
    setGridError('');
    setGridSuccess('');
    periodClasses.forEach((cls) => void loadClassCourses(cls._id));
  }, [effectiveSchoolId, loadClassCourses, periodClasses, selectedPeriod]);

  useEffect(() => {
    if (editRequest <= lastEditRequest.current || rulesLoading) return;
    lastEditRequest.current = editRequest;
    beginEdit();
    onEditRequestHandled();
  }, [beginEdit, editRequest, onEditRequestHandled, rulesLoading]);

  useEffect(() => {
    if (createRequest <= lastCreateRequest.current) return;
    lastCreateRequest.current = createRequest;
    if (!effectiveSchoolId) setGridError('Create Exam requires one organization/school context.');
    else setShowCreatePeriod(true);
    onCreateRequestHandled();
  }, [createRequest, effectiveSchoolId, onCreateRequestHandled]);

  useEffect(() => {
    if (!editMode) return;
    periodClasses.forEach((cls) => void loadClassCourses(cls._id));
  }, [editMode, loadClassCourses, periodClasses]);

  const cancelEdit = () => {
    if (Object.keys(draft).length && !window.confirm('Discard unsaved exam schedule changes?')) return;
    setDraft({});
    setEditMode(false);
    setGridError('');
    setGridSuccess('');
  };

  const saveSchedule = async () => {
    const entries = Object.entries(draft);
    if (!entries.length) {
      setEditMode(false);
      return;
    }
    if (!selectedDate || !effectiveSchoolId || !selectedPeriodId) {
      setGridError('Select an Exam and an allowed Exam Date before saving.');
      return;
    }

    setSaving(true);
    setGridError('');
    setGridSuccess('');
    try {
      const cells = entries.map(([key, courseId]) => {
        const [classId, shiftIndexRaw] = key.split('|');
        return { key, classId, shiftIndex: Number(shiftIndexRaw), courseId };
      });
      const response = await api.post('/exams/schedule-grid', {
        school: effectiveSchoolId,
        periodId: selectedPeriodId,
        examDate: selectedDate,
        cells,
      });
      const result = response.data?.data || {};
      const savedKeys: string[] = Array.isArray(result.saved) ? result.saved : [];
      const failures: { key: string; message: string }[] = Array.isArray(result.failures) ? result.failures : [];

      if (savedKeys.length) {
        setDraft((current) => {
          const next = { ...current };
          savedKeys.forEach((key) => delete next[key]);
          return next;
        });
      }

      await onChanged();

      if (!failures.length) {
        setEditMode(false);
        setGridSuccess(`${selectedPeriod?.name || 'Exam'} schedule saved — ${savedKeys.length} ${savedKeys.length === 1 ? 'cell' : 'cells'} updated.`);
      } else {
        setGridError(`${savedKeys.length} of ${entries.length} changes saved. ${failures.length} failed: ${failures.map((item) => item.message).join('; ')}`);
      }
    } catch (err: any) {
      setGridError(err?.response?.data?.message || 'Could not save exam schedule.');
    } finally {
      setSaving(false);
    }
  };

  const createPeriod = async () => {
    if (!periodForm.name.trim() || !periodForm.academicYear.trim()) {
      setGridError('Exam Name and Academic Year are required.');
      return;
    }
    setCreatingPeriod(true);
    setGridError('');
    setGridSuccess('');
    try {
      const response = await api.post('/exams/periods', {
        school: effectiveSchoolId,
        name: periodForm.name.trim(),
        academicYear: periodForm.academicYear.trim(),
        term: periodForm.term.trim(),
        startDate: periodForm.startDate || null,
        endDate: periodForm.endDate || null,
      });
      const created: ExamPeriod = response.data?.data;
      setPeriods((current) => [created, ...current.filter((period) => period._id !== created._id)]);
      setSelectedPeriodId(created._id);
      if (effectiveSchoolId) {
        try {
          window.localStorage.setItem(`examSchedule:selectedPeriod:${effectiveSchoolId}`, created._id);
        } catch {
          // Continue without browser persistence.
        }
      }
      setShowCreatePeriod(false);
      await onChanged();
      setPeriodForm((current) => ({ ...current, name: '', term: '', startDate: '', endDate: '' }));
      setGridSuccess(`${created.name} created. You can now build its Grade × Shift schedule.`);
    } catch (err: any) {
      setGridError(err?.response?.data?.message || 'Could not create exam.');
    } finally {
      setCreatingPeriod(false);
    }
  };

  const updatePeriodStatus = async (status: ExamPeriod['status']) => {
    if (!selectedPeriod || !effectiveSchoolId) return;
    setGridError('');
    try {
      const response = await api.patch(`/exams/periods/${selectedPeriod._id}`, {
        school: effectiveSchoolId,
        status,
      });
      const updated: ExamPeriod = response.data?.data?.period || response.data?.data;
      setPeriods((current) => current.map((period) => period._id === updated._id ? updated : period));
      setGridSuccess(status === 'published' ? 'Exam published to students.' : status === 'closed' ? 'Exam closed.' : 'Exam moved back to draft.');
    } catch (err: any) {
      setGridError(err?.response?.data?.message || 'Could not update exam status.');
    }
  };

  const openEditPeriod = () => {
    if (!selectedPeriod) return;
    setGridError('');
    setEditPeriodForm({
      name: selectedPeriod.name,
      academicYear: selectedPeriod.academicYear,
      term: selectedPeriod.term || '',
      startDate: periodDateValue(selectedPeriod.startDate),
      endDate: periodDateValue(selectedPeriod.endDate),
    });
    setShowEditPeriod(true);
  };

  const savePeriodDetails = async () => {
    if (!selectedPeriod || !effectiveSchoolId) return;
    if (!editPeriodForm.name.trim() || !editPeriodForm.academicYear.trim()) {
      setGridError('Exam Name and Academic Year are required.');
      return;
    }
    setPeriodActionBusy(true);
    setGridError('');
    setGridSuccess('');
    try {
      const response = await api.patch(`/exams/periods/${selectedPeriod._id}`, {
        school: effectiveSchoolId,
        name: editPeriodForm.name.trim(),
        academicYear: editPeriodForm.academicYear.trim(),
        term: editPeriodForm.term.trim(),
        startDate: editPeriodForm.startDate || null,
        endDate: editPeriodForm.endDate || null,
      });
      const data = response.data?.data || {};
      const updated: ExamPeriod = data.period || data;
      await onChanged();
      await loadContext();
      setSelectedPeriodId(updated._id);
      setShowEditPeriod(false);
      setGridSuccess(data.remappedExams
        ? `Exam updated. ${data.remappedExams} scheduled exam(s) were moved into the new date window.`
        : 'Exam details updated.');
    } catch (err: any) {
      setGridError(err?.response?.data?.message || 'Could not update exam.');
    } finally {
      setPeriodActionBusy(false);
    }
  };

  const openReusePeriod = () => {
    if (!selectedPeriod) return;
    setGridError('');
    setReusePeriodForm({
      name: selectedPeriod.name,
      academicYear: nextAcademicYearLabel(selectedPeriod.academicYear),
      term: selectedPeriod.term || '',
      startDate: shiftDateOneYear(selectedPeriod.startDate),
      endDate: shiftDateOneYear(selectedPeriod.endDate),
    });
    setShowReusePeriod(true);
  };

  const reuseScheduleForNewYear = async () => {
    if (!selectedPeriod || !effectiveSchoolId) return;
    if (!reusePeriodForm.name.trim() || !reusePeriodForm.academicYear.trim() || !reusePeriodForm.startDate) {
      setGridError('Exam Name, Academic Year and Start Date are required.');
      return;
    }
    setPeriodActionBusy(true);
    setGridError('');
    setGridSuccess('');
    try {
      const response = await api.post(`/exams/periods/${selectedPeriod._id}/duplicate`, {
        school: effectiveSchoolId,
        name: reusePeriodForm.name.trim(),
        academicYear: reusePeriodForm.academicYear.trim(),
        term: reusePeriodForm.term.trim(),
        startDate: reusePeriodForm.startDate,
        endDate: reusePeriodForm.endDate || null,
      });
      const data = response.data?.data || {};
      const created: ExamPeriod = data.period;
      await onChanged();
      await loadContext();
      setSelectedPeriodId(created._id);
      setShowReusePeriod(false);
      setPerspective('day');
      setGridSuccess(`${created.name} ${created.academicYear} created as Draft. ${data.copiedExams || 0} scheduled exam(s) were reused. Review dates, then Publish when ready.`);
    } catch (err: any) {
      setGridError(err?.response?.data?.message || 'Could not reuse this exam schedule.');
    } finally {
      setPeriodActionBusy(false);
    }
  };

  const autoGenerateSchedule = async () => {
    if (!selectedPeriod || !effectiveSchoolId) {
      setGridError('Create or select an Exam before using Auto Generate.');
      return;
    }
    if (selectedPeriod.status === 'closed') {
      setGridError('This exam is closed. Reopen it before generating the schedule.');
      return;
    }
    if (!selectedPeriod.startDate) {
      setGridError('Set the Exam Start Date first. Auto Generate uses the exam date window and Scheduling Rules.');
      return;
    }

    const overwrite = periodExams.length > 0;
    if (overwrite) {
      const confirmed = window.confirm(
        `Regenerate ${selectedPeriod.name}?\n\nThis will replace the current ${periodExams.length} scheduled exam(s). Any manual cell positions in this exam will be replaced. You can edit the generated schedule afterwards.`
      );
      if (!confirmed) return;
    }

    setAutoGenerating(true);
    setGridError('');
    setGridSuccess('');
    try {
      const response = await api.post(`/exams/periods/${selectedPeriod._id}/auto-generate`, {
        school: effectiveSchoolId,
        overwrite,
      });
      const result = response.data?.data || {};
      await onChanged();
      await loadContext();
      if (result.firstDate) setSelectedDate(result.firstDate);
      setPerspective('day');
      setEditMode(false);
      setDraft({});

      const bandDetails = Array.isArray(result.bandSummary)
        ? result.bandSummary
            .filter((item: any) => item.subjects > 0)
            .map((item: any) => {
              const label = item.band === 'secondary'
                ? 'Secondary'
                : item.band === 'primary-middle'
                  ? 'Primary/Middle'
                  : 'Other';
              return `${label}: ${item.subjects} subjects`;
            })
            .join(' · ')
        : '';

      setGridSuccess(
        `Auto Generate complete — ${result.created || 0} exams created from ${result.sharedSubjectSlots || 0} shared subject slots.${bandDetails ? ` ${bandDetails}.` : ''} Same subject names now use the same date and shift within each school group. You can still edit any cell manually.`
      );
    } catch (err: any) {
      setGridError(err?.response?.data?.message || 'Could not auto-generate the exam schedule.');
    } finally {
      setAutoGenerating(false);
    }
  };

  useEffect(() => {
    onScheduleContextChange({
      hasSelectedPeriod: Boolean(selectedPeriod),
      periodId: selectedPeriod?._id,
      periodStatus: selectedPeriod?.status,
      perspective,
      busy: periodActionBusy || autoGenerating,
    });
  }, [autoGenerating, onScheduleContextChange, periodActionBusy, perspective, selectedPeriod]);

  useEffect(() => {
    if (!scheduleActionRequest || scheduleActionRequest.id <= lastScheduleActionRequest.current || rulesLoading) return;

    lastScheduleActionRequest.current = scheduleActionRequest.id;
    const { action } = scheduleActionRequest;

    if (action === 'by-day') {
      setPerspective('day');
    } else if (action === 'by-class') {
      setPerspective('class');
    } else if (!selectedPeriod) {
      setGridError('Create or select an Exam first.');
    } else if (action === 'edit-exam') {
      openEditPeriod();
    } else if (action === 'reuse-schedule') {
      openReusePeriod();
    } else if (action === 'auto-generate') {
      void autoGenerateSchedule();
    } else if (action === 'period-status') {
      const nextStatus: ExamPeriod['status'] = selectedPeriod.status === 'draft'
        ? 'published'
        : selectedPeriod.status === 'published'
          ? 'closed'
          : 'draft';
      void updatePeriodStatus(nextStatus);
    }

    onScheduleActionRequestHandled(scheduleActionRequest.id);
  }, [
    onScheduleActionRequestHandled,
    rulesLoading,
    scheduleActionRequest,
    selectedPeriod,
  ]);

  const changeDate = (value: string) => {
    if (!selectedPeriod) return;
    if (value !== selectedDate && editMode && Object.keys(draft).length > 0) {
      setGridError('Save or cancel the current schedule changes before switching exam day.');
      return;
    }
    if (!isAllowedExamDate(value, rules.allowedExamDays)) {
      const dayName = new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'long' });
      setGridError(`${dayName} is disabled in Exam Scheduling Rules.`);
      return;
    }
    const periodStart = selectedPeriod.startDate ? new Date(selectedPeriod.startDate).toISOString().slice(0, 10) : '';
    const periodEnd = selectedPeriod.endDate ? new Date(selectedPeriod.endDate).toISOString().slice(0, 10) : '';
    if (periodStart && value < periodStart) {
      setGridError(`Choose a date on or after ${periodStart}.`);
      return;
    }
    if (periodEnd && value > periodEnd) {
      setGridError(`Choose a date on or before ${periodEnd}.`);
      return;
    }
    setGridError('');
    setGridSuccess('');
    setSelectedDate(value);
  };

  const changePeriod = (periodId: string) => {
    if (Object.keys(draft).length && !window.confirm('Discard unsaved schedule changes and switch Exam?')) return;
    setDraft({});
    setEditMode(false);
    setSelectedPeriodId(periodId);
    setGridError('');
    setGridSuccess('');
  };

  const dynamicColumnCount = Math.max(1, rules.examShifts.length * 2 - 1);
  const tableMinWidth = Math.max(720, 190 + rules.examShifts.length * 230 + Math.max(0, rules.examShifts.length - 1) * 105);
  const classPrintSchoolName = printBranding.name || (user as any)?.organizationName || 'Organization';
  const classPrintLogo = printBranding.branding?.logo || '';
  const classPrintGeneratedOn = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
  if (rulesLoading && !classes.length && !periods.length) {
    return (
      <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center shadow-sm">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
        <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Loading Exam Schedule workspace…</p>
      </section>
    );
  }

  return (
    <>
      <style>{`
        .exam-class-print-only { display: none; }

        @media (max-width: 639px) {
          .exam-responsive-table-wrap { overflow-x: hidden !important; }
          .exam-responsive-table {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
          }
          .exam-responsive-table .exam-fixed-col {
            width: 27% !important;
            max-width: 27% !important;
            padding: 7px 6px !important;
            font-size: 9px !important;
            line-height: 1.15 !important;
          }
          .exam-responsive-table .exam-shift-head {
            padding: 7px 4px !important;
            font-size: 9px !important;
            line-height: 1.15 !important;
          }
          .exam-responsive-table .exam-shift-head > div:first-child {
            font-size: 10px !important;
            line-height: 1.15 !important;
          }
          .exam-responsive-table .exam-shift-head > div:last-child {
            font-size: 8px !important;
            line-height: 1.1 !important;
            white-space: nowrap !important;
          }
          .exam-responsive-table .exam-break-col {
            width: 13% !important;
            max-width: 13% !important;
            padding: 4px 2px !important;
          }
          .exam-responsive-table .exam-break-col > div:first-child,
          .exam-responsive-table .exam-break-card > span:first-child {
            font-size: 8px !important;
            letter-spacing: .08em !important;
          }
          .exam-responsive-table .exam-break-col > div:last-child,
          .exam-responsive-table .exam-break-card > span:last-child {
            font-size: 7px !important;
            line-height: 1.1 !important;
            white-space: normal !important;
          }
          .exam-responsive-table .exam-shift-cell { padding: 4px !important; }
          .exam-responsive-table .exam-row-label {
            padding: 8px 6px !important;
            font-size: 10px !important;
            line-height: 1.2 !important;
            overflow-wrap: anywhere !important;
          }
          .exam-responsive-table .exam-timetable-card {
            border-radius: 9px !important;
            padding: 6px !important;
          }
          .exam-responsive-table .exam-timetable-card > div:first-child {
            font-size: 10px !important;
            line-height: 1.2 !important;
          }
          .exam-responsive-table .exam-timetable-card > div:last-child {
            margin-top: 3px !important;
            font-size: 8px !important;
            line-height: 1.2 !important;
          }
          .exam-responsive-table .exam-timetable-empty {
            padding-top: 12px !important;
            padding-bottom: 12px !important;
            font-size: 10px !important;
          }
          .exam-responsive-table .exam-break-card {
            min-height: 58px !important;
            border-radius: 9px !important;
            padding: 6px 2px !important;
          }
        }

        @media print {
          @page { size: A4 landscape; margin: 7mm; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden !important; }
          #exam-class-print,
          #exam-class-print * { visibility: visible !important; }
          #exam-class-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #111827 !important;
          }
          #exam-class-print .exam-class-print-only {
            display: block !important;
          }
          #exam-class-print .exam-print-header {
            display: grid !important;
            grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.35fr) minmax(180px, .8fr) !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 2mm 1mm 3.5mm !important;
            border-bottom: 2px solid #0f766e !important;
          }
          #exam-class-print .exam-print-brand {
            display: flex !important;
            align-items: center !important;
            gap: 9px !important;
            min-width: 0 !important;
          }
          #exam-class-print .exam-print-logo,
          #exam-class-print .exam-print-logo-fallback {
            width: 44px !important;
            height: 44px !important;
            flex: 0 0 44px !important;
          }
          #exam-class-print .exam-print-logo {
            object-fit: contain !important;
          }
          #exam-class-print .exam-print-logo-fallback {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border: 2px solid #0f766e !important;
            border-radius: 10px !important;
            background: #ecfdf5 !important;
            font-size: 19px !important;
            font-weight: 900 !important;
          }
          #exam-class-print .exam-print-school-name {
            font-size: 13px !important;
            line-height: 1.15 !important;
            font-weight: 900 !important;
          }
          #exam-class-print .exam-print-kicker {
            margin-top: 3px !important;
            font-size: 7.5px !important;
            line-height: 1.15 !important;
            font-weight: 800 !important;
            letter-spacing: .08em !important;
            text-transform: uppercase !important;
            color: #475569 !important;
          }
          #exam-class-print .exam-print-title {
            text-align: center !important;
          }
          #exam-class-print .exam-print-title h1 {
            margin: 0 !important;
            font-size: 20px !important;
            line-height: 1.05 !important;
            font-weight: 900 !important;
            letter-spacing: -.02em !important;
          }
          #exam-class-print .exam-print-title p {
            margin: 5px 0 0 !important;
            font-size: 10px !important;
            line-height: 1.15 !important;
            font-weight: 800 !important;
            color: #334155 !important;
          }
          #exam-class-print .exam-print-meta {
            display: grid !important;
            gap: 3px !important;
            justify-self: end !important;
            min-width: 180px !important;
            font-size: 8px !important;
            line-height: 1.2 !important;
          }
          #exam-class-print .exam-print-meta-row {
            display: grid !important;
            grid-template-columns: auto 1fr !important;
            gap: 5px !important;
          }
          #exam-class-print .exam-print-meta-label {
            font-weight: 900 !important;
            color: #475569 !important;
          }
          #exam-class-print .exam-class-scroll {
            overflow: visible !important;
          }
          #exam-class-print table {
            min-width: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-size: 9.6px !important;
            color: #111827 !important;
          }
          #exam-class-print thead {
            display: table-header-group !important;
          }
          #exam-class-print tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          #exam-class-print th {
            background: #eaf4fb !important;
            font-size: 9px !important;
            line-height: 1.15 !important;
            font-weight: 900 !important;
          }
          #exam-class-print th,
          #exam-class-print td {
            color: #111827 !important;
            padding: 7px 6px !important;
            border: 1px solid #cbd5e1 !important;
            vertical-align: middle !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }
          #exam-class-print td > div {
            min-height: 42px !important;
          }
          #exam-class-print td p,
          #exam-class-print td .font-bold,
          #exam-class-print td .font-extrabold {
            font-size: 10.5px !important;
            line-height: 1.16 !important;
            font-weight: 900 !important;
          }
          #exam-class-print .exam-print-footer {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 10px !important;
            margin-top: 3mm !important;
            padding: 2.5mm 1mm 0 !important;
            border-top: 1px solid #94a3b8 !important;
            font-size: 7.5px !important;
            font-weight: 700 !important;
            color: #475569 !important;
          }
        }
      `}</style>

      {selectedPeriod && perspective === 'class' && !editMode && (
        <div className="mb-4 flex w-full flex-nowrap items-end gap-1.5 overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2.5 shadow-sm sm:gap-3 sm:p-4">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Class</span>
            <select
              value={selectedClassId}
              onChange={(event) => {
                setSelectedClassId(event.target.value);
                setClassResetConfirmOpen(false);
                setGridError('');
                setGridSuccess('');
              }}
              className="w-full min-w-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2.5 py-2.5 text-xs font-semibold sm:px-3 sm:text-sm"
            >
              {periodClasses.length === 0 && <option value="">No classes available</option>}
              {periodClasses.map((cls) => (
                <option key={cls._id} value={cls._id}>{classBriefLabel(cls)}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={beginEdit}
            disabled={!selectedClassId || classResetting}
            className="inline-flex h-[40px] shrink-0 items-center justify-center gap-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 text-xs font-bold text-[var(--color-text-secondary)] shadow-sm transition-colors hover:bg-[var(--color-surface-secondary)] disabled:cursor-not-allowed disabled:opacity-40 sm:h-[42px] sm:gap-2 sm:px-4 sm:text-sm"
          >
            <Pencil className="h-4 w-4" />
            <span>Edit</span>
          </button>

          <button
            type="button"
            onClick={() => setClassResetConfirmOpen(true)}
            disabled={!selectedClassId || selectedClassExamIds.length === 0 || classResetting}
            className="inline-flex h-[40px] shrink-0 items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 text-xs font-bold text-red-700 shadow-sm transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300 sm:h-[42px] sm:gap-2 sm:px-4 sm:text-sm"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={!selectedClassId || classRows.length === 0 || classResetting}
            className="inline-flex h-[40px] shrink-0 items-center justify-center gap-1 rounded-xl bg-primary-600 px-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 sm:h-[42px] sm:gap-2 sm:px-4 sm:text-sm"
          >
            <Printer className="h-4 w-4" />
            <span className="sm:hidden">Print</span>
            <span className="hidden sm:inline">Print Class</span>
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
        <div className="border-b border-[var(--color-border-subtle)] p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-[var(--color-text-primary)]">
                  {selectedPeriod ? selectedPeriod.name : 'Exam Timetable'}
                </h2>
                {selectedPeriod && (
                  <>
                    <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-bold text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
                      {selectedPeriod.academicYear}{selectedPeriod.term ? ` · ${selectedPeriod.term}` : ''}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${selectedPeriod.status === 'published'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : selectedPeriod.status === 'closed'
                        ? 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}>
                      {selectedPeriod.status}
                    </span>
                  </>
                )}
                <span className="rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-[10px] font-bold text-[var(--color-text-secondary)]">
                  {rules.examShiftCount} shift{rules.examShiftCount === 1 ? '' : 's'}
                </span>
                {editMode && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                    Editing · {Object.keys(draft).length} changed
                  </span>
                )}
              </div>
            </div>

            {editMode && (
              <div className="flex gap-2">
                <button type="button" onClick={cancelEdit} disabled={saving} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-xs font-bold text-[var(--color-text-secondary)] disabled:opacity-50">
                  Cancel
                </button>
                <button type="button" onClick={saveSchedule} disabled={saving || Object.keys(draft).length === 0} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50">
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? 'Saving…' : `Save Schedule${Object.keys(draft).length ? ` (${Object.keys(draft).length})` : ''}`}
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto] md:items-center">
            <div>
              <select
                value={selectedPeriodId}
                onChange={(e) => changePeriod(e.target.value)}
                disabled={editMode}
                className="w-full min-w-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                <option value="">Select Exam...</option>
                {periods.map((period) => (
                  <option key={period._id} value={period._id}>
                    {period.name} · {period.academicYear}{period.term ? ` · ${period.term}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedPeriod && (perspective === 'day' || editMode) && selectedDate && (
              <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs font-bold text-[var(--color-text-secondary)]">
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
            )}

          </div>

          {selectedPeriod && (perspective === 'day' || editMode) && examDayTabs.length > 0 && (
            <div className="mt-3 w-full">
              <div className="flex w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {examDayTabs.map((date, index) => {
                  const active = date === selectedDate;
                  const isToday = date === localTodayKey();
                  const parsed = new Date(`${date}T00:00:00`);
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => changeDate(date)}
                      aria-pressed={active}
                      className={`min-w-[104px] flex-1 snap-start rounded-xl border px-3 py-2.5 text-center transition-all sm:min-w-[118px] ${active
                        ? 'border-primary-600 bg-primary-600 text-white shadow-sm ring-2 ring-primary-500/15'
                        : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)] hover:border-primary-300 hover:bg-[var(--color-surface-secondary)]'}`}
                    >
                      <div className={`whitespace-nowrap text-[9px] font-extrabold uppercase tracking-wide sm:text-[10px] ${active ? 'text-white/80' : 'text-[var(--color-text-tertiary)]'}`}>
                        Day {index + 1}{isToday ? ' · Today' : ''}
                      </div>
                      <div className="mt-0.5 whitespace-nowrap text-xs font-extrabold sm:text-sm">
                        {parsed.toLocaleDateString(undefined, { weekday: 'short' })}
                      </div>
                      <div className={`whitespace-nowrap text-[10px] font-semibold sm:text-[11px] ${active ? 'text-white/90' : 'text-[var(--color-text-tertiary)]'}`}>
                        {parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {gridError && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{gridError}</div>}
          {gridSuccess && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">{gridSuccess}</div>}
        </div>

        {!effectiveSchoolId && user?.role === 'admin' ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">
            Select/filter one organization before creating an Exam Schedule.
          </div>
        ) : !selectedPeriod ? (
          <div className="px-4 py-14 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" />
            <p className="mt-3 text-sm font-bold text-[var(--color-text-primary)]">Create an Exam first</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--color-text-tertiary)]">
              Example: Midterm Exam 2026/27 or Final Exam 2026/27. After creation, the Grade × Shift table is generated from Scheduling Rules.
            </p>
            <button type="button" onClick={() => setShowCreatePeriod(true)} className="mt-4 rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-bold text-white">
              Create Exam
            </button>
          </div>
        ) : periodClasses.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">
            No active grades/classes match {selectedPeriod.academicYear}.
          </div>
        ) : perspective === 'day' || editMode ? (
          <div className="exam-responsive-table-wrap max-w-full overflow-x-hidden overscroll-x-contain sm:overflow-x-auto [scrollbar-width:thin] [touch-action:pan-x_pan-y]">
            <table className="exam-responsive-table w-full border-collapse text-xs sm:text-sm" style={{ minWidth: tableMinWidth, tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th scope="col" className="exam-fixed-col sticky left-0 z-20 w-44 border-b border-r border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-3 text-left text-[11px] font-extrabold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                    Grade / Class
                  </th>
                  {rules.examShifts.map((shift, index) => (
                    <Fragment key={`head-wrap-${index}`}>
                      <th className="exam-shift-head border-b border-r border-[var(--color-border-default)] bg-emerald-50 px-3 py-3 text-center dark:bg-emerald-950/20">
                        <div className="font-extrabold text-emerald-700 dark:text-emerald-300">{shift.name || `Shift ${index + 1}`}</div>
                        <div className="mt-0.5 text-[10px] font-semibold text-emerald-700/70 dark:text-emerald-300/70">{shift.startTime} – {shift.endTime}</div>
                      </th>
                      {index < rules.examShifts.length - 1 && (
                        <th className="exam-break-col w-28 border-b border-r border-[var(--color-border-default)] bg-amber-50 px-2 py-3 text-center dark:bg-amber-950/20">
                          <div className="font-extrabold text-amber-700 dark:text-amber-300">Break</div>
                          <div className="mt-0.5 text-[9px] font-semibold text-amber-700/70 dark:text-amber-300/70">{shift.endTime} – {rules.examShifts[index + 1].startTime}</div>
                        </th>
                      )}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dayRows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="exam-fixed-col exam-row-label sticky left-0 z-10 border-b border-r border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-4 text-left shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                      <div className="font-extrabold text-[var(--color-text-primary)]">{row.label}</div>
                    </th>
                    {row.slots.map((slotExams, index) => {
                      const key = draftKey(row.id, index);
                      const current = currentCourseId(row.id, index);
                      return (
                        <Fragment key={`row-${row.id}-${index}`}>
                          <td className="exam-shift-cell border-b border-r border-[var(--color-border-default)] p-2 align-top">
                            <ExamTimetableCell
                              exams={slotExams}
                              onOpen={onOpen}
                              editMode={editMode}
                              courses={coursesByClass[row.id] || []}
                              value={current}
                              onChange={(courseId) => setCellCourse(row.id, index, courseId)}
                              loadingCourses={loadingCourses.has(row.id)}
                              changed={Object.prototype.hasOwnProperty.call(draft, key)}
                              usedCourseIds={usedCourseIdsByClass[row.id] || []}
                            />
                          </td>
                          {index < rules.examShifts.length - 1 && (
                            <td className="exam-break-col border-b border-r border-[var(--color-border-default)] p-2 align-middle">
                              <ExamBreakCell startTime={rules.examShifts[index].endTime} endTime={rules.examShifts[index + 1].startTime} />
                            </td>
                          )}
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div id="exam-class-print">
            <div className="exam-class-print-only exam-print-header">
              <div className="exam-print-brand">
                {classPrintLogo ? (
                  <img className="exam-print-logo" src={classPrintLogo} alt="" />
                ) : (
                  <div className="exam-print-logo-fallback">{classPrintSchoolName.charAt(0).toUpperCase()}</div>
                )}
                <div>
                  <div className="exam-print-school-name">{classPrintSchoolName}</div>
                  <div className="exam-print-kicker">Official Examination Schedule</div>
                </div>
              </div>
              <div className="exam-print-title">
                <h1>{selectedClass ? classBriefLabel(selectedClass) : 'Class'} Exam Schedule</h1>
                <p>{selectedPeriod.name}</p>
              </div>
              <div className="exam-print-meta">
                <div className="exam-print-meta-row"><span className="exam-print-meta-label">Academic Year</span><span>{selectedPeriod.academicYear || '—'}</span></div>
                <div className="exam-print-meta-row"><span className="exam-print-meta-label">Term</span><span>{selectedPeriod.term || '—'}</span></div>
                <div className="exam-print-meta-row"><span className="exam-print-meta-label">Generated</span><span>{classPrintGeneratedOn}</span></div>
              </div>
            </div>
            <div className="exam-class-scroll exam-responsive-table-wrap max-w-full overflow-x-hidden overscroll-x-contain sm:overflow-x-auto [scrollbar-width:thin] [touch-action:pan-x_pan-y]">
              <table className="exam-responsive-table w-full border-collapse text-xs sm:text-sm" style={{ minWidth: tableMinWidth, tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th className="exam-fixed-col sticky left-0 z-20 w-44 border-b border-r border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-3 text-left text-[11px] font-extrabold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                    Exam Date
                  </th>
                  {rules.examShifts.map((shift, index) => (
                    <Fragment key={`class-head-${index}`}>
                      <th className="exam-shift-head border-b border-r border-[var(--color-border-default)] bg-emerald-50 px-3 py-3 text-center dark:bg-emerald-950/20">
                        <div className="font-extrabold text-emerald-700 dark:text-emerald-300">{shift.name || `Shift ${index + 1}`}</div>
                        <div className="mt-0.5 text-[10px] font-semibold text-emerald-700/70 dark:text-emerald-300/70">{shift.startTime} – {shift.endTime}</div>
                      </th>
                      {index < rules.examShifts.length - 1 && (
                        <th className="exam-break-col w-28 border-b border-r border-[var(--color-border-default)] bg-amber-50 px-2 py-3 text-center dark:bg-amber-950/20">Break</th>
                      )}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classRows.length === 0 ? (
                  <tr>
                    <td colSpan={dynamicColumnCount + 1} className="px-4 py-12 text-center text-sm text-[var(--color-text-tertiary)]">No schedule has been saved for this class in {selectedPeriod.name} yet.</td>
                  </tr>
                ) : classRows.map((row) => (
                  <tr key={row.date}>
                    <th scope="row" className="exam-fixed-col exam-row-label sticky left-0 z-10 border-b border-r border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-4 text-left shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                      <div className="font-extrabold text-[var(--color-text-primary)]">
                        {new Date(`${row.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div className="mt-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
                        {new Date(`${row.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}
                      </div>
                    </th>
                    {row.slots.map((slotExams, index) => (
                      <Fragment key={`class-row-${row.date}-${index}`}>
                        <td className="exam-shift-cell border-b border-r border-[var(--color-border-default)] p-2 align-top">
                          <ExamTimetableCell exams={slotExams} onOpen={onOpen} />
                        </td>
                        {index < rules.examShifts.length - 1 && (
                          <td className="exam-break-col border-b border-r border-[var(--color-border-default)] p-2 align-middle">
                            <ExamBreakCell startTime={rules.examShifts[index].endTime} endTime={rules.examShifts[index + 1].startTime} />
                          </td>
                        )}
                      </Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="exam-class-print-only exam-print-footer">
              <span>{classPrintSchoolName} · {selectedClass ? classBriefLabel(selectedClass) : 'Class'}</span>
              <span>{selectedPeriod.name} · {selectedPeriod.academicYear}</span>
            </div>
          </div>
        )}
      </section>

      {classResetConfirmOpen && selectedClass && (
        <div className="fixed inset-0 z-[125] flex items-end justify-center bg-black/45 p-3 sm:items-center" onMouseDown={() => !classResetting && setClassResetConfirmOpen(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-2xl sm:p-5"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300">
              <RotateCcw className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[var(--color-text-primary)]">Reset {classBriefLabel(selectedClass)} Schedule?</h3>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
              All exam cells for this class will become blank. Courses are not deleted and can be scheduled again through Edit.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClassResetConfirmOpen(false)}
                disabled={classResetting}
                className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-bold text-[var(--color-text-secondary)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void resetSelectedClassSchedule()}
                disabled={classResetting}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {classResetting ? 'Resetting…' : 'Reset Class'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreatePeriod && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm" onClick={() => !creatingPeriod && setShowCreatePeriod(false)}>
          <div className="w-full max-w-lg rounded-3xl bg-[var(--color-surface-primary)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Create Exam</h2>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Create the exam first; its schedule grid will be built from the saved Rules.</p>
              </div>
              <button type="button" onClick={() => setShowCreatePeriod(false)} disabled={creatingPeriod} className="rounded-xl p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4 p-5">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Exam Name *</span>
                <input
                  autoFocus
                  value={periodForm.name}
                  onChange={(e) => setPeriodForm((current) => ({ ...current, name: e.target.value }))}
                  placeholder="e.g. Midterm Exam, Final Exam"
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Academic Year *</span>
                  <AcademicYearSelect
                    format="short-slash"
                    value={periodForm.academicYear}
                    onChange={(value) => setPeriodForm((current) => ({ ...current, academicYear: value }))}
                    required
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Term / Semester</span>
                  <input
                    value={periodForm.term}
                    onChange={(e) => setPeriodForm((current) => ({ ...current, term: e.target.value }))}
                    placeholder="Term 1"
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Start Date</span>
                  <input type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm((current) => ({ ...current, startDate: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm" />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">End Date</span>
                  <input type="date" value={periodForm.endDate} min={periodForm.startDate || undefined} onChange={(e) => setPeriodForm((current) => ({ ...current, endDate: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm" />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4">
              <button type="button" onClick={() => setShowCreatePeriod(false)} disabled={creatingPeriod} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={createPeriod} disabled={creatingPeriod || !periodForm.name.trim() || !periodForm.academicYear.trim()} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {creatingPeriod ? 'Creating…' : 'Create Exam'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditPeriod && selectedPeriod && (
        <div className="fixed inset-0 z-[61] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm" onClick={() => !periodActionBusy && setShowEditPeriod(false)}>
          <div className="w-full max-w-lg rounded-3xl bg-[var(--color-surface-primary)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Edit Exam</h2>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Changing Start Date moves the saved timetable to the new allowed exam days automatically.</p>
              </div>
              <button type="button" onClick={() => setShowEditPeriod(false)} disabled={periodActionBusy} className="rounded-xl p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Exam Name *</span>
                <input value={editPeriodForm.name} onChange={(e) => setEditPeriodForm((current) => ({ ...current, name: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Academic Year *</span>
                  <AcademicYearSelect
                    format="short-slash"
                    value={editPeriodForm.academicYear}
                    onChange={(value) => setEditPeriodForm((current) => ({ ...current, academicYear: value }))}
                    required
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Term / Semester</span>
                  <input value={editPeriodForm.term} onChange={(e) => setEditPeriodForm((current) => ({ ...current, term: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Start Date</span>
                  <input type="date" value={editPeriodForm.startDate} onChange={(e) => setEditPeriodForm((current) => ({ ...current, startDate: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm" />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">End Date</span>
                  <input type="date" value={editPeriodForm.endDate} min={editPeriodForm.startDate || undefined} onChange={(e) => setEditPeriodForm((current) => ({ ...current, endDate: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm" />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4">
              <button type="button" onClick={() => setShowEditPeriod(false)} disabled={periodActionBusy} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={savePeriodDetails} disabled={periodActionBusy || !editPeriodForm.name.trim() || !editPeriodForm.academicYear.trim()} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {periodActionBusy ? 'Saving…' : 'Save Exam'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReusePeriod && selectedPeriod && (
        <div className="fixed inset-0 z-[61] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm" onClick={() => !periodActionBusy && setShowReusePeriod(false)}>
          <div className="w-full max-w-lg rounded-3xl bg-[var(--color-surface-primary)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Reuse Schedule for New Academic Year</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">Copies every Grade × Shift cell. Exam Day 1, Day 2, etc. are moved to the new allowed dates. The new exam starts as Draft.</p>
              </div>
              <button type="button" onClick={() => setShowReusePeriod(false)} disabled={periodActionBusy} className="rounded-xl p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Exam Name *</span>
                <input value={reusePeriodForm.name} onChange={(e) => setReusePeriodForm((current) => ({ ...current, name: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">New Academic Year *</span>
                  <AcademicYearSelect
                    format="short-slash"
                    value={reusePeriodForm.academicYear}
                    onChange={(value) => setReusePeriodForm((current) => ({ ...current, academicYear: value }))}
                    required
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Term / Semester</span>
                  <input value={reusePeriodForm.term} onChange={(e) => setReusePeriodForm((current) => ({ ...current, term: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">New Start Date *</span>
                  <input type="date" value={reusePeriodForm.startDate} onChange={(e) => setReusePeriodForm((current) => ({ ...current, startDate: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm" />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">New End Date</span>
                  <input type="date" value={reusePeriodForm.endDate} min={reusePeriodForm.startDate || undefined} onChange={(e) => setReusePeriodForm((current) => ({ ...current, endDate: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm" />
                </label>
              </div>
              <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-3 text-xs leading-5 text-primary-800 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-200">
                Students see only a <strong>Published</strong> exam that matches their <strong>current Grade/Class and academic year</strong>. After promotion, a Grade 5 student moved to Grade 6 automatically receives the published Grade 6 schedule for the new year.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4">
              <button type="button" onClick={() => setShowReusePeriod(false)} disabled={periodActionBusy} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={reuseScheduleForNewYear} disabled={periodActionBusy || !reusePeriodForm.name.trim() || !reusePeriodForm.academicYear.trim() || !reusePeriodForm.startDate} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {periodActionBusy ? 'Copying…' : 'Reuse Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ExamsManage() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examPeriods, setExamPeriods] = useState<ExamPeriod[]>([]);
  const [filterClasses, setFilterClasses] = useState<ClassBrief[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [periodsError, setPeriodsError] = useState('');
  const [overviewYear, setOverviewYear] = useState('');
  const [examDetailOpen, setExamDetailOpen] = useState(false);
  const [selectedExamPeriodId, setSelectedExamPeriodId] = useState('');
  const [periodRowBusy, setPeriodRowBusy] = useState('');
  const [annualEditPeriod, setAnnualEditPeriod] = useState<ExamPeriod | null>(null);
  const [annualEditSaving, setAnnualEditSaving] = useState(false);
  const [annualDeletePeriod, setAnnualDeletePeriod] = useState<ExamPeriod | null>(null);
  const [annualEditForm, setAnnualEditForm] = useState({
    name: '',
    academicYear: '',
    term: '',
    startDate: '',
    endDate: '',
  });
  const [loading, setLoading] = useState(true);
  const examsLoadedRef = useRef(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[] | null>(null);
  const [scheduleFilters, setScheduleFilters] = useState<string[] | null>(null);
  const [classFilters, setClassFilters] = useState<string[] | null>(null);
  const [departmentFilters, setDepartmentFilters] = useState<string[] | null>(null);
  const [dateFilter, setDateFilter] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'table' | 'department'>(() => {
    try {
      const stored = window.localStorage.getItem('examSchedule:viewMode');
      return stored === 'table' || stored === 'department' ? stored : 'list';
    } catch {
      return 'list';
    }
  });
  const [editScheduleRequest, setEditScheduleRequest] = useState(0);
  const [createExamRequest, setCreateExamRequest] = useState(0);
  const [scheduleActionRequest, setScheduleActionRequest] = useState<ExamScheduleActionRequest | null>(null);
  const scheduleActionSequence = useRef(0);
  const [scheduleMenuContext, setScheduleMenuContext] = useState<ExamScheduleMenuContext>({
    hasSelectedPeriod: false,
    perspective: 'day',
    busy: false,
  });
  const [scheduleContextRefreshKey, setScheduleContextRefreshKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | undefined>(undefined);
  const [viewingExam, setViewingExam] = useState<Exam | undefined>(undefined);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    const firstLoad = !examsLoadedRef.current;
    if (firstLoad) setLoading(true);
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
      examsLoadedRef.current = true;
      if (firstLoad) setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const ownOrgId = String((user as any)?.organizationId?._id || (user as any)?.organizationId || '');
  const pageExamSchoolIds = useMemo(
    () => Array.from(new Set(exams.map(examSchoolId).filter(Boolean))),
    [exams],
  );
  const pageSchoolId = user?.role === 'org_admin'
    ? ownOrgId
    : pageExamSchoolIds.length === 1
      ? pageExamSchoolIds[0]
      : '';

  const fetchExamPeriods = useCallback(async () => {
    if (!pageSchoolId) {
      setExamPeriods([]);
      setFilterClasses([]);
      setPeriodsError('');
      return;
    }
    setPeriodsLoading(true);
    setPeriodsError('');
    try {
      const [periodsResponse, classesResponse] = await Promise.all([
        api.get('/exams/periods', { params: { school: pageSchoolId } }),
        api.get('/classes', { params: { schoolId: pageSchoolId, status: 'active', limit: 300 } }),
      ]);
      setExamPeriods(periodsResponse.data?.data || []);
      setFilterClasses(classesResponse.data?.data || []);
    } catch (err: any) {
      setPeriodsError(err.response?.data?.message || 'Failed to load annual examinations');
    } finally {
      setPeriodsLoading(false);
    }
  }, [pageSchoolId]);

  useEffect(() => {
    void fetchExamPeriods();
  }, [fetchExamPeriods]);

  const academicYears = useMemo(
    () => Array.from(new Set(examPeriods.map((period) => period.academicYear).filter(Boolean))),
    [examPeriods],
  );

  useEffect(() => {
    if (!academicYears.length) {
      setOverviewYear('');
      return;
    }
    if (!overviewYear || !academicYears.includes(overviewYear)) setOverviewYear(academicYears[0]);
  }, [academicYears, overviewYear]);

  useEffect(() => {
    try {
      window.localStorage.setItem('examSchedule:viewMode', viewMode);
    } catch {
      // Keep the page functional even when browser storage is unavailable.
    }
  }, [viewMode]);

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

  const scopedExams = useMemo(
    () => selectedExamPeriodId
      ? exams.filter((exam) => examPeriodId(exam) === selectedExamPeriodId)
      : exams,
    [exams, selectedExamPeriodId],
  );

  const placedScopedExams = useMemo(
    () => scopedExams.filter((exam) => exam.autoSchedule || exam.schedulePlaced !== false),
    [scopedExams],
  );

  const scheduledCount = placedScopedExams.filter((e) => getEffectiveStatus(e) === 'scheduled').length;
  const ongoingCount = placedScopedExams.filter((e) => getEffectiveStatus(e) === 'ongoing').length;
  const completedCount = placedScopedExams.filter((e) => getEffectiveStatus(e) === 'completed').length;
  const cancelledCount = placedScopedExams.filter((e) => getEffectiveStatus(e) === 'cancelled').length;
  const manualCount = placedScopedExams.filter((e) => !e.autoSchedule).length;
  const autoCount = placedScopedExams.filter((e) => e.autoSchedule).length;

  const classOptions = useMemo(() => {
    const values = new Map<string, string>();

    for (const cls of filterClasses) {
      if (!cls?._id || !cls.title) continue;
      values.set(cls._id, cls.section ? cls.title + ' - ' + cls.section : cls.title);
    }

    for (const exam of scopedExams) {
      const cls = exam.course?.class;
      if (!cls?._id || !cls.title) continue;
      if (!values.has(cls._id)) {
        values.set(cls._id, cls.section ? cls.title + ' - ' + cls.section : cls.title);
      }
    }

    return Array.from(values.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  }, [filterClasses, scopedExams]);

  const departmentOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const exam of scopedExams) {
      const dept = exam.course?.class?.department;
      if (!dept?._id || !dept.name) continue;
      values.set(dept._id, dept.name);
    }
    return Array.from(values.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [scopedExams]);

  const visibleTimetableClassIds = useMemo(() => {
    if (classFilters === null && departmentFilters === null) return null;

    return filterClasses
      .filter((cls) => {
        if (classFilters !== null && !classFilters.includes(cls._id)) return false;
        const departmentId = String(cls.department?._id || '');
        if (departmentFilters !== null && !departmentFilters.includes(departmentId)) return false;
        return true;
      })
      .map((cls) => cls._id);
  }, [classFilters, departmentFilters, filterClasses]);

  const visibleExams = placedScopedExams.filter((exam) => {
    const cls = exam.course?.class;
    const dept = cls?.department;
    const scheduleType = exam.autoSchedule ? 'auto' : 'manual';
    if (scheduleFilters !== null && !scheduleFilters.includes(scheduleType)) return false;
    if (statusFilters !== null && !statusFilters.includes(getEffectiveStatus(exam))) return false;
    if (classFilters !== null && !classFilters.includes(cls?._id || '')) return false;
    if (departmentFilters !== null && !departmentFilters.includes(dept?._id || '')) return false;
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
    setStatusFilters(null);
    setScheduleFilters(null);
    setClassFilters(null);
    setDepartmentFilters(null);
    setDateFilter('');
  };

  const requestScheduleAction = (action: ExamScheduleMenuAction) => {
    scheduleActionSequence.current += 1;
    setViewMode('table');
    setScheduleActionRequest({ id: scheduleActionSequence.current, action });
  };

  const handleScheduleContextChange = useCallback((context: ExamScheduleMenuContext) => {
    setScheduleMenuContext((current) => (
      current.hasSelectedPeriod === context.hasSelectedPeriod &&
      current.periodId === context.periodId &&
      current.periodStatus === context.periodStatus &&
      current.perspective === context.perspective &&
      current.busy === context.busy
        ? current
        : context
    ));
    if (context.periodId) {
      setSelectedExamPeriodId((current) => current === context.periodId ? current : context.periodId!);
    }
  }, []);

  const openExamPeriod = (period: ExamPeriod) => {
    setSelectedExamPeriodId(period._id);
    setExamDetailOpen(true);
    setViewMode('table');
    setStatusFilters(null);
    setScheduleFilters(null);
    setClassFilters(null);
    setDepartmentFilters(null);
    setDateFilter('');
    setSearch('');
    if (pageSchoolId) {
      try {
        window.localStorage.setItem(`examSchedule:selectedPeriod:${pageSchoolId}`, period._id);
      } catch {
        // Continue without browser persistence.
      }
    }
    setScheduleContextRefreshKey((value) => value + 1);
  };

  const returnToExamList = () => {
    setExamDetailOpen(false);
    setSelectedExamPeriodId('');
    setScheduleActionRequest(null);
    setScheduleMenuContext({ hasSelectedPeriod: false, perspective: 'day', busy: false });
    setSelected(new Set());
    setStatusFilters(null);
    setScheduleFilters(null);
    setClassFilters(null);
    setDepartmentFilters(null);
    setDateFilter('');
    setSearch('');
  };

  const periodInputDate = (value?: string | null) =>
    value ? new Date(value).toISOString().slice(0, 10) : '';

  const openAnnualEdit = (period: ExamPeriod) => {
    setAnnualEditForm({
      name: period.name,
      academicYear: period.academicYear,
      term: period.term || '',
      startDate: periodInputDate(period.startDate),
      endDate: periodInputDate(period.endDate),
    });
    setAnnualEditPeriod(period);
    setPeriodsError('');
  };

  const saveAnnualEdit = async () => {
    if (!annualEditPeriod) return;
    if (!annualEditForm.name.trim() || !annualEditForm.academicYear.trim()) {
      setPeriodsError('Exam Name and Academic Year are required.');
      return;
    }

    setAnnualEditSaving(true);
    setPeriodRowBusy(annualEditPeriod._id);
    setPeriodsError('');
    try {
      const response = await api.patch(`/exams/periods/${annualEditPeriod._id}`, {
        school: pageSchoolId,
        name: annualEditForm.name.trim(),
        academicYear: annualEditForm.academicYear.trim(),
        term: annualEditForm.term.trim(),
        startDate: annualEditForm.startDate || null,
        endDate: annualEditForm.endDate || null,
      });
      const data = response.data?.data || {};
      const updated: ExamPeriod = data.period || data;
      setExamPeriods((current) => current.map((item) => item._id === updated._id ? updated : item));
      setExams((current) => current.map((exam) => examPeriodId(exam) === updated._id ? { ...exam, title: updated.name } : exam));
      setAnnualEditPeriod(null);
    } catch (err: any) {
      setPeriodsError(err.response?.data?.message || 'Failed to update examination');
    } finally {
      setAnnualEditSaving(false);
      setPeriodRowBusy('');
    }
  };

  const deleteAnnualPeriod = async () => {
    if (!annualDeletePeriod) return;
    const period = annualDeletePeriod;

    setPeriodRowBusy(period._id);
    setPeriodsError('');
    try {
      await api.delete(`/exams/periods/${period._id}`, { params: { school: pageSchoolId } });
      setExamPeriods((current) => current.filter((item) => item._id !== period._id));
      setExams((current) => current.filter((exam) => examPeriodId(exam) !== period._id));
      setAnnualDeletePeriod(null);
      if (selectedExamPeriodId === period._id) returnToExamList();
    } catch (err: any) {
      setPeriodsError(err.response?.data?.message || 'Failed to delete examination');
    } finally {
      setPeriodRowBusy('');
    }
  };

  const selectedPeriodMeta = examPeriods.find((period) => period._id === selectedExamPeriodId);
  const overviewPeriods = examPeriods.filter((period) => !overviewYear || period.academicYear === overviewYear);

  const periodPaperCount = (periodId: string) =>
    exams.filter((exam) =>
      examPeriodId(exam) === periodId
      && exam.status !== 'cancelled'
      && (exam.autoSchedule || exam.schedulePlaced !== false)
    ).length;

  const formatPeriodRange = (period: ExamPeriod) => {
    const format = (value?: string | null) => value
      ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
    const start = format(period.startDate);
    const end = format(period.endDate);
    if (start && end) return `${start} – ${end}`;
    return start || end || 'Dates not set';
  };

  const periodStatusClasses: Record<ExamPeriod['status'], string> = {
    draft: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    published: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };

  if (loading) {
    return (
      <div className="p-4 pt-5 sm:p-6 sm:pt-6 lg:p-8 lg:pt-8">
        <div className="mx-auto max-w-[1100px] space-y-5">
          <div>
            <BackButton fallback="/admin/exams" />
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Exam Operations</h1>
          </div>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-5 shadow-sm">
            <div className="flex items-center gap-3 text-sm font-semibold text-[var(--color-text-secondary)]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
              Loading schedule…
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!examDetailOpen) {
    return (
      <div className="p-4 pt-5 sm:p-6 sm:pt-6 lg:p-8 lg:pt-8">
        <div className="mx-auto max-w-[1100px]">
          <main className="min-w-0 space-y-5">
            <div>
              <BackButton fallback="/admin/exams" />
              <div className="mt-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Exam Operations</h1>
                  <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Choose an annual examination to manage its schedule, rooms, invigilators and attendance.</p>
                </div>
                <div className="shrink-0">
                  <ExamsActionsMenu
                    onSchedule={() => {
                      setSelectedExamPeriodId('');
                      setExamDetailOpen(true);
                      setViewMode('table');
                      setCreateExamRequest((value) => value + 1);
                    }}
                    onEditSchedule={() => {
                      setExamDetailOpen(true);
                      setViewMode('table');
                      setEditScheduleRequest((value) => value + 1);
                    }}
                    onReuseSchedule={() => requestScheduleAction('reuse-schedule')}
                    onAutoGenerate={() => requestScheduleAction('auto-generate')}
                    onPeriodStatus={() => requestScheduleAction('period-status')}
                    onByDay={() => requestScheduleAction('by-day')}
                    onByClass={() => requestScheduleAction('by-class')}
                    onByDepartment={() => {
                      if (selectedExamPeriodId) setViewMode('department');
                    }}
                    departmentViewActive={viewMode === 'department'}
                    scheduleContext={scheduleMenuContext}
                    onRules={() => setShowRulesModal(true)}
                    onImport={() => setShowImportModal(true)}
                    onExport={handleExport}
                    exporting={exporting}
                    onBulkDelete={() => setShowBulkDeleteModal(true)}
                    selectedCount={selected.size}
                  />
                </div>
              </div>
            </div>

            <section className="overflow-visible rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
              <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Annual Examinations</h2>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Mid Exam, Final Exam and any other examination created for the selected academic year.</p>
                </div>
                <AcademicYearSelect
                  format="short-slash"
                  value={overviewYear}
                  onChange={setOverviewYear}
                  options={academicYears}
                  placeholder="Academic Year"
                  disabled={!academicYears.length}
                  className="sm:w-auto sm:min-w-[180px]"
                />
              </div>

              {periodsLoading ? (
                <div className="flex min-h-[220px] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
                </div>
              ) : periodsError ? (
                <div className="p-8 text-center">
                  <p className="text-sm font-semibold text-red-600">{periodsError}</p>
                  <button type="button" onClick={() => void fetchExamPeriods()} className="mt-3 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white">Retry</button>
                </div>
              ) : overviewPeriods.length === 0 ? (
                <div className="p-10 text-center">
                  <CalendarDays className="mx-auto h-9 w-9 text-[var(--color-text-tertiary)]" />
                  <h3 className="mt-3 font-bold text-[var(--color-text-primary)]">No examinations yet</h3>
                  <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Use the three-dot menu and choose New Exam to create Mid Exam, Final Exam or another exam.</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border-subtle)]">
                  {overviewPeriods.map((period) => (
                    <div
                      key={period._id}
                      className="group flex w-full items-center gap-2 p-3 transition-colors hover:bg-[var(--color-surface-secondary)] sm:gap-3 sm:p-4"
                    >
                      <button
                        type="button"
                        onClick={() => openExamPeriod(period)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 text-left sm:gap-4"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
                          <CalendarClock className="h-6 w-6" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-base font-bold text-[var(--color-text-primary)]">{period.name}</span>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${periodStatusClasses[period.status]}`}>{period.status}</span>
                          </span>
                          <span className="mt-1 block text-xs text-[var(--color-text-tertiary)]">
                            {period.academicYear}{period.term ? ` · ${period.term}` : ''} · {formatPeriodRange(period)}
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-[var(--color-text-secondary)]">
                            {periodPaperCount(period._id)} scheduled paper{periodPaperCount(period._id) === 1 ? '' : 's'}
                          </span>
                        </span>
                        <span className="hidden shrink-0 items-center gap-1 text-xs font-bold text-primary-700 sm:flex dark:text-primary-300">
                          Open
                          <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </button>

                      <AnnualExamActionsMenu
                        disabled={periodRowBusy === period._id}
                        onEdit={() => openAnnualEdit(period)}
                        onDelete={() => setAnnualDeletePeriod(period)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>

        {annualEditPeriod && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => !annualEditSaving && setAnnualEditPeriod(null)}>
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Edit Examination</h2>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Update the exam name, academic year, term and date window.</p>
                </div>
                <button type="button" onClick={() => setAnnualEditPeriod(null)} disabled={annualEditSaving} className="rounded-xl p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-50">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Exam Name</span>
                    <input value={annualEditForm.name} onChange={(event) => setAnnualEditForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Academic Year</span>
                    <AcademicYearSelect
                      format="short-slash"
                      value={annualEditForm.academicYear}
                      onChange={(value) => setAnnualEditForm((current) => ({ ...current, academicYear: value }))}
                      required
                    />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Term</span>
                    <input value={annualEditForm.term} onChange={(event) => setAnnualEditForm((current) => ({ ...current, term: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">Start Date</span>
                    <input type="date" value={annualEditForm.startDate} onChange={(event) => setAnnualEditForm((current) => ({ ...current, startDate: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">End Date</span>
                    <input type="date" min={annualEditForm.startDate || undefined} value={annualEditForm.endDate} onChange={(event) => setAnnualEditForm((current) => ({ ...current, endDate: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20" />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4">
                <button type="button" onClick={() => setAnnualEditPeriod(null)} disabled={annualEditSaving} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => void saveAnnualEdit()} disabled={annualEditSaving || !annualEditForm.name.trim() || !annualEditForm.academicYear.trim()} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50">
                  {annualEditSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {annualDeletePeriod && (
          <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => periodRowBusy !== annualDeletePeriod._id && setAnnualDeletePeriod(null)}>
            <div className="w-full max-w-md rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/30">
                  <Trash2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Delete Examination?</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                    Are you sure you want to delete <strong>{annualDeletePeriod.name}</strong> ({annualDeletePeriod.academicYear})? This will also remove its {periodPaperCount(annualDeletePeriod._id)} scheduled paper{periodPaperCount(annualDeletePeriod._id) === 1 ? '' : 's'}.
                  </p>
                  <p className="mt-2 text-xs font-semibold text-red-600">This action cannot be undone.</p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setAnnualDeletePeriod(null)} disabled={periodRowBusy === annualDeletePeriod._id} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => void deleteAnnualPeriod()} disabled={periodRowBusy === annualDeletePeriod._id} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50">
                  {periodRowBusy === annualDeletePeriod._id ? 'Deleting…' : 'Delete Exam'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showImportModal && <ExamsImportModal onClose={() => setShowImportModal(false)} onImported={() => {
          void fetchData();
          void fetchExamPeriods();
          setScheduleContextRefreshKey((value) => value + 1);
        }} />}
        {showRulesModal && <ExamScheduleRulesModal onClose={() => {
          setShowRulesModal(false);
          setScheduleContextRefreshKey((value) => value + 1);
        }} />}
      </div>
    );
  }

  return (
    <div className="p-4 pt-5 sm:p-6 sm:pt-6 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-[1700px]">
        <div>
          <main className="min-w-0 space-y-5">
            <div>
              <button
                type="button"
                onClick={returnToExamList}
                className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" /> Annual Examinations
              </button>
              <div className="mt-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">{selectedPeriodMeta?.name || 'Exam'} Schedule</h1>
                  <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                    {selectedPeriodMeta ? `${selectedPeriodMeta.academicYear}${selectedPeriodMeta.term ? ` · ${selectedPeriodMeta.term}` : ''} · ${formatPeriodRange(selectedPeriodMeta)}` : 'List, Table Grid and Departmental View for the selected examination.'}
                  </p>
                </div>
                <div className="shrink-0">
                  <ExamsActionsMenu
                    onSchedule={() => {
                      setExamDetailOpen(true);
                      setViewMode('table');
                      setCreateExamRequest((value) => value + 1);
                    }}
                    onEditSchedule={() => {
                      setViewMode('table');
                      setEditScheduleRequest((value) => value + 1);
                    }}
                    onReuseSchedule={() => requestScheduleAction('reuse-schedule')}
                    onAutoGenerate={() => requestScheduleAction('auto-generate')}
                    onPeriodStatus={() => requestScheduleAction('period-status')}
                    onByDay={() => requestScheduleAction('by-day')}
                    onByClass={() => requestScheduleAction('by-class')}
                    onByDepartment={() => {
                      if (selectedExamPeriodId) setViewMode('department');
                    }}
                    departmentViewActive={viewMode === 'department'}
                    scheduleContext={scheduleMenuContext}
                    onRules={() => setShowRulesModal(true)}
                    onImport={() => setShowImportModal(true)}
                    onExport={handleExport}
                    exporting={exporting}
                    onBulkDelete={() => setShowBulkDeleteModal(true)}
                    selectedCount={selected.size}
                  />
                </div>
              </div>
            </div>

            <ExamWorkspaceTabs />

            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search exams, subjects or rooms..."
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Exam schedule display"
              className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-1 sm:inline-grid sm:min-w-[280px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors ${viewMode === 'list' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
              >
                <List className="h-4 w-4" />
                List
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'table'}
                onClick={() => setViewMode('table')}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors ${viewMode === 'table' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
              >
                <LayoutGrid className="h-4 w-4" />
                Table Grid
              </button>
            </div>

            {viewMode === 'department' && (
              <DepartmentalExamView
                exams={scopedExams}
                period={selectedPeriodMeta}
                classes={filterClasses}
                onChanged={async () => {
                  await fetchData();
                  await fetchExamPeriods();
                }}
              />
            )}

            {viewMode === 'table' && (
              <ExamTimetable
                exams={visibleExams}
                visibleClassIds={visibleTimetableClassIds}
                onOpen={(exam) => setViewingExam(exam)}
                onChanged={async () => {
                  await fetchData();
                  await fetchExamPeriods();
                }}
                editRequest={editScheduleRequest}
                createRequest={createExamRequest}
                scheduleActionRequest={scheduleActionRequest}
                focusedPeriodId={selectedExamPeriodId || undefined}
                refreshKey={scheduleContextRefreshKey}
                onEditRequestHandled={() => setEditScheduleRequest(0)}
                onCreateRequestHandled={() => setCreateExamRequest(0)}
                onScheduleActionRequestHandled={(id) => {
                  setScheduleActionRequest((current) => current?.id === id ? null : current);
                }}
                onScheduleContextChange={handleScheduleContextChange}
              />
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30">
                <p>{error}</p>
                <button onClick={fetchData} className="mt-1 font-bold text-primary-600 hover:underline">Retry</button>
              </div>
            )}

            {viewMode === 'list' && (
              <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
                <div className="flex flex-col gap-2 border-b border-[var(--color-border-subtle)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-bold text-[var(--color-text-primary)]">Exam Records <span className="text-[var(--color-text-tertiary)]">({visibleExams.length})</span></h2>
                    <p className="text-xs text-[var(--color-text-tertiary)]">Detailed records remain available here for status changes, selection and actions.</p>
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
      {showImportModal && <ExamsImportModal onClose={() => setShowImportModal(false)} onImported={() => {
        void fetchData();
        void fetchExamPeriods();
        setScheduleContextRefreshKey((value) => value + 1);
      }} />}
      {showRulesModal && <ExamScheduleRulesModal onClose={() => {
        setShowRulesModal(false);
        setScheduleContextRefreshKey((value) => value + 1);
      }} />}
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