import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, CalendarCheck, ClipboardList, Clock3, Loader2, Save } from 'lucide-react';
import api from '../../../lib/axios';

interface Course {
  _id: string;
  title?: { en?: string };
}

interface Student {
  _id: string;
  studentId?: string;
  profile?: { firstName?: string; lastName?: string };
}

interface Schedule {
  _id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  course?: Course;
  class?: { title?: string; section?: string };
}

interface AttendanceRecord {
  _id?: string;
  student?: Student;
  status: Status;
  date: string;
  locked?: boolean;
  schedule?: { _id?: string; startTime?: string; endTime?: string };
}

type Status = 'present' | 'absent' | 'late' | 'excused';
type Tab = 'take' | 'records' | 'reports';

const statuses: Array<{ value: Status; label: string; key: string }> = [
  { value: 'present', label: 'Present', key: 'P' },
  { value: 'absent', label: 'Absent', key: 'A' },
  { value: 'late', label: 'Late', key: 'L' },
  { value: 'excused', label: 'Excused', key: 'E' },
];

const localDate = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const prettyDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const studentName = (student?: Student) => {
  const name = `${student?.profile?.firstName || ''} ${student?.profile?.lastName || ''}`.trim();
  return name || student?.studentId || 'Student';
};

const statusClass = (status: Status) => {
  if (status === 'present') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (status === 'absent') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';
  if (status === 'late') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
  return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';
};

export function TeacherAttendance() {
  const [tab, setTab] = useState<Tab>('take');
  const [courses, setCourses] = useState<Course[]>([]);
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [recordCourse, setRecordCourse] = useState('');
  const [recordFrom, setRecordFrom] = useState(localDate());
  const [recordTo, setRecordTo] = useState(localDate());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [reportCourse, setReportCourse] = useState('');
  const [reportFrom, setReportFrom] = useState(localDate());
  const [reportTo, setReportTo] = useState(localDate());
  const [reportRecords, setReportRecords] = useState<AttendanceRecord[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    const loadPage = async () => {
      try {
        const [dashboardResponse, scheduleResponse] = await Promise.all([
          api.get('/teacher-portal/dashboard'),
          api.get('/class-schedules/my-teaching'),
        ]);

        const activeCourses: Course[] = dashboardResponse.data?.data?.activeCourses || [];
        const schedules: Schedule[] = scheduleResponse.data?.data || [];
        const today = new Date().getDay();

        setCourses(activeCourses);
        setTodaySchedules(
          schedules
            .filter((schedule) => schedule.dayOfWeek === today)
            .sort((a, b) => a.startTime.localeCompare(b.startTime)),
        );

        if (activeCourses[0]?._id) {
          setRecordCourse(activeCourses[0]._id);
          setReportCourse(activeCourses[0]._id);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load attendance page');
      } finally {
        setLoading(false);
      }
    };

    void loadPage();
  }, []);

  const loadTakeAttendance = async (schedule: Schedule) => {
    const courseId = schedule.course?._id;
    if (!courseId) return;

    setSelectedSchedule(schedule);
    setRosterLoading(true);
    setError('');
    setMessage('');

    try {
      const [rosterResponse, attendanceResponse] = await Promise.all([
        api.get(`/teacher-portal/courses/${courseId}/attendance-roster`),
        api.get('/attendance/course', {
          params: { courseId, date: localDate(), schedule: schedule._id },
        }),
      ]);

      const roster: Student[] = rosterResponse.data?.data || [];
      const existing: AttendanceRecord[] = attendanceResponse.data?.data || [];
      const nextMarks: Record<string, Status> = {};

      existing.forEach((record) => {
        if (record.student?._id) nextMarks[record.student._id] = record.status;
      });

      setStudents(roster);
      setMarks(nextMarks);
      setLocked(existing.some((record) => record.locked));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load this class attendance');
      setStudents([]);
      setMarks({});
      setLocked(false);
    } finally {
      setRosterLoading(false);
    }
  };

  const saveAttendance = async () => {
    if (!selectedSchedule?.course?._id || !students.length) return;

    if (students.some((student) => !marks[student._id])) {
      setError(`Mark all ${students.length} students before saving.`);
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await api.post('/attendance', {
        course: selectedSchedule.course._id,
        schedule: selectedSchedule._id,
        date: localDate(),
        records: students.map((student) => ({
          student: student._id,
          status: marks[student._id],
        })),
      });
      setLocked(true);
      setMessage('Attendance saved and locked.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const loadRecords = async () => {
    if (!recordCourse) return;
    setRecordsLoading(true);
    setError('');

    try {
      const response = await api.get('/attendance/course', {
        params: { courseId: recordCourse, dateFrom: recordFrom, dateTo: recordTo },
      });
      setRecords(response.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load attendance records');
    } finally {
      setRecordsLoading(false);
    }
  };

  const loadReport = async () => {
    if (!reportCourse) return;
    setReportLoading(true);
    setError('');

    try {
      const response = await api.get('/attendance/course', {
        params: { courseId: reportCourse, dateFrom: reportFrom, dateTo: reportTo },
      });
      setReportRecords(response.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load attendance report');
    } finally {
      setReportLoading(false);
    }
  };

  const report = useMemo(() => {
    const total = reportRecords.length;
    const present = reportRecords.filter((r) => r.status === 'present').length;
    const absent = reportRecords.filter((r) => r.status === 'absent').length;
    const late = reportRecords.filter((r) => r.status === 'late').length;
    const excused = reportRecords.filter((r) => r.status === 'excused').length;
    const studentCount = new Set(reportRecords.map((r) => r.student?._id).filter(Boolean)).size;
    const rate = total ? Math.round(((present + late * 0.5) / total) * 100) : 0;

    return { total, present, absent, late, excused, studentCount, rate };
  }, [reportRecords]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 lg:p-8">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-emerald-600">
          <CalendarCheck className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-wide">Teacher</span>
        </div>
        <h1 className="mt-1 text-2xl font-black text-[var(--color-text-primary)]">Attendance</h1>
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
          Take today’s attendance, review records, or view a course report.
        </p>
      </header>

      <nav className="mb-5 flex overflow-x-auto rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-1">
        {[
          ['take', 'Take Attendance', CalendarCheck],
          ['records', 'Records', ClipboardList],
          ['reports', 'Reports', BarChart3],
        ].map(([value, label, Icon]) => {
          const active = tab === value;
          return (
            <button
              key={String(value)}
              type="button"
              onClick={() => setTab(value as Tab)}
              className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                active
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {String(label)}
            </button>
          );
        })}
      </nav>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {message}
        </div>
      )}

      {tab === 'take' && (
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Today’s classes</h2>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Only classes on your teaching timetable are shown.
              </p>
            </div>
            <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{prettyDate(localDate())}</span>
          </div>

          {todaySchedules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-12 text-center">
              <CalendarCheck className="mx-auto mb-3 h-9 w-9 text-[var(--color-text-tertiary)]" />
              <p className="font-semibold text-[var(--color-text-primary)]">No classes scheduled today</p>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Your teaching sessions will appear here.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {todaySchedules.map((schedule) => {
                const selected = selectedSchedule?._id === schedule._id;
                const className = schedule.class
                  ? `${schedule.class.title || ''} ${schedule.class.section || ''}`.trim()
                  : 'Class';

                return (
                  <button
                    key={schedule._id}
                    type="button"
                    onClick={() => void loadTakeAttendance(schedule)}
                    className={`rounded-2xl border bg-[var(--color-surface-primary)] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                      selected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/10'
                        : 'border-[var(--color-border-subtle)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-[var(--color-text-primary)]">
                          {schedule.course?.title?.en || 'Untitled course'}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{className}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <Clock3 className="h-3.5 w-3.5" />
                        {schedule.startTime}–{schedule.endTime}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedSchedule && (
            <section className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
              <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-bold text-[var(--color-text-primary)]">{selectedSchedule.course?.title?.en}</h3>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {selectedSchedule.startTime}–{selectedSchedule.endTime} · {students.length} students{locked ? ' · Locked' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {statuses.map((status) => (
                    <button
                      key={status.value}
                      type="button"
                      disabled={locked || rosterLoading}
                      onClick={() =>
                        setMarks(
                          Object.fromEntries(students.map((student) => [student._id, status.value])),
                        )
                      }
                      className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                    >
                      All {status.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void saveAttendance()}
                    disabled={locked || saving || rosterLoading || !students.length}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {rosterLoading ? (
                <div className="flex min-h-48 items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border-subtle)]">
                  {students.map((student, index) => {
                    const name = studentName(student);
                    const selectedStatus = marks[student._id];

                    return (
                      <div key={student._id} className="flex items-center justify-between gap-3 p-3 md:px-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="w-5 text-xs text-[var(--color-text-tertiary)]">{index + 1}</span>
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{name}</p>
                            <p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId || 'No ID'}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {statuses.map((status) => (
                            <button
                              key={status.value}
                              type="button"
                              disabled={locked}
                              aria-pressed={selectedStatus === status.value}
                              onClick={() =>
                                setMarks((previous) => ({ ...previous, [student._id]: status.value }))
                              }
                              className={`h-9 min-w-9 rounded-lg border px-2 text-xs font-black ${
                                selectedStatus === status.value
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
                              } disabled:opacity-50`}
                            >
                              {status.key}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {!students.length && (
                    <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">
                      No students are enrolled in this course.
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {tab === 'records' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4">
            <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto]">
              <select value={recordCourse} onChange={(event) => setRecordCourse(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm font-semibold">
                {courses.map((course) => <option key={course._id} value={course._id}>{course.title?.en || 'Untitled course'}</option>)}
              </select>
              <input type="date" value={recordFrom} onChange={(event) => setRecordFrom(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" />
              <input type="date" value={recordTo} onChange={(event) => setRecordTo(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" />
              <button type="button" onClick={() => void loadRecords()} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Load</button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
            {recordsLoading ? (
              <div className="p-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" /></div>
            ) : records.length ? (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {records.map((record, index) => (
                  <div key={record._id || `${record.date}-${record.student?._id}-${index}`} className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{studentName(record.student)}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        {prettyDate(record.date)}
                        {record.schedule?.startTime ? ` · ${record.schedule.startTime}–${record.schedule.endTime}` : ''}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClass(record.status)}`}>{record.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">No attendance records for this range.</div>
            )}
          </div>
        </section>
      )}

      {tab === 'reports' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4">
            <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto]">
              <select value={reportCourse} onChange={(event) => setReportCourse(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm font-semibold">
                {courses.map((course) => <option key={course._id} value={course._id}>{course.title?.en || 'Untitled course'}</option>)}
              </select>
              <input type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" />
              <input type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" />
              <button type="button" onClick={() => void loadReport()} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Generate</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Students', report.studentCount],
              ['Attendance', report.total],
              ['Present', report.present],
              ['Absent', report.absent],
              ['Rate', `${report.rate}%`],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4">
                <p className="text-xl font-black text-[var(--color-text-primary)]">{value}</p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{String(label)}</p>
              </div>
            ))}
          </div>

          {reportLoading ? (
            <div className="p-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" /></div>
          ) : (
            <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
                <h3 className="font-bold text-[var(--color-text-primary)]">Attendance breakdown</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {statuses.map((status) => {
                  const value = reportRecords.filter((record) => record.status === status.value).length;
                  const percentage = report.total ? Math.round((value / report.total) * 100) : 0;
                  return (
                    <div key={status.value}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{status.label}</span>
                        <span>{value} · {percentage}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-[var(--color-text-tertiary)]">
                {reportFrom} → {reportTo}. Late attendance counts as half credit in the rate.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default TeacherAttendance;
