/**
 * Class Schedules Management — Admin
 *
 * CRUD for class scheduling. Links organization, class, course, teacher,
 * day of week (Sunday–Saturday), and start/end times.
 *
 * Cascading dropdowns:
 *   1. Organization → filtered Classes for that org
 *   2. Class → filtered Courses assigned to that class
 *   3. Course → auto-fills Teacher if one is already assigned in Course Builder
 *
 * Org Admin: Organization field is locked to their own org.
 *
 * Smart Loading:
 *   - No data fetched on initial mount — shows "Please apply a filter to view records."
 *   - Super admin MUST pick an Organization (or "All") before fetching.
 *   - Filter changes trigger API calls with pagination & server-side filtering.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Pencil, Trash2, CalendarDays, Search, CheckCircle2, X } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { ColumnFilterHeader, useColumnFilters } from '../components/column-filter-header';

// ---------------------------------------------------------------------------
// Row Actions — single "⋮" dropdown replacing individual Edit/Delete links.
// ---------------------------------------------------------------------------

function RowActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (<>
    <button
      ref={btnRef}
      onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      className="rounded-lg border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-1.5 text-[var(--color-text-secondary)] shadow-sm hover:bg-[var(--color-surface-tertiary)] transition-colors"
      title="More Actions"
    >
      <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
    </button>
    {open && btnRef.current && createPortal(
      <div
        ref={menuRef}
        style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().bottom + 4, right: window.innerWidth - btnRef.current.getBoundingClientRect().right, zIndex: 100 }}
        className="w-40 rounded-xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] shadow-md py-1"
      >
        <button onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-primary-600 hover:bg-[var(--color-surface-tertiary)] transition-colors">
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} /> Edit
        </button>
        <button onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-red-600 hover:bg-[var(--color-surface-tertiary)] transition-colors">
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Delete
        </button>
      </div>,
      document.body,
    )}
  </>);
}

// ---------------------------------------------------------------------------
// Page Header Actions — Import / Export / New Schedule / Bulk Delete, tucked
// behind a single "⋮" button so the header has room for the title.
// ---------------------------------------------------------------------------

function SchedulesActionsMenu({ onImport, onExport, exporting, onNew, onBulkDelete, selectedCount }: {
  onImport: () => void;
  onExport: () => void;
  exporting: boolean;
  onNew: () => void;
  onBulkDelete: () => void;
  selectedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (<>
    <button
      ref={btnRef}
      onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-[var(--color-text-secondary)] shadow-sm hover:bg-[var(--color-surface-tertiary)] transition-colors"
      title="More Actions"
    >
      <MoreVertical className="h-5 w-5" strokeWidth={1.75} />
    </button>
    {open && btnRef.current && createPortal(
      <div
        ref={menuRef}
        style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().bottom + 4, right: window.innerWidth - btnRef.current.getBoundingClientRect().right, zIndex: 100 }}
        className="w-56 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-elevated py-1"
      >
        <button onClick={() => { setOpen(false); onNew(); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">+ New Schedule</button>
        <button onClick={() => { setOpen(false); onImport(); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">↑ Import Excel</button>
        <button onClick={() => { setOpen(false); onExport(); }} disabled={exporting} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-50 transition-colors">↓ Export Excel</button>
        <div className="my-1 border-t border-[var(--color-border-subtle)]" />
        <button onClick={() => { setOpen(false); onBulkDelete(); }} disabled={selectedCount === 0} className="w-full text-left px-4 py-2.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          🗑️ Bulk Delete{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>
      </div>,
      document.body,
    )}
  </>);
}

interface SchoolBrief { _id: string; name: string; }
interface DepartmentBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; school?: string | { _id: string }; department?: string | { _id: string; name: string }; }
interface CourseBrief { _id: string; title: { en: string }; teacher?: string | { _id: string; profile?: { firstName: string; lastName: string } }; }
interface TeacherBrief { _id: string; name?: string; profile?: { firstName: string; lastName: string }; }
interface Schedule {
  _id: string;
  school: SchoolBrief;
  class: ClassBrief;
  course: CourseBrief;
  teacher: TeacherBrief;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface ScheduleColumnParams {
  schoolIds: string[];
  departmentIds: string[];
  classIds: string[];
  courseIds: string[];
  teacherIds: string[];
  days: string[];
  statuses: string[];
  sortBy: string | null;
  sortDir: 'asc' | 'desc';
}
const EMPTY_SCHEDULE_COLUMN_PARAMS: ScheduleColumnParams = {
  schoolIds: [], departmentIds: [], classIds: [], courseIds: [], teacherIds: [], days: [], statuses: [], sortBy: null, sortDir: 'asc',
};
const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];

export function SchedulesManage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const isOrgAdmin = user?.role === 'org_admin';

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Import / Export state
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ totalRows: number; created: number; failed: number; errors: { row: number; message: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteError, setPasteError] = useState('');

  // Reference data
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [departments, setDepartments] = useState<DepartmentBrief[]>([]);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [teachers, setTeachers] = useState<TeacherBrief[]>([]);

  // Cascading loading flags
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [classesLoading, setClassesLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);

  // Filters — NO initial fetch, user must apply filters first
  const [filterSchool, setFilterSchool] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [hasFetched, setHasFetched] = useState(false);

  // Column filters (Excel-style headers) — Day and Status used to be
  // standalone selects; both are now handled by their column header instead
  // (a strict superset — multi-select vs single-select, and Status is now a
  // real server-side filter instead of the old client-side-only one that
  // silently only ever filtered whatever page happened to be loaded).
  const [columnParams, setColumnParams] = useState<ScheduleColumnParams>(EMPTY_SCHEDULE_COLUMN_PARAMS);
  const [filterDepartments, setFilterDepartments] = useState<DepartmentBrief[]>([]);
  const [filterClasses, setFilterClasses] = useState<ClassBrief[]>([]);
  const [filterCourses, setFilterCourses] = useState<CourseBrief[]>([]);

  // Bulk selection / delete — `selected` holds explicitly-checked rows on
  // the loaded page; `selectAllMatching` is a separate "every schedule
  // matching the current filters, across every page" mode entered via the
  // banner upsell below, not implied by ticking every row on one page.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Form values
  const [formSchool, setFormSchool] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formClass, setFormClass] = useState('');
  const [formCourse, setFormCourse] = useState('');
  const [formTeacher, setFormTeacher] = useState('');
  const [formDay, setFormDay] = useState(0);
  const [formStart, setFormStart] = useState('08:00');
  const [formEnd, setFormEnd] = useState('09:30');
  const [formActive, setFormActive] = useState(true);

  const [saving, setSaving] = useState(false);

  // ── Helper: extract teacher ID from course data ──
  function extractTeacherId(course: any): string | null {
    if (!course?.teacher) return null;
    if (typeof course.teacher === 'string') return course.teacher;
    if (course.teacher._id) return course.teacher._id;
    return null;
  }

  // ── Fetch schedules (called only when filters are applied) ──
  const fetchSchedules = useCallback(async (pageNum = 1, overrideParams?: ScheduleColumnParams) => {
    setLoading(true);
    setError('');
    try {
      const cp = overrideParams ?? columnParams;
      const params: any = { page: String(pageNum), limit: String(limit) };
      // Organization column header filter wins over the top-bar org select —
      // backend accepts comma-separated multi-value for ?school=
      if (cp.schoolIds.length > 0) params.school = cp.schoolIds.join(',');
      else if (filterSchool) params.school = filterSchool;
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (cp.departmentIds.length > 0) params.department = cp.departmentIds.join(',');
      if (cp.classIds.length > 0) params.class = cp.classIds.join(',');
      if (cp.courseIds.length > 0) params.course = cp.courseIds.join(',');
      if (cp.teacherIds.length > 0) params.teacher = cp.teacherIds.join(',');
      if (cp.days.length > 0) params.day = cp.days.join(',');
      if (cp.statuses.length > 0) params.status = cp.statuses.join(',');
      if (cp.sortBy) { params.sortBy = cp.sortBy; params.sortDir = cp.sortDir; }

      const { data } = await api.get('/class-schedules', { params });
      const items = data.data || [];
      setSchedules(items);
      setTotal(data.meta?.total || 0);
      setHasFetched(true);
      setSelected(new Set());
      setSelectAllMatching(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [filterSchool, searchTerm, columnParams]);

  // ── Column filter dropdown options (Department/Class/Course), scoped to
  // the selected organization — same "options fetch on org change" pattern
  // as Students' Class column filter. ──
  useEffect(() => {
    if (!filterSchool) {
      setFilterDepartments([]);
      setFilterClasses([]);
      setFilterCourses([]);
      return;
    }
    (async () => {
      try {
        const [dRes, cRes, coRes] = await Promise.all([
          api.get(`/departments?school=${filterSchool}`),
          api.get(`/classes?schoolId=${filterSchool}&status=active&limit=200`),
          api.get(`/courses/admin?school=${filterSchool}&limit=200`),
        ]);
        setFilterDepartments(dRes.data.data || []);
        setFilterClasses(cRes.data.data || []);
        setFilterCourses(coRes.data.data || []);
      } catch { /* non-critical — filter dropdowns just show fewer options */ }
    })();
  }, [filterSchool]);

  // ── Column filter commit -> server refetch ──
  const handleColumnFilterChange = (state: { filters: Record<string, string[]>; sortBy: string | null; sortDir: 'asc' | 'desc' }) => {
    const next: ScheduleColumnParams = {
      schoolIds: state.filters.organization || [],
      departmentIds: state.filters.department || [],
      classIds: state.filters.class || [],
      courseIds: state.filters.course || [],
      teacherIds: state.filters.teacher || [],
      days: state.filters.day || [],
      statuses: state.filters.status || [],
      sortBy: state.sortBy,
      sortDir: state.sortDir,
    };
    setColumnParams(next);
    setPage(1);
    fetchSchedules(1, next);
  };

  // ── Load schools + all-classes/all-teachers on mount ──
  useEffect(() => {
    (async () => {
      try {
        const [sRes, tRes] = await Promise.all([
          api.get('/schools'),
          api.get('/teachers'),
        ]);
        setSchools(sRes.data.data || []);
        setTeachers(tRes.data.data || []);

        if (isOrgAdmin) {
          const orgSchool = sRes.data.data?.[0];
          if (orgSchool) {
            setFilterSchool(orgSchool._id);
            setFormSchool(orgSchool._id);
          }
        }
      } catch { /* ignore */ }
    })();
  }, [isOrgAdmin]);

  // ── When org admin auto-locks, trigger first fetch ──
  useEffect(() => {
    if (isOrgAdmin && filterSchool && !hasFetched) {
      fetchSchedules(1);
    }
  }, [isOrgAdmin, filterSchool, hasFetched, fetchSchedules]);

  // ── Apply Filters ──
  const handleApplyFilters = () => {
    if (isSuperAdmin && !filterSchool) {
      setError('Please select an organization to view schedules.');
      return;
    }
    setPage(1);
    fetchSchedules(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchSchedules(newPage);
  };

  // ── Cascading 1: School → Departments (form) ──
  useEffect(() => {
    if (!formSchool) {
      setDepartments([]);
      setFormDepartment('');
      return;
    }
    setDepartmentsLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/departments?school=${formSchool}`);
        setDepartments(data.data || []);
      } catch {
        setDepartments([]);
      } finally {
        setDepartmentsLoading(false);
      }
    })();
  }, [formSchool]);

  // ── Cascading 2: Department → Classes ──
  useEffect(() => {
    if (!formDepartment) {
      setClasses([]);
      setFormClass('');
      return;
    }
    setClassesLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/classes?department=${formDepartment}&status=active`);
        setClasses(data.data || []);
      } catch {
        setClasses([]);
      } finally {
        setClassesLoading(false);
      }
    })();
  }, [formDepartment]);

  // ── Cascading 3: Class → Courses ──
  useEffect(() => {
    if (!formClass) {
      setCourses([]);
      setFormCourse('');
      return;
    }
    setCoursesLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/courses/admin?classId=${formClass}&limit=200`);
        setCourses(data.data || []);
      } catch {
        setCourses([]);
      } finally {
        setCoursesLoading(false);
      }
    })();
  }, [formClass]);

  // ── Dual-state 3: Course → Teacher ──
  // State A (course already has a teacher): lock the field to that teacher.
  // State B (no teacher on the course yet): clear it so the admin must pick
  // one from the active roster. Skipped while editing an existing schedule
  // — that schedule's own saved teacher (which may differ from the course's
  // current default) must not be silently overwritten by this effect.
  useEffect(() => {
    if (editId) return;
    if (!formCourse) { setFormTeacher(''); return; }
    const selectedCourse = courses.find((c) => c._id === formCourse);
    if (selectedCourse) {
      setFormTeacher(extractTeacherId(selectedCourse) || '');
    } else {
      (async () => {
        try {
          const { data } = await api.get(`/courses/${formCourse}/admin`);
          setFormTeacher(extractTeacherId(data.data) || '');
        } catch {
          setFormTeacher('');
        }
      })();
    }
  }, [formCourse, courses, editId]);

  // ── Clear downstream selections ──
  const handleSchoolChange = (schoolId: string) => {
    setFormSchool(schoolId);
    setFormDepartment('');
    setFormClass('');
    setFormCourse('');
    setFormTeacher('');
  };

  const handleDepartmentChange = (deptId: string) => {
    setFormDepartment(deptId);
    setFormClass('');
    setFormCourse('');
    setFormTeacher('');
  };

  const handleClassChange = (classId: string) => {
    setFormClass(classId);
    setFormCourse('');
    setFormTeacher('');
  };

  // ── Submit form ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        school: formSchool,
        class: formClass,
        course: formCourse,
        teacher: formTeacher,
        dayOfWeek: formDay,
        startTime: formStart,
        endTime: formEnd,
        isActive: formActive,
      };
      if (editId) {
        await api.put(`/class-schedules/${editId}`, payload);
        setMessage('Schedule updated');
      } else {
        await api.post('/class-schedules', payload);
        setMessage('Schedule created');
      }
      resetForm();
      fetchSchedules(page);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormSchool(isOrgAdmin ? formSchool : '');
    setFormDepartment(''); setFormClass(''); setFormCourse('');
    setFormTeacher(''); setFormDay(0); setFormStart('08:00');
    setFormEnd('09:30'); setFormActive(true); setEditId(null); setShowForm(false);
  };

  const handleEdit = (s: Schedule) => {
    const deptId = typeof s.class?.department === 'string' ? s.class.department : s.class?.department?._id;
    setFormSchool(s.school._id);
    setTimeout(() => {
      if (deptId) setFormDepartment(deptId);
      setTimeout(() => {
        setFormClass(s.class._id);
        setTimeout(() => {
          setFormCourse(s.course._id);
          setFormTeacher(s.teacher._id);
        }, 100);
      }, 100);
    }, 100);
    setFormDay(s.dayOfWeek);
    setFormStart(s.startTime);
    setFormEnd(s.endTime);
    setFormActive(s.isActive);
    setEditId(s._id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this schedule?')) return;
    try {
      await api.delete(`/class-schedules/${id}`);
      fetchSchedules(page);
      setMessage('Schedule deleted');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Delete failed');
    }
  };

  const teacherLabel = (t?: TeacherBrief | null): string => {
    if (!t) return 'Not Assigned';
    const fullName = t.profile ? `${t.profile.firstName || ''} ${t.profile.lastName || ''}`.trim() : '';
    return fullName || (t as any).name || 'Not Assigned';
  };

  // ── Excel-style column header filters (server-side) ──
  const scheduleColumnAccessors: Record<string, (s: Schedule) => string> = {
    organization: (s) => s.school?.name || '',
    time: (s) => s.startTime || '',
    department: (s) => (typeof s.class?.department === 'string' ? '' : s.class?.department?.name || ''),
    class: (s) => `${s.class?.title || ''} ${s.class?.section || ''}`,
    course: (s) => s.course?.title?.en || '',
    teacher: (s) => teacherLabel(s.teacher),
    day: (s) => DAYS[s.dayOfWeek] || '',
    status: (s) => (s.isActive ? 'Active' : 'Inactive'),
  };
  const {
    columnFilters: scheduleColumnFilters,
    sortCol: scheduleSortCol,
    sortDir: scheduleSortDir,
    applyColumnCommit: applyScheduleColumnCommit,
    clearColumnFilter: clearScheduleColumnFilter,
  } = useColumnFilters(schedules, scheduleColumnAccessors, { onChange: handleColumnFilterChange });

  // ── Derived: is the currently-selected course's teacher pre-assigned? ──
  const selectedCourseForTeacher = courses.find((c) => c._id === formCourse);
  const preAssignedTeacherId = extractTeacherId(selectedCourseForTeacher);
  const isTeacherLocked = !!preAssignedTeacherId;
  const preAssignedTeacherLabel = (() => {
    if (!preAssignedTeacherId) return '';
    const courseTeacher = (selectedCourseForTeacher as any)?.teacher;
    if (courseTeacher && typeof courseTeacher === 'object' && (courseTeacher.profile || (courseTeacher as any).name)) {
      return teacherLabel(courseTeacher);
    }
    const fromRoster = teachers.find((t: any) => t._id === preAssignedTeacherId);
    return fromRoster ? teacherLabel(fromRoster) : 'Assigned teacher';
  })();

  // ───────────────────────────────────────────────────────────────────────
  // Import Modal Logic
  // ───────────────────────────────────────────────────────────────────────

  const openImportModal = () => {
    setShowImportModal(true);
    setImportMode('upload');
    setSelectedFile(null);
    setPasteText('');
    setPasteError('');
    setImportResult(null);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setSelectedFile(null);
    setPasteText('');
    setPasteError('');
    setImportResult(null);
  };

  // ── Download Template ──
  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/class-schedules/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'class-schedules-template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download template');
    }
  };

  // ── File Upload ──
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const submitFileImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setError('');
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const { data } = await api.post('/class-schedules/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(data.data);
      if (data.data?.created > 0) {
        setMessage(`Imported ${data.data.created} of ${data.data.totalRows} schedules`);
        fetchSchedules(page);
        // Only auto-close when every row succeeded — closing unconditionally
        // as soon as ANY row succeeded hid the per-row error table for the
        // rest (e.g. "120 of 400 imported" with no way to see why the other
        // 280 failed), which looked like a silent row-count cap rather than
        // what it actually was: real per-row validation failures.
        if (!data.data?.failed) closeImportModal();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // ── Manual Copy & Paste ──
  const parsePastedRows = (): string[][] => {
    if (!pasteText.trim()) return [];
    const lines = pasteText.trim().split(/\r?\n/);
    return lines
      .map((line) => line.split('\t').map((cell) => cell.trim()))
      .filter((row) => row.length > 0 && row.some((cell) => cell !== ''));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Allow default paste behavior; the textarea value updates naturally
  };

  const submitPasteImport = async () => {
    const rows = parsePastedRows();
    if (rows.length === 0) {
      setPasteError('Please paste at least one row of data before submitting.');
      return;
    }

    // First row should be header. Column count isn't validated client-side
    // beyond "more than one" — the backend accepts several equivalent
    // shapes (e.g. a single combined "Time" column instead of separate
    // Start/End Time), so a strict count here could reject a valid paste
    // the backend would otherwise accept. Let the backend's per-row errors
    // (shown after submit) be the source of truth.
    if (rows[0].length < 2) {
      setPasteError('That doesn\'t look like tabular data — make sure each row has more than one tab-separated column.');
      return;
    }

    // Build CSV from pasted data and upload as file
    const csvContent = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], 'pasted-schedules.csv', { type: 'text/csv' });

    setImporting(true);
    setError('');
    setImportResult(null);
    setPasteError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/class-schedules/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(data.data);
      if (data.data?.created > 0) {
        setMessage(`Imported ${data.data.created} of ${data.data.totalRows} schedules`);
        fetchSchedules(page);
        if (!data.data?.failed) closeImportModal();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // ── Export Excel ──
  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/class-schedules/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `class-schedules-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setMessage('Export downloaded successfully');
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const parsedRows = parsePastedRows();

  // ── Bulk selection / delete ──
  const allOnPageSelected = schedules.length > 0 && schedules.every((s) => selected.has(s._id));
  const selectedCount = selectAllMatching ? total : selected.size;
  // Unchecking a single row while "all matching" mode is active collapses
  // down to "this page, minus that one row" — there's no backend concept of
  // excluding one id from an all-pages match, so this is the sane
  // approximation rather than the checkbox appearing to ignore the click.
  const toggleSelected = (id: string) => {
    if (selectAllMatching) { setSelectAllMatching(false); setSelected(new Set(schedules.map((s) => s._id).filter((sid) => sid !== id))); return; }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectAllMatching) { setSelectAllMatching(false); setSelected(new Set()); return; }
    setSelected(allOnPageSelected ? new Set() : new Set(schedules.map((s) => s._id)));
  };
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const payload = selectAllMatching
        ? { selectAllMatching: true, filters: {
            search: searchTerm || undefined,
            school: columnParams.schoolIds.length
              ? columnParams.schoolIds.join(',')
              : (filterSchool || undefined),
            department: columnParams.departmentIds.length ? columnParams.departmentIds.join(',') : undefined,
            class: columnParams.classIds.length ? columnParams.classIds.join(',') : undefined,
            course: columnParams.courseIds.length ? columnParams.courseIds.join(',') : undefined,
            teacher: columnParams.teacherIds.length ? columnParams.teacherIds.join(',') : undefined,
            day: columnParams.days.length ? columnParams.days.join(',') : undefined,
            status: columnParams.statuses.length ? columnParams.statuses.join(',') : undefined,
          } }
        : { ids: Array.from(selected) };
      const { data } = await api.post('/class-schedules/bulk-delete', payload);
      setMessage(data?.message || `Deleted ${selectedCount} schedule(s)`);
      setSelected(new Set());
      setSelectAllMatching(false);
      setShowBulkDeleteModal(false);
      fetchSchedules(page);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto w-full max-w-screen-2xl px-0 sm:px-2 space-y-6">

        {/* ── Action Bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-3xl font-bold text-[var(--color-text-primary)]"><CalendarDays className="h-8 w-8 text-primary-600" strokeWidth={1.75} />Class Schedules</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {hasFetched ? `${total} total schedules` : 'Apply a filter to view schedules'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <SchedulesActionsMenu
              onImport={openImportModal}
              onExport={handleExport}
              exporting={exporting}
              onNew={() => { resetForm(); setShowForm(true); }}
              onBulkDelete={() => setShowBulkDeleteModal(true)}
              selectedCount={selectedCount}
            />
          </div>
        </div>

        {message && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" strokeWidth={1.75} />
            {message}
          </div>
        )}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {/* ═══════════════════════════════════════════════════════════════
            Import Modal
           ═══════════════════════════════════════════════════════════════ */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
              {/* Modal Header */}
              <div className="border-b border-[var(--color-border-subtle)] px-6 py-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Import Class Schedules</h2>
                    <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
                      Select your preferred method to import multiple class schedules into the system.
                    </p>
                  </div>
                  <button
                    onClick={closeImportModal}
                    className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                    disabled={importing}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5 space-y-6">
                {/* ── Template Download Banner ── */}
                <button
                  onClick={handleDownloadTemplate}
                  className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📥</span>
                      <div>
                        <p className="text-sm font-bold text-primary-700 dark:text-primary-300 group-hover:text-primary-800 dark:group-hover:text-primary-200">
                          Download Excel Sample Template
                        </p>
                        <p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">
                          Pre-formatted .xlsx file with the correct column structure
                        </p>
                      </div>
                    </div>
                    <svg className="h-5 w-5 text-primary-500 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                </button>

                {/* ── Mode Selector (Selection Cards) ── */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setImportMode('upload'); setPasteError(''); }}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      importMode === 'upload'
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm'
                        : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'
                    }`}
                  >
                    <span className="text-2xl block mb-1">📁</span>
                    <p className={`text-sm font-bold ${importMode === 'upload' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>
                      Upload Excel File
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      Drag and drop your .xlsx file
                    </p>
                  </button>
                  <button
                    onClick={() => { setImportMode('paste'); setPasteError(''); }}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      importMode === 'paste'
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm'
                        : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'
                    }`}
                  >
                    <span className="text-2xl block mb-1">📋</span>
                    <p className={`text-sm font-bold ${importMode === 'paste' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>
                      Manual Copy & Paste
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      Paste tabular data from your clipboard
                    </p>
                  </button>
                </div>

                {/* ── Upload Mode ── */}
                {importMode === 'upload' && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleFileDrop}
                    className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
                      dragOver
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                        : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'
                    }`}
                  >
                    {selectedFile ? (
                      <div className="space-y-3">
                        <span className="text-3xl">✅</span>
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedFile.name}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                        <button
                          onClick={() => setSelectedFile(null)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove file
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <span className="text-3xl">📂</span>
                        <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                          Drag and drop your Excel file here, or
                        </p>
                        <label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">
                          Browse Files
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileInputChange}
                            className="hidden"
                          />
                        </label>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          Supported formats: .xlsx, .xls, .csv (max 10 MB)
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Paste Mode ── */}
                {importMode === 'paste' && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                      <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">
                        Paste your spreadsheet data below (tab-separated columns, one row per line):
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)] mb-3 font-mono">
                        {isOrgAdmin
                          ? 'Department · Class · Section · Course · Teacher Email · Day · Start Time · End Time · Status'
                          : 'School · Department · Class · Section · Course · Teacher Email · Day · Start Time · End Time · Status'}
                      </p>
                      <textarea
                        value={pasteText}
                        onChange={(e) => { setPasteText(e.target.value); setPasteError(''); }}
                        onPaste={handlePaste}
                        rows={8}
                        placeholder={`Paste data from Excel here...\n\nExample:\n${isOrgAdmin ? 'Quran Beginners\tA\tQuran Recitation\tteacher@example.com\tMonday\t08:00\t09:30\tYes' : 'Madrasa Al-Noor\tQuran Beginners\tA\tQuran Recitation\tteacher@example.com\tMonday\t08:00\t09:30\tYes'}\n${isOrgAdmin ? 'Fiqh Level 1\tB\tIslamic Jurisprudence\tteacher2@example.com\tTuesday\t10:00\t11:30\tYes' : 'Madrasa Al-Noor\tFiqh Level 1\tB\tIslamic Jurisprudence\tteacher2@example.com\tTuesday\t10:00\t11:30\tYes'}`}
                        className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y"
                      />
                    </div>

                    {pasteError && (
                      <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                        {pasteError}
                      </div>
                    )}

                    {/* Parsed Data Preview */}
                    {parsedRows.length > 0 && (
                      <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
                        <div className="bg-[var(--color-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-tertiary)]">
                          Preview — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed
                        </div>
                        <div className="max-h-40 overflow-auto">
                          <table className="w-full text-xs">
                            <tbody className="divide-y divide-[var(--color-border-subtle)]">
                              {parsedRows.slice(0, 20).map((row, ri) => (
                                <tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--color-surface-primary)]' : 'bg-[var(--color-surface-secondary)]'}>
                                  {row.map((cell, ci) => (
                                    <td key={ci} className="px-3 py-1.5 text-[var(--color-text-secondary)] whitespace-nowrap border-r border-[var(--color-border-subtle)] last:border-r-0">
                                      {cell}
                                    </td>
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

                {/* Modal Import Error */}
                {error && (
                  <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between">
                <button
                  onClick={closeImportModal}
                  disabled={importing}
                  className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={importMode === 'upload' ? submitFileImport : submitPasteImport}
                  disabled={
                    importing ||
                    (importMode === 'upload' && !selectedFile) ||
                    (importMode === 'paste' && !pasteText.trim())
                  }
                  className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                >
                  {importing ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Importing...
                    </>
                  ) : (
                    'Import Schedules'
                  )}
                </button>
              </div>

              {/* Modal Inline Import Result */}
              {importResult && (
                <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 space-y-2">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {importResult.created} of {importResult.totalRows} rows imported successfully
                    {importResult.failed > 0 && ` — ${importResult.failed} failed`}
                  </p>
                  {importResult.errors.length > 0 && (
                    <div className="max-h-36 overflow-auto rounded-lg border border-red-200 dark:border-red-900/40">
                      <table className="w-full text-xs">
                        <thead className="bg-red-50 dark:bg-red-950/30 text-left text-red-700 dark:text-red-300">
                          <tr>
                            <th className="px-3 py-1.5">Row</th>
                            <th className="px-3 py-1.5">Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-100 dark:divide-red-900/30">
                          {importResult.errors.map((e, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{e.row}</td>
                              <td className="px-3 py-1.5 text-red-600 dark:text-red-400">{e.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            Schedule Create / Edit Modal
           ═══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
              onClick={resetForm}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl"
              >
                <div className="flex items-center justify-between px-6 pt-6 pb-2">
                  <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{editId ? 'Edit Schedule' : 'New Schedule'}</h2>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                </div>
          <form onSubmit={handleSubmit} className="p-6 pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">
                  Organization {isOrgAdmin && <span className="text-[var(--color-text-tertiary)] font-normal">(auto)</span>}
                </label>
                {isOrgAdmin ? (
                  <div className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                    {schools.find((s) => s._id === formSchool)?.name || 'Your Organization'}
                  </div>
                ) : (
                  <select
                    value={formSchool}
                    onChange={(e) => handleSchoolChange(e.target.value)}
                    required
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
                  >
                    <option value="">Select an organization...</option>
                    {schools.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">
                  Department {departmentsLoading && <span className="text-[var(--color-text-tertiary)] font-normal">(loading...)</span>}
                </label>
                <select
                  value={formDepartment}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  required
                  disabled={!formSchool || departmentsLoading}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">{!formSchool ? 'Select organization first' : 'Select a department...'}</option>
                  {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">
                  Class {classesLoading && <span className="text-[var(--color-text-tertiary)] font-normal">(loading...)</span>}
                </label>
                <select
                  value={formClass}
                  onChange={(e) => handleClassChange(e.target.value)}
                  required
                  disabled={!formDepartment || classesLoading}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">{!formDepartment ? 'Select department first' : 'Select a class...'}</option>
                  {classes.map((c) => <option key={c._id} value={c._id}>{c.title} {c.section}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">
                  Course {coursesLoading && <span className="text-[var(--color-text-tertiary)] font-normal">(loading...)</span>}
                </label>
                <select
                  value={formCourse}
                  onChange={(e) => setFormCourse(e.target.value)}
                  required
                  disabled={!formClass || coursesLoading}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">{!formClass ? 'Select class first' : 'Select a course...'}</option>
                  {courses.map((c) => <option key={c._id} value={c._id}>{c.title.en}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">
                  Teacher {isTeacherLocked && <span className="text-green-600 font-normal">(auto-filled)</span>}
                </label>
                {isTeacherLocked ? (
                  <div className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                    {preAssignedTeacherLabel}
                  </div>
                ) : (
                  <select
                    value={formTeacher}
                    onChange={(e) => setFormTeacher(e.target.value)}
                    required
                    disabled={!formCourse}
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="">{!formCourse ? 'Select course first' : 'Select a teacher...'}</option>
                    {teachers.map((t: any) => <option key={t._id} value={t._id}>{teacherLabel(t)}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Day of Week</label>
                <select value={formDay} onChange={(e) => setFormDay(Number(e.target.value))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm">
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Start Time</label>
                  <input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)} required className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">End Time</label>
                  <input type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} required className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} id="active-check" className="h-4 w-4" />
                <label htmlFor="active-check" className="text-sm text-[var(--color-text-secondary)]">Active</label>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button>
              <button type="button" onClick={resetForm} className="rounded-xl border border-[var(--color-border-default)] px-5 py-2.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]">Cancel</button>
            </div>
          </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Filter Bar ── */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {isOrgAdmin ? (
              <div className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)]">
                {schools.find((s) => s._id === filterSchool)?.name || 'Your Organization'}
              </div>
            ) : (
              <select
                value={filterSchool}
                onChange={(e) => { setFilterSchool(e.target.value); setHasFetched(false); }}
                className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
              >
                <option value="">{isSuperAdmin ? 'Select an Organization...' : 'Select Organization...'}</option>
                {schools.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            💡 Day and Status now filter from their column headers below — click a header for search, sort, and multi-select.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search by course, teacher, class, or school..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setHasFetched(false); }}
              className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              onKeyDown={(e) => { if (e.key === 'Enter') handleApplyFilters(); }}
            />
            <button
              onClick={handleApplyFilters}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors whitespace-nowrap"
            >
              <Search className="h-4 w-4" strokeWidth={2} />
              Apply Filters
            </button>
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          </div>
        )}

        {/* ── Empty State ── */}
        {!loading && !hasFetched && (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Please apply a filter to view records.</p>
            <p className="text-sm text-[var(--color-text-tertiary)]">
              {isSuperAdmin
                ? 'Select an organization and click "Apply Filters" to load schedules.'
                : 'Click "Apply Filters" to load schedules for your organization.'}
            </p>
          </div>
        )}

        {/* ── No Results ── */}
        {!loading && hasFetched && schedules.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No schedules found.</p>
            <p className="text-sm text-[var(--color-text-tertiary)]">Try adjusting your filters or create a new schedule.</p>
          </div>
        )}

        {/* ── Schedules Table ── */}
        {!loading && hasFetched && schedules.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            {selectAllMatching ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-2.5 text-xs bg-primary-50 dark:bg-primary-950/30 border-b border-[var(--color-border-subtle)] text-primary-700 dark:text-primary-300">
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />
                <span>All <strong>{total}</strong> schedules matching your filters are selected{totalPages > 1 ? ` (across ${totalPages} pages)` : ''}.</span>
                <button onClick={() => { setSelectAllMatching(false); setSelected(new Set(schedules.map((s) => s._id))); }} className="font-semibold underline hover:no-underline">Select only this page ({schedules.length})</button>
                <span className="text-primary-300 dark:text-primary-700">·</span>
                <button onClick={() => { setSelectAllMatching(false); setSelected(new Set()); }} className="font-semibold underline hover:no-underline">Clear selection</button>
              </div>
            ) : (allOnPageSelected && total > schedules.length && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-2.5 text-xs bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]">
                <span>All {schedules.length} schedules on this page are selected.</span>
                <button onClick={() => setSelectAllMatching(true)} className="font-semibold text-primary-600 hover:underline">Select all {total} schedules across {totalPages} page{totalPages !== 1 ? 's' : ''}</button>
              </div>
            ))}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox" checked={selectAllMatching || allOnPageSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30 cursor-pointer" />
                    </th>
                    <th className="px-4 py-3"><ColumnFilterHeader label="Organization" colKey="organization" options={schools.map((s) => ({ value: s._id, label: s.name }))} currentSelected={scheduleColumnFilters.organization ?? null} currentSort={scheduleSortCol === 'organization' ? scheduleSortDir : null} onCommit={applyScheduleColumnCommit} onClear={clearScheduleColumnFilter} /></th>
                    <th className="px-4 py-3"><ColumnFilterHeader label="Department" colKey="department" options={filterDepartments.map((d) => ({ value: d._id, label: d.name }))} currentSelected={scheduleColumnFilters.department ?? null} currentSort={scheduleSortCol === 'department' ? scheduleSortDir : null} onCommit={applyScheduleColumnCommit} onClear={clearScheduleColumnFilter} /></th>
                    <th className="px-4 py-3"><ColumnFilterHeader label="Class" colKey="class" options={filterClasses.map((c) => ({ value: c._id, label: `${c.title} — ${c.section}` }))} currentSelected={scheduleColumnFilters.class ?? null} currentSort={scheduleSortCol === 'class' ? scheduleSortDir : null} onCommit={applyScheduleColumnCommit} onClear={clearScheduleColumnFilter} /></th>
                    <th className="px-4 py-3"><ColumnFilterHeader label="Course" colKey="course" options={filterCourses.map((c) => ({ value: c._id, label: c.title.en }))} currentSelected={scheduleColumnFilters.course ?? null} currentSort={scheduleSortCol === 'course' ? scheduleSortDir : null} onCommit={applyScheduleColumnCommit} onClear={clearScheduleColumnFilter} /></th>
                    <th className="px-4 py-3"><ColumnFilterHeader label="Teacher" colKey="teacher" options={teachers.map((t) => ({ value: t._id, label: teacherLabel(t) }))} currentSelected={scheduleColumnFilters.teacher ?? null} currentSort={scheduleSortCol === 'teacher' ? scheduleSortDir : null} onCommit={applyScheduleColumnCommit} onClear={clearScheduleColumnFilter} /></th>
                    <th className="px-4 py-3"><ColumnFilterHeader label="Day" colKey="day" options={DAYS.map((d, i) => ({ value: String(i), label: d }))} currentSelected={scheduleColumnFilters.day ?? null} currentSort={scheduleSortCol === 'day' ? scheduleSortDir : null} onCommit={applyScheduleColumnCommit} onClear={clearScheduleColumnFilter} /></th>
                    <th className="px-4 py-3"><ColumnFilterHeader label="Time" colKey="time" currentSelected={scheduleColumnFilters.time ?? null} currentSort={scheduleSortCol === 'time' ? scheduleSortDir : null} onCommit={applyScheduleColumnCommit} onClear={clearScheduleColumnFilter} /></th>
                    <th className="px-4 py-3"><ColumnFilterHeader label="Status" colKey="status" options={STATUS_OPTIONS} currentSelected={scheduleColumnFilters.status ?? null} currentSort={scheduleSortCol === 'status' ? scheduleSortDir : null} onCommit={applyScheduleColumnCommit} onClear={clearScheduleColumnFilter} /></th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {schedules.map((s) => {
                    const today = new Date().getDay() === s.dayOfWeek;
                    return (
                      <tr key={s._id} className="hover:bg-[var(--color-surface-secondary)] transition-colors">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selected.has(s._id)} onChange={() => toggleSelected(s._id)} className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30 cursor-pointer" />
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
                            {s.school?.name || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)]">{typeof s.class?.department === 'string' ? '—' : s.class?.department?.name || '—'}</td>
                        <td className="px-4 py-3">{s.class?.title} {s.class?.section}</td>
                        <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{s.course?.title?.en || '—'}</td>
                        <td className="px-4 py-3">{teacherLabel(s.teacher)}</td>
                        <td className="px-4 py-3">{DAYS[s.dayOfWeek]}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{s.startTime} – {s.endTime}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            s.isActive
                              ? today
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {s.isActive ? (today ? '🟢 Active' : '🟠 Scheduled') : '⚪ Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end">
                            <RowActionsMenu onEdit={() => handleEdit(s)} onDelete={() => handleDelete(s._id)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showBulkDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowBulkDeleteModal(false)}>
            <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30 text-red-600">
                  <Trash2 className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Bulk Delete Schedules</h2>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)] mb-5">
                You're about to delete <strong>{selectedCount}</strong> schedule{selectedCount !== 1 ? 's' : ''}{selectAllMatching ? ' — every schedule matching your current filters, across all pages' : ''}. This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowBulkDeleteModal(false)} disabled={bulkDeleting} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button>
                <button type="button" onClick={handleBulkDelete} disabled={bulkDeleting} className="flex-1 rounded-xl bg-red-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">
                  {bulkDeleting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  Delete {selectedCount}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Prev</button>
            <span className="text-sm text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SchedulesManage;