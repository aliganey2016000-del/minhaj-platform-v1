import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock3, Users } from 'lucide-react';
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

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function SchoolAttendanceDashboardPanel() {
  const [date, setDate] = useState(localDate());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await api.get('/attendance/school/dashboard', { params: { date, days: 30, threshold: 90 } });
      setData(response.data?.data || null);
    } catch (e: any) {
      setData(null);
      setError(e?.response?.data?.message || 'Could not load attendance dashboard.');
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-bold text-[var(--color-text-primary)]">Attendance Operations Dashboard</p><p className="text-xs text-[var(--color-text-tertiary)]">Submission completion, today's status and early-warning students.</p></div>
        <label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /></label>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading attendance dashboard...</div>}

      {!loading && data && (
        <>
          {data.calendarDay?.isInstructional === false && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><strong>{data.calendarDay.name || 'Non-instructional day'}.</strong> Scheduled attendance is closed for this date.</div>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card"><div className="flex items-center gap-2 text-[var(--color-text-tertiary)]"><CalendarCheck className="h-4 w-4"/><span className="text-xs font-semibold">Scheduled lessons</span></div><p className="mt-2 text-3xl font-bold text-[var(--color-text-primary)]">{data.sessions.total}</p></div>
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card"><div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4"/><span className="text-xs font-semibold">Completed</span></div><p className="mt-2 text-3xl font-bold text-emerald-600">{data.sessions.complete}</p><p className="text-xs text-[var(--color-text-tertiary)]">{data.sessions.completionRate}% submission rate</p></div>
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card"><div className="flex items-center gap-2 text-amber-600"><Clock3 className="h-4 w-4"/><span className="text-xs font-semibold">Partial</span></div><p className="mt-2 text-3xl font-bold text-amber-600">{data.sessions.partial}</p></div>
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card"><div className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-4 w-4"/><span className="text-xs font-semibold">Not submitted</span></div><p className="mt-2 text-3xl font-bold text-red-600">{data.sessions.missing}</p></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {[['Present', data.attendance.present, 'text-emerald-600'], ['Late', data.attendance.late, 'text-amber-600'], ['Absent', data.attendance.absent, 'text-red-600'], ['Excused', data.attendance.excused, 'text-blue-600']].map(([label, value, cls]) => <div key={String(label)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 text-center"><p className="text-xs text-[var(--color-text-tertiary)]">{label}</p><p className={`text-xl font-bold ${cls}`}>{value}</p></div>)}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-default)] p-4"><div><p className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]"><Users className="h-4 w-4"/>Early Warning</p><p className="text-xs text-[var(--color-text-tertiary)]">Students below {data.earlyWarning.threshold}% over the last {data.earlyWarning.windowDays} days (minimum 3 recorded lessons).</p></div><span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">{data.earlyWarning.count}</span></div>
            {data.earlyWarning.students.length === 0 ? <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No students currently below the early-warning threshold.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-[var(--color-surface-secondary)] text-left text-xs uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Events</th><th className="px-4 py-3">Absent</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Rate</th></tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{data.earlyWarning.students.map((student) => <tr key={student.studentId}><td className="px-4 py-3"><p className="font-semibold text-[var(--color-text-primary)]">{student.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId}</p></td><td className="px-4 py-3">{student.className || '—'}</td><td className="px-4 py-3">{student.total}</td><td className="px-4 py-3 text-red-600">{student.absent}</td><td className="px-4 py-3 text-amber-600">{student.late}</td><td className="px-4 py-3"><span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">{student.rate}%</span></td></tr>)}</tbody></table></div>}
          </div>
        </>
      )}
    </div>
  );
}

export default SchoolAttendanceDashboardPanel;
