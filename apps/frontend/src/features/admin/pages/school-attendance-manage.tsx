import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarCheck, CheckCircle2, CheckSquare, Clock3, Download, Eye, FileText, Lock, Search, Users } from 'lucide-react';
import api from '../../../lib/axios';

interface SessionSummary {
  _id: string;
  className: string;
  class?: { _id: string; title: string; section?: string };
  course?: { _id: string; title?: { en?: string }; courseCode?: string };
  teacherName: string;
  startTime: string;
  endTime: string;
  dayName: string;
  attendance: { total: number; present: number; absent: number; late: number; excused: number; locked: boolean; taken: boolean };
}

interface RosterStudent {
  _id: string;
  studentId: string;
  name: string;
  attendance: { _id?: string; status: AttendanceStatus; notes?: string; locked?: boolean } | null;
}

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
interface DraftRecord { status: AttendanceStatus; notes: string; }
interface SessionDetail {
  date: string;
  schedule: SessionSummary & { course?: { _id: string; title?: { en?: string }; courseCode?: string } };
  locked: boolean;
  taken: boolean;
  roster: RosterStudent[];
}
interface ReportOption { classId: string; className: string; courseId: string; courseName: string; courseCode?: string; }
interface ReportRow { _id: string; studentId: string; name: string; total: number; present: number; late: number; absent: number; percentage: number; }

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; letter: string; label: string; active: string; idle: string }> = [
  { value: 'present', letter: 'P', label: 'Present', active: 'bg-emerald-600 text-white border-emerald-600', idle: 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300' },
  { value: 'absent', letter: 'A', label: 'Absent', active: 'bg-red-600 text-white border-red-600', idle: 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300' },
  { value: 'late', letter: 'L', label: 'Late', active: 'bg-amber-500 text-white border-amber-500', idle: 'border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-300' },
  { value: 'excused', letter: 'E', label: 'Excused', active: 'bg-blue-600 text-white border-blue-600', idle: 'border-blue-200 text-blue-700 dark:border-blue-900 dark:text-blue-300' },
];

function localISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function courseName(session: SessionSummary) {
  return session.course?.title?.en || session.course?.courseCode || 'Subject';
}

function downloadCsv(rows: ReportRow[], option?: ReportOption) {
  const header = ['Student ID', 'Student Name', 'Total', 'Present', 'Late', 'Absent', 'Attendance %'];
  const values = rows.map((r) => [r.studentId, r.name, r.total, r.present, r.late, r.absent, `${r.percentage}%`]);
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...values].map((row) => row.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-${option?.className || 'school'}-${localISODate()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function StatusButtons({ value, onChange, disabled }: { value: AttendanceStatus; onChange: (value: AttendanceStatus) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex gap-1" role="group" aria-label="Attendance status">
      {STATUS_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`h-9 w-9 rounded-lg border text-xs font-bold transition ${value === option.value ? option.active : `bg-[var(--color-surface-primary)] ${option.idle}`} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {option.letter}
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const cls = {
    present: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    absent: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
    late: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    excused: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  }[status];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${cls}`}>{status}</span>;
}

export function SchoolAttendanceManage() {
  const [tab, setTab] = useState<'take' | 'view' | 'report'>('take');
  const [date, setDate] = useState(localISODate());
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [records, setRecords] = useState<Record<string, DraftRecord>>({});
  const [studentSearch, setStudentSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [reportOptions, setReportOptions] = useState<ReportOption[]>([]);
  const [reportCourse, setReportCourse] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return localISODate(d);
  });
  const [dateTo, setDateTo] = useState(localISODate());
  const [report, setReport] = useState<ReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSearch, setReportSearch] = useState('');

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true); setError('');
    try {
      const { data } = await api.get('/attendance/school/sessions', { params: { date } });
      setSessions(data?.data?.sessions || []);
    } catch (e: any) {
      setSessions([]);
      setError(e?.response?.data?.message || 'Could not load scheduled classes for this date.');
    } finally {
      setSessionsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (tab === 'take' || tab === 'view') loadSessions();
    setSelectedId(''); setDetail(null); setRecords({}); setMessage(''); setError('');
  }, [tab, loadSessions]);

  useEffect(() => {
    if (tab !== 'report') return;
    (async () => {
      try {
        const { data } = await api.get('/attendance/school/options');
        const options = data?.data || [];
        setReportOptions(options);
        setReportCourse((current) => current || options[0]?.courseId || '');
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Could not load report subjects.');
      }
    })();
  }, [tab]);

  const openSession = async (sessionId: string) => {
    setSelectedId(sessionId); setDetailLoading(true); setError(''); setMessage('');
    try {
      const { data } = await api.get(`/attendance/school/session/${sessionId}`, { params: { date } });
      const next: SessionDetail = data.data;
      setDetail(next);
      const draft: Record<string, DraftRecord> = {};
      for (const student of next.roster) {
        draft[student._id] = {
          status: student.attendance?.status || 'present',
          notes: student.attendance?.notes || '',
        };
      }
      setRecords(draft);
    } catch (e: any) {
      setDetail(null);
      setError(e?.response?.data?.message || 'Could not load the class roster.');
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredRoster = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!detail) return [];
    if (!q) return detail.roster;
    return detail.roster.filter((student) => student.name.toLowerCase().includes(q) || student.studentId.toLowerCase().includes(q));
  }, [detail, studentSearch]);

  const markAllPresent = () => {
    if (!detail || detail.locked) return;
    setRecords((current) => {
      const next = { ...current };
      detail.roster.forEach((student) => { next[student._id] = { ...(next[student._id] || { notes: '' }), status: 'present' }; });
      return next;
    });
  };

  const saveAttendance = async () => {
    if (!detail?.schedule?.course?._id || !detail.roster.length || detail.locked) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await api.post('/attendance', {
        course: detail.schedule.course._id,
        schedule: detail.schedule._id,
        date,
        records: detail.roster.map((student) => ({
          student: student._id,
          status: records[student._id]?.status || 'present',
          notes: records[student._id]?.notes || '',
        })),
      });
      setMessage('Attendance saved and locked successfully.');
      await loadSessions();
      await openSession(detail.schedule._id);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const runReport = async () => {
    if (!reportCourse) return;
    setReportLoading(true); setError('');
    try {
      const { data } = await api.get('/attendance/report', { params: { courseId: reportCourse, dateFrom, dateTo } });
      setReport(data.data || []);
    } catch (e: any) {
      setReport([]);
      setError(e?.response?.data?.message || 'Could not generate attendance report.');
    } finally {
      setReportLoading(false);
    }
  };

  const filteredReport = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    return q ? report.filter((row) => row.name.toLowerCase().includes(q) || row.studentId.toLowerCase().includes(q)) : report;
  }, [report, reportSearch]);

  const selectedReportOption = reportOptions.find((option) => option.courseId === reportCourse);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <CalendarCheck className="h-8 w-8 text-emerald-600" />
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">Attendance</h1>
              <p className="text-sm text-[var(--color-text-tertiary)]">School attendance follows the class schedule automatically.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-card">
        {([
          ['take', 'Take Attendance', CheckSquare],
          ['view', 'View Records', Eye],
          ['report', 'Reports', BarChart3],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-xs font-semibold sm:text-sm ${tab === key ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>
            <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span><span className="sm:hidden">{key === 'take' ? 'Take' : key === 'view' ? 'View' : 'Report'}</span>
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}

      {(tab === 'take' || tab === 'view') && (
        <>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
            <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Attendance Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm sm:max-w-xs" />
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Only classes scheduled on this day are shown.</p>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">Scheduled Classes</h2>
              <span className="text-xs text-[var(--color-text-tertiary)]">{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
            </div>
            {sessionsLoading ? (
              <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading scheduled classes...</div>
            ) : sessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 text-center">
                <CalendarCheck className="mx-auto mb-3 h-8 w-8 text-[var(--color-text-tertiary)]" />
                <p className="font-semibold text-[var(--color-text-primary)]">No classes scheduled for this date</p>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Create the class schedule first, then attendance will appear here automatically.</p>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {sessions.map((session) => (
                  <button key={session._id} type="button" onClick={() => openSession(session._id)} className={`rounded-2xl border p-4 text-left shadow-card transition hover:border-primary-400 ${selectedId === session._id ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-lg font-bold text-[var(--color-text-primary)]">{session.className}</p>
                        <p className="mt-0.5 font-semibold text-emerald-600">{courseName(session)}</p>
                      </div>
                      {session.attendance.taken ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Taken</span>
                      ) : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">Not taken</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><p className="text-xs text-[var(--color-text-tertiary)]">Teacher</p><p className="truncate font-medium text-[var(--color-text-primary)]">{session.teacherName}</p></div>
                      <div className="rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><p className="text-xs text-[var(--color-text-tertiary)]">Time</p><p className="font-medium text-[var(--color-text-primary)]">{session.startTime}–{session.endTime}</p></div>
                    </div>
                    {session.attendance.taken && <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">P {session.attendance.present} · A {session.attendance.absent} · L {session.attendance.late} · E {session.attendance.excused}</p>}
                  </button>
                ))}
              </div>
            )}
          </section>

          {detailLoading && <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading class roster...</div>}

          {!detailLoading && detail && (
            <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
              <div className="border-b border-[var(--color-border-default)] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-bold text-[var(--color-text-primary)]">{detail.schedule.className} · {courseName(detail.schedule)}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-secondary)]"><span>{detail.schedule.teacherName}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" />{detail.schedule.startTime}–{detail.schedule.endTime}</span></p>
                  </div>
                  {detail.locked && <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Lock className="h-3.5 w-3.5" /> Submitted & Locked</span>}
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/><input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search student name or ID..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-10 pr-3 text-sm" /></div>
                  {tab === 'take' && <button type="button" onClick={markAllPresent} disabled={detail.locked} className="rounded-xl border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30">Mark All Present</button>}
                </div>
              </div>

              <div className="divide-y divide-[var(--color-border-subtle)]">
                {filteredRoster.length === 0 ? <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No students found in this class.</div> : filteredRoster.map((student) => {
                  const draft = records[student._id] || { status: 'present' as AttendanceStatus, notes: '' };
                  return (
                    <div key={student._id} className="p-4 sm:flex sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[var(--color-text-primary)]">{student.name}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId}</p>
                      </div>
                      {tab === 'take' ? (
                        <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:items-center">
                          <StatusButtons value={draft.status} disabled={detail.locked} onChange={(status) => setRecords((current) => ({ ...current, [student._id]: { ...draft, status } }))} />
                          <input value={draft.notes} disabled={detail.locked} onChange={(e) => setRecords((current) => ({ ...current, [student._id]: { ...draft, notes: e.target.value } }))} placeholder="Note (optional)" className="min-w-0 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs disabled:opacity-60 sm:w-48" />
                        </div>
                      ) : (
                        <div className="mt-2 sm:mt-0">{student.attendance ? <StatusBadge status={student.attendance.status} /> : <span className="text-xs text-[var(--color-text-tertiary)]">Not marked</span>}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {tab === 'take' && (
                <div className="flex flex-col gap-3 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[var(--color-text-tertiary)]">{detail.roster.length} student{detail.roster.length === 1 ? '' : 's'} in this class. Submitting locks this session.</p>
                  <button type="button" onClick={saveAttendance} disabled={saving || detail.locked || detail.roster.length === 0} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving...' : detail.locked ? 'Attendance Locked' : 'Save Attendance'}</button>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {tab === 'report' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
            <div className="grid gap-3 lg:grid-cols-4">
              <label className="lg:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Class / Subject</span><select value={reportCourse} onChange={(e) => setReportCourse(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"><option value="">Select class / subject...</option>{reportOptions.map((option) => <option key={`${option.classId}-${option.courseId}`} value={option.courseId}>{option.className} — {option.courseName}{option.courseCode ? ` (${option.courseCode})` : ''}</option>)}</select></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">From</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">To</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /></label>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={runReport} disabled={!reportCourse || reportLoading} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{reportLoading ? 'Generating...' : 'Generate Report'}</button>{report.length > 0 && <button type="button" onClick={() => downloadCsv(filteredReport, selectedReportOption)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)]"><Download className="h-4 w-4"/>Export CSV</button>}</div>
          </div>

          {report.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
              <div className="flex flex-col gap-3 border-b border-[var(--color-border-default)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-[var(--color-text-primary)]">Attendance Report</p><p className="text-xs text-[var(--color-text-tertiary)]">{selectedReportOption?.className} · {selectedReportOption?.courseName}</p></div><div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/><input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Search student..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2 pl-9 pr-3 text-sm" /></div></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-[var(--color-surface-secondary)] text-left text-xs uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Absent</th><th className="px-4 py-3">Rate</th></tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{filteredReport.map((row) => <tr key={row._id}><td className="px-4 py-3"><p className="font-semibold text-[var(--color-text-primary)]">{row.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{row.studentId}</p></td><td className="px-4 py-3">{row.total}</td><td className="px-4 py-3 text-emerald-600">{row.present}</td><td className="px-4 py-3 text-amber-600">{row.late}</td><td className="px-4 py-3 text-red-600">{row.absent}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.percentage >= 90 ? 'bg-emerald-100 text-emerald-700' : row.percentage >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{row.percentage}%</span></td></tr>)}</tbody></table></div>
            </div>
          )}

          {!reportLoading && report.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center"><FileText className="mx-auto mb-3 h-8 w-8 text-[var(--color-text-tertiary)]"/><p className="font-semibold text-[var(--color-text-primary)]">Choose a class and subject to generate a report</p></div>}
        </div>
      )}
    </div>
  );
}

export default SchoolAttendanceManage;
