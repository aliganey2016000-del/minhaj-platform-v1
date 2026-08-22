import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarCheck, Check, Clock3, Loader2, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';

type Status = 'present' | 'absent' | 'late' | 'excused';

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
  startTime: string;
  endTime: string;
  course?: Course;
  class?: { title?: string; section?: string };
}

interface AttendanceRecord {
  student?: Student;
  status: Status;
  locked?: boolean;
}

const statuses: Array<{ value: Status; label: string; short: string }> = [
  { value: 'present', label: 'Present', short: 'P' },
  { value: 'absent', label: 'Absent', short: 'A' },
  { value: 'late', label: 'Late', short: 'L' },
  { value: 'excused', label: 'Excused', short: 'E' },
];

const localDate = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const studentName = (student: Student) => {
  const name = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim();
  return name || student.studentId || 'Student';
};

const statusClasses: Record<Status, string> = {
  present: 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  absent: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  late: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  excused: 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
};

export function TeacherTakeAttendance() {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!scheduleId) {
        setError('Attendance session not found.');
        setLoading(false);
        return;
      }

      try {
        const schedulesResponse = await api.get('/class-schedules/my-teaching');
        const schedules: Schedule[] = schedulesResponse.data?.data || [];
        const current = schedules.find((item) => item._id === scheduleId);

        if (!current?.course?._id) {
          setError('This teaching session is not available.');
          return;
        }

        setSchedule(current);

        const [rosterResponse, attendanceResponse] = await Promise.all([
          api.get(`/teacher-portal/courses/${current.course._id}/attendance-roster`),
          api.get('/attendance/course', {
            params: { courseId: current.course._id, date: localDate(), schedule: current._id },
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
        setError(err.response?.data?.message || 'Failed to load attendance.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [scheduleId]);

  const markAll = (status: Status) => {
    if (locked) return;
    setMarks(Object.fromEntries(students.map((student) => [student._id, status])));
  };

  const save = async () => {
    if (!schedule?.course?._id || !students.length || locked) return;

    if (students.some((student) => !marks[student._id])) {
      setError(`Please mark all ${students.length} students before saving.`);
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await api.post('/attendance', {
        course: schedule.course._id,
        schedule: schedule._id,
        date: localDate(),
        records: students.map((student) => ({
          student: student._id,
          status: marks[student._id],
        })),
      });
      setLocked(true);
      setMessage('Attendance saved successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error && !schedule) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <button type="button" onClick={() => navigate('/teacher/attendance')} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-emerald-700">
          <ArrowLeft className="h-4 w-4" /> Back to Attendance
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  const className = schedule?.class
    ? `${schedule.class.title || ''} ${schedule.class.section || ''}`.trim()
    : 'Class';

  return (
    <div className="mx-auto w-full max-w-3xl p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
        <button
          type="button"
          onClick={() => navigate('/teacher/attendance')}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm font-bold text-[var(--color-text-secondary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Attendance
        </button>
        <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{localDate()}</span>
      </div>

      <header className="mb-4 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 sm:mb-5 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-emerald-600">
              <CalendarCheck className="h-5 w-5 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wide">Take Attendance</span>
            </div>
            <h1 className="break-words text-2xl font-black leading-tight text-[var(--color-text-primary)] sm:text-3xl">
              {schedule?.course?.title?.en || 'Course'}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{className}</p>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Clock3 className="h-4 w-4" />
            {schedule?.startTime}–{schedule?.endTime}
          </span>
        </div>
      </header>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}

      <section className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
        <div className="border-b border-[var(--color-border-subtle)] p-4 sm:p-5">
          <div className="mb-3">
            <h2 className="font-bold text-[var(--color-text-primary)]">Students</h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {students.length} active student{students.length === 1 ? '' : 's'}{locked ? ' · Attendance locked' : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {statuses.map((status) => (
              <button
                key={status.value}
                type="button"
                disabled={locked || !students.length}
                onClick={() => markAll(status.value)}
                className="min-h-10 rounded-lg border border-[var(--color-border-default)] px-2 py-2 text-xs font-bold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)] disabled:opacity-50 sm:px-3"
              >
                All {status.label}
              </button>
            ))}
          </div>
        </div>

        {students.length === 0 ? (
          <div className="p-10 text-center sm:p-12">
            <p className="font-semibold text-[var(--color-text-primary)]">No active students found.</p>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
              This course has no active students in its attendance roster.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {students.map((student, index) => {
              const name = studentName(student);
              const selected = marks[student._id];

              return (
                <div key={student._id} className="p-4 sm:flex sm:items-center sm:gap-3 sm:px-5">
                  <div className="grid min-w-0 grid-cols-[20px_40px_minmax(0,1fr)] items-center gap-3 sm:flex sm:flex-1">
                    <span className="w-5 text-xs text-[var(--color-text-tertiary)]">{index + 1}</span>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold leading-5 text-[var(--color-text-primary)] sm:text-[15px]">
                        {name}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{student.studentId || 'No ID'}</p>
                    </div>
                  </div>

                  <div className="mt-3 ml-8 grid grid-cols-4 gap-2 sm:mt-0 sm:ml-auto sm:flex sm:shrink-0 sm:gap-1">
                    {statuses.map((status) => (
                      <button
                        key={status.value}
                        type="button"
                        title={status.label}
                        aria-label={`${status.label} — ${name}`}
                        disabled={locked}
                        onClick={() => setMarks((current) => ({ ...current, [student._id]: status.value }))}
                        className={`flex min-h-11 w-full items-center justify-center rounded-lg border text-sm font-black transition disabled:opacity-60 sm:h-9 sm:min-h-0 sm:w-9 sm:text-xs ${
                          selected === status.value
                            ? statusClasses[status.value]
                            : 'border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)]'
                        }`}
                      >
                        {selected === status.value ? <Check className="h-4 w-4" /> : status.short}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-[var(--color-border-subtle)] p-4 sm:p-5">
          <button
            type="button"
            onClick={() => void save()}
            disabled={locked || saving || !students.length}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : locked ? 'Attendance Saved' : 'Save Attendance'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default TeacherTakeAttendance;
