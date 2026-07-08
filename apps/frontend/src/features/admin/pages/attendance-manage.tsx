/**
 * Attendance Management — Admin
 * Take attendance per course/date, view records, generate reports
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface Course { _id: string; title: { en: string }; enrolledStudents: number; }

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

  useEffect(() => { fetchCourses(); }, []);

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

        {/* Tab Switcher */}
        <div className="flex gap-2 border-b border-[var(--color-border-subtle)] pb-0">
          {(['take', 'view', 'report'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (t === 'report') loadReport();
                if (t === 'view' && selectedCourse) loadStudents();
              }}
              className={`rounded-t-xl px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${
                tab === t
                  ? 'bg-[var(--color-surface-primary)] text-primary-600 border-primary-600'
                  : 'text-[var(--color-text-tertiary)] border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]'
              }`}
            >
              {t === 'take' ? '📝 Take Attendance' : t === 'view' ? '👁️ View Records' : '📊 Report'}
            </button>
          ))}
        </div>

        {/* Course + Date Selector */}
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
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
            className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
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
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">#</th>
                    <th className="text-left px-5 py-3 font-semibold">Student</th>
                    <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">ID</th>
                    <th className="text-center px-5 py-3 font-semibold">Status</th>
                    <th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <td className="px-5 py-3 text-center text-xs text-[var(--color-text-tertiary)] w-10">{i + 1}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium">{s.profile?.firstName} {s.profile?.lastName}</p>
                      </td>
                      <td className="px-5 py-3 text-center hidden sm:table-cell">
                        <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{s.studentId}</code>
                      </td>
                      <td className="px-5 py-3 text-center">
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
                      <td className="px-5 py-3 text-center hidden md:table-cell">
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
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Student</th>
                    <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">ID</th>
                    <th className="text-center px-5 py-3 font-semibold">Status</th>
                    <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {existingRecords.map((r) => (
                    <tr key={r._id || r.student?._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <td className="px-5 py-4 font-medium">{r.student?.profile?.firstName} {r.student?.profile?.lastName}</td>
                      <td className="px-5 py-4 text-center hidden sm:table-cell">
                        <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{r.student?.studentId}</code>
                      </td>
                      <td className="px-5 py-4 text-center">{StatusBadge({ status: r.status })}</td>
                      <td className="px-5 py-4 hidden md:table-cell text-xs text-[var(--color-text-tertiary)]">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'view' && selectedCourse && existingRecords.length === 0 && !loading && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-lg">No attendance records for this date.</p>
            <p className="text-sm mt-1">Switch to "Take Attendance" to mark attendance.</p>
          </div>
        )}

        {/* ── Report ── */}
        {tab === 'report' && report.length > 0 && !loading && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Student</th>
                    <th className="text-center px-5 py-3 font-semibold">Present</th>
                    <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Late</th>
                    <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Absent</th>
                    <th className="text-center px-5 py-3 font-semibold">Total</th>
                    <th className="text-center px-5 py-3 font-semibold">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r) => (
                    <tr key={r.studentId} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <td className="px-5 py-4 font-medium">{r.name}</td>
                      <td className="px-5 py-4 text-center text-green-600 font-medium">{r.present}</td>
                      <td className="px-5 py-4 text-center hidden sm:table-cell text-amber-600 font-medium">{r.late}</td>
                      <td className="px-5 py-4 text-center hidden sm:table-cell text-red-600 font-medium">{r.absent}</td>
                      <td className="px-5 py-4 text-center">{r.total}</td>
                      <td className="px-5 py-4 text-center">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            r.percentage >= 75
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
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
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-lg">👆 Select a course above to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AttendanceManage;