import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorOpen,
  RotateCcw,
  Search,
  Sparkles,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';
import { ExamWorkspaceTabs } from '../components/exam-workspace-tabs';

type Period = {
  _id: string;
  name: string;
  academicYear: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
};

type Assignment = {
  _id: string;
  teacher?: {
    _id: string;
    teacherId?: string;
    name?: string;
    email?: string;
  } | null;
};

type RoomRow = {
  _id: string;
  name: string;
  building?: string;
  capacity: number;
  students: number;
  classBreakdown?: Array<{
    classId: string;
    className: string;
    subject: string;
    students: number;
  }>;
  assignment?: Assignment | null;
};

type Session = {
  key: string;
  examDate: string;
  startTime: string;
  endTime: string;
  exams: Array<{ _id: string; subject: string; className: string }>;
  rooms: RoomRow[];
};

type Context = {
  period: Period;
  examType: 'mid' | 'final';
  sessions: Session[];
};

type TeacherAttendanceRow = {
  teacher: {
    _id: string;
    teacherId?: string;
    name: string;
    email?: string;
  };
  attendance?: {
    _id: string;
    status: 'present' | 'absent';
  } | null;
};

type TeacherAttendanceSummary = {
  total: number;
  present: number;
  absent: number;
  unmarked: number;
};

const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const input = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

const formatDay = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

const localTodayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function ExamInvigilatorsManage() {
  const [workspaceSearchParams] = useSearchParams();
  const contextPeriodId = workspaceSearchParams.get('periodId') || '';
  const contextExamName = workspaceSearchParams.get('examName') || '';
  const contextAcademicYear = workspaceSearchParams.get('academicYear') || '';
  const contextStartDate = workspaceSearchParams.get('startDate') || '';
  const contextEndDate = workspaceSearchParams.get('endDate') || '';
  const hasExamContext = Boolean(contextPeriodId);

  const [tab, setTab] = useState<'attendance' | 'assignment'>('attendance');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState(contextPeriodId);
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [attendanceDate, setAttendanceDate] = useState(() => localTodayKey());
  const [attendanceRows, setAttendanceRows] = useState<TeacherAttendanceRow[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<TeacherAttendanceSummary>({
    total: 0,
    present: 0,
    absent: 0,
    unmarked: 0,
  });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [savingTeacher, setSavingTeacher] = useState('');
  const [attendanceQuery, setAttendanceQuery] = useState('');

  const [assignmentDate, setAssignmentDate] = useState('');
  const [activeSession, setActiveSession] = useState('');
  const [draftAssignments, setDraftAssignments] = useState<Record<string, string>>({});
  const [assignmentDirty, setAssignmentDirty] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);

  const loadBase = async () => {
    setLoading(true);
    setError('');
    try {
      const periodRes = await api.get('/exams/periods');
      const nextPeriods = periodRes.data?.data || [];
      setPeriods(nextPeriods);
      setPeriodId(prev => {
        if (contextPeriodId && nextPeriods.some((period: Period) => period._id === contextPeriodId)) {
          return contextPeriodId;
        }
        return prev || nextPeriods[0]?._id || '';
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not load exam periods.');
    } finally {
      setLoading(false);
    }
  };

  const loadContext = async (id = periodId) => {
    if (!id) {
      setContext(null);
      return;
    }
    setError('');
    try {
      const response = await api.get('/exams/invigilators/context', { params: { periodId: id } });
      const next: Context | null = response.data?.data || null;
      setContext(next);

      if (next?.sessions?.length) {
        const dates = Array.from(new Set(next.sessions.map(session => session.examDate))).sort();
        const today = localTodayKey();
        const preferredDate = dates.includes(assignmentDate)
          ? assignmentDate
          : dates.includes(today)
            ? today
            : dates[0];

        setAssignmentDate(preferredDate);
        setActiveSession(prev => {
          const previous = next.sessions.find(session => session.key === prev && session.examDate === preferredDate);
          return previous?.key || next.sessions.find(session => session.examDate === preferredDate)?.key || next.sessions[0].key;
        });
      } else {
        setAssignmentDate('');
        setActiveSession('');
      }
    } catch (err: any) {
      setContext(null);
      setError(err.response?.data?.message || 'Could not load invigilation sessions.');
    }
  };

  const loadTeacherAttendance = async (date = attendanceDate) => {
    if (!periodId || !date) {
      setAttendanceRows([]);
      setAttendanceSummary({ total: 0, present: 0, absent: 0, unmarked: 0 });
      return;
    }

    setAttendanceLoading(true);
    setError('');
    try {
      const response = await api.get('/exams/invigilators/teacher-attendance', {
        params: { periodId, date },
      });
      const data = response.data?.data || {};
      setAttendanceRows(data.rows || []);
      setAttendanceSummary(data.summary || { total: 0, present: 0, absent: 0, unmarked: 0 });
    } catch (err: any) {
      setAttendanceRows([]);
      setAttendanceSummary({ total: 0, present: 0, absent: 0, unmarked: 0 });
      setError(err.response?.data?.message || 'Could not load teacher attendance.');
    } finally {
      setAttendanceLoading(false);
    }
  };

  useEffect(() => {
    void loadBase();
  }, []);

  useEffect(() => {
    if (contextPeriodId && contextPeriodId !== periodId) setPeriodId(contextPeriodId);
  }, [contextPeriodId, periodId]);

  useEffect(() => {
    if (periodId) void loadContext(periodId);
  }, [periodId]);

  useEffect(() => {
    if (periodId && attendanceDate) void loadTeacherAttendance(attendanceDate);
  }, [periodId, attendanceDate]);

  const examDates = useMemo(
    () => Array.from(new Set((context?.sessions || []).map(session => session.examDate))).sort(),
    [context],
  );

  const sessionsForDate = useMemo(
    () => (context?.sessions || []).filter(session => session.examDate === assignmentDate),
    [context, assignmentDate],
  );

  const selectedSession = useMemo(
    () => context?.sessions.find(session => session.key === activeSession) || null,
    [context, activeSession],
  );

  useEffect(() => {
    if (!sessionsForDate.length) return;
    if (!sessionsForDate.some(session => session.key === activeSession)) {
      setActiveSession(sessionsForDate[0].key);
    }
  }, [sessionsForDate, activeSession]);

  useEffect(() => {
    if (tab === 'assignment' && selectedSession?.examDate && attendanceDate !== selectedSession.examDate) {
      setAttendanceDate(selectedSession.examDate);
    }
  }, [tab, selectedSession?.examDate, attendanceDate]);

  const filteredAttendance = useMemo(() => {
    const q = attendanceQuery.trim().toLowerCase();
    if (!q) return attendanceRows;
    return attendanceRows.filter(row =>
      `${row.teacher.name} ${row.teacher.teacherId || ''} ${row.teacher.email || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [attendanceRows, attendanceQuery]);

  const presentTeachers = useMemo(
    () => attendanceRows
      .filter(row => row.attendance?.status === 'present')
      .map(row => row.teacher)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })),
    [attendanceRows],
  );

  const presentTeacherIds = useMemo(
    () => new Set(presentTeachers.map(teacher => teacher._id)),
    [presentTeachers],
  );

  useEffect(() => {
    if (!selectedSession || attendanceLoading) return;
    const next: Record<string, string> = {};
    selectedSession.rooms.forEach(room => {
      const existingTeacher = room.assignment?.teacher?._id || '';
      next[room._id] = existingTeacher && presentTeacherIds.has(existingTeacher)
        ? existingTeacher
        : '';
    });
    setDraftAssignments(next);
    setAssignmentDirty(false);
  }, [selectedSession?.key, attendanceLoading, presentTeacherIds]);

  const usedTeacherIds = useMemo(
    () => new Set(Object.values(draftAssignments).filter(Boolean)),
    [draftAssignments],
  );

  const assignmentTotals = useMemo(() => {
    const rooms = selectedSession?.rooms.length || 0;
    const assigned = selectedSession?.rooms.filter(room => Boolean(draftAssignments[room._id])).length || 0;
    return {
      rooms,
      assigned,
      missing: Math.max(rooms - assigned, 0),
      present: presentTeachers.length,
    };
  }, [selectedSession, draftAssignments, presentTeachers]);

  const teacherWorkload = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of context?.sessions || []) {
      if (session.key === selectedSession?.key) continue;
      for (const room of session.rooms) {
        const teacherId = room.assignment?.teacher?._id;
        if (teacherId) map.set(teacherId, (map.get(teacherId) || 0) + 1);
      }
    }
    return map;
  }, [context, selectedSession?.key]);

  const resetDraft = () => {
    if (!selectedSession) return;
    const next: Record<string, string> = {};
    selectedSession.rooms.forEach(room => {
      const existingTeacher = room.assignment?.teacher?._id || '';
      next[room._id] = existingTeacher && presentTeacherIds.has(existingTeacher)
        ? existingTeacher
        : '';
    });
    setDraftAssignments(next);
    setAssignmentDirty(false);
    setMessage('');
    setError('');
  };

  const autoAssign = () => {
    if (!selectedSession) return;
    setError('');
    setMessage('');

    if (!selectedSession.rooms.length) {
      setError('This session has no allocated exam rooms yet.');
      return;
    }
    if (!presentTeachers.length) {
      setError('No teacher is marked Present for this exam date.');
      return;
    }

    const orderedTeachers = presentTeachers.slice().sort((a, b) => {
      const aLoad = teacherWorkload.get(a._id) || 0;
      const bLoad = teacherWorkload.get(b._id) || 0;
      if (aLoad !== bLoad) return aLoad - bLoad;
      return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
    });

    const next: Record<string, string> = {};
    const used = new Set<string>();

    for (const room of selectedSession.rooms) {
      const current = room.assignment?.teacher?._id || '';
      if (current && presentTeacherIds.has(current) && !used.has(current)) {
        next[room._id] = current;
        used.add(current);
      }
    }

    const available = orderedTeachers.filter(teacher => !used.has(teacher._id));
    let cursor = 0;
    for (const room of selectedSession.rooms) {
      if (next[room._id]) continue;
      const teacher = available[cursor++];
      next[room._id] = teacher?._id || '';
      if (teacher) used.add(teacher._id);
    }

    setDraftAssignments(next);
    setAssignmentDirty(true);

    const assigned = Object.values(next).filter(Boolean).length;
    const missing = Math.max(selectedSession.rooms.length - assigned, 0);
    setMessage(
      missing
        ? `Smart draft created. ${missing} room(s) still need a Present teacher.`
        : 'Smart draft created. Review the dropdowns, then confirm assignments.',
    );
  };

  const confirmAssignments = async () => {
    if (!selectedSession || !context) return;
    setError('');
    setMessage('');

    const assignedIds = selectedSession.rooms
      .map(room => draftAssignments[room._id])
      .filter(Boolean);

    if (assignedIds.length !== selectedSession.rooms.length) {
      setError('Every room must have an invigilator before confirmation.');
      return;
    }
    if (new Set(assignedIds).size !== assignedIds.length) {
      setError('A teacher cannot be assigned to two rooms in the same session.');
      return;
    }

    setSavingAssignments(true);
    try {
      const response = await api.post('/exams/invigilators/bulk', {
        periodId: context.period._id,
        examDate: selectedSession.examDate,
        startTime: selectedSession.startTime,
        endTime: selectedSession.endTime,
        assignments: selectedSession.rooms.map(room => ({
          roomId: room._id,
          teacherId: draftAssignments[room._id],
        })),
      });
      setMessage(response.data?.message || 'Invigilator assignments confirmed.');
      setAssignmentDirty(false);
      await loadContext(context.period._id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not confirm invigilator assignments.');
    } finally {
      setSavingAssignments(false);
    }
  };

  const markTeacher = async (teacherId: string, status: 'present' | 'absent') => {
    if (!periodId || !attendanceDate) return;
    setSavingTeacher(teacherId);
    setError('');
    setMessage('');
    try {
      await api.post('/exams/invigilators/teacher-attendance', {
        periodId,
        date: attendanceDate,
        teacherId,
        status,
      });
      setMessage('Teacher attendance saved.');
      await loadTeacherAttendance(attendanceDate);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not save teacher attendance.');
    } finally {
      setSavingTeacher('');
    }
  };

  const markAll = async (status: 'present' | 'absent') => {
    if (!periodId || !attendanceDate) return;
    setSavingTeacher('all');
    setError('');
    setMessage('');
    try {
      const response = await api.post('/exams/invigilators/teacher-attendance/mark-all', {
        periodId,
        date: attendanceDate,
        status,
      });
      setMessage(response.data?.message || 'Teacher attendance saved.');
      await loadTeacherAttendance(attendanceDate);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not save teacher attendance.');
    } finally {
      setSavingTeacher('');
    }
  };

  const formatContextDate = (value: string) => {
    if (!value) return '';
    const date = new Date(value + 'T00:00:00');
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  const contextRange = (() => {
    const start = formatContextDate(contextStartDate);
    const end = formatContextDate(contextEndDate);
    if (start && end) return `${start} – ${end}`;
    return start || end;
  })();

  const contextSubtitle = [
    contextExamName || context?.period?.name,
    contextAcademicYear || context?.period?.academicYear,
    contextRange,
  ].filter(Boolean).join(' · ');

  const scheduleFallback = contextPeriodId
    ? `/admin/exams/schedule?${workspaceSearchParams.toString()}`
    : '/admin/exams/schedule';

  const todayKey = localTodayKey();

  if (loading) {
    return (
      <div className="p-4 pt-5 sm:p-6 sm:pt-6 lg:p-8 lg:pt-8">
        <div className="mx-auto max-w-screen-2xl space-y-5">
          <BackButton fallback={scheduleFallback} />
          <div>
            <h1 className="text-3xl font-bold">Invigilators</h1>
            {contextSubtitle && (
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{contextSubtitle}</p>
            )}
          </div>
          <ExamWorkspaceTabs />
          <div className={card + ' p-8 text-center text-sm text-[var(--color-text-tertiary)]'}>
            Loading invigilator workspace…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pt-5 sm:p-6 sm:pt-6 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-screen-2xl space-y-5">
        <BackButton fallback={scheduleFallback} />

        <div>
          <h1 className="text-3xl font-bold">Invigilators</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
            {contextSubtitle || 'Take teacher attendance, then assign Present teachers to exam rooms.'}
          </p>
        </div>

        <ExamWorkspaceTabs />

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
            {message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('attendance')}
            className={
              'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ' +
              (tab === 'attendance'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]')
            }
          >
            <UserCheck size={17} /> Teacher Attendance
          </button>
          <button
            type="button"
            onClick={() => setTab('assignment')}
            className={
              'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ' +
              (tab === 'assignment'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]')
            }
          >
            <DoorOpen size={17} /> Invigilator Assignment
          </button>
        </div>

        {!hasExamContext && (
          <div className={card + ' p-5'}>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">Exam</span>
              <select
                className={input}
                value={periodId}
                onChange={event => {
                  setPeriodId(event.target.value);
                  setAttendanceDate(localTodayKey());
                  setError('');
                  setMessage('');
                }}
              >
                <option value="">Select exam...</option>
                {periods.map(period => (
                  <option key={period._id} value={period._id}>
                    {period.name} · {period.academicYear}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {tab === 'attendance' && (
          <>
            <div className={card + ' p-5'}>
              <div className="grid gap-4 lg:grid-cols-[260px_1fr_auto] lg:items-end">
                <label className="space-y-1.5">
                  <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]">
                    <span>Exam Date</span>
                    {attendanceDate === todayKey && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        Today
                      </span>
                    )}
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className={input}
                      value={attendanceDate}
                      onChange={event => setAttendanceDate(event.target.value)}
                      disabled={!periodId}
                    />
                    <button
                      type="button"
                      onClick={() => setAttendanceDate(todayKey)}
                      disabled={!periodId}
                      className="rounded-xl border px-3 text-xs font-bold disabled:opacity-50"
                    >
                      Today
                    </button>
                  </div>
                  {examDates.length > 0 && (
                    <p className="text-[11px] text-[var(--color-text-tertiary)]">
                      Scheduled: {examDates.map(formatDay).join(' · ')}
                    </p>
                  )}
                </label>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <input
                    className={input + ' pl-9'}
                    value={attendanceQuery}
                    onChange={event => setAttendanceQuery(event.target.value)}
                    placeholder="Search teacher..."
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void markAll('present')}
                  disabled={!attendanceDate || savingTeacher === 'all'}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  <CheckCircle2 size={16} /> Mark All Present
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={card + ' p-4'}>
                <p className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Teachers</p>
                <p className="mt-1 text-2xl font-bold">{attendanceSummary.total}</p>
              </div>
              <div className={card + ' p-4'}>
                <p className="text-xs font-bold uppercase text-emerald-600">Present</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">{attendanceSummary.present}</p>
              </div>
              <div className={card + ' p-4'}>
                <p className="text-xs font-bold uppercase text-red-600">Absent</p>
                <p className="mt-1 text-2xl font-bold text-red-600">{attendanceSummary.absent}</p>
              </div>
              <div className={card + ' p-4'}>
                <p className="text-xs font-bold uppercase text-amber-600">Not Marked</p>
                <p className="mt-1 text-2xl font-bold text-amber-600">{attendanceSummary.unmarked}</p>
              </div>
            </div>

            <div className={card + ' overflow-hidden'}>
              {attendanceLoading ? (
                <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">
                  Loading teacher attendance...
                </div>
              ) : !attendanceDate ? (
                <div className="p-10 text-center">
                  <CalendarDays className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" />
                  <p className="mt-3 font-bold">Select an exam date</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border-default)]">
                  {filteredAttendance.map((row, index) => {
                    const status = row.attendance?.status;
                    return (
                      <div
                        key={row.teacher._id}
                        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-secondary)] text-sm font-bold">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-bold">{row.teacher.name}</p>
                            <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                              {row.teacher.teacherId || row.teacher.email || 'Teacher'}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex">
                          <button
                            type="button"
                            disabled={savingTeacher === row.teacher._id}
                            onClick={() => void markTeacher(row.teacher._id, 'present')}
                            className={
                              'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition disabled:opacity-50 ' +
                              (status === 'present'
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300')
                            }
                          >
                            <CheckCircle2 size={16} /> Present
                          </button>
                          <button
                            type="button"
                            disabled={savingTeacher === row.teacher._id}
                            onClick={() => void markTeacher(row.teacher._id, 'absent')}
                            className={
                              'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition disabled:opacity-50 ' +
                              (status === 'absent'
                                ? 'border-red-600 bg-red-600 text-white'
                                : 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300')
                            }
                          >
                            <UserX size={16} /> Absent
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredAttendance.length === 0 && (
                    <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">
                      No teachers found.
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'assignment' && (
          <>
            <div className={card + ' p-4 sm:p-5'}>
              <div className="grid gap-4 lg:grid-cols-[220px_260px_1fr_auto] lg:items-end">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">Exam Date</span>
                  <select
                    className={input}
                    value={assignmentDate}
                    onChange={event => {
                      const value = event.target.value;
                      setAssignmentDate(value);
                      const first = (context?.sessions || []).find(session => session.examDate === value);
                      setActiveSession(first?.key || '');
                      setAssignmentDirty(false);
                      setMessage('');
                      setError('');
                    }}
                    disabled={!examDates.length}
                  >
                    {examDates.map(date => (
                      <option key={date} value={date}>{formatDay(date)}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">Session / Shift</span>
                  <select
                    className={input}
                    value={activeSession}
                    onChange={event => {
                      setActiveSession(event.target.value);
                      setAssignmentDirty(false);
                      setMessage('');
                      setError('');
                    }}
                    disabled={!sessionsForDate.length}
                  >
                    {sessionsForDate.map((session, index) => (
                      <option key={session.key} value={session.key}>
                        Shift {index + 1} · {session.startTime}–{session.endTime}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-center">
                    <p className="text-xl font-bold">{assignmentTotals.rooms}</p>
                    <p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Rooms</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3 text-center dark:bg-emerald-950/20">
                    <p className="text-xl font-bold text-emerald-600">{assignmentTotals.present}</p>
                    <p className="text-[10px] font-bold uppercase text-emerald-600">Present</p>
                  </div>
                  <div className="rounded-xl bg-blue-50 p-3 text-center dark:bg-blue-950/20">
                    <p className="text-xl font-bold text-blue-600">{assignmentTotals.assigned}</p>
                    <p className="text-[10px] font-bold uppercase text-blue-600">Assigned</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3 text-center dark:bg-amber-950/20">
                    <p className="text-xl font-bold text-amber-600">{assignmentTotals.missing}</p>
                    <p className="text-[10px] font-bold uppercase text-amber-600">Missing</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={autoAssign}
                  disabled={!selectedSession || attendanceLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Sparkles size={16} /> Auto Assign
                </button>
              </div>

              {selectedSession && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 font-semibold">
                    <CalendarDays size={13} /> {formatDay(selectedSession.examDate)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 font-semibold">
                    <Clock3 size={13} /> {selectedSession.startTime}–{selectedSession.endTime}
                  </span>
                  <span>Auto Assign keeps valid existing assignments and balances remaining teachers by prior invigilation workload.</span>
                </div>
              )}
            </div>

            {selectedSession && assignmentTotals.present < assignmentTotals.rooms && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                {assignmentTotals.rooms - assignmentTotals.present} more Present teacher(s) are needed to cover every room in this session.
              </div>
            )}

            {selectedSession?.rooms.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {selectedSession.rooms.map(room => {
                  const selectedTeacherId = draftAssignments[room._id] || '';
                  const selectedTeacher = presentTeachers.find(teacher => teacher._id === selectedTeacherId);
                  const classes = room.classBreakdown || [];
                  const assigned = Boolean(selectedTeacherId);

                  return (
                    <div key={room._id} className={card + ' overflow-hidden'}>
                      <div className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-primary-50 p-2.5 text-primary-600 dark:bg-primary-950/30">
                              <DoorOpen size={20} />
                            </div>
                            <div>
                              <h2 className="font-bold">{room.name}</h2>
                              <p className="text-xs text-[var(--color-text-tertiary)]">
                                {room.building || 'Main'} · {room.students} students
                              </p>
                            </div>
                          </div>
                          <span className={
                            'rounded-full px-2.5 py-1 text-[10px] font-bold ' +
                            (assigned
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700')
                          }>
                            {assigned ? 'Assigned' : 'Missing'}
                          </span>
                        </div>

                        <div className="mt-4 space-y-1.5">
                          {classes.slice(0, 4).map(row => (
                            <div
                              key={row.classId}
                              className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-xs"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <BookOpen size={13} className="shrink-0 text-[var(--color-text-tertiary)]" />
                                <span className="truncate font-semibold">{row.subject} {row.className}</span>
                              </span>
                              <span className="shrink-0 font-bold text-[var(--color-text-secondary)]">
                                {row.students}
                              </span>
                            </div>
                          ))}
                          {classes.length > 4 && (
                            <p className="px-1 text-[11px] font-semibold text-[var(--color-text-tertiary)]">
                              +{classes.length - 4} more class group(s)
                            </p>
                          )}
                        </div>

                        <label className="mt-4 block space-y-1.5">
                          <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">Invigilator</span>
                          <select
                            className={input}
                            value={selectedTeacherId}
                            onChange={event => {
                              setDraftAssignments(prev => ({
                                ...prev,
                                [room._id]: event.target.value,
                              }));
                              setAssignmentDirty(true);
                              setError('');
                              setMessage('');
                            }}
                          >
                            <option value="">Choose Present teacher...</option>
                            {presentTeachers.map(teacher => {
                              const usedElsewhere = usedTeacherIds.has(teacher._id) && teacher._id !== selectedTeacherId;
                              const workload = teacherWorkload.get(teacher._id) || 0;
                              return (
                                <option key={teacher._id} value={teacher._id} disabled={usedElsewhere}>
                                  {teacher.name}{teacher.teacherId ? ` · ${teacher.teacherId}` : ''} · {workload} prior
                                  {usedElsewhere ? ' · Already used' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </label>

                        {selectedTeacher && (
                          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                            <UserCheck size={17} className="shrink-0 text-emerald-600" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-emerald-800 dark:text-emerald-300">
                                {selectedTeacher.name}
                              </p>
                              <p className="truncate text-[11px] text-emerald-700/70 dark:text-emerald-400">
                                Present · {(teacherWorkload.get(selectedTeacher._id) || 0)} prior assignment(s)
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={card + ' p-10 text-center'}>
                <DoorOpen className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" />
                <p className="mt-3 font-bold">No allocated rooms for this session</p>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                  Complete Room Allocation for this Exam Period, then return here.
                </p>
              </div>
            )}

            {selectedSession?.rooms.length ? (
              <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-[var(--color-text-tertiary)]">
                  {assignmentTotals.missing
                    ? `${assignmentTotals.missing} room(s) still need an invigilator.`
                    : assignmentDirty
                      ? 'Draft ready. Review once more, then confirm.'
                      : 'Assignments match the saved session.'}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetDraft}
                    disabled={savingAssignments}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold sm:flex-none"
                  >
                    <RotateCcw size={16} /> Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmAssignments()}
                    disabled={savingAssignments || assignmentTotals.missing > 0 || !assignmentDirty}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                  >
                    <CheckCircle2 size={16} />
                    {savingAssignments ? 'Confirming…' : 'Confirm Assignments'}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default ExamInvigilatorsManage;
