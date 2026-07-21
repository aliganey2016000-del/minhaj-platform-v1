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
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface SchoolBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; school?: string | { _id: string }; }
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
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [teachers, setTeachers] = useState<TeacherBrief[]>([]);

  // Cascading loading flags
  const [classesLoading, setClassesLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);

  // Filters — NO initial fetch, user must apply filters first
  const [filterSchool, setFilterSchool] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [hasFetched, setHasFetched] = useState(false);

  // Form values
  const [formSchool, setFormSchool] = useState('');
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
  const fetchSchedules = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page: String(pageNum), limit: String(limit) };
      if (filterSchool) params.school = filterSchool;
      if (filterDay !== '') params.day = filterDay;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const { data } = await api.get('/class-schedules', { params });
      const items = data.data || [];
      setSchedules(items);
      setTotal(data.meta?.total || 0);
      setHasFetched(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [filterSchool, filterDay, searchTerm]);

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

  // ── Cascading 1: School → Classes (form) ──
  useEffect(() => {
    if (!formSchool) {
      setClasses([]);
      setFormClass('');
      return;
    }
    setClassesLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/classes?schoolId=${formSchool}`);
        setClasses(data.data || []);
      } catch {
        setClasses([]);
      } finally {
        setClassesLoading(false);
      }
    })();
  }, [formSchool]);

  // ── Cascading 2: Class → Courses ──
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
    setFormClass(''); setFormCourse('');
    setFormTeacher(''); setFormDay(0); setFormStart('08:00');
    setFormEnd('09:30'); setFormActive(true); setEditId(null); setShowForm(false);
  };

  const handleEdit = (s: Schedule) => {
    setFormSchool(s.school._id);
    setTimeout(() => {
      setFormClass(s.class._id);
      setTimeout(() => {
        setFormCourse(s.course._id);
        setFormTeacher(s.teacher._id);
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

  const teacherLabel = (t: TeacherBrief) =>
    t.profile
      ? `${t.profile.firstName} ${t.profile.lastName}`
      : (t as any).name || t._id;

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
        closeImportModal();
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

    // First row should be header; validate expected column count. Section
    // and Active are optional on the backend, so this only checks the
    // minimum — School (non-org-admin only), Class, Course, Teacher Email,
    // Day, Start Time, End Time.
    const minCols = isOrgAdmin ? 6 : 7;
    if (rows[0].length < minCols) {
      setPasteError(`Expected at least ${minCols} columns (${isOrgAdmin ? 'Class, Course, Teacher Email, Day, Start Time, End Time' : 'School, Class, Course, Teacher Email, Day, Start Time, End Time'}). Found ${rows[0].length}.`);
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
        closeImportModal();
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

  const displayedSchedules = filterActive === ''
    ? schedules
    : schedules.filter((s) => (filterActive === 'active' ? s.isActive : !s.isActive));

  const parsedRows = parsePastedRows();

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* ── Action Bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🕐 Class Schedules</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {hasFetched ? `${total} total schedules` : 'Apply a filter to view schedules'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={openImportModal}
              className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
            >
              ↑ Import Excel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {exporting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
              ) : (
                <>↓ Export Excel</>
              )}
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(!showForm); }}
              className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
            >
              {showForm ? 'Cancel' : '+ New Schedule'}
            </button>
          </div>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
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
                          ? 'Class &nbsp; Section &nbsp; Course &nbsp; Teacher Email &nbsp; Day &nbsp; Start Time &nbsp; End Time &nbsp; Active'
                          : 'School &nbsp; Class &nbsp; Section &nbsp; Course &nbsp; Teacher Email &nbsp; Day &nbsp; Start Time &nbsp; End Time &nbsp; Active'}
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
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-red-200 dark:border-red-900/40">
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
            Schedule Create / Edit Form
           ═══════════════════════════════════════════════════════════════ */}
        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card space-y-4">
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
                  Class {classesLoading && <span className="text-[var(--color-text-tertiary)] font-normal">(loading...)</span>}
                </label>
                <select
                  value={formClass}
                  onChange={(e) => handleClassChange(e.target.value)}
                  required
                  disabled={!formSchool || classesLoading}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">{!formSchool ? 'Select organization first' : 'Select a class...'}</option>
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
        )}

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

            <select
              value={filterDay}
              onChange={(e) => { setFilterDay(e.target.value); setHasFetched(false); }}
              className="flex-1 sm:flex-none sm:w-48 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            >
              <option value="">All Days</option>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>

            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

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
              className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors whitespace-nowrap"
            >
              🔍 Apply Filters
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
        {!loading && hasFetched && displayedSchedules.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No schedules found.</p>
            <p className="text-sm text-[var(--color-text-tertiary)]">Try adjusting your filters or create a new schedule.</p>
          </div>
        )}

        {/* ── Schedules Table ── */}
        {!loading && hasFetched && displayedSchedules.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase">
                  <tr>
                    <th className="px-4 py-3">Organization</th>
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Day</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Teacher</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {displayedSchedules.map((s) => {
                    const today = new Date().getDay() === s.dayOfWeek;
                    return (
                      <tr key={s._id} className="hover:bg-[var(--color-surface-secondary)] transition-colors">
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
                            {s.school?.name || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{s.course?.title?.en || '—'}</td>
                        <td className="px-4 py-3">{DAYS[s.dayOfWeek]}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{s.startTime} – {s.endTime}</td>
                        <td className="px-4 py-3">{teacherLabel(s.teacher)}</td>
                        <td className="px-4 py-3">{s.class?.title} {s.class?.section}</td>
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
                          <button onClick={() => handleEdit(s)} className="text-primary-600 hover:underline text-xs font-medium mr-3">Edit</button>
                          <button onClick={() => handleDelete(s._id)} className="text-red-500 hover:underline text-xs font-medium">Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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