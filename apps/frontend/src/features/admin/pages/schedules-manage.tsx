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

import { useEffect, useState, useCallback } from 'react';
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

        // Org admin: auto-lock to their own school
        if (isOrgAdmin) {
          const orgSchool = sRes.data.data?.[0]; // backend scopes to their org already
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
    // Super admin must pick an org
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

  // ── Autofill 3: Course → Teacher ──
  useEffect(() => {
    if (!formCourse) return;
    const selectedCourse = courses.find((c) => c._id === formCourse);
    if (selectedCourse) {
      const teacherId = extractTeacherId(selectedCourse);
      if (teacherId) setFormTeacher(teacherId);
    } else {
      (async () => {
        try {
          const { data } = await api.get(`/courses/${formCourse}/admin`);
          const course = data.data;
          if (course) {
            const teacherId = extractTeacherId(course);
            if (teacherId) setFormTeacher(teacherId);
          }
        } catch { /* ignore */ }
      })();
    }
  }, [formCourse, courses]);

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

  const totalPages = Math.ceil(total / limit);

  /**
   * Filter visible schedules client-side by active status (the API already
   * returns paginated results, but `isActive` filtering is cheap client-side).
   */
  const displayedSchedules = filterActive === ''
    ? schedules
    : schedules.filter((s) => (filterActive === 'active' ? s.isActive : !s.isActive));

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🕐 Class Schedules</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {hasFetched ? `${total} total schedules` : 'Apply a filter to view schedules'}
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Schedule'}
          </button>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {/* ── Form ── */}
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
                  Teacher {formTeacher && courses.find((c) => c._id === formCourse)?.teacher && <span className="text-green-600 font-normal">(auto-filled)</span>}
                </label>
                <select
                  value={formTeacher}
                  onChange={(e) => setFormTeacher(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
                >
                  <option value="">Select a teacher...</option>
                  {teachers.map((t: any) => <option key={t._id} value={t._id}>{teacherLabel(t)}</option>)}
                </select>
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
            {/* Organization filter — always visible */}
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
                <option value="">
                  {isSuperAdmin ? 'Select an Organization...' : 'Select Organization...'}
                </option>
                {schools.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}

            {/* Day filter */}
            <select
              value={filterDay}
              onChange={(e) => { setFilterDay(e.target.value); setHasFetched(false); }}
              className="flex-1 sm:flex-none sm:w-48 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            >
              <option value="">All Days</option>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>

            {/* Active/Inactive filter (client-side) */}
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
            {/* Search */}
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

        {/* ── Empty State (no filters applied) ── */}
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