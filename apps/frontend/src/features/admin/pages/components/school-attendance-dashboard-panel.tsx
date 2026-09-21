import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import api from '../../../../lib/axios';

type DashboardData = {
  date: string;
  calendarDay?: { name?: string; type?: string; isInstructional?: boolean } | null;
  sessions: { total: number; complete: number; partial: number; missing: number; completionRate: number };
  attendance: { present: number; late: number; absent: number; excused: number };
  earlyWarning: {
    windowDays: number;
    threshold: number;
    count: number;
    students: Array<{ studentId: string; name: string; className: string; total: number; present: number; late: number; absent: number; excused: number; rate: number }>;
  };
};

type DashboardProps = {
  onOpenPeriod?: () => void;
  onOpenDaily?: () => void;
};

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

export function SchoolAttendanceDashboardPanel({ onOpenPeriod, onOpenDaily }: DashboardProps) {
  const [date, setDate] = useState(localDate());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/attendance/school/dashboard', { params: { date, days: 30, threshold: 90 } });
      setData(response.data?.data || null);
    } catch (e: any) {
      setData(null);
      setError(e?.response?.data?.message || 'Could not load attendance dashboard.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const attendanceTotal = useMemo(() => {
    if (!data) return 0;
    return data.attendance.present + data.attendance.late + data.attendance.absent + data.attendance.excused;
  }, [data]);

  const donutBackground = useMemo(() => {
    if (!data || attendanceTotal === 0) return 'var(--color-surface-secondary)';
    const present = (data.attendance.present / attendanceTotal) * 100;
    const late = present + (data.attendance.late / attendanceTotal) * 100;
    const absent = late + (data.attendance.absent / attendanceTotal) * 100;
    return `conic-gradient(#10b981 0 ${present}%, #f59e0b ${present}% ${late}%, #ef4444 ${late}% ${absent}%, #3b82f6 ${absent}% 100%)`;
  }, [attendanceTotal, data]);

  const exportSnapshot = () => {
    if (!data) return;
    const rows = [
      ['Attendance Dashboard', formatDisplayDate(data.date)],
      [],
      ['Session status', 'Count'],
      ['Scheduled lessons', data.sessions.total],
      ['Completed', data.sessions.complete],
      ['Partial', data.sessions.partial],
      ['Not submitted', data.sessions.missing],
      ['Submission rate', `${data.sessions.completionRate}%`],
      [],
      ['Attendance status', 'Count'],
      ['Present', data.attendance.present],
      ['Late', data.attendance.late],
      ['Absent', data.attendance.absent],
      ['Excused', data.attendance.excused],
      [],
      ['Early warning students', data.earlyWarning.count],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `attendance-dashboard-${data.date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const statCards = data
    ? [
        {
          label: 'Scheduled Lessons',
          value: data.sessions.total,
          note: 'Timetabled for selected date',
          icon: CalendarCheck,
          iconWrap: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
          valueClass: 'text-[var(--color-text-primary)]',
        },
        {
          label: 'Completed',
          value: data.sessions.complete,
          note: `${data.sessions.completionRate}% submission rate`,
          icon: CheckCircle2,
          iconWrap: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          valueClass: 'text-emerald-600 dark:text-emerald-400',
        },
        {
          label: 'Partial',
          value: data.sessions.partial,
          note: 'Started but not complete',
          icon: Clock3,
          iconWrap: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          valueClass: 'text-amber-600 dark:text-amber-400',
        },
        {
          label: 'Not Submitted',
          value: data.sessions.missing,
          note: 'Lessons needing follow-up',
          icon: AlertTriangle,
          iconWrap: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
          valueClass: 'text-red-600 dark:text-red-400',
        },
      ]
    : [];

  const statusCards = data
    ? [
        { label: 'Present', value: data.attendance.present, icon: UserCheck, cls: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
        { label: 'Late', value: data.attendance.late, icon: Clock3, cls: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20' },
        { label: 'Absent', value: data.attendance.absent, icon: UserX, cls: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/20' },
        { label: 'Excused', value: data.attendance.excused, icon: ShieldCheck, cls: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20' },
      ]
    : [];

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-sm">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">Attendance Management</h1>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Monitor lesson submissions, daily attendance and students who need follow-up.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 sm:w-52">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Dashboard date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
              />
            </label>
            <button
              type="button"
              onClick={onOpenPeriod}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              <ClipboardCheck className="h-4 w-4" />
              Take Attendance
            </button>
            <button
              type="button"
              onClick={exportSnapshot}
              disabled={!data}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] sm:px-5">
          <span className="font-semibold text-[var(--color-text-secondary)]">{formatDisplayDate(date)}</span>
          <span>•</span>
          <button type="button" onClick={onOpenDaily} className="inline-flex items-center gap-1.5 font-semibold text-primary-600 hover:text-primary-700">
            Open daily attendance <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Live school data'}
          </span>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-tertiary)] shadow-card">
          Loading attendance dashboard...
        </div>
      )}

      {data && (
        <>
          {data.calendarDay?.isInstructional === false && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
              <strong>{data.calendarDay.name || 'Non-instructional day'}.</strong> Scheduled attendance is closed for this date.
            </div>
          )}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map(({ label, value, note, icon: Icon, iconWrap, valueClass }) => (
              <div key={label} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}</p>
                    <p className={`mt-2 text-3xl font-bold tracking-tight ${valueClass}`}>{value}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconWrap}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{note}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,.65fr)]">
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-bold text-[var(--color-text-primary)]">Submission Progress</p>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">How much of today&apos;s scheduled lesson attendance has been submitted.</p>
                </div>
                <span className="inline-flex w-fit rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
                  {data.sessions.completionRate}% complete
                </span>
              </div>

              <div className="mt-5">
                <div className="h-3 overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
                  <div
                    className="h-full rounded-full bg-primary-600 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, data.sessions.completionRate))}%` }}
                  />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Completed', value: data.sessions.complete, total: data.sessions.total, dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Partial', value: data.sessions.partial, total: data.sessions.total, dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
                    { label: 'Not submitted', value: data.sessions.missing, total: data.sessions.total, dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
                        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{item.label}</span>
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <span className={`text-xl font-bold ${item.text}`}>{item.value}</span>
                        <span className="text-xs text-[var(--color-text-tertiary)]">{pct(item.value, item.total)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card sm:p-5">
              <div>
                <p className="font-bold text-[var(--color-text-primary)]">Attendance Distribution</p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Recorded attendance marks for the selected date.</p>
              </div>
              <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
                <div className="relative h-36 w-36 shrink-0 rounded-full p-4" style={{ background: donutBackground }}>
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[var(--color-surface-primary)] shadow-inner">
                    <span className="text-2xl font-bold text-[var(--color-text-primary)]">{attendanceTotal}</span>
                    <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Recorded</span>
                  </div>
                </div>
                <div className="grid w-full gap-2">
                  {[
                    ['Present', data.attendance.present, 'bg-emerald-500'],
                    ['Late', data.attendance.late, 'bg-amber-500'],
                    ['Absent', data.attendance.absent, 'bg-red-500'],
                    ['Excused', data.attendance.excused, 'bg-blue-500'],
                  ].map(([label, value, dot]) => (
                    <div key={String(label)} className="flex items-center justify-between gap-4 text-sm">
                      <span className="inline-flex items-center gap-2 text-[var(--color-text-secondary)]">
                        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                        {label}
                      </span>
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {value} <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">({pct(Number(value), attendanceTotal)}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statusCards.map(({ label, value, icon: Icon, cls, bg }) => (
              <div key={label} className={`flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] p-4 shadow-sm ${bg}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface-primary)] shadow-sm">
                  <Icon className={`h-5 w-5 ${cls}`} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}</p>
                  <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
            <div className="flex flex-col gap-3 border-b border-[var(--color-border-default)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <p className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Early Warning
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  Students below {data.earlyWarning.threshold}% over the last {data.earlyWarning.windowDays} days, based on at least 3 recorded lessons.
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 dark:bg-red-950/30 dark:text-red-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {data.earlyWarning.count} student{data.earlyWarning.count === 1 ? '' : 's'}
              </span>
            </div>

            {data.earlyWarning.students.length === 0 ? (
              <div className="p-10 text-center sm:p-12">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="mt-3 font-semibold text-[var(--color-text-primary)]">No students currently need an early-warning flag</p>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Students who fall below the threshold will appear here automatically.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-[var(--color-surface-secondary)] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                    <tr>
                      <th className="px-4 py-3 sm:px-5">Student</th>
                      <th className="px-4 py-3">Class</th>
                      <th className="px-4 py-3">Recorded</th>
                      <th className="px-4 py-3">Present</th>
                      <th className="px-4 py-3">Late</th>
                      <th className="px-4 py-3">Absent</th>
                      <th className="px-4 py-3 sm:px-5">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {data.earlyWarning.students.map((student) => (
                      <tr key={student.studentId} className="transition hover:bg-[var(--color-surface-secondary)]/70">
                        <td className="px-4 py-3.5 sm:px-5">
                          <p className="font-semibold text-[var(--color-text-primary)]">{student.name}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId}</p>
                        </td>
                        <td className="px-4 py-3.5 text-[var(--color-text-secondary)]">{student.className || '—'}</td>
                        <td className="px-4 py-3.5 text-[var(--color-text-secondary)]">{student.total}</td>
                        <td className="px-4 py-3.5 font-semibold text-emerald-600 dark:text-emerald-400">{student.present}</td>
                        <td className="px-4 py-3.5 font-semibold text-amber-600 dark:text-amber-400">{student.late}</td>
                        <td className="px-4 py-3.5 font-semibold text-red-600 dark:text-red-400">{student.absent}</td>
                        <td className="px-4 py-3.5 sm:px-5">
                          <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-950/30 dark:text-red-300">
                            {student.rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default SchoolAttendanceDashboardPanel;
