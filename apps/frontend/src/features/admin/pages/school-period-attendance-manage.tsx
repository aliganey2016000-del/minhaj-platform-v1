import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock3,
  Lock,
  Plus,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react';
import api from '../../../lib/axios';
import SchoolAttendanceReportPanel from './components/school-attendance-report-panel';

interface SessionSummary {
  _id: string;
  className: string;
  class?: { _id: string; title: string; section?: string };
  course?: { _id: string; title?: { en?: string }; courseCode?: string };
  teacherName: string;
  startTime: string;
  endTime: string;
  dayName: string;
  attendance: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    locked: boolean;
    taken: boolean;
    completionStatus?: 'not_taken' | 'partial' | 'complete';
    expectedStudents?: number | null;
    recordedStudents?: number;
  };
}

type AttendanceStatus = 'present' | 'absent';
type ReasonCode = '' | 'sick' | 'medical' | 'family_emergency' | 'school_activity' | 'suspension' | 'transport_delay' | 'other';
type CalendarDayType = 'instructional' | 'holiday' | 'closure' | 'exam' | 'special';
type Tab = 'take' | 'report' | 'calendar';

interface RosterStudent {
  _id: string;
  studentId: string;
  name: string;
  attendance: {
    _id?: string;
    status: AttendanceStatus;
    notes?: string;
    reasonCode?: ReasonCode;
    arrivalTime?: string;
    departureTime?: string;
    locked?: boolean;
  } | null;
}

interface DraftRecord {
  status: AttendanceStatus;
  notes: string;
  reasonCode: ReasonCode;
  arrivalTime: string;
  departureTime: string;
}

interface SessionDetail {
  date: string;
  schedule: SessionSummary & { course?: { _id: string; title?: { en?: string }; courseCode?: string } };
  locked: boolean;
  taken: boolean;
  completionStatus?: 'not_taken' | 'partial' | 'complete';
  expectedStudents?: number;
  recordedStudents?: number;
  unlockReason?: string;
  roster: RosterStudent[];
}

interface SessionFilterOption {
  classId: string;
  className: string;
  courseId: string;
  courseName: string;
  courseCode?: string;
  startTime?: string;
  endTime?: string;
  dayOfWeek?: number;
}
interface CalendarDay { _id: string; date: string; type: CalendarDayType; name: string; isInstructional: boolean; notes?: string; }

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; letter: string; label: string; active: string; idle: string }> = [
  { value: 'present', letter: 'P', label: 'Present', active: 'bg-emerald-600 text-white border-emerald-600', idle: 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300' },
  { value: 'absent', letter: 'A', label: 'Absent', active: 'bg-red-600 text-white border-red-600', idle: 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300' },
];

const REASONS: Array<{ value: ReasonCode; label: string }> = [
  { value: '', label: 'Reason (optional)' },
  { value: 'sick', label: 'Sick' },
  { value: 'medical', label: 'Medical appointment' },
  { value: 'family_emergency', label: 'Family emergency' },
  { value: 'school_activity', label: 'School activity' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'transport_delay', label: 'Transport delay' },
  { value: 'other', label: 'Other' },
];

function localISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthBounds(value = new Date()) {
  return {
    from: localISODate(new Date(value.getFullYear(), value.getMonth(), 1)),
    to: localISODate(new Date(value.getFullYear(), value.getMonth() + 1, 0)),
  };
}

function courseName(session: SessionSummary) {
  return session.course?.title?.en || session.course?.courseCode || 'Subject';
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

export function SchoolAttendanceManage() {
  const preserveReportOpenRef = useRef(false);
  const [tab, setTab] = useState<Tab>('take');
  const [date, setDate] = useState(localISODate());
  const [classFilter, setClassFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [sessionFilterOptions, setSessionFilterOptions] = useState<SessionFilterOption[]>([]);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [calendarDay, setCalendarDay] = useState<CalendarDay | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [records, setRecords] = useState<Record<string, DraftRecord>>({});
  const [studentSearch, setStudentSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const bounds = monthBounds();
  const [calendarFrom, setCalendarFrom] = useState(bounds.from);
  const [calendarTo, setCalendarTo] = useState(bounds.to);
  const [calendarRows, setCalendarRows] = useState<CalendarDay[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarForm, setCalendarForm] = useState<{ date: string; type: CalendarDayType; name: string; isInstructional: boolean; notes: string }>({
    date: localISODate(), type: 'holiday', name: '', isInstructional: false, notes: '',
  });

  const loadSessionFilterOptions = useCallback(async () => {
    setFilterOptionsLoading(true); setError('');
    try {
      const { data } = await api.get('/attendance/school/options', { params: { date } });
      setSessionFilterOptions(data?.data || []);
    } catch (e: any) {
      setSessionFilterOptions([]);
      setError(e?.response?.data?.message || 'Could not load attendance filters for this date.');
    } finally {
      setFilterOptionsLoading(false);
    }
  }, [date]);

  const loadSessions = useCallback(async () => {
    if (!classFilter || !periodFilter) {
      setSessions([]);
      setCalendarDay(null);
      return;
    }
    const [startTime, endTime] = periodFilter.split('|');
    setSessionsLoading(true); setError('');
    try {
      const { data } = await api.get('/attendance/school/sessions', {
        params: { date, classId: classFilter, startTime, endTime },
      });
      setSessions(data?.data?.sessions || []);
      setCalendarDay(data?.data?.calendarDay || null);
    } catch (e: any) {
      setSessions([]); setCalendarDay(null);
      setError(e?.response?.data?.message || 'Could not load scheduled classes for these filters.');
    } finally {
      setSessionsLoading(false);
    }
  }, [date, classFilter, periodFilter]);

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true); setError('');
    try {
      const { data } = await api.get('/attendance/school/calendar', { params: { from: calendarFrom, to: calendarTo } });
      setCalendarRows(data?.data || []);
    } catch (e: any) {
      setCalendarRows([]);
      setError(e?.response?.data?.message || 'Could not load school calendar.');
    } finally {
      setCalendarLoading(false);
    }
  }, [calendarFrom, calendarTo]);

  useEffect(() => {
    if (tab === 'take') void loadSessionFilterOptions();
  }, [tab, loadSessionFilterOptions]);

  useEffect(() => {
    if (tab === 'take') {
      if (classFilter && periodFilter) void loadSessions();
      else {
        setSessions([]);
        setCalendarDay(null);
        setSessionsLoading(false);
      }
    }
    if (tab === 'calendar') void loadCalendar();
    if (preserveReportOpenRef.current && tab === 'take') {
      preserveReportOpenRef.current = false;
      setMessage('');
      setError('');
    } else {
      setSelectedId('');
      setDetail(null);
      setRecords({});
      setMessage('');
      setError('');
    }
  }, [tab, classFilter, periodFilter, loadSessions, loadCalendar]);

  const classOptions = useMemo(() => {
    const seen = new Set<string>();
    return sessionFilterOptions
      .filter((option) => {
        if (!option.classId || seen.has(option.classId)) return false;
        seen.add(option.classId);
        return true;
      })
      .map((option) => ({ id: option.classId, name: option.className }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionFilterOptions]);

  const periodOptions = useMemo(() => {
    const seen = new Set<string>();
    return sessionFilterOptions
      .filter((option) => option.classId === classFilter && option.startTime && option.endTime)
      .map((option) => ({
        value: `${option.startTime}|${option.endTime}`,
        label: `${option.startTime}–${option.endTime}`,
      }))
      .filter((option) => {
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
      });
  }, [sessionFilterOptions, classFilter]);

  const openSession = async (sessionId: string, targetDate = date) => {
    setSelectedId(sessionId); setDetailLoading(true); setError(''); setMessage('');
    try {
      const { data } = await api.get(`/attendance/school/session/${sessionId}`, { params: { date: targetDate } });
      const next: SessionDetail = data.data;
      setSelectedId(sessionId);
      setDetail(next);
      const draft: Record<string, DraftRecord> = {};
      for (const student of next.roster) {
        draft[student._id] = {
          status: student.attendance?.status || 'present',
          notes: student.attendance?.notes || '',
          reasonCode: student.attendance?.reasonCode || '',
          arrivalTime: student.attendance?.arrivalTime || '',
          departureTime: student.attendance?.departureTime || '',
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

  const openAttendanceFromReport = (input: {
    date: string;
    sessionId: string;
    classId: string;
    startTime: string;
    endTime: string;
  }) => {
    // The normal Take-tab filter effect clears the selected roster whenever
    // date/class/period changes. Preserve this direct report drill-down so the
    // requested lesson stays open while those filters synchronise.
    preserveReportOpenRef.current = true;
    setDate(input.date);
    setClassFilter(input.classId);
    setPeriodFilter(`${input.startTime}|${input.endTime}`);
    setSessions([]);
    setCalendarDay(null);
    setTab('take');
    void openSession(input.sessionId, input.date);
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
      detail.roster.forEach((student) => {
        next[student._id] = { ...(next[student._id] || { notes: '', arrivalTime: '', departureTime: '', reasonCode: '' }), status: 'present', reasonCode: '', arrivalTime: '', departureTime: '' };
      });
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
          reasonCode: records[student._id]?.reasonCode || '',
          arrivalTime: records[student._id]?.arrivalTime || '',
          departureTime: records[student._id]?.departureTime || '',
        })),
      });
      setMessage('Attendance submitted, verified against the full roster, and locked.');
      await loadSessions();
      await openSession(detail.schedule._id);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const unlockSession = async (session: SessionSummary) => {
    if (!session?.course?._id || !session.attendance?.locked) return;
    const reason = window.prompt('Why is this attendance being reopened for correction?');
    if (!reason?.trim()) return;
    setUnlocking(true); setError(''); setMessage('');
    try {
      await api.patch('/attendance/school/unlock', {
        course: session.course._id,
        schedule: session._id,
        date,
        reason: reason.trim(),
      });
      await loadSessions();
      if (selectedId === session._id) await openSession(session._id);
      setMessage('Attendance unlocked. You or the assigned teacher can now correct it and submit it again.');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not unlock attendance.');
    } finally {
      setUnlocking(false);
    }
  };

  const unlockAttendance = async () => {
    if (!detail?.schedule || !detail.locked) return;
    await unlockSession(detail.schedule);
  };

  const saveCalendarDay = async () => {
    if (!calendarForm.date || !calendarForm.name.trim()) return;
    setCalendarLoading(true); setError(''); setMessage('');
    try {
      await api.post('/attendance/school/calendar', calendarForm);
      setMessage('School calendar day saved. Attendance will follow this instructional-day rule.');
      setCalendarForm((current) => ({ ...current, name: '', notes: '' }));
      await loadCalendar();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save school calendar day.');
    } finally {
      setCalendarLoading(false);
    }
  };

  const deleteCalendarDay = async (id: string) => {
    if (!window.confirm('Remove this calendar override?')) return;
    setCalendarLoading(true); setError('');
    try {
      await api.delete(`/attendance/school/calendar/${id}`);
      await loadCalendar();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not remove school calendar day.');
    } finally {
      setCalendarLoading(false);
    }
  };


  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <CalendarCheck className="h-8 w-8 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">Attendance Control Center</h1>
          <p className="text-sm text-[var(--color-text-tertiary)]">Take attendance, review records, and generate simple class reports.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-card">
        {([
          ['take', 'Take Attendance', CheckSquare],
          ['report', 'Reports', BarChart3],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-xs font-semibold sm:text-sm ${tab === key ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>
            <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span><span className="sm:hidden">{key === 'take' ? 'Take' : 'Report'}</span>
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}

      {tab === 'take' && (
        <>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
            <div className="grid gap-3 sm:grid-cols-3">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Attendance Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setClassFilter('');
                    setPeriodFilter('');
                    setSessions([]);
                    setCalendarDay(null);
                  }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Class</span>
                <select
                  value={classFilter}
                  disabled={filterOptionsLoading}
                  onChange={(e) => {
                    setClassFilter(e.target.value);
                    setPeriodFilter('');
                    setSessions([]);
                    setCalendarDay(null);
                  }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm disabled:opacity-60"
                >
                  <option value="">{filterOptionsLoading ? 'Loading classes...' : 'Select Class'}</option>
                  {classOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Period</span>
                <select
                  value={periodFilter}
                  disabled={!classFilter || filterOptionsLoading}
                  onChange={(e) => {
                    setPeriodFilter(e.target.value);
                    setSessions([]);
                    setCalendarDay(null);
                  }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm disabled:opacity-60"
                >
                  <option value="">{!classFilter ? 'Select Class First' : 'Select Period'}</option>
                  {periodOptions.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Only scheduled lessons on an instructional school day can be marked.</p>
          </div>

          {calendarDay && !calendarDay.isInstructional && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="font-semibold">{calendarDay.name}</p><p className="text-sm">This date is marked {calendarDay.type} / non-instructional. Attendance is closed.</p></div>
            </div>
          )}

          {classFilter && periodFilter && (
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
                <p className="font-semibold text-[var(--color-text-primary)]">{calendarDay && !calendarDay.isInstructional ? 'Attendance closed for this date' : 'No classes scheduled for this date'}</p>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{calendarDay && !calendarDay.isInstructional ? 'Change the School Calendar only if this should be an instructional day.' : 'Create the class schedule first, then attendance will appear here automatically.'}</p>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {sessions.map((session) => {
                  const completion = session.attendance.completionStatus || (session.attendance.taken ? 'complete' : 'not_taken');
                  const reopened = completion === 'complete' && !session.attendance.locked;
                  return (
                    <div key={session._id} className={`rounded-2xl border p-4 shadow-card transition ${selectedId === session._id ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}>
                      <button type="button" onClick={() => openSession(session._id)} className="w-full text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="text-lg font-bold text-[var(--color-text-primary)]">{session.className}</p><p className="mt-0.5 font-semibold text-emerald-600">{courseName(session)}</p></div>
                          {reopened ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700"><Unlock className="h-3.5 w-3.5" /> Unlocked</span>
                          ) : completion === 'complete' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</span>
                          ) : completion === 'partial' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Partial</span>
                          ) : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Not taken</span>}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><p className="text-xs text-[var(--color-text-tertiary)]">Teacher</p><p className="truncate font-medium text-[var(--color-text-primary)]">{session.teacherName}</p></div>
                          <div className="rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><p className="text-xs text-[var(--color-text-tertiary)]">Time</p><p className="font-medium text-[var(--color-text-primary)]">{session.startTime}–{session.endTime}</p></div>
                        </div>
                        {session.attendance.total > 0 && <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Present {session.attendance.present} · Absent {session.attendance.absent}{session.attendance.expectedStudents != null ? ` · ${session.attendance.recordedStudents}/${session.attendance.expectedStudents}` : ''}</p>}
                      </button>
                      {completion === 'complete' && session.attendance.locked && (
                        <div className="mt-3 border-t border-[var(--color-border-subtle)] pt-3">
                          <button type="button" onClick={() => void unlockSession(session)} disabled={unlocking} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 px-3 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/30">
                            <Unlock className="h-4 w-4" />{unlocking ? 'Unlocking...' : 'Unlock Attendance'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          )}

          {detailLoading && <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading class roster...</div>}

          {!detailLoading && detail && (
            <section className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
              <div className="border-b border-[var(--color-border-default)] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><p className="text-lg font-bold text-[var(--color-text-primary)]">{detail.schedule.className} · {courseName(detail.schedule)}</p><p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-secondary)]"><span>{detail.schedule.teacherName}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" />{detail.schedule.startTime}–{detail.schedule.endTime}</span></p></div>
                  <div className="flex flex-wrap gap-2">
                    {detail.locked && <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Lock className="h-3.5 w-3.5" /> Submitted & Locked</span>}
                    {tab === 'take' && detail.locked && <button type="button" onClick={unlockAttendance} disabled={unlocking} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"><Unlock className="h-3.5 w-3.5" />{unlocking ? 'Unlocking...' : 'Unlock Attendance'}</button>}
                  </div>
                </div>
                {detail.unlockReason && !detail.locked && <p className="mt-2 text-xs text-amber-700">Correction reason: {detail.unlockReason}</p>}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/><input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search student name or ID..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-10 pr-3 text-sm" /></div>
                  {tab === 'take' && <button type="button" onClick={markAllPresent} disabled={detail.locked} className="rounded-xl border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30">Mark All Present</button>}
                </div>
              </div>

              <div className="divide-y divide-[var(--color-border-subtle)]">
                {filteredRoster.length === 0 ? <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No students found in this class.</div> : filteredRoster.map((student) => {
                  const draft = records[student._id] || { status: 'present' as AttendanceStatus, notes: '', reasonCode: '' as ReasonCode, arrivalTime: '', departureTime: '' };
                  return (
                    <div key={student._id} className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                        <div className="min-w-0 flex-1"><p className="font-semibold text-[var(--color-text-primary)]">{student.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId}</p></div>
                        <StatusButtons value={draft.status} disabled={detail.locked} onChange={(status) => setRecords((current) => ({ ...current, [student._id]: { ...draft, status, ...(status === 'present' ? { reasonCode: '', arrivalTime: '', departureTime: '' } : {}) } }))} />
                      </div>
                      {tab === 'take' && draft.status === 'absent' && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(180px,1fr)_minmax(180px,1fr)] sm:items-center">
                          <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 text-xs font-semibold text-[var(--color-text-secondary)]">
                            <input
                              type="checkbox"
                              checked={!!draft.reasonCode}
                              disabled={detail.locked}
                              onChange={(e) => setRecords((current) => ({ ...current, [student._id]: { ...draft, reasonCode: e.target.checked ? (draft.reasonCode || 'other') : '' } }))}
                            />
                            Excused
                          </label>
                          {draft.reasonCode && (
                            <select value={draft.reasonCode} disabled={detail.locked} onChange={(e) => setRecords((current) => ({ ...current, [student._id]: { ...draft, reasonCode: e.target.value as ReasonCode } }))} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs disabled:opacity-60">
                              {REASONS.filter((reason) => reason.value).map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                            </select>
                          )}
                          <input value={draft.notes} disabled={detail.locked} onChange={(e) => setRecords((current) => ({ ...current, [student._id]: { ...draft, notes: e.target.value } }))} placeholder="Note (optional)" className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs disabled:opacity-60" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {tab === 'take' && (
                <div className="flex flex-col gap-3 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Full roster required: {detail.roster.length} student{detail.roster.length === 1 ? '' : 's'}. A complete submission locks the session.</p>
                  <button type="button" onClick={saveAttendance} disabled={saving || detail.locked || detail.roster.length === 0} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving...' : detail.locked ? 'Attendance Locked' : 'Submit Attendance'}</button>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {tab === 'report' && <SchoolAttendanceReportPanel onOpenAttendanceSession={openAttendanceFromReport} />}

      {tab === 'calendar' && (
        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
            <div className="mb-4"><p className="font-bold text-[var(--color-text-primary)]">Add Calendar Day</p><p className="text-xs text-[var(--color-text-tertiary)]">Holidays and closures automatically stop attendance for that date.</p></div>
            <div className="space-y-3">
              <label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Date</span><input type="date" value={calendarForm.date} onChange={(e) => setCalendarForm((current) => ({ ...current, date: e.target.value }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /></label>
              <label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Type</span><select value={calendarForm.type} onChange={(e) => { const type = e.target.value as CalendarDayType; setCalendarForm((current) => ({ ...current, type, isInstructional: !['holiday', 'closure'].includes(type) })); }} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"><option value="holiday">Holiday</option><option value="closure">School closure</option><option value="instructional">Instructional day</option><option value="exam">Exam day</option><option value="special">Special day</option></select></label>
              <label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Name</span><input value={calendarForm.name} onChange={(e) => setCalendarForm((current) => ({ ...current, name: e.target.value }))} placeholder="e.g. Eid Holiday" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /></label>
              <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] p-3 text-sm"><input type="checkbox" checked={calendarForm.isInstructional} onChange={(e) => setCalendarForm((current) => ({ ...current, isInstructional: e.target.checked }))} /><span className="text-[var(--color-text-secondary)]">Students attend school on this date</span></label>
              <label><span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Notes</span><textarea value={calendarForm.notes} onChange={(e) => setCalendarForm((current) => ({ ...current, notes: e.target.value }))} rows={3} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /></label>
              <button type="button" onClick={saveCalendarDay} disabled={calendarLoading || !calendarForm.name.trim()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Save Calendar Day</button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
            <div className="border-b border-[var(--color-border-default)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-bold text-[var(--color-text-primary)]">School Calendar</p><p className="text-xs text-[var(--color-text-tertiary)]">Instructional-day rules used by attendance.</p></div><div className="flex gap-2"><input type="date" value={calendarFrom} onChange={(e) => setCalendarFrom(e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs"/><input type="date" value={calendarTo} onChange={(e) => setCalendarTo(e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2 text-xs"/><button type="button" onClick={loadCalendar} className="rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold">Load</button></div></div>
            </div>
            {calendarLoading ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading calendar...</div> : calendarRows.length === 0 ? <div className="p-10 text-center"><CalendarDays className="mx-auto mb-3 h-8 w-8 text-[var(--color-text-tertiary)]"/><p className="font-semibold text-[var(--color-text-primary)]">No calendar overrides in this range</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Normal class schedules remain active.</p></div> : <div className="divide-y divide-[var(--color-border-subtle)]">{calendarRows.map((row) => <div key={row._id} className="flex items-center gap-3 p-4"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${row.isInstructional ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}><CalendarDays className="h-5 w-5"/></div><div className="min-w-0 flex-1"><p className="font-semibold text-[var(--color-text-primary)]">{row.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{String(row.date).slice(0, 10)} · {row.type.replace(/_/g, ' ')} · {row.isInstructional ? 'Instructional' : 'No attendance'}</p>{row.notes && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{row.notes}</p>}</div><button type="button" onClick={() => deleteCalendarDay(row._id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Remove"><Trash2 className="h-4 w-4"/></button></div>)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default SchoolAttendanceManage;
