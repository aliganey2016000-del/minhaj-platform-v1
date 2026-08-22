import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarCheck, CheckCircle2, ClipboardList, Clock3, Loader2, UserCheck, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';

interface Course {
  _id: string;
  title?: { en?: string };
}

interface Schedule {
  _id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  course?: Course;
  class?: { title?: string; section?: string };
}

interface Student {
  _id: string;
  studentId?: string;
  profile?: { firstName?: string; lastName?: string };
}

interface AttendanceRecord {
  _id?: string;
  student?: Student;
  status: Status;
  date: string;
  schedule?: { _id?: string; startTime?: string; endTime?: string };
}

type Status = 'present' | 'absent' | 'late' | 'excused';
type Tab = 'take' | 'records' | 'reports';

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

const statusIcon = (status: Status) => {
  if (status === 'present') return CheckCircle2;
  if (status === 'absent') return XCircle;
  return UserCheck;
};

export function TeacherAttendance() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('take');
  const [courses, setCourses] = useState<Course[]>([]);
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    const load = async () => {
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
            .filter((schedule) => schedule.dayOfWeek === today && schedule.course?._id)
            .sort((a, b) => a.startTime.localeCompare(b.startTime)),
        );

        if (activeCourses[0]?._id) {
          setRecordCourse(activeCourses[0]._id);
          setReportCourse(activeCourses[0]._id);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load attendance page.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

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
      setError(err.response?.data?.message || 'Failed to load attendance records.');
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
      setError(err.response?.data?.message || 'Failed to load attendance report.');
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

    const byStudent = Array.from(
      reportRecords.reduce((map, record) => {
        const id = record.student?._id || record.student?.studentId || studentName(record.student);
        const current = map.get(id) || { name: studentName(record.student), id: record.student?.studentId || '—', total: 0, present: 0, absent: 0, late: 0, excused: 0 };
        current.total += 1;
        current[record.status] += 1;
        map.set(id, current);
        return map;
      }, new Map<string, { name: string; id: string; total: number; present: number; absent: number; late: number; excused: number }>()).values(),
    ).map((student) => ({
      ...student,
      rate: student.total ? Math.round(((student.present + student.late * 0.5) / student.total) * 100) : 0,
    })).sort((a, b) => a.name.localeCompare(b.name));

    return { total, present, absent, late, excused, studentCount, rate, byStudent };
  }, [reportRecords]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
      </div>
    );
  }

  const tabs: Array<[Tab, string, typeof CalendarCheck]> = [
    ['take', 'Take Attendance', CalendarCheck],
    ['records', 'Records', ClipboardList],
    ['reports', 'Reports', BarChart3],
  ];

  return (
    <div className="mx-auto w-full max-w-6xl p-3 sm:p-4 md:p-6 lg:p-8">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-emerald-600">
          <CalendarCheck className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-wide">Teacher</span>
        </div>
        <h1 className="mt-1 text-2xl font-black text-[var(--color-text-primary)]">Attendance</h1>
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Take today’s attendance, review records, or view reports.</p>
      </header>

      <nav className="mb-5 grid grid-cols-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-1">
        {tabs.map(([value, label, Icon]) => {
          const active = tab === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2.5 text-[11px] font-bold sm:gap-2 sm:px-2 sm:text-sm ${
                active ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {tab === 'take' && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Today’s classes</h2>
              <p className="text-xs text-[var(--color-text-tertiary)]">Select a class to open its attendance list.</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-[var(--color-text-tertiary)]">{prettyDate(localDate())}</span>
          </div>

          {todaySchedules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center">
              <CalendarCheck className="mx-auto mb-3 h-9 w-9 text-[var(--color-text-tertiary)]" />
              <p className="font-semibold text-[var(--color-text-primary)]">No classes scheduled today</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {todaySchedules.map((schedule) => {
                const className = schedule.class
                  ? `${schedule.class.title || ''} ${schedule.class.section || ''}`.trim()
                  : 'Class';

                return (
                  <button
                    key={schedule._id}
                    type="button"
                    onClick={() => navigate(`/teacher/attendance/take/${schedule._id}`)}
                    className="w-full rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-base font-bold text-[var(--color-text-primary)]">{schedule.course?.title?.en || 'Untitled course'}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{className}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <Clock3 className="h-3.5 w-3.5" />
                        {schedule.startTime}–{schedule.endTime}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'records' && (
        <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
          <div className="border-b border-[var(--color-border-subtle)] p-4 sm:p-5">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Attendance records</h2>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">View attendance for one course and date range.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
              <label className="min-w-0 text-xs font-bold text-[var(--color-text-secondary)]">
                Course
                <select value={recordCourse} onChange={(e) => setRecordCourse(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm">
                  {courses.map((course) => <option key={course._id} value={course._id}>{course.title?.en || 'Course'}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-[var(--color-text-secondary)]">From<input type="date" value={recordFrom} onChange={(e) => setRecordFrom(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm" /></label>
              <label className="text-xs font-bold text-[var(--color-text-secondary)]">To<input type="date" value={recordTo} onChange={(e) => setRecordTo(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm" /></label>
              <button type="button" onClick={() => void loadRecords()} disabled={recordsLoading || !recordCourse} className="min-h-11 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{recordsLoading ? 'Loading…' : 'Load records'}</button>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {records.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">No attendance records for this range.</p>
            ) : (
              <div className="space-y-2">
                {records.map((record) => {
                  const StatusIcon = statusIcon(record.status);
                  return (
                    <div key={record._id || `${record.date}-${record.student?._id}`} className="rounded-xl border border-[var(--color-border-subtle)] p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {studentName(record.student).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-bold text-[var(--color-text-primary)]">{studentName(record.student)}</p>
                              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{record.student?.studentId || 'No student ID'}</p>
                            </div>
                            <span className={`inline-flex w-fit items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold capitalize ${statusClass(record.status)}`}>
                              <StatusIcon className="h-3.5 w-3.5" />
                              {record.status}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
                            <span>{prettyDate(record.date?.slice(0, 10) || localDate())}</span>
                            {record.schedule?.startTime && record.schedule?.endTime && <span>{record.schedule.startTime}–{record.schedule.endTime}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'reports' && (
        <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
          <div className="border-b border-[var(--color-border-subtle)] p-4 sm:p-5">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Attendance report</h2>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">A simple course summary with student-level attendance.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
              <label className="min-w-0 text-xs font-bold text-[var(--color-text-secondary)]">
                Course
                <select value={reportCourse} onChange={(e) => setReportCourse(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm">
                  {courses.map((course) => <option key={course._id} value={course._id}>{course.title?.en || 'Course'}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-[var(--color-text-secondary)]">From<input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm" /></label>
              <label className="text-xs font-bold text-[var(--color-text-secondary)]">To<input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm" /></label>
              <button type="button" onClick={() => void loadReport()} disabled={reportLoading || !reportCourse} className="min-h-11 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{reportLoading ? 'Loading…' : 'Generate report'}</button>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Attendance rate', `${report.rate}%`],
                ['Students', report.studentCount],
                ['Present', report.present],
                ['Absent', report.absent],
                ['Late', report.late],
                ['Excused', report.excused],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                  <p className="text-[11px] leading-4 text-[var(--color-text-tertiary)]">{label}</p>
                  <p className="mt-1 text-xl font-black text-[var(--color-text-primary)]">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-[var(--color-text-primary)]">By student</h3>
                  <p className="text-xs text-[var(--color-text-tertiary)]">Attendance rate for the selected period.</p>
                </div>
              </div>

              {report.byStudent.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--color-border-default)] py-10 text-center text-sm text-[var(--color-text-tertiary)]">Generate a report to see student summaries.</p>
              ) : (
                <div className="space-y-2">
                  {report.byStudent.map((student) => (
                    <div key={`${student.id}-${student.name}`} className="rounded-xl border border-[var(--color-border-subtle)] p-3 sm:p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-bold text-[var(--color-text-primary)]">{student.name}</p>
                              <p className="text-xs text-[var(--color-text-tertiary)]">{student.id}</p>
                            </div>
                            <p className="shrink-0 text-sm font-black text-emerald-600">{student.rate}%</p>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                            <span>P {student.present}</span>
                            <span>A {student.absent}</span>
                            <span>L {student.late}</span>
                            <span>E {student.excused}</span>
                            <span>· {student.total} records</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default TeacherAttendance;
