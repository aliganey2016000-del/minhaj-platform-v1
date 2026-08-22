import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarCheck, ClipboardList, Clock3, Loader2 } from 'lucide-react';
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
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Take today’s attendance, review records, or view reports.</p>
      </header>

      <nav className="mb-5 grid grid-cols-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-1">
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
              className={`flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-bold sm:text-sm ${
                active ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {String(label)}
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
            <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{prettyDate(localDate())}</span>
          </div>

          {todaySchedules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-12 text-center">
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
                    className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-[var(--color-text-primary)]">{schedule.course?.title?.en || 'Untitled course'}</p>
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
        </section>
      )}

      {tab === 'records' && (
        <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
            <label className="text-xs font-bold text-[var(--color-text-secondary)]">
              Course
              <select value={recordCourse} onChange={(e) => setRecordCourse(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm">
                {courses.map((course) => <option key={course._id} value={course._id}>{course.title?.en || 'Course'}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-[var(--color-text-secondary)]">From<input type="date" value={recordFrom} onChange={(e) => setRecordFrom(e.target.value)} className="mt-1 rounded-xl border border-[var(--color-border-default)] px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-bold text-[var(--color-text-secondary)]">To<input type="date" value={recordTo} onChange={(e) => setRecordTo(e.target.value)} className="mt-1 rounded-xl border border-[var(--color-border-default)] px-3 py-2.5 text-sm" /></label>
            <button type="button" onClick={() => void loadRecords()} disabled={recordsLoading || !recordCourse} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{recordsLoading ? 'Loading…' : 'Load'}</button>
          </div>

          <div className="mt-5 overflow-x-auto">
            {records.length === 0 ? <p className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">No attendance records for this range.</p> : (
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead><tr className="border-b border-[var(--color-border-subtle)] text-xs text-[var(--color-text-tertiary)]"><th className="px-2 py-3">Date</th><th className="px-2 py-3">Student</th><th className="px-2 py-3">ID</th><th className="px-2 py-3">Status</th><th className="px-2 py-3">Time</th></tr></thead>
                <tbody>{records.map((record) => <tr key={record._id || `${record.date}-${record.student?._id}`} className="border-b border-[var(--color-border-subtle)]"><td className="px-2 py-3">{record.date?.slice(0, 10)}</td><td className="px-2 py-3 font-semibold">{studentName(record.student)}</td><td className="px-2 py-3">{record.student?.studentId || '—'}</td><td className="px-2 py-3 capitalize">{record.status}</td><td className="px-2 py-3">{record.schedule?.startTime && record.schedule?.endTime ? `${record.schedule.startTime}–${record.schedule.endTime}` : '—'}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {tab === 'reports' && (
        <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
            <label className="text-xs font-bold text-[var(--color-text-secondary)]">Course<select value={reportCourse} onChange={(e) => setReportCourse(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm">{courses.map((course) => <option key={course._id} value={course._id}>{course.title?.en || 'Course'}</option>)}</select></label>
            <label className="text-xs font-bold text-[var(--color-text-secondary)]">From<input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="mt-1 rounded-xl border border-[var(--color-border-default)] px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-bold text-[var(--color-text-secondary)]">To<input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="mt-1 rounded-xl border border-[var(--color-border-default)] px-3 py-2.5 text-sm" /></label>
            <button type="button" onClick={() => void loadReport()} disabled={reportLoading || !reportCourse} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{reportLoading ? 'Loading…' : 'Generate'}</button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              ['Rate', `${report.rate}%`],
              ['Students', report.studentCount],
              ['Present', report.present],
              ['Absent', report.absent],
              ['Late', report.late],
              ['Excused', report.excused],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-xs text-[var(--color-text-tertiary)]">{label}</p><p className="mt-1 text-xl font-black text-[var(--color-text-primary)]">{value}</p></div>)}
          </div>
        </section>
      )}
    </div>
  );
}

export default TeacherAttendance;
