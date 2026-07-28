/**
 * Attendance Management — Admin
 * Take attendance per course/date, view records, generate reports
 */

import { useEffect, useState, useCallback } from 'react';
import { CheckSquare, FileText, BarChart3, Inbox, CalendarX, Clock, ArrowRight, Building2, Layers, User } from 'lucide-react';
import api from '../../../lib/axios';
import { categoryLabels, inferCategoryIcon, inferCategoryColor, levelColors, statusColors } from '../../../lib/course-category-visuals';

interface Course {
  _id: string;
  title: { en: string };
  enrolledStudents: number;
  category?: string;
  thumbnail?: string;
  status?: string;
  level?: string;
  duration?: number;
  fee?: number;
  maxStudents?: number;
  teacher?: { profile?: { firstName: string; lastName: string } } | null;
  school?: { name: string } | null;
  class?: { title: string; section: string } | null;
}

interface TodaySchedule {
  _id: string;
  course?: { _id: string; title: { en: string } };
  startTime: string;
  endTime: string;
}

interface Student {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  enrolledCourses: string[];
}

interface AttendanceRecord {
  _id?: string;
  student: { _id: string; studentId: string; profile?: { firstName: string; lastName: string } };
  status: string;
  notes?: string;
}

interface ReportRow {
  studentId: string;
  name: string;
  total: number;
  present: number;
  late: number;
  absent: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    present: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    excused: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AttendanceManage() {
  const [tab, setTab] = useState<'take' | 'view' | 'report'>('take');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<string, { status: string; notes: string }>>({});
  const [existingRecords, setExistingRecords] = useState<AttendanceRecord[]>([]);
  const [report, setReport] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [todaysSchedules, setTodaysSchedules] = useState<TodaySchedule[]>([]);
  const [todaysSchedulesLoading, setTodaysSchedulesLoading] = useState(false);
  // Thumbnail URLs that failed to load — those cards fall back to the
  // gradient + category-icon placeholder, matching Manage Courses.
  const [brokenThumbnails, setBrokenThumbnails] = useState<Set<string>>(new Set());
  const markThumbnailBroken = (id: string) => setBrokenThumbnails((prev) => new Set(prev).add(id));

  useEffect(() => { fetchCourses(); }, []);

  // Today's timetable — powers the quick-pick grid shown in place of the
  // bare "select a course" prompt, so the admin can jump straight into
  // whatever's actually scheduled for today instead of hunting through the
  // full course dropdown.
  useEffect(() => {
    const loadTodaysSchedules = async () => {
      setTodaysSchedulesLoading(true);
      try {
        const todayDow = new Date().getDay();
        const { data } = await api.get('/class-schedules', { params: { day: todayDow, limit: '50' } });
        setTodaysSchedules((data.data || []).filter((s: TodaySchedule) => s.course?._id));
      } catch {
        setTodaysSchedules([]);
      } finally {
        setTodaysSchedulesLoading(false);
      }
    };
    loadTodaysSchedules();
  }, []);

  const pickTodaysCourse = (courseId: string) => {
    setDate(new Date().toISOString().split('T')[0]);
    setTab('take');
    setSelectedCourse(courseId);
  };

  const fetchCourses = async () => {
    try {
      const { data } = await api.get('/courses/admin');
      setCourses(data.data || []);
    } catch {}
  };

  const loadStudents = useCallback(async () => {
    if (!selectedCourse) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data: studentData } = await api.get(`/courses/${selectedCourse}/students`);
      const enrolled: Student[] = studentData.data || [];

      // Get existing attendance for this date
      try {
        const { data: attData } = await api.get(`/attendance/course?courseId=${selectedCourse}&date=${date}`);
        setExistingRecords(attData.data || []);
        const recMap: Record<string, { status: string; notes: string }> = {};
        (attData.data || []).forEach((r: AttendanceRecord) => {
          if (r.student?._id) recMap[r.student._id] = { status: r.status, notes: r.notes || '' };
        });
        setRecords(recMap);
      } catch {
        setExistingRecords([]);
        setRecords({});
      }

      setStudents(enrolled);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [selectedCourse, date]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  const handleStatusChange = (studentId: string, status: string) => {
    setRecords((prev) => ({ ...prev, [studentId]: { ...prev[studentId], status } }));
  };

  const handleNotesChange = (studentId: string, notes: string) => {
    setRecords((prev) => ({ ...prev, [studentId]: { ...prev[studentId], notes } }));
  };

  const handleSubmit = async () => {
    if (!selectedCourse || students.length === 0) return;
    const payload = {
      course: selectedCourse,
      date,
      records: students.map((s) => ({
        student: s._id,
        status: records[s._id]?.status || 'present',
        notes: records[s._id]?.notes || '',
      })),
    };
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await api.post('/attendance', payload);
      setMessage(`✅ Attendance marked for ${students.length} students!`);
      loadStudents();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to mark attendance');
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async () => {
    if (!selectedCourse) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/attendance/report?courseId=${selectedCourse}`);
      setReport(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const selectedCourseObj = courses.find((c) => c._id === selectedCourse);

  // Count statuses for current batch
  const presentCount = Object.values(records).filter((r) => r.status === 'present').length;
  const absentCount = Object.values(records).filter((r) => r.status === 'absent').length;
  const lateCount = Object.values(records).filter((r) => r.status === 'late').length;
  const excusedCount = Object.values(records).filter((r) => r.status === 'excused').length;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📅 Attendance Management</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {selectedCourseObj ? `${selectedCourseObj.title.en} — ${selectedCourseObj.enrolledStudents} enrolled` : 'Select a course to get started'}
            </p>
          </div>
        </div>

        {/* Tab Switcher — segmented control */}
        <div className="flex bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl max-w-md gap-1">
          {([
            { key: 'take' as const, label: 'Take Attendance', icon: CheckSquare },
            { key: 'view' as const, label: 'View Records', icon: FileText },
            { key: 'report' as const, label: 'Report', icon: BarChart3 },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                if (key === 'report') loadReport();
                if (key === 'view' && selectedCourse) loadStudents();
              }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 text-sm transition-all ${
                tab === key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm rounded-lg font-semibold px-4 py-2'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 px-4 py-2'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Course + Date Selector */}
        <div className="flex flex-col sm:flex-row gap-4 items-center mt-6 max-w-3xl">
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="w-full sm:flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">Select a course...</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title.en} ({c.enrolledStudents} enrolled)
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-auto h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Messages */}
        {message && (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700 flex items-center gap-2">
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>
        )}

        {/* Quick Stats (Take/View) */}
        {(tab === 'take' || tab === 'view') && selectedCourse && existingRecords.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{tab === 'take' ? presentCount : existingRecords.filter((r) => r.status === 'present').length}</p>
              <p className="text-xs text-green-600 dark:text-green-400">Present</p>
            </div>
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">{tab === 'take' ? absentCount : existingRecords.filter((r) => r.status === 'absent').length}</p>
              <p className="text-xs text-red-600 dark:text-red-400">Absent</p>
            </div>
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{tab === 'take' ? lateCount : existingRecords.filter((r) => r.status === 'late').length}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Late</p>
            </div>
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{tab === 'take' ? excusedCount : existingRecords.filter((r) => r.status === 'excused').length}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">Excused</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          </div>
        )}

        {/* ── Take Attendance ── */}
        {tab === 'take' && selectedCourse && students.length > 0 && !loading && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 dark:bg-slate-800/40">
                  <tr>
                    <th className="text-left py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase">#</th>
                    <th className="text-left py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase">Student</th>
                    <th className="text-center py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase hidden sm:table-cell">ID</th>
                    <th className="text-center py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase">Status</th>
                    <th className="text-center py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s._id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 text-center text-xs text-[var(--color-text-tertiary)] w-10">{i + 1}</td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium">{s.profile?.firstName} {s.profile?.lastName}</p>
                      </td>
                      <td className="py-3.5 px-4 text-center hidden sm:table-cell">
                        <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{s.studentId}</code>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <select
                          value={records[s._id]?.status || 'present'}
                          onChange={(e) => handleStatusChange(s._id, e.target.value)}
                          className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1.5 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        >
                          <option value="present">✅ Present</option>
                          <option value="absent">❌ Absent</option>
                          <option value="late">⏰ Late</option>
                          <option value="excused">📝 Excused</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4 text-center hidden md:table-cell">
                        <input
                          type="text"
                          value={records[s._id]?.notes || ''}
                          onChange={(e) => handleNotesChange(s._id, e.target.value)}
                          className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                          placeholder="Optional note"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] flex items-center justify-between">
              <p className="text-xs text-[var(--color-text-tertiary)]">{students.length} students in list</p>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm"
              >
                {loading ? 'Saving...' : '💾 Save Attendance'}
              </button>
            </div>
          </div>
        )}

        {tab === 'take' && selectedCourse && students.length === 0 && !loading && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-lg">No students enrolled in this course.</p>
          </div>
        )}

        {/* ── View Records ── */}
        {tab === 'view' && selectedCourse && existingRecords.length > 0 && !loading && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 dark:bg-slate-800/40">
                  <tr>
                    <th className="text-left py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase">Student</th>
                    <th className="text-center py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase hidden sm:table-cell">ID</th>
                    <th className="text-center py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase">Status</th>
                    <th className="text-left py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {existingRecords.map((r) => (
                    <tr key={r._id || r.student?._id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-medium">{r.student?.profile?.firstName} {r.student?.profile?.lastName}</td>
                      <td className="py-3.5 px-4 text-center hidden sm:table-cell">
                        <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{r.student?.studentId}</code>
                      </td>
                      <td className="py-3.5 px-4 text-center">{StatusBadge({ status: r.status })}</td>
                      <td className="py-3.5 px-4 hidden md:table-cell text-xs text-[var(--color-text-tertiary)]">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'view' && selectedCourse && existingRecords.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 rounded-2xl p-12 text-center">
            <Inbox className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" strokeWidth={1.5} />
            <p className="text-lg text-[var(--color-text-secondary)]">No attendance records for this date.</p>
            <p className="text-sm mt-1 text-[var(--color-text-tertiary)]">Switch to "Take Attendance" to mark attendance.</p>
          </div>
        )}

        {/* ── Report ── */}
        {tab === 'report' && report.length > 0 && !loading && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 dark:bg-slate-800/40">
                  <tr>
                    <th className="text-left py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase">Student</th>
                    <th className="text-center py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase">Present</th>
                    <th className="text-center py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase hidden sm:table-cell">Late</th>
                    <th className="text-center py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase hidden sm:table-cell">Absent</th>
                    <th className="text-center py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase">Total</th>
                    <th className="text-center py-3.5 px-4 text-xs font-semibold tracking-wider text-slate-500 uppercase">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r) => (
                    <tr key={r.studentId} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-medium">{r.name}</td>
                      <td className="py-3.5 px-4 text-center text-green-600 font-medium">{r.present}</td>
                      <td className="py-3.5 px-4 text-center hidden sm:table-cell text-amber-600 font-medium">{r.late}</td>
                      <td className="py-3.5 px-4 text-center hidden sm:table-cell text-red-600 font-medium">{r.absent}</td>
                      <td className="py-3.5 px-4 text-center">{r.total}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${
                            r.percentage >= 75
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300'
                          }`}
                        >
                          {r.percentage}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'report' && report.length === 0 && !loading && selectedCourse && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-lg">No attendance data for this course yet.</p>
            <p className="text-sm mt-1">Mark attendance first to generate reports.</p>
          </div>
        )}

        {!selectedCourse && (
          <>
            {!todaysSchedulesLoading && todaysSchedules.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-secondary)]">Today's Schedule</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {todaysSchedules.map((s) => {
                    const courseInfo = courses.find((c) => c._id === s.course?._id);
                    const category = courseInfo?.category || '';
                    const FallbackIcon = inferCategoryIcon(category);
                    const hasThumbnail = !!courseInfo?.thumbnail && !brokenThumbnails.has(s._id);
                    const teacherName = courseInfo?.teacher?.profile
                      ? `${courseInfo.teacher.profile.firstName} ${courseInfo.teacher.profile.lastName}`
                      : 'Unassigned';
                    const schoolName = courseInfo?.school?.name || '—';
                    const className = courseInfo?.class ? `${courseInfo.class.title} (${courseInfo.class.section})` : '—';
                    const maxStudents = courseInfo?.maxStudents || 0;
                    const enrolled = courseInfo?.enrolledStudents || 0;
                    return (
                      <div
                        key={s._id}
                        onClick={() => s.course?._id && pickTodaysCourse(s.course._id)}
                        className="group bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col justify-between h-full"
                      >
                        {/* Thumbnail — identical treatment to Manage Courses' course cards */}
                        <div className="relative h-40 bg-gradient-to-br from-primary-100 via-primary-50 to-sky-100 dark:from-primary-900/40 dark:via-sky-900/30 dark:to-primary-950/50 flex items-center justify-center">
                          {hasThumbnail ? (
                            <img
                              src={courseInfo!.thumbnail}
                              alt={s.course?.title?.en || ''}
                              className="w-full h-full object-cover"
                              onError={() => markThumbnailBroken(s._id)}
                            />
                          ) : (
                            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${inferCategoryColor(category)}`}>
                              <FallbackIcon className="h-7 w-7" strokeWidth={1.5} />
                            </div>
                          )}
                          {courseInfo?.status && (
                            <span className={`absolute top-3 right-3 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${statusColors[courseInfo.status] || 'bg-gray-100 text-gray-600'}`}>
                              {courseInfo.status}
                            </span>
                          )}
                        </div>

                        <div className="p-4 flex flex-col flex-1 justify-between gap-2.5">
                        <div className="flex flex-col gap-2.5">
                          <p className="font-bold text-sm text-[var(--color-text-primary)] truncate">{s.course?.title?.en || 'Untitled Course'}</p>

                          {/* Category + Level pills */}
                          <div className="flex flex-wrap gap-1.5">
                            {category && (
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${inferCategoryColor(category)}`}>
                                {categoryLabels[category] || category}
                              </span>
                            )}
                            {courseInfo?.level && (
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${levelColors[courseInfo.level] || 'bg-gray-100 text-gray-600'}`}>
                                {courseInfo.level}
                              </span>
                            )}
                          </div>

                          {/* Info rows — same fields/order as Manage Courses */}
                          <div className="space-y-1.5 text-sm">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" strokeWidth={1.75} />
                              <span className="text-xs text-[var(--color-text-tertiary)] w-20 flex-shrink-0">Organization</span>
                              <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">{schoolName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Layers className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" strokeWidth={1.75} />
                              <span className="text-xs text-[var(--color-text-tertiary)] w-20 flex-shrink-0">Class</span>
                              <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">{className}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" strokeWidth={1.75} />
                              <span className="text-xs text-[var(--color-text-tertiary)] w-20 flex-shrink-0">Teacher</span>
                              <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">{teacherName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" strokeWidth={1.75} />
                              <span className="text-xs text-[var(--color-text-tertiary)] w-20 flex-shrink-0">Time</span>
                              <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">{s.startTime} – {s.endTime}</span>
                            </div>
                          </div>

                          {/* Enrollment progress bar */}
                          <div className="mt-1">
                            <div className="flex justify-between text-xs text-[var(--color-text-tertiary)] mb-1">
                              <span>Enrollment</span>
                              <span>{enrolled}/{maxStudents}</span>
                            </div>
                            <div className="w-full h-1.5 bg-[var(--color-surface-tertiary)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary-500 rounded-full transition-all duration-500"
                                style={{ width: `${maxStudents > 0 ? Math.min(100, (enrolled / maxStudents) * 100) : 0}%` }}
                              />
                            </div>
                          </div>
                        </div>

                          <span className="inline-flex items-center justify-center gap-1 mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 group-hover:gap-1.5 transition-all">
                            Take Attendance <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 rounded-2xl p-12 text-center">
                <CalendarX className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" strokeWidth={1.5} />
                <p className="text-lg text-[var(--color-text-secondary)]">
                  {todaysSchedulesLoading ? 'Loading today’s schedule...' : 'Select a course above to get started'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AttendanceManage;