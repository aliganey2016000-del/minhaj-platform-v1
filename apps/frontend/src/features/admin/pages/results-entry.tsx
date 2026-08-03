/**
 * Enter Results — Admin
 *
 * Course-centric bulk score entry: narrow down to a course via cascading
 * Organization -> Department -> Class -> Course filters (all searchable —
 * no need to scroll a giant flat course list), then key in every enrolled
 * student's Mid Exam / Mid Activity / Final / Final Activity score in one
 * Excel-like sheet (arrow keys/Tab/Enter move between cells, each valid
 * entry auto-saves in the background with a small per-cell "Saved"
 * indicator so nothing is lost if the connection drops). Every course is
 * selectable — if a course has no Grading Rules category matching one of
 * the 4 columns yet, the backend auto-provisions it the moment this page
 * loads that course (see ensureManualEntryCategories in
 * gradebook.controller.ts), so all 4 columns are always fillable. A column
 * an admin marked hidden from teachers (teacherVisible: false on that
 * category) shows as "not set up" for a teacher, same as a genuinely
 * missing category. Multi-tenant: every endpoint here is scoped
 * server-side to the caller's organization and, for teachers, to only the
 * courses they teach.
 *
 * Each field is entered as RAW POINTS out of that category's own configured
 * weight (e.g. "38/40" for a category worth 40% of the grade) rather than a
 * 0-100 percentage — this matches how a teacher actually thinks about
 * grading ("this exam is worth 40 points, they got 38"). The backend still
 * stores/computes everything as a 0-100 percent-of-category internally (so
 * Grading Rules' weighted math and View Results stay unchanged), so this
 * page converts raw points <-> percent on the way in/out — see
 * pointsToPercent/percentToPoints below. A category at 0% weight has no
 * meaningful point cap, so it falls back to a plain 0-100 entry (the
 * zero-weight warning banner below already flags that it won't count).
 *
 * Before a course is picked, the empty space below the filters shows a
 * quick "how much is left" glance (courses fully entered, students graded
 * so far, courses still pending) fed by /gradebook-courses/entry-summary.
 *
 * The "Columns" menu next to the page title lets an admin hide whichever of
 * the 4 score columns they aren't using right now (e.g. only Final Exam
 * week) — purely a client-side display filter (nothing is deleted), and the
 * choice is remembered per-browser via localStorage so it persists across
 * visits without needing a per-course setting.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardEdit, Save, Loader2, AlertTriangle, CheckCircle2, UploadCloud, GraduationCap, Users, Clock, SlidersHorizontal } from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';
import { SearchableSelect, type SearchableSelectOption } from '../../shared/components/searchable-select';
import { BulkImportResultsModal } from './components/bulk-import-results-modal';

function initials(first?: string, last?: string): string {
  return `${(first || '?').charAt(0)}${(last || '').charAt(0)}`.toUpperCase();
}

const AVATAR_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500'];
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

interface CourseBrief {
  _id: string;
  title: { en: string };
  class?: { _id: string; title: string; section: string } | null;
  organization?: { _id: string; name: string } | null;
  department?: { _id: string; name: string } | null;
}

interface EntrySummaryCourse {
  _id: string;
  title: string;
  organization: string;
  department: string;
  courseClass: string;
  totalStudents: number;
  gradedStudents: number;
  completed: boolean;
}

interface EntrySummary {
  coursesTotal: number;
  coursesCompleted: number;
  coursesPending: number;
  studentsGraded: number;
  studentsTotal: number;
  courses: EntrySummaryCourse[];
}

type SummaryTab = 'completed' | 'graded' | 'pending';

type ManualEntrySlot = 'midExam' | 'midActivity' | 'final' | 'finalActivity';
const MANUAL_ENTRY_SLOTS: { slot: ManualEntrySlot; label: string }[] = [
  { slot: 'midExam', label: 'Mid Exam' },
  { slot: 'midActivity', label: 'Mid Activity' },
  { slot: 'final', label: 'Final' },
  { slot: 'finalActivity', label: 'Final Activity' },
];

// Remembered per-browser (not per-course) — an admin who only ever enters
// Final Exam scores this week can hide the other 3 columns once and have
// that stick every time they come back, exactly like a spreadsheet's own
// column visibility.
const HIDDEN_COLUMNS_STORAGE_KEY = 'enterResults.hiddenColumns';

function loadHiddenColumns(): Set<ManualEntrySlot> {
  try {
    const raw = localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.filter((s): s is ManualEntrySlot => MANUAL_ENTRY_SLOTS.some((m) => m.slot === s)));
  } catch {
    return new Set();
  }
}

function ColumnVisibilityMenu({ hidden, onToggle }: { hidden: Set<ManualEntrySlot>; onToggle: (slot: ManualEntrySlot) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
        title="Show or hide score columns"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
        Columns
        {hidden.size > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white">{hidden.size}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-lg py-1.5">
          <p className="px-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Show columns</p>
          {MANUAL_ENTRY_SLOTS.map(({ slot, label }) => (
            <label key={slot} className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer">
              <input
                type="checkbox"
                checked={!hidden.has(slot)}
                onChange={() => onToggle(slot)}
                className="h-3.5 w-3.5 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30"
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface ManualEntryRosterStudent {
  studentId: string;
  studentCode: string;
  studentName: string;
  department: string;
  scores: Record<ManualEntrySlot, number | null>;
}

interface ManualEntryRoster {
  slots: Record<ManualEntrySlot, { key: string; label: string; weight: number } | null>;
  organization: string;
  courseClass: string;
  passingScore: number;
  students: ManualEntryRosterStudent[];
}

interface ResultsEntryProps {
  /** BackButton's fallback route — defaults to the admin exams hub; the teacher portal passes '/teacher'. */
  backFallback?: string;
}

/** A slot's point cap for entry purposes — its category's weight, or 100 when the weight is 0 (nothing meaningful to cap against). */
function entryMax(weight: number | undefined): number {
  return weight && weight > 0 ? weight : 100;
}

/** Stored value (0-100 percent-of-category) -> what the admin sees (raw points out of the category's weight). */
function percentToPoints(percent: number, weight: number | undefined): number {
  if (!weight || weight <= 0) return percent;
  return Math.round((percent / 100) * weight);
}

/** What the admin typed (raw points out of the category's weight) -> stored value (0-100 percent-of-category). */
function pointsToPercent(points: number, weight: number | undefined): number {
  if (!weight || weight <= 0) return Math.min(100, points);
  return Math.min(100, Math.round((points / weight) * 100 * 100) / 100);
}

/** Keeps only digits and a single decimal point, so the field behaves like a number input while still supporting text-input caret APIs (needed for Left/Right cell navigation — native type="number" inputs don't expose selectionStart/End). */
function sanitizeNumericInput(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  return cleaned;
}

const TONE_CLASSES = {
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/20', ring: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', activeRing: 'ring-2 ring-emerald-400' },
  sky: { bg: 'bg-sky-50 dark:bg-sky-950/20', ring: 'text-sky-600 dark:text-sky-400', bar: 'bg-sky-500', activeRing: 'ring-2 ring-sky-400' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/20', ring: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', activeRing: 'ring-2 ring-amber-400' },
} as const;

/** A quick-metric card that doubles as a tab button — tapping it opens a course breakdown panel for that metric, tapping the active one again closes it. */
function MetricCard({ icon, label, value, sub, progress, tone, active, onClick }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; progress?: number;
  tone: keyof typeof TONE_CLASSES; active: boolean; onClick: () => void;
}) {
  const toneClasses = TONE_CLASSES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full text-left rounded-2xl border border-[var(--color-border-default)] ${toneClasses.bg} p-4 transition-shadow hover:shadow-md ${active ? toneClasses.activeRing : ''}`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-primary)] ${toneClasses.ring}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--color-text-tertiary)] truncate">{label}</p>
          <p className="text-lg font-bold text-[var(--color-text-primary)] leading-tight">{value}</p>
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-2.5 h-1.5 w-full rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
          <div className={`h-full rounded-full ${toneClasses.bar}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
      {sub && <p className="mt-1.5 text-[10px] text-[var(--color-text-tertiary)]">{sub}</p>}
    </button>
  );
}

const SUMMARY_TAB_META: Record<SummaryTab, { title: string; empty: string }> = {
  completed: { title: 'Courses fully entered', empty: 'No courses are fully entered yet.' },
  graded: { title: 'Grading progress by course', empty: 'No courses with students yet.' },
  pending: { title: 'Courses still pending entry', empty: 'Nothing pending — all caught up 🎉' },
};

/** The panel that opens under the quick-metric tabs — a responsive, scrollable list of courses for whichever metric is active, each row jumping straight into that course's Enter Results sheet on click. */
function SummaryBreakdownPanel({ tab, courses, onClose, onSelectCourse }: {
  tab: SummaryTab; courses: EntrySummaryCourse[]; onClose: () => void; onSelectCourse: (courseId: string) => void;
}) {
  const rows = tab === 'completed'
    ? courses.filter((c) => c.completed)
    : tab === 'pending'
    ? courses.filter((c) => !c.completed)
    : [...courses].sort((a, b) => b.gradedStudents - a.gradedStudents);
  const meta = SUMMARY_TAB_META[tab];

  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">{meta.title} · {rows.length}</p>
        <button type="button" onClick={onClose} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">Close ✕</button>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-[var(--color-border-subtle)]">
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-[var(--color-text-tertiary)]">{meta.empty}</p>}
        {rows.map((c) => (
          <button
            type="button"
            key={c._id}
            onClick={() => onSelectCourse(c._id)}
            className="w-full flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-surface-tertiary)] transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{c.title}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] truncate">{[c.organization, c.department, c.courseClass].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="h-1.5 w-20 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${c.completed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${c.totalStudents ? Math.min(100, (c.gradedStudents / c.totalStudents) * 100) : 0}%` }}
                />
              </div>
              <span className={`text-xs font-semibold whitespace-nowrap ${c.completed ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--color-text-secondary)]'}`}>
                {c.gradedStudents}/{c.totalStudents}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ResultsEntry({ backFallback = '/admin/exams' }: ResultsEntryProps) {
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [summary, setSummary] = useState<EntrySummary | null>(null);
  const [orgFilter, setOrgFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [roster, setRoster] = useState<ManualEntryRoster | null>(null);
  const [entryValues, setEntryValues] = useState<Record<string, Record<ManualEntrySlot, string>>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, Partial<Record<ManualEntrySlot, string>>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<ManualEntrySlot>>(loadHiddenColumns);
  const [activeSummaryTab, setActiveSummaryTab] = useState<SummaryTab | null>(null);

  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [errorKeys, setErrorKeys] = useState<Set<string>>(new Set());
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const courseIdRef = useRef('');

  const loadSummary = async () => {
    try {
      const { data } = await api.get('/gradebook-courses/entry-summary');
      setSummary(data.data);
    } catch { /* quick-metrics are a nice-to-have; empty state below still works without it */ }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/gradebook-courses');
        setCourses(data.data || []);
      } catch { /* course list stays empty; the empty-state below handles it */ }
    })();
    loadSummary();
  }, []);

  useEffect(() => { courseIdRef.current = selectedCourseId; }, [selectedCourseId]);

  // ---- Cascading filter option lists, derived straight from the course list ----
  const orgOptions: SearchableSelectOption[] = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => { if (c.organization) map.set(c.organization._id, c.organization.name); });
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [courses]);

  const deptOptions: SearchableSelectOption[] = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => {
      if (orgFilter && c.organization?._id !== orgFilter) return;
      if (c.department) map.set(c.department._id, c.department.name);
    });
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [courses, orgFilter]);

  const classOptions: SearchableSelectOption[] = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => {
      if (orgFilter && c.organization?._id !== orgFilter) return;
      if (deptFilter && c.department?._id !== deptFilter) return;
      if (c.class) map.set(c.class._id, `${c.class.title} (${c.class.section})`);
    });
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [courses, orgFilter, deptFilter]);

  const filteredCourses = useMemo(() => courses.filter((c) => {
    if (orgFilter && c.organization?._id !== orgFilter) return false;
    if (deptFilter && c.department?._id !== deptFilter) return false;
    if (classFilter && c.class?._id !== classFilter) return false;
    return true;
  }), [courses, orgFilter, deptFilter, classFilter]);

  const courseOptions: SearchableSelectOption[] = useMemo(() => filteredCourses.map((c) => ({
    value: c._id,
    label: c.title?.en || 'Untitled course',
    sublabel: c.class ? `${c.class.title} (${c.class.section})` : undefined,
  })), [filteredCourses]);

  const visibleSlots = useMemo(() => MANUAL_ENTRY_SLOTS.filter(({ slot }) => !hiddenColumns.has(slot)), [hiddenColumns]);

  const toggleColumn = (slot: ManualEntrySlot) => {
    setHiddenColumns((prev) => {
      const isHiding = !prev.has(slot);
      if (isHiding && prev.size >= MANUAL_ENTRY_SLOTS.length - 1) return prev; // always keep at least one column visible
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot); else next.add(slot);
      localStorage.setItem(HIDDEN_COLUMNS_STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleOrgChange = (v: string) => { setOrgFilter(v); setDeptFilter(''); setClassFilter(''); setSelectedCourseId(''); setRoster(null); };
  const handleDeptChange = (v: string) => { setDeptFilter(v); setClassFilter(''); setSelectedCourseId(''); setRoster(null); };
  const handleClassChange = (v: string) => { setClassFilter(v); setSelectedCourseId(''); setRoster(null); };

  const loadCourse = async (courseId: string) => {
    setSelectedCourseId(courseId);
    setMessage('');
    Object.values(autoSaveTimers.current).forEach(clearTimeout);
    autoSaveTimers.current = {};
    setSavingKeys(new Set());
    setSavedKeys(new Set());
    setErrorKeys(new Set());
    if (!courseId) { setRoster(null); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/gradebook/${courseId}/manual-entry-roster`);
      const r: ManualEntryRoster = data.data;
      setRoster(r);
      setFieldErrors({});
      const values: Record<string, Record<ManualEntrySlot, string>> = {};
      r.students.forEach((s) => {
        const row = {} as Record<ManualEntrySlot, string>;
        MANUAL_ENTRY_SLOTS.forEach(({ slot }) => {
          const percent = s.scores[slot];
          row[slot] = percent === null ? '' : String(percentToPoints(percent, r.slots[slot]?.weight));
        });
        values[s.studentId] = row;
      });
      setEntryValues(values);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  /** Jumping in from a quick-metric tab's course list bypasses the cascading filters entirely (a course from "Pending" might not match whatever Org/Dept/Class is currently picked), so those reset here to guarantee the target course shows up in the Course picker. */
  const jumpToCourse = (courseId: string) => {
    setOrgFilter('');
    setDeptFilter('');
    setClassFilter('');
    setActiveSummaryTab(null);
    loadCourse(courseId);
  };

  const toggleSummaryTab = (tab: SummaryTab) => {
    setActiveSummaryTab((prev) => (prev === tab ? null : tab));
  };

  const hasFieldErrors = Object.values(fieldErrors).some((row) => Object.keys(row).length > 0);

  const scheduleAutoSave = (studentId: string, slot: ManualEntrySlot, points: number, weight: number | undefined) => {
    const key = `${studentId}_${slot}`;
    if (autoSaveTimers.current[key]) clearTimeout(autoSaveTimers.current[key]);
    autoSaveTimers.current[key] = setTimeout(async () => {
      const courseId = courseIdRef.current;
      if (!courseId) return;
      setSavingKeys((prev) => new Set(prev).add(key));
      setErrorKeys((prev) => { if (!prev.has(key)) return prev; const next = new Set(prev); next.delete(key); return next; });
      try {
        const score = pointsToPercent(points, weight);
        await api.post(`/gradebook/${courseId}/manual-entry-roster/bulk`, { entries: [{ studentId, slot, score }] });
        setSavedKeys((prev) => new Set(prev).add(key));
      } catch {
        setErrorKeys((prev) => new Set(prev).add(key));
      } finally {
        setSavingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
      }
    }, 700);
  };

  const handleEntryChange = (studentId: string, slot: ManualEntrySlot, value: string) => {
    setEntryValues((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [slot]: value } }));

    const cat = roster?.slots[slot];
    const max = entryMax(cat?.weight);
    const num = Number(value);
    const outOfRange = value !== '' && !Number.isNaN(num) && (num > max || num < 0);
    setFieldErrors((prev) => {
      const rowErrors = { ...(prev[studentId] || {}) };
      if (outOfRange) {
        rowErrors[slot] = num > max
          ? `Max ${max} — this is ${MANUAL_ENTRY_SLOTS.find((s) => s.slot === slot)?.label}'s configured weight for this course`
          : 'Must be 0 or higher';
      } else {
        delete rowErrors[slot];
      }
      return { ...prev, [studentId]: rowErrors };
    });

    const key = `${studentId}_${slot}`;
    if (autoSaveTimers.current[key]) { clearTimeout(autoSaveTimers.current[key]); delete autoSaveTimers.current[key]; }
    setSavedKeys((prev) => { if (!prev.has(key)) return prev; const next = new Set(prev); next.delete(key); return next; });
    setErrorKeys((prev) => { if (!prev.has(key)) return prev; const next = new Set(prev); next.delete(key); return next; });

    if (value !== '' && !Number.isNaN(num) && !outOfRange) {
      scheduleAutoSave(studentId, slot, num, cat?.weight);
    }
  };

  // ---- Excel-like keyboard navigation: Up/Down move within a column, Enter
  // moves down (matches spreadsheet muscle memory), Left/Right move between
  // the 4 slot columns only when the caret is already at that edge of the
  // text (so normal in-place editing isn't hijacked). Tab/Shift+Tab already
  // work for free via natural DOM order. ----
  const focusCell = (row: number, col: number) => {
    const el = cellRefs.current[`${row}_${col}`];
    if (el) { el.focus(); el.select(); }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      focusCell(row + 1, col);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(row - 1, col);
    } else if (e.key === 'ArrowRight') {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length) { e.preventDefault(); focusCell(row, col + 1); }
    } else if (e.key === 'ArrowLeft') {
      const input = e.currentTarget;
      if (input.selectionStart === 0) { e.preventDefault(); focusCell(row, col - 1); }
    }
  };

  const handleSubmit = async () => {
    if (!selectedCourseId || !roster || roster.students.length === 0) return;

    if (hasFieldErrors) {
      setError('Fix the highlighted scores before saving — they exceed the category\'s configured weight.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const entries: { studentId: string; slot: ManualEntrySlot; score: number }[] = [];
      roster.students.forEach((s) => {
        MANUAL_ENTRY_SLOTS.forEach(({ slot }) => {
          const cat = roster.slots[slot];
          if (!cat) return;
          const raw = entryValues[s.studentId]?.[slot];
          if (raw === undefined || raw === '') return;
          const points = Number(raw);
          if (!Number.isNaN(points)) entries.push({ studentId: s.studentId, slot, score: pointsToPercent(points, cat.weight) });
        });
      });

      if (entries.length === 0) {
        setError('Enter at least one score before saving.');
        return;
      }

      const { data } = await api.post(`/gradebook/${selectedCourseId}/manual-entry-roster/bulk`, { entries });
      const saved = data.data?.saved ?? entries.length;
      setMessage(`Saved ${saved} score${saved === 1 ? '' : 's'}.`);
      setSavedKeys(new Set(entries.map((en) => `${en.studentId}_${en.slot}`)));
      loadSummary();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save results');
    } finally {
      setSaving(false);
    }
  };

  const anySaving = savingKeys.size > 0;
  const anyError = errorKeys.size > 0;
  const anySaved = savedKeys.size > 0;

  return (
    <div className="p-6 lg:p-8 pt-20 lg:pt-6">
      <div className="mx-auto max-w-none space-y-4">
        <div>
          <BackButton fallback={backFallback} />
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                <ClipboardEdit className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Enter Results</h1>
                <p className="text-sm text-[var(--color-text-tertiary)] truncate">Record Mid Exam, Mid Activity, Final, and Final Activity scores for a course</p>
              </div>
            </div>
            <ColumnVisibilityMenu hidden={hiddenColumns} onToggle={toggleColumn} />
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5 block">Organization</label>
              <SearchableSelect value={orgFilter} onChange={handleOrgChange} options={orgOptions} placeholder="All organizations" searchPlaceholder="Search organizations..." />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5 block">Department</label>
              <SearchableSelect value={deptFilter} onChange={handleDeptChange} options={deptOptions} placeholder="All departments" searchPlaceholder="Search departments..." disabled={deptOptions.length === 0} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5 block">Class / Grade</label>
              <SearchableSelect value={classFilter} onChange={handleClassChange} options={classOptions} placeholder="All classes" searchPlaceholder="Search classes..." disabled={classOptions.length === 0} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5 block">Course</label>
              <SearchableSelect value={selectedCourseId} onChange={loadCourse} options={courseOptions} placeholder="Choose a course..." searchPlaceholder="Search courses..." emptyMessage="No courses match these filters." />
            </div>
          </div>
          {roster && (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {roster.organization}{roster.organization && roster.courseClass ? ' · ' : ''}{roster.courseClass}
              <span className="mx-1.5">|</span>
              Passing score: <strong className="text-[var(--color-text-secondary)]">{roster.passingScore}%</strong>
            </p>
          )}
          {courses.length === 0 && (
            <p className="text-xs text-[var(--color-text-tertiary)]">No courses found.</p>
          )}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}
        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700 dark:text-green-400">{message}</div>}

        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          </div>
        )}

        {!loading && !selectedCourseId && (
          <div className="space-y-3">
            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MetricCard
                  icon={<GraduationCap className="h-4 w-4" strokeWidth={2} />}
                  label="Courses Completed"
                  value={`${summary.coursesCompleted}/${summary.coursesTotal}`}
                  progress={summary.coursesTotal ? (summary.coursesCompleted / summary.coursesTotal) * 100 : 0}
                  tone="emerald"
                  active={activeSummaryTab === 'completed'}
                  onClick={() => toggleSummaryTab('completed')}
                />
                <MetricCard
                  icon={<Users className="h-4 w-4" strokeWidth={2} />}
                  label="Students Graded"
                  value={`${summary.studentsGraded}/${summary.studentsTotal}`}
                  progress={summary.studentsTotal ? (summary.studentsGraded / summary.studentsTotal) * 100 : 0}
                  tone="sky"
                  active={activeSummaryTab === 'graded'}
                  onClick={() => toggleSummaryTab('graded')}
                />
                <MetricCard
                  icon={<Clock className="h-4 w-4" strokeWidth={2} />}
                  label="Courses Pending Entry"
                  value={`${summary.coursesPending}`}
                  sub={summary.coursesPending === 0 ? 'All caught up 🎉' : 'Still waiting on scores'}
                  tone="amber"
                  active={activeSummaryTab === 'pending'}
                  onClick={() => toggleSummaryTab('pending')}
                />
              </div>
            )}
            {summary && activeSummaryTab && (
              <SummaryBreakdownPanel
                tab={activeSummaryTab}
                courses={summary.courses}
                onClose={() => setActiveSummaryTab(null)}
                onSelectCourse={jumpToCourse}
              />
            )}
            {!activeSummaryTab && (
              <div className="text-center py-10 text-[var(--color-text-tertiary)]"><p className="text-lg">👆 Select a course above to enter results</p></div>
            )}
          </div>
        )}

        {!loading && selectedCourseId && roster && roster.students.length > 0 && (
          <>
            {(() => {
              const zeroWeightLabels = visibleSlots.filter(({ slot }) => roster.slots[slot] && roster.slots[slot]!.weight === 0).map(({ label }) => label);
              if (zeroWeightLabels.length === 0) return null;
              return (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3.5 flex items-start gap-2.5 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" strokeWidth={2} />
                  <p>
                    <strong>{zeroWeightLabels.join(', ')}</strong> {zeroWeightLabels.length === 1 ? 'is' : 'are'} set to 0% weight for this course —
                    scores entered here are saved but won't affect the student's Final Grade until you assign a weight to{' '}
                    {zeroWeightLabels.length === 1 ? 'it' : 'them'} in Grading Rules.
                  </p>
                </div>
              );
            })()}
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="px-4 py-2.5 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] flex items-center justify-between">
              <p className="text-xs text-[var(--color-text-tertiary)]">{roster.students.length} students · scores auto-save as you type</p>
              {anySaving ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              ) : anyError ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-950/40 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" /> {errorKeys.size} didn't save — check connection
                </span>
              ) : anySaved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Saved
                </span>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: '26%' }} />
                  <col className="hidden sm:table-column" style={{ width: '18%' }} />
                  {visibleSlots.map(({ slot }) => (
                    <col key={slot} style={{ width: `${56 / visibleSlots.length}%` }} />
                  ))}
                </colgroup>
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Student Name / ID</th>
                    <th className="text-left px-4 py-2 font-semibold hidden sm:table-cell">Organization / Department</th>
                    {visibleSlots.map(({ slot, label }) => {
                      const zeroWeight = roster.slots[slot] && roster.slots[slot]!.weight === 0;
                      return (
                        <th key={slot} className="text-left px-4 py-2 font-semibold">
                          <span className="inline-flex items-center gap-1">
                            {label}
                            {zeroWeight && (
                              <span title="0% weight — scores here won't count toward the Final Grade until you set a weight in Grading Rules">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" strokeWidth={2} />
                              </span>
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {roster.students.map((s, i) => (
                    <tr key={s.studentId} className={`border-b border-[var(--color-border-subtle)] ${i % 2 === 1 ? 'bg-slate-50 dark:bg-slate-800/40' : ''}`}>
                      <td className="px-4 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarColor(s.studentId)}`}>
                            {initials(s.studentName.split(' ')[0], s.studentName.split(' ').slice(1).join(' '))}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium truncate leading-tight">{s.studentName || 'Unknown Student'}</p>
                            <code className="text-[10px] text-[var(--color-text-tertiary)]">{s.studentCode}</code>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-1.5 hidden sm:table-cell text-xs text-[var(--color-text-secondary)] truncate">
                        {roster.organization}{roster.organization && s.department ? ' · ' : ''}{s.department}
                      </td>
                      {visibleSlots.map(({ slot }, si) => {
                        const cat = roster.slots[slot];
                        const active = !!cat;
                        const max = entryMax(cat?.weight);
                        const fieldError = fieldErrors[s.studentId]?.[slot];
                        const key = `${s.studentId}_${slot}`;
                        const value = entryValues[s.studentId]?.[slot] || '';
                        const filled = active && value !== '' && !fieldError;
                        return (
                          <td className="px-4 py-1.5" key={slot}>
                            <div className="relative">
                              <input
                                ref={(el) => { cellRefs.current[`${i}_${si}`] = el; }}
                                type="text"
                                inputMode="decimal"
                                value={value}
                                onChange={(e) => handleEntryChange(s.studentId, slot, sanitizeNumericInput(e.target.value))}
                                onKeyDown={(e) => handleCellKeyDown(e, i, si)}
                                disabled={!active}
                                className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 disabled:opacity-30 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                                  fieldError
                                    ? 'border-red-400 bg-[var(--color-surface-primary)] focus:ring-red-500/30'
                                    : filled
                                    ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 focus:ring-primary-500/30'
                                    : active
                                    ? 'border-[var(--color-border-default)] bg-amber-50/40 dark:bg-amber-950/10 focus:ring-primary-500/30'
                                    : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] focus:ring-primary-500/30'
                                }`}
                                placeholder={active ? `/ ${max}` : 'not set up'}
                              />
                              {active && (
                                <span className="absolute -top-1.5 -right-1.5">
                                  {savingKeys.has(key) && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
                                  {!savingKeys.has(key) && savedKeys.has(key) && <CheckCircle2 className="h-3 w-3 text-emerald-500" strokeWidth={2.5} />}
                                  {!savingKeys.has(key) && errorKeys.has(key) && <AlertTriangle className="h-3 w-3 text-red-500" strokeWidth={2.5} />}
                                </span>
                              )}
                            </div>
                            {fieldError && <p className="mt-0.5 text-[10px] leading-tight text-red-500">{fieldError}</p>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--color-text-tertiary)]">{roster.students.length} students</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImport(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                >
                  <UploadCloud className="h-4 w-4" strokeWidth={2} />
                  Bulk Import
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || hasFieldErrors}
                  title={hasFieldErrors ? 'Fix the highlighted scores before saving' : undefined}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors shadow-md"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save All'}
                </button>
              </div>
            </div>
          </div>
          </>
        )}

        {!loading && selectedCourseId && roster && roster.students.length === 0 && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">No students enrolled in this course.</p></div>
        )}

        {showImport && selectedCourseId && (
          <BulkImportResultsModal
            courseId={selectedCourseId}
            onClose={() => setShowImport(false)}
            onImported={() => { loadCourse(selectedCourseId); loadSummary(); }}
          />
        )}
      </div>
    </div>
  );
}

export default ResultsEntry;
