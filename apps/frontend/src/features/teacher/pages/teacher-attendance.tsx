import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck,
  Check,
  CheckCheck,
  ClipboardCheck,
  Clock3,
  Loader2,
  Save,
  Users,
} from 'lucide-react';
import api from '../../../lib/axios';

interface Course { _id: string; title?: { en?: string }; }
interface Student { _id: string; studentId?: string; profile?: { firstName?: string; lastName?: string }; }
interface AttendanceRecord { student: { _id: string }; status: string; locked?: boolean; }
type Status = 'present' | 'absent' | 'late' | 'excused';

const statuses: { value: Status; label: string; short: string; key: string }[] = [
  { value: 'present', label: 'Present', short: 'Present', key: 'P' },
  { value: 'absent', label: 'Absent', short: 'Absent', key: 'A' },
  { value: 'late', label: 'Late', short: 'Late', key: 'L' },
  { value: 'excused', label: 'Excused', short: 'Excused', key: 'E' },
];

const statusStyles: Record<Status, string> = {
  present: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  absent: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  late: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  excused: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
};

export function TeacherAttendance() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<string, Status>>({});
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/teacher-portal/dashboard');
        const active = data.data?.activeCourses || [];
        setCourses(active);
        if (active[0]?._id) setCourseId(active[0]._id);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load your courses');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!courseId) return;
    (async () => {
      setRosterLoading(true);
      setError('');
      setMessage('');
      try {
        const [rosterResponse, attendanceResponse] = await Promise.all([
          api.get(`/teacher-portal/courses/${courseId}/attendance-roster`),
          api.get('/attendance/course', { params: { courseId, date } }),
        ]);
        const roster: Student[] = rosterResponse.data?.data || [];
        const existing: AttendanceRecord[] = attendanceResponse.data?.data || [];
        const next: Record<string, Status> = {};
        existing.forEach((record) => {
          if (record.student?._id) next[record.student._id] = record.status as Status;
        });
        setStudents(roster);
        setRecords(next);
        setLocked(existing.some((record) => record.locked));
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load attendance roster');
        setStudents([]);
        setRecords({});
      } finally {
        setRosterLoading(false);
      }
    })();
  }, [courseId, date]);

  const counts = useMemo(() => {
    const values = Object.values(records);
    return {
      marked: values.length,
      present: values.filter((value) => value === 'present').length,
      absent: values.filter((value) => value === 'absent').length,
      late: values.filter((value) => value === 'late').length,
      excused: values.filter((value) => value === 'excused').length,
    };
  }, [records]);

  const completion = students.length ? Math.round((counts.marked / students.length) * 100) : 0;
  const selectedCourse = courses.find((course) => course._id === courseId);

  const setStatus = (studentId: string, status: Status) => {
    setRecords((prev) => ({ ...prev, [studentId]: status }));
    setMessage('');
    setError('');
  };

  const markAll = (status: Status) => {
    const next: Record<string, Status> = {};
    students.forEach((student) => { next[student._id] = status; });
    setRecords(next);
    setMessage('');
    setError('');
  };

  const save = async () => {
    if (!courseId || students.length === 0) return;
    if (counts.marked !== students.length) {
      setError(`Please mark all ${students.length} students before saving.`);
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.post('/attendance', {
        course: courseId,
        date,
        records: students.map((student) => ({ student: student._id, status: records[student._id] })),
      });
      setLocked(true);
      setMessage('Attendance saved and locked successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/30"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
          <p className="text-sm text-[var(--color-text-tertiary)]">Loading attendance workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 pb-28 md:p-6 md:pb-32 lg:p-8 lg:pb-12">
      <header className="mb-6 rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CalendarCheck className="h-3.5 w-3.5" /> Teacher workspace
            </div>
            <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)] md:text-3xl">Attendance</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-tertiary)]">Take attendance quickly, review the session at a glance, then lock it once it is submitted.</p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-[430px]">
            <label className="relative">
              <span className="sr-only">Course</span>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-full appearance-none rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                {courses.map((course) => <option key={course._id} value={course._id}>{course.title?.en || 'Untitled course'}</option>)}
              </select>
            </label>
            <label className="relative">
              <span className="sr-only">Attendance date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
            </label>
          </div>
        </div>
      </header>

      {error && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span></div>}
      {message && <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCheck className="h-5 w-5 shrink-0" /><span>{message}</span></div>}

      {courses.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-14 text-center">
          <Users className="mx-auto mb-4 h-10 w-10 text-[var(--color-text-tertiary)]" />
          <p className="font-semibold text-[var(--color-text-primary)]">No active courses</p>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">You have no active courses assigned yet.</p>
        </div>
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Students', value: students.length, icon: Users, tone: 'text-slate-600 bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300' },
              { label: 'Present', value: counts.present, icon: Check, tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300' },
              { label: 'Absent', value: counts.absent, icon: AlertCircle, tone: 'text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300' },
              { label: 'Late', value: counts.late, icon: Clock3, tone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300' },
            ].map((stat) => <div key={stat.label} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 shadow-sm"><div className={`mb-3 inline-flex rounded-xl p-2 ${stat.tone}`}><stat.icon className="h-4 w-4" /></div><p className="text-xl font-black text-[var(--color-text-primary)]">{stat.value}</p><p className="mt-0.5 text-xs font-medium text-[var(--color-text-tertiary)]">{stat.label}</p></div>)}
          </section>

          <section className="overflow-hidden rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm">
            <div className="border-b border-[var(--color-border-subtle)] p-4 md:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold text-[var(--color-text-primary)]">{selectedCourse?.title?.en || 'Attendance roster'}</h2>{locked && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">LOCKED</span>}</div>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{date} · {counts.marked} of {students.length} marked · {completion}% complete</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {statuses.map((status) => <button key={status.value} type="button" disabled={locked || rosterLoading} onClick={() => markAll(status.value)} className={`rounded-xl border px-3 py-2 text-xs font-bold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${statusStyles[status.value]}`}>All {status.label}</button>)}
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${completion}%` }} /></div>
            </div>

            {rosterLoading ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div> : <div className="divide-y divide-[var(--color-border-subtle)]">{students.map((student, index) => {
              const name = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || 'Unnamed student';
              const value = records[student._id];
              return <div key={student._id} className="group flex flex-col gap-3 p-4 transition hover:bg-[var(--color-surface-tertiary)] sm:flex-row sm:items-center sm:justify-between md:px-5">
                <div className="flex min-w-0 items-center gap-3"><span className="w-7 text-xs font-bold text-[var(--color-text-tertiary)]">{String(index + 1).padStart(2, '0')}</span><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{name.charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--color-text-primary)]">{name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId || 'No student ID'}</p></div></div>
                <div className="flex items-center gap-1.5 sm:pl-4" role="group" aria-label={`Attendance for ${name}`}>{statuses.map((status) => <button key={status.value} type="button" disabled={locked} aria-pressed={value === status.value} onClick={() => setStatus(student._id, status.value)} className={`h-10 min-w-10 rounded-xl border px-2.5 text-xs font-black transition ${value === status.value ? `${statusStyles[status.value]} ring-2 ring-current/10` : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)] hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20'} disabled:cursor-not-allowed disabled:opacity-50`}>{status.key}<span className="sr-only"> {status.short}</span></button>)}{value && <Check className="ml-1 h-4 w-4 text-emerald-600" />}</div>
              </div>;
            })}{students.length === 0 && <div className="p-14 text-center"><ClipboardCheck className="mx-auto mb-3 h-9 w-9 text-[var(--color-text-tertiary)]" /><p className="text-sm font-semibold text-[var(--color-text-primary)]">No students enrolled</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">There are no students in this course roster.</p></div>}</div>}
          </section>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]/95 p-3 backdrop-blur md:static md:mt-5 md:rounded-2xl md:border md:p-4">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--color-text-primary)]">{locked ? 'Session locked' : `${counts.marked}/${students.length} students marked`}</p><p className="hidden text-xs text-[var(--color-text-tertiary)] sm:block">{locked ? 'This attendance session has been submitted.' : 'Mark everyone before saving.'}</p></div><button type="button" onClick={save} disabled={locked || saving || rosterLoading || students.length === 0} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : locked ? 'Saved' : 'Save attendance'}</button></div>
          </div>
        </>
      )}
    </div>
  );
}

export default TeacherAttendance;
