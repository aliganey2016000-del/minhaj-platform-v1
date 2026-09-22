import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, Clock3, Search, UserRound, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../../../lib/axios';

type ReportMode = 'date' | 'missing' | 'risk' | 'teacher' | 'student';

interface ScheduleOption {
  startTime?: string;
  endTime?: string;
}

interface MissingAttendanceSession {
  _id: string;
  className: string;
  class?: { _id: string; title?: string; section?: string };
  course?: { _id: string; title?: { en?: string }; courseCode?: string };
  teacherName: string;
  startTime: string;
  endTime: string;
  attendance: {
    total: number;
    present: number;
    absent: number;
    completionStatus?: 'not_taken' | 'partial' | 'complete';
    expectedStudents?: number | null;
    recordedStudents?: number;
    locked?: boolean;
  };
}

interface AttendanceRiskReport {
  window: { from: string; to: string; days: number };
  thresholds: {
    highRiskBelowPercentage: number;
    warningBelowPercentage: number;
    consecutiveAbsentDays: number;
    minimumAttendanceRecords: number;
  };
  summary: {
    activeStudents: number;
    studentsWithAttendance: number;
    atRisk: number;
    highRisk: number;
    warning: number;
    consecutiveAbsence: number;
  };
  rows: Array<{
    studentId: string;
    admissionNumber: string;
    name: string;
    classId?: string | null;
    className: string;
    total: number;
    present: number;
    absent: number;
    percentage: number;
    consecutiveAbsentDays: number;
    lastAttendanceDate?: string | null;
    riskLevel: 'high' | 'warning';
    reasons: string[];
  }>;
}

interface TeacherComplianceReport {
  window: { from: string; to: string; days: number };
  summary: {
    teachers: number;
    scheduled: number;
    teacherSubmitted: number;
    submittedByOther: number;
    completed: number;
    partial: number;
    missing: number;
    unassignedSessions: number;
    compliancePercentage: number;
    completionPercentage: number;
  };
  rows: Array<{
    teacherId: string;
    teacherCode: string;
    teacherName: string;
    scheduled: number;
    teacherSubmitted: number;
    submittedByOther: number;
    completed: number;
    partial: number;
    missing: number;
    compliancePercentage: number;
    completionPercentage: number;
    classes: string[];
    courses: string[];
  }>;
}

interface TeacherComplianceDetail {
  teacher: {
    _id: string;
    teacherId: string;
    name: string;
    status: string;
  };
  window: { from: string; to: string; days: number };
  summary: {
    scheduled: number;
    submitted: number;
    submittedByTeacher: number;
    submittedByOther: number;
    partial: number;
    missing: number;
    compliancePercentage: number;
  };
  rows: Array<{
    date: string;
    scheduleId: string;
    classId: string;
    className: string;
    courseId: string;
    courseName: string;
    courseCode?: string;
    startTime: string;
    endTime: string;
    isSubstitute: boolean;
    substituteReason?: string;
    status: 'missing' | 'partial' | 'submitted';
    locked: boolean;
    recordedStudents: number;
    expectedStudents?: number | null;
    submittedByType: 'teacher' | 'other' | null;
    submittedBy: string;
    submittedByRole: string;
    submittedAt?: string | null;
  }>;
}

interface SchoolAttendanceReportPanelProps {
  onOpenAttendanceSession?: (input: {
    date: string;
    sessionId: string;
    classId: string;
    startTime: string;
    endTime: string;
  }) => void;
}

interface DateReport {
  date: string;
  calendarDay?: { name?: string; type?: string; isInstructional?: boolean } | null;
  summary: {
    students: number;
    sessions: number;
    records: number;
    present: number;
    absent: number;
    presentPercentage: number;
    absentPercentage: number;
  };
  periods: Array<{
    key: string;
    label: string;
    startTime: string;
    endTime: string;
  }>;
  classes: Array<{
    classId: string;
    className: string;
    sessions: number;
    students: number;
    records: number;
    present: number;
    absent: number;
    percentage: number;
    periods: Record<string, {
      scheduled: boolean;
      sessions: number;
      subjects: string[];
      records: number;
      present: number;
      absent: number;
      percentage: number;
    }>;
  }>;
}

interface ClassReport {
  date: string;
  class: { _id: string; name: string };
  period: string;
  subjects: string[];
  summary: {
    students: number;
    marked: number;
    present: number;
    absent: number;
    presentPercentage: number;
    absentPercentage: number;
  };
  rows: Array<{
    _id: string;
    studentId: string;
    name: string;
    status: 'present' | 'absent' | null;
    excused: boolean;
  }>;
}

interface StudentSearchRow {
  _id: string;
  studentId: string;
  name: string;
  className: string;
}

function localISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'present' | 'absent' }) {
  const valueClass = tone === 'present' ? 'text-emerald-600' : tone === 'absent' ? 'text-red-600' : 'text-[var(--color-text-primary)]';
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 text-center">
      <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

export function SchoolAttendanceReportPanel({ onOpenAttendanceSession }: SchoolAttendanceReportPanelProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ReportMode>('date');
  const [date, setDate] = useState(localISODate());
  const [datePeriod, setDatePeriod] = useState('');
  const [dateOptions, setDateOptions] = useState<ScheduleOption[]>([]);
  const [dateOptionsLoading, setDateOptionsLoading] = useState(false);

  const [dateReport, setDateReport] = useState<DateReport | null>(null);
  const [missingSessions, setMissingSessions] = useState<MissingAttendanceSession[]>([]);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingClass, setMissingClass] = useState('');
  const [missingTeacher, setMissingTeacher] = useState('');
  const [missingPeriod, setMissingPeriod] = useState('');
  const [riskReport, setRiskReport] = useState<AttendanceRiskReport | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskTo, setRiskTo] = useState(localISODate());
  const [riskDays, setRiskDays] = useState('30');
  const [riskClass, setRiskClass] = useState('');
  const [riskLevel, setRiskLevel] = useState<'all' | 'high' | 'warning'>('all');
  const [teacherReport, setTeacherReport] = useState<TeacherComplianceReport | null>(null);
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [teacherTo, setTeacherTo] = useState(localISODate());
  const [teacherDays, setTeacherDays] = useState('30');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherDetail, setTeacherDetail] = useState<TeacherComplianceDetail | null>(null);
  const [teacherDetailLoading, setTeacherDetailLoading] = useState(false);
  const [teacherDetailName, setTeacherDetailName] = useState('');
  const [cellReport, setCellReport] = useState<ClassReport | null>(null);
  const [cellReportLoading, setCellReportLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const [studentSearch, setStudentSearch] = useState('');
  const [studentRows, setStudentRows] = useState<StudentSearchRow[]>([]);
  const [studentSearching, setStudentSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'date') return;
    let active = true;
    setDateOptionsLoading(true);
    api.get('/attendance/school/options', { params: { date } })
      .then(({ data }) => {
        if (!active) return;
        setDateOptions(data?.data || []);
      })
      .catch(() => {
        if (active) setDateOptions([]);
      })
      .finally(() => {
        if (active) setDateOptionsLoading(false);
      });
    return () => { active = false; };
  }, [mode, date]);

  const datePeriods = useMemo(() => {
    const seen = new Set<string>();
    return dateOptions
      .filter((option) => option.startTime && option.endTime)
      .map((option) => ({
        value: `${option.startTime}|${option.endTime}`,
        label: `${option.startTime}–${option.endTime}`,
      }))
      .filter((option) => {
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
      })
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [dateOptions]);

  useEffect(() => {
    if (mode !== 'missing') return;
    let active = true;
    setMissingLoading(true);
    setError('');
    api.get('/attendance/school/sessions', { params: { date } })
      .then(({ data }) => {
        if (!active) return;
        setMissingSessions(data?.data?.sessions || []);
      })
      .catch((e: any) => {
        if (!active) return;
        setMissingSessions([]);
        setError(e?.response?.data?.message || 'Could not load missing attendance sessions.');
      })
      .finally(() => {
        if (active) setMissingLoading(false);
      });
    return () => { active = false; };
  }, [mode, date]);

  const missingClassOptions = useMemo(() => {
    const values = new Map<string, string>();
    missingSessions.forEach((session) => {
      const id = session.class?._id || '';
      if (id) values.set(id, session.className);
    });
    return [...values.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [missingSessions]);

  const missingTeacherOptions = useMemo(() => {
    return [...new Set(missingSessions.map((session) => session.teacherName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [missingSessions]);

  const missingPeriodOptions = useMemo(() => {
    const values = new Map<string, string>();
    missingSessions.forEach((session) => {
      if (!session.startTime || !session.endTime) return;
      const value = `${session.startTime}|${session.endTime}`;
      values.set(value, `${session.startTime}–${session.endTime}`);
    });
    return [...values.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.value.localeCompare(b.value));
  }, [missingSessions]);

  const filteredMissingSessions = useMemo(() => {
    return missingSessions.filter((session) => {
      if (session.attendance?.completionStatus === 'complete') return false;
      if (missingClass && String(session.class?._id || '') !== missingClass) return false;
      if (missingTeacher && session.teacherName !== missingTeacher) return false;
      if (missingPeriod && `${session.startTime}|${session.endTime}` !== missingPeriod) return false;
      return true;
    });
  }, [missingSessions, missingClass, missingTeacher, missingPeriod]);

  const submittedSessions = missingSessions.filter((session) => session.attendance?.completionStatus === 'complete').length;
  const incompleteSessions = missingSessions.length - submittedSessions;
  const completionPercentage = missingSessions.length ? Math.round((submittedSessions / missingSessions.length) * 100) : 0;

  useEffect(() => {
    if (mode !== 'risk') return;
    let active = true;
    setRiskLoading(true);
    setError('');
    api.get('/attendance/school/report/risk', { params: { to: riskTo, days: riskDays } })
      .then(({ data }) => {
        if (!active) return;
        setRiskReport(data?.data || null);
      })
      .catch((e: any) => {
        if (!active) return;
        setRiskReport(null);
        setError(e?.response?.data?.message || 'Could not load attendance risk report.');
      })
      .finally(() => {
        if (active) setRiskLoading(false);
      });
    return () => { active = false; };
  }, [mode, riskTo, riskDays]);

  const riskClassOptions = useMemo(() => {
    const values = new Map<string, string>();
    riskReport?.rows.forEach((row) => {
      if (row.classId) values.set(String(row.classId), row.className);
    });
    return [...values.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [riskReport]);

  const filteredRiskRows = useMemo(() => {
    return (riskReport?.rows || []).filter((row) => {
      if (riskClass && String(row.classId || '') !== riskClass) return false;
      if (riskLevel !== 'all' && row.riskLevel !== riskLevel) return false;
      return true;
    });
  }, [riskReport, riskClass, riskLevel]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    let active = true;
    setTeacherLoading(true);
    setError('');
    api.get('/attendance/school/report/teacher-compliance', { params: { to: teacherTo, days: teacherDays } })
      .then(({ data }) => {
        if (!active) return;
        setTeacherReport(data?.data || null);
      })
      .catch((e: any) => {
        if (!active) return;
        setTeacherReport(null);
        setError(e?.response?.data?.message || 'Could not load teacher attendance compliance.');
      })
      .finally(() => {
        if (active) setTeacherLoading(false);
      });
    return () => { active = false; };
  }, [mode, teacherTo, teacherDays]);

  const filteredTeacherRows = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase();
    if (!q) return teacherReport?.rows || [];
    return (teacherReport?.rows || []).filter((row) =>
      row.teacherName.toLowerCase().includes(q)
      || row.teacherCode.toLowerCase().includes(q)
      || row.classes.some((name) => name.toLowerCase().includes(q))
    );
  }, [teacherReport, teacherSearch]);

  const openTeacherComplianceDetail = async (row: TeacherComplianceReport['rows'][number]) => {
    setTeacherDetailName(row.teacherName);
    setTeacherDetail(null);
    setTeacherDetailLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/attendance/school/report/teacher-compliance/${row.teacherId}`, {
        params: { to: teacherTo, days: teacherDays },
      });
      setTeacherDetail(data?.data || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load this teacher attendance detail.');
    } finally {
      setTeacherDetailLoading(false);
    }
  };

  const openComplianceLesson = (row: TeacherComplianceDetail['rows'][number]) => {
    setTeacherDetail(null);
    setTeacherDetailName('');
    if (!onOpenAttendanceSession) return;
    onOpenAttendanceSession({
      date: row.date,
      sessionId: row.scheduleId,
      classId: String(row.classId || ''),
      startTime: row.startTime,
      endTime: row.endTime,
    });
  };

  const switchMode = (next: ReportMode) => {
    setMode(next);
    setError('');
    setDateReport(null);
    setCellReport(null);
    setStudentRows([]);
    if (next !== 'missing') {
      setMissingClass('');
      setMissingTeacher('');
      setMissingPeriod('');
    }
  };

  const runDateReport = async () => {
    setReportLoading(true);
    setError('');
    setDateReport(null);
    try {
      const params: Record<string, string> = { date };
      if (datePeriod) {
        const [startTime, endTime] = datePeriod.split('|');
        params.startTime = startTime;
        params.endTime = endTime;
      }
      const { data } = await api.get('/attendance/school/report/date', { params });
      setDateReport(data?.data || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not generate the school attendance report.');
    } finally {
      setReportLoading(false);
    }
  };

  const openCellReport = async (row: DateReport['classes'][number], periodRow: DateReport['periods'][number]) => {
    setCellReportLoading(true);
    setError('');
    setCellReport(null);
    try {
      const { data } = await api.get('/attendance/school/report/class-period', {
        params: {
          date,
          classId: row.classId,
          startTime: periodRow.startTime,
          endTime: periodRow.endTime,
        },
      });
      setCellReport(data?.data || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load this lesson attendance report.');
    } finally {
      setCellReportLoading(false);
    }
  };

  const searchStudents = async () => {
    const q = studentSearch.trim();
    if (q.length < 2) {
      setStudentRows([]);
      setError('Enter at least 2 letters or digits to search for a student.');
      return;
    }
    setStudentSearching(true);
    setError('');
    try {
      const { data } = await api.get('/attendance/school/report/students', { params: { search: q } });
      setStudentRows(data?.data || []);
    } catch (e: any) {
      setStudentRows([]);
      setError(e?.response?.data?.message || 'Could not search students.');
    } finally {
      setStudentSearching(false);
    }
  };

  const openStudent = (studentId: string) => navigate(`/admin/attendance/student/${studentId}`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-0.5 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-card sm:gap-1 sm:p-1.5">
        {([
          ['date', 'By Date', CalendarDays],
          ['missing', 'Missing', Clock3],
          ['risk', 'Risk', AlertTriangle],
          ['teacher', 'Teachers', CheckCircle2],
          ['student', 'By Student', UserRound],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => switchMode(key)}
            className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold sm:gap-1.5 sm:px-2 sm:text-sm ${
              mode === key
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {mode === 'date' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setDatePeriod(''); setDateReport(null); }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Period <span className="font-normal text-[var(--color-text-tertiary)]">(optional)</span></span>
                <select
                  value={datePeriod}
                  disabled={dateOptionsLoading}
                  onChange={(e) => { setDatePeriod(e.target.value); setDateReport(null); }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm disabled:opacity-60"
                >
                  <option value="">{dateOptionsLoading ? 'Loading periods...' : 'All Periods'}</option>
                  {datePeriods.map((row, index) => <option key={row.value} value={row.value}>Period {index + 1} · {row.label}</option>)}
                </select>
              </label>
              <button type="button" onClick={runDateReport} disabled={reportLoading} className="min-h-11 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {reportLoading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Choose a date to see all attended courses for that day. Select a period only when you want to narrow the report to one lesson period.</p>
          </div>

          {dateReport && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryCard label="Students" value={dateReport.summary.students} />
                <SummaryCard label="Sessions" value={dateReport.summary.sessions} />
                <SummaryCard label="Present" value={`${dateReport.summary.presentPercentage}%`} tone="present" />
                <SummaryCard label="Absent" value={`${dateReport.summary.absentPercentage}%`} tone="absent" />
              </div>

              {dateReport.calendarDay?.isInstructional === false ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                  Attendance is closed for {dateReport.calendarDay.name || dateReport.calendarDay.type || 'this date'}.
                </div>
              ) : dateReport.classes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 text-center text-sm text-[var(--color-text-tertiary)]">No scheduled classes were found for this date.</div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
                  <div className="border-b border-[var(--color-border-default)] p-3 sm:p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-[var(--color-text-primary)] sm:text-base">School Attendance · {dateReport.date}</p>
                        <p className="text-[11px] leading-4 text-[var(--color-text-tertiary)] sm:text-xs">Classes are rows and periods are columns. Each cell shows the attendance percentage.</p>
                      </div>
                      <span className="text-[10px] font-medium text-[var(--color-text-tertiary)] sm:hidden">Swipe horizontally →</span>
                    </div>
                  </div>
                  <div className="max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [touch-action:pan-x_pan-y]">
                    <table className="w-max min-w-full border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-[var(--color-surface-secondary)]">
                          <th className="sticky left-0 z-20 w-[108px] min-w-[108px] max-w-[108px] border-b border-r border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-2.5 text-left text-[11px] font-bold text-[var(--color-text-secondary)] shadow-[2px_0_5px_rgba(0,0,0,0.08)] sm:w-40 sm:min-w-40 sm:max-w-none sm:px-3 sm:py-3 sm:text-xs">Class</th>
                          {dateReport.periods.map((period) => (
                            <th key={period.key} className="w-[86px] min-w-[86px] border-b border-r border-[var(--color-border-default)] px-1.5 py-2.5 text-center sm:w-28 sm:min-w-28 sm:px-3 sm:py-3">
                              <div className="text-[10px] font-bold text-[var(--color-text-primary)] sm:text-xs">
                                <span className="sm:hidden">{period.label.replace('Period ', 'P')}</span>
                                <span className="hidden sm:inline">{period.label}</span>
                              </div>
                              <div className="mt-0.5 whitespace-nowrap text-[8px] font-medium text-[var(--color-text-tertiary)] sm:mt-1 sm:text-[10px]">{period.startTime}–{period.endTime}</div>
                            </th>
                          ))}
                          <th className="w-[82px] min-w-[82px] border-b border-[var(--color-border-default)] px-1.5 py-2.5 text-center text-[10px] font-bold text-[var(--color-text-secondary)] sm:min-w-24 sm:px-3 sm:py-3 sm:text-xs">Overall</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dateReport.classes.map((row) => (
                          <tr key={row.classId} className="border-b border-[var(--color-border-subtle)] last:border-b-0">
                            <td className="sticky left-0 z-10 w-[108px] min-w-[108px] max-w-[108px] border-r border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-2.5 shadow-[2px_0_5px_rgba(0,0,0,0.08)] sm:w-40 sm:min-w-40 sm:max-w-none sm:px-3 sm:py-3">
                              <div className="break-words text-[11px] font-semibold leading-4 text-[var(--color-text-primary)] sm:text-sm">{row.className}</div>
                              <div className="mt-0.5 text-[9px] text-[var(--color-text-tertiary)] sm:text-[10px]">{row.sessions} period{row.sessions === 1 ? '' : 's'}</div>
                            </td>
                            {dateReport.periods.map((period) => {
                              const cell = row.periods?.[period.key];
                              if (!cell?.scheduled) {
                                return <td key={period.key} className="w-[86px] min-w-[86px] border-r border-[var(--color-border-subtle)] px-1.5 py-2.5 text-center text-[var(--color-text-tertiary)] sm:w-28 sm:min-w-28 sm:px-3 sm:py-3">—</td>;
                              }
                              const hasRecords = cell.records > 0;
                              return (
                                <td
                                  key={period.key}
                                  className="w-[86px] min-w-[86px] border-r border-[var(--color-border-subtle)] px-1 py-1.5 text-center sm:w-28 sm:min-w-28 sm:px-2 sm:py-2"
                                  title={hasRecords ? `${cell.present} present of ${cell.records} recorded — tap to view students` : 'Attendance not recorded'}
                                >
                                  {hasRecords ? (
                                    <button
                                      type="button"
                                      onClick={() => void openCellReport(row, period)}
                                      className="w-full touch-manipulation rounded-lg px-1 py-1.5 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 dark:hover:bg-emerald-950/30"
                                      aria-label={`View ${row.className} attendance for ${period.startTime} to ${period.endTime}`}
                                    >
                                      {cell.subjects?.length > 0 && (
                                        <div className="mb-1 line-clamp-2 text-[9px] font-semibold leading-3 text-[var(--color-text-secondary)] sm:text-[10px]" title={cell.subjects.join(', ')}>
                                          {cell.subjects.join(', ')}
                                        </div>
                                      )}
                                      <div className="text-sm font-bold text-emerald-600 sm:text-base">{cell.percentage}%</div>
                                      <div className="mt-0.5 text-[8px] leading-3 text-[var(--color-text-tertiary)] sm:text-[10px]">
                                        <span className="sm:hidden">{cell.present}/{cell.records}</span>
                                        <span className="hidden sm:inline">{cell.present}/{cell.records} present</span>
                                      </div>
                                    </button>
                                  ) : (
                                    <>
                                      <div className="text-sm font-bold text-[var(--color-text-tertiary)] sm:text-base">—</div>
                                      <div className="mt-0.5 text-[8px] leading-3 text-[var(--color-text-tertiary)] sm:text-[10px]">
                                        <span className="sm:hidden">No data</span>
                                        <span className="hidden sm:inline">Not recorded</span>
                                      </div>
                                    </>
                                  )}
                                </td>
                              );
                            })}
                            <td className="w-[82px] min-w-[82px] px-1.5 py-2.5 text-center sm:min-w-24 sm:px-3 sm:py-3">
                              <div className={`text-sm font-bold sm:text-base ${row.records ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}>
                                {row.records ? `${row.percentage}%` : '—'}
                              </div>
                              <div className="mt-0.5 text-[8px] leading-3 text-[var(--color-text-tertiary)] sm:text-[10px]">
                                {row.records ? (
                                  <>
                                    <span className="sm:hidden">{row.present}/{row.records}</span>
                                    <span className="hidden sm:inline">{row.present}/{row.records} present</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="sm:hidden">No data</span>
                                    <span className="hidden sm:inline">Not recorded</span>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {mode === 'missing' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setMissingClass('');
                    setMissingTeacher('');
                    setMissingPeriod('');
                  }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Class</span>
                <select value={missingClass} onChange={(e) => setMissingClass(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm">
                  <option value="">All Classes</option>
                  {missingClassOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Teacher</span>
                <select value={missingTeacher} onChange={(e) => setMissingTeacher(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm">
                  <option value="">All Teachers</option>
                  {missingTeacherOptions.map((teacher) => <option key={teacher} value={teacher}>{teacher}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Period</span>
                <select value={missingPeriod} onChange={(e) => setMissingPeriod(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm">
                  <option value="">All Periods</option>
                  {missingPeriodOptions.map((option, index) => <option key={option.value} value={option.value}>Period {index + 1} · {option.label}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Shows scheduled lessons whose attendance has not been fully submitted for the selected date.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryCard label="Scheduled" value={missingSessions.length} />
            <SummaryCard label="Submitted" value={submittedSessions} tone="present" />
            <SummaryCard label="Missing" value={incompleteSessions} tone="absent" />
            <SummaryCard label="Completion" value={`${completionPercentage}%`} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
            <div className="border-b border-[var(--color-border-default)] p-4">
              <p className="font-bold text-[var(--color-text-primary)]">Missing Attendance</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">Not submitted and partially recorded lessons appear here until attendance is complete.</p>
            </div>

            {missingLoading ? (
              <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading scheduled lessons...</div>
            ) : filteredMissingSessions.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">No missing attendance</p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">All matching scheduled lessons have complete attendance.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 p-3 sm:hidden">
                  {filteredMissingSessions.map((session) => {
                    const status = session.attendance?.completionStatus || 'not_taken';
                    const recorded = session.attendance?.recordedStudents ?? session.attendance?.total ?? 0;
                    const expected = session.attendance?.expectedStudents;
                    const subject = session.course?.title?.en || session.course?.courseCode || 'Subject';
                    return (
                      <div key={session._id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-[var(--color-text-primary)]">{session.className}</p>
                            <p className="mt-0.5 truncate text-xs font-semibold text-[var(--color-text-secondary)]">{subject}</p>
                            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{session.teacherName}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${status === 'partial' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                            {status === 'partial' ? 'Partial' : 'Not Submitted'}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="text-xs text-[var(--color-text-secondary)]">
                            <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{session.startTime}–{session.endTime}</span>
                            {status === 'partial' && <span className="ml-2">{recorded}/{expected ?? '?'} recorded</span>}
                          </div>
                          {onOpenAttendanceSession && (
                            <button
                              type="button"
                              onClick={() => onOpenAttendanceSession({ date, sessionId: session._id, classId: String(session.class?._id || ''), startTime: session.startTime, endTime: session.endTime })}
                              className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white"
                            >
                              Open Attendance
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto [touch-action:pan-x_pan-y] sm:block">
                  <table className="w-full min-w-[780px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-[var(--color-surface-secondary)] text-left text-xs text-[var(--color-text-secondary)]">
                        <th className="px-4 py-3 font-bold">Class</th>
                        <th className="px-4 py-3 font-bold">Course</th>
                        <th className="px-4 py-3 font-bold">Teacher</th>
                        <th className="px-4 py-3 font-bold">Period</th>
                        <th className="px-4 py-3 font-bold">Status</th>
                        <th className="px-4 py-3 text-right font-bold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-subtle)]">
                      {filteredMissingSessions.map((session) => {
                        const status = session.attendance?.completionStatus || 'not_taken';
                        const recorded = session.attendance?.recordedStudents ?? session.attendance?.total ?? 0;
                        const expected = session.attendance?.expectedStudents;
                        const subject = session.course?.title?.en || session.course?.courseCode || 'Subject';
                        return (
                          <tr key={session._id}>
                            <td className="px-4 py-3 font-semibold text-[var(--color-text-primary)]">{session.className}</td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)]">{subject}</td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)]">{session.teacherName}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-[var(--color-text-secondary)]">{session.startTime}–{session.endTime}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'partial' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                {status === 'partial' ? `Partial · ${recorded}/${expected ?? '?'}` : 'Not Submitted'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {onOpenAttendanceSession && (
                                <button
                                  type="button"
                                  onClick={() => onOpenAttendanceSession({ date, sessionId: session._id, classId: String(session.class?._id || ''), startTime: session.startTime, endTime: session.endTime })}
                                  className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white"
                                >
                                  Open Attendance
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mode === 'risk' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">As of Date</span>
                <input
                  type="date"
                  value={riskTo}
                  onChange={(e) => { setRiskTo(e.target.value); setRiskClass(''); }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Review Window</span>
                <select value={riskDays} onChange={(e) => { setRiskDays(e.target.value); setRiskClass(''); }} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm">
                  <option value="30">Last 30 days</option>
                  <option value="60">Last 60 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="120">Last 120 days</option>
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Class</span>
                <select value={riskClass} onChange={(e) => setRiskClass(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm">
                  <option value="">All Classes</option>
                  {riskClassOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Risk Level</span>
                <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as 'all' | 'high' | 'warning')} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm">
                  <option value="all">All At-Risk</option>
                  <option value="high">High Risk</option>
                  <option value="warning">Warning</option>
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
              High Risk: attendance below 80% with at least 5 attendance records, or 3+ consecutive fully absent days. Warning: 80–89% attendance.
            </p>
          </div>

          {riskLoading ? (
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">Analysing attendance risk...</div>
          ) : riskReport ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryCard label="At Risk" value={riskReport.summary.atRisk} tone="absent" />
                <SummaryCard label="High Risk" value={riskReport.summary.highRisk} tone="absent" />
                <SummaryCard label="Warning" value={riskReport.summary.warning} />
                <SummaryCard label="3+ Absent Days" value={riskReport.summary.consecutiveAbsence} />
              </div>

              <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
                <div className="border-b border-[var(--color-border-default)] p-4">
                  <p className="font-bold text-[var(--color-text-primary)]">Attendance Risk / Early Warning</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {riskReport.summary.studentsWithAttendance} of {riskReport.summary.activeStudents} active students have attendance data in this review window.
                  </p>
                </div>

                {filteredRiskRows.length === 0 ? (
                  <div className="p-10 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">No students match this risk filter</p>
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Students at or above 90% attendance are not listed as at-risk.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 p-3 sm:hidden">
                      {filteredRiskRows.map((row) => (
                        <button key={row.studentId} type="button" onClick={() => openStudent(row.studentId)} className="w-full rounded-xl border border-[var(--color-border-default)] p-3 text-left hover:bg-[var(--color-surface-secondary)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-bold text-[var(--color-text-primary)]">{row.name}</p>
                              <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{row.admissionNumber} · {row.className}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${row.riskLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {row.riskLevel === 'high' ? 'High Risk' : 'Warning'}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                            <div className="rounded-lg bg-[var(--color-surface-secondary)] px-1 py-2"><p className="text-[9px] text-[var(--color-text-tertiary)]">Records</p><p className="text-sm font-black">{row.total}</p></div>
                            <div className="rounded-lg bg-emerald-50 px-1 py-2 dark:bg-emerald-950/30"><p className="text-[9px] text-emerald-700">Present</p><p className="text-sm font-black text-emerald-600">{row.present}</p></div>
                            <div className="rounded-lg bg-red-50 px-1 py-2 dark:bg-red-950/30"><p className="text-[9px] text-red-700">Absent</p><p className="text-sm font-black text-red-600">{row.absent}</p></div>
                            <div className="rounded-lg bg-primary-500/10 px-1 py-2"><p className="text-[9px] text-primary-700">Present %</p><p className="text-sm font-black text-primary-600">{row.percentage}%</p></div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {row.reasons.map((reason) => <span key={reason} className="rounded-full bg-[var(--color-surface-secondary)] px-2 py-1 text-[10px] font-semibold text-[var(--color-text-secondary)]">{reason}</span>)}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="hidden overflow-x-auto [touch-action:pan-x_pan-y] sm:block">
                      <table className="w-full min-w-[900px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-[var(--color-surface-secondary)] text-left text-xs text-[var(--color-text-secondary)]">
                            <th className="px-4 py-3 font-bold">Student</th>
                            <th className="px-4 py-3 font-bold">Class</th>
                            <th className="px-3 py-3 text-center font-bold">Records</th>
                            <th className="px-3 py-3 text-center font-bold">Present</th>
                            <th className="px-3 py-3 text-center font-bold">Absent</th>
                            <th className="px-3 py-3 text-center font-bold">Present %</th>
                            <th className="px-3 py-3 text-center font-bold">Consecutive</th>
                            <th className="px-4 py-3 font-bold">Risk</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)]">
                          {filteredRiskRows.map((row) => (
                            <tr key={row.studentId} className="cursor-pointer hover:bg-[var(--color-surface-secondary)]" onClick={() => openStudent(row.studentId)}>
                              <td className="px-4 py-3"><p className="font-semibold text-[var(--color-text-primary)]">{row.name}</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{row.admissionNumber}</p></td>
                              <td className="px-4 py-3 text-[var(--color-text-secondary)]">{row.className}</td>
                              <td className="px-3 py-3 text-center font-semibold">{row.total}</td>
                              <td className="px-3 py-3 text-center font-semibold text-emerald-600">{row.present}</td>
                              <td className="px-3 py-3 text-center font-semibold text-red-600">{row.absent}</td>
                              <td className="px-3 py-3 text-center font-black text-primary-600">{row.percentage}%</td>
                              <td className="px-3 py-3 text-center">{row.consecutiveAbsentDays ? `${row.consecutiveAbsentDays} day${row.consecutiveAbsentDays === 1 ? '' : 's'}` : '—'}</td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.riskLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {row.riskLevel === 'high' ? 'High Risk' : 'Warning'}
                                </span>
                                <p className="mt-1 max-w-[260px] text-[10px] text-[var(--color-text-tertiary)]">{row.reasons.join(' · ')}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {mode === 'teacher' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
            <div className="grid gap-3 sm:grid-cols-3">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">As of Date</span>
                <input
                  type="date"
                  value={teacherTo}
                  onChange={(e) => setTeacherTo(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Review Window</span>
                <select value={teacherDays} onChange={(e) => setTeacherDays(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm">
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="60">Last 60 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="120">Last 120 days</option>
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Teacher / Class</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <input
                    value={teacherSearch}
                    onChange={(e) => setTeacherSearch(e.target.value)}
                    placeholder="Search teacher or class"
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-3 text-sm"
                  />
                </div>
              </label>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
              Compliance counts lessons submitted by the teacher responsible for that lesson. Attendance completed by an admin or another user is shown separately as “By Other”.
            </p>
          </div>

          {teacherLoading ? (
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading teacher attendance compliance...</div>
          ) : teacherReport ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryCard label="Scheduled" value={teacherReport.summary.scheduled} />
                <SummaryCard label="Teacher Submitted" value={teacherReport.summary.teacherSubmitted} tone="present" />
                <SummaryCard label="Missing" value={teacherReport.summary.missing + teacherReport.summary.partial} tone="absent" />
                <SummaryCard label="Compliance" value={`${teacherReport.summary.compliancePercentage}%`} />
              </div>

              {teacherReport.summary.unassignedSessions > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  {teacherReport.summary.unassignedSessions} scheduled lesson(s) in this period have no teacher assigned and are excluded from teacher compliance.
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
                <div className="border-b border-[var(--color-border-default)] p-4">
                  <p className="font-bold text-[var(--color-text-primary)]">Teacher Attendance Compliance</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {teacherReport.summary.teachers} teacher(s) with scheduled lessons in this review window. Future lessons today are not counted.
                  </p>
                </div>

                {filteredTeacherRows.length === 0 ? (
                  <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No teachers match this filter.</div>
                ) : (
                  <>
                    <div className="space-y-2 p-3 sm:hidden">
                      {filteredTeacherRows.map((row) => (
                        <button key={row.teacherId} type="button" onClick={() => void openTeacherComplianceDetail(row)} className="w-full rounded-xl border border-[var(--color-border-default)] p-3 text-left transition hover:bg-[var(--color-surface-secondary)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-bold text-[var(--color-text-primary)]">{row.teacherName}</p>
                              <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                                {row.teacherCode || 'No teacher ID'}{row.classes.length ? ` · ${row.classes.join(', ')}` : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.compliancePercentage >= 90 ? 'bg-emerald-100 text-emerald-700' : row.compliancePercentage >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                {row.compliancePercentage}%
                              </span>
                              <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-5 gap-1 text-center">
                            <div className="rounded-lg bg-[var(--color-surface-secondary)] px-1 py-2"><p className="text-[8px] text-[var(--color-text-tertiary)]">Scheduled</p><p className="text-sm font-black">{row.scheduled}</p></div>
                            <div className="rounded-lg bg-emerald-50 px-1 py-2 dark:bg-emerald-950/30"><p className="text-[8px] text-emerald-700">Submitted</p><p className="text-sm font-black text-emerald-600">{row.teacherSubmitted}</p></div>
                            <div className="rounded-lg bg-blue-50 px-1 py-2 dark:bg-blue-950/30"><p className="text-[8px] text-blue-700">By Other</p><p className="text-sm font-black text-blue-600">{row.submittedByOther}</p></div>
                            <div className="rounded-lg bg-orange-50 px-1 py-2 dark:bg-orange-950/30"><p className="text-[8px] text-orange-700">Partial</p><p className="text-sm font-black text-orange-600">{row.partial}</p></div>
                            <div className="rounded-lg bg-red-50 px-1 py-2 dark:bg-red-950/30"><p className="text-[8px] text-red-700">Missing</p><p className="text-sm font-black text-red-600">{row.missing}</p></div>
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="hidden overflow-x-auto [touch-action:pan-x_pan-y] sm:block">
                      <table className="w-full min-w-[980px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-[var(--color-surface-secondary)] text-left text-xs text-[var(--color-text-secondary)]">
                            <th className="px-4 py-3 font-bold">Teacher</th>
                            <th className="px-4 py-3 font-bold">Classes</th>
                            <th className="px-3 py-3 text-center font-bold">Scheduled</th>
                            <th className="px-3 py-3 text-center font-bold">Teacher Submitted</th>
                            <th className="px-3 py-3 text-center font-bold">By Other</th>
                            <th className="px-3 py-3 text-center font-bold">Partial</th>
                            <th className="px-3 py-3 text-center font-bold">Missing</th>
                            <th className="px-3 py-3 text-center font-bold">Compliance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)]">
                          {filteredTeacherRows.map((row) => (
                            <tr key={row.teacherId} onClick={() => void openTeacherComplianceDetail(row)} className="cursor-pointer hover:bg-[var(--color-surface-secondary)]">
                              <td className="px-4 py-3"><div className="flex items-center justify-between gap-2"><div><p className="font-semibold text-[var(--color-text-primary)]">{row.teacherName}</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{row.teacherCode || '—'}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" /></div></td>
                              <td className="max-w-[280px] px-4 py-3 text-[var(--color-text-secondary)]"><p className="line-clamp-2">{row.classes.join(', ') || '—'}</p></td>
                              <td className="px-3 py-3 text-center font-semibold">{row.scheduled}</td>
                              <td className="px-3 py-3 text-center font-bold text-emerald-600">{row.teacherSubmitted}</td>
                              <td className="px-3 py-3 text-center font-semibold text-blue-600">{row.submittedByOther}</td>
                              <td className="px-3 py-3 text-center font-semibold text-orange-600">{row.partial}</td>
                              <td className="px-3 py-3 text-center font-bold text-red-600">{row.missing}</td>
                              <td className="px-3 py-3 text-center">
                                <span className={`inline-flex rounded-full px-2.5 py-1 font-bold ${row.compliancePercentage >= 90 ? 'bg-emerald-100 text-emerald-700' : row.compliancePercentage >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                  {row.compliancePercentage}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {(teacherDetailLoading || teacherDetail) && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Teacher attendance compliance detail">
          <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl sm:max-w-3xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-default)] p-4">
              <div className="min-w-0">
                <p className="text-lg font-bold text-[var(--color-text-primary)]">{teacherDetail?.teacher.name || teacherDetailName || 'Teacher Attendance'}</p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  Course-by-course attendance submission status. Tap a lesson to view students, take missing attendance, or unlock a submitted lesson for correction.
                </p>
              </div>
              <button type="button" onClick={() => { setTeacherDetail(null); setTeacherDetailName(''); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]" aria-label="Close teacher compliance detail">
                <X className="h-4 w-4" />
              </button>
            </div>

            {teacherDetailLoading ? (
              <div className="p-10 text-center">
                <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Loading teacher lesson history...</p>
              </div>
            ) : teacherDetail ? (
              <>
                <div className="grid grid-cols-4 gap-2 border-b border-[var(--color-border-default)] p-3 sm:p-4">
                  <SummaryCard label="Scheduled" value={teacherDetail.summary.scheduled} />
                  <SummaryCard label="Submitted" value={teacherDetail.summary.submitted} tone="present" />
                  <SummaryCard label="Partial" value={teacherDetail.summary.partial} />
                  <SummaryCard label="Missing" value={teacherDetail.summary.missing} tone="absent" />
                </div>

                <div className="overflow-y-auto overscroll-contain">
                  {teacherDetail.rows.length === 0 ? (
                    <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No completed lesson times were found in this review window.</div>
                  ) : (
                    <div className="divide-y divide-[var(--color-border-subtle)]">
                      {teacherDetail.rows.map((row) => {
                        const submittedByText = row.submittedByType === 'teacher'
                          ? `Submitted by teacher · ${row.submittedBy}`
                          : row.submittedByType === 'other'
                            ? `Submitted by other · ${row.submittedBy}${row.submittedByRole ? ` (${row.submittedByRole.replace(/_/g, ' ')})` : ''}`
                            : '';
                        return (
                          <button
                            key={`${row.date}-${row.scheduleId}`}
                            type="button"
                            onClick={() => openComplianceLesson(row)}
                            className="flex w-full items-start gap-3 p-4 text-left hover:bg-[var(--color-surface-secondary)]"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]">
                              <Clock3 className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate font-bold text-[var(--color-text-primary)]">{row.courseName}</p>
                                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{row.date} · {row.className} · {row.startTime}–{row.endTime}</p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                                  row.status === 'submitted'
                                    ? (row.submittedByType === 'teacher' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700')
                                    : row.status === 'partial'
                                      ? 'bg-orange-100 text-orange-700'
                                      : 'bg-red-100 text-red-700'
                                }`}>
                                  {row.status === 'submitted'
                                    ? (row.submittedByType === 'teacher' ? 'Submitted · Teacher' : 'Submitted · By Other')
                                    : row.status === 'partial'
                                      ? 'Partial'
                                      : 'Missing'}
                                </span>
                              </div>
                              {submittedByText && <p className="mt-2 text-xs font-medium text-[var(--color-text-secondary)]">{submittedByText}</p>}
                              {row.status === 'partial' && (
                                <p className="mt-1 text-[11px] text-orange-700">
                                  {row.recordedStudents}/{row.expectedStudents ?? '?'} students recorded{row.submittedBy ? ` · Last saved by ${row.submittedBy}` : ''}
                                </p>
                              )}
                              {row.status === 'missing' && <p className="mt-1 text-[11px] text-red-600">Attendance has not been taken for this lesson.</p>}
                              {row.status === 'submitted' && row.locked && <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">Submitted & locked · open to view students or unlock for correction.</p>}
                              {row.isSubstitute && <p className="mt-1 text-[11px] text-blue-600">Substitute assignment{row.substituteReason ? ` · ${row.substituteReason}` : ''}</p>}
                            </div>
                            <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-[var(--color-text-tertiary)]" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {(cellReportLoading || cellReport) && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Lesson attendance report">
          <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            {cellReportLoading ? (
              <div className="p-10 text-center">
                <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Loading lesson attendance...</p>
              </div>
            ) : cellReport ? (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-default)] p-4">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-[var(--color-text-primary)]">{cellReport.class.name}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                      {cellReport.date} · {cellReport.period}{cellReport.subjects.length ? ` · ${cellReport.subjects.join(', ')}` : ''}
                    </p>
                  </div>
                  <button type="button" onClick={() => setCellReport(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]" aria-label="Close report">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 border-b border-[var(--color-border-default)] p-3 sm:p-4">
                  <SummaryCard label="Students" value={cellReport.summary.students} />
                  <SummaryCard label="Present" value={cellReport.summary.present} tone="present" />
                  <SummaryCard label="Absent" value={cellReport.summary.absent} tone="absent" />
                </div>

                <div className="overflow-y-auto overscroll-contain">
                  <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
                    <section className="overflow-hidden rounded-xl border border-emerald-200 dark:border-emerald-900">
                      <div className="flex items-center justify-between bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/30">
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Present Students</p>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">{cellReport.summary.present}</span>
                      </div>
                      <div className="divide-y divide-emerald-100 dark:divide-emerald-950">
                        {cellReport.rows.filter((student) => student.status === 'present').length ? cellReport.rows.filter((student) => student.status === 'present').map((student) => (
                          <button key={student._id} type="button" onClick={() => openStudent(student._id)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{student.name}</p>
                              <p className="text-[11px] text-[var(--color-text-tertiary)]">{student.studentId}</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">Present</span>
                          </button>
                        )) : <p className="px-3 py-5 text-center text-xs text-[var(--color-text-tertiary)]">No present students recorded.</p>}
                      </div>
                    </section>

                    <section className="overflow-hidden rounded-xl border border-red-200 dark:border-red-900">
                      <div className="flex items-center justify-between bg-red-50 px-3 py-2.5 dark:bg-red-950/30">
                        <p className="text-sm font-bold text-red-700 dark:text-red-300">Absent Students</p>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900 dark:text-red-200">{cellReport.summary.absent}</span>
                      </div>
                      <div className="divide-y divide-red-100 dark:divide-red-950">
                        {cellReport.rows.filter((student) => student.status === 'absent').length ? cellReport.rows.filter((student) => student.status === 'absent').map((student) => (
                          <button key={student._id} type="button" onClick={() => openStudent(student._id)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-red-50/60 dark:hover:bg-red-950/20">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{student.name}</p>
                              <p className="text-[11px] text-[var(--color-text-tertiary)]">{student.studentId}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {student.excused && <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700">Excused</span>}
                              <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">Absent</span>
                            </div>
                          </button>
                        )) : <p className="px-3 py-5 text-center text-xs text-[var(--color-text-tertiary)]">No absent students recorded.</p>}
                      </div>
                    </section>
                  </div>
                  {cellReport.rows.some((student) => !student.status) && (
                    <div className="border-t border-[var(--color-border-default)] px-4 py-3 text-xs text-[var(--color-text-tertiary)]">
                      {cellReport.rows.filter((student) => !student.status).length} student(s) have no attendance record for this lesson.
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {mode === 'student' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Student Name or ID</span>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <input
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void searchStudents(); }}
                    placeholder="e.g. BALCAD-706 or student name"
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-3 text-sm"
                  />
                </div>
                <button type="button" onClick={searchStudents} disabled={studentSearching} className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
                  {studentSearching ? 'Searching...' : 'Search'}
                </button>
              </div>
            </label>
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">No student data is loaded until you search. Select a student to open the overall report on a separate page.</p>
          </div>

          {studentRows.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {studentRows.map((student) => (
                  <button key={student._id} type="button" onClick={() => openStudent(student._id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-[var(--color-surface-secondary)]">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[var(--color-text-primary)]">{student.name}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId} · {student.className}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SchoolAttendanceReportPanel;
