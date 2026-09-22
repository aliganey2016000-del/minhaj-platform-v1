import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, School, Search, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../../../lib/axios';

type ReportMode = 'date' | 'class' | 'student';

interface ScheduleOption {
  classId: string;
  className: string;
  startTime?: string;
  endTime?: string;
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
  classes: Array<{
    classId: string;
    className: string;
    sessions: number;
    students: number;
    records: number;
    present: number;
    absent: number;
    percentage: number;
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

export function SchoolAttendanceReportPanel() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ReportMode>('date');
  const [date, setDate] = useState(localISODate());
  const [classId, setClassId] = useState('');
  const [period, setPeriod] = useState('');
  const [options, setOptions] = useState<ScheduleOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const [dateReport, setDateReport] = useState<DateReport | null>(null);
  const [classReport, setClassReport] = useState<ClassReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [studentSearch, setStudentSearch] = useState('');
  const [studentRows, setStudentRows] = useState<StudentSearchRow[]>([]);
  const [studentSearching, setStudentSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'class') return;
    let active = true;
    setOptionsLoading(true);
    setError('');
    api.get('/attendance/school/options', { params: { date } })
      .then(({ data }) => {
        if (!active) return;
        setOptions(data?.data || []);
      })
      .catch((e: any) => {
        if (!active) return;
        setOptions([]);
        setError(e?.response?.data?.message || 'Could not load classes and periods for this date.');
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => { active = false; };
  }, [mode, date]);

  const classes = useMemo(() => {
    const seen = new Set<string>();
    return options
      .filter((option) => {
        if (!option.classId || seen.has(option.classId)) return false;
        seen.add(option.classId);
        return true;
      })
      .map((option) => ({ id: option.classId, name: option.className }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [options]);

  const periods = useMemo(() => {
    const seen = new Set<string>();
    return options
      .filter((option) => option.classId === classId && option.startTime && option.endTime)
      .map((option) => ({
        value: `${option.startTime}|${option.endTime}`,
        label: `${option.startTime}–${option.endTime}`,
      }))
      .filter((option) => {
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
      });
  }, [options, classId]);

  const switchMode = (next: ReportMode) => {
    setMode(next);
    setError('');
    setDateReport(null);
    setClassReport(null);
    setStudentRows([]);
  };

  const runDateReport = async () => {
    setReportLoading(true);
    setError('');
    setDateReport(null);
    try {
      const { data } = await api.get('/attendance/school/report/date', { params: { date } });
      setDateReport(data?.data || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not generate the school attendance report.');
    } finally {
      setReportLoading(false);
    }
  };

  const runClassReport = async () => {
    if (!classId || !period) return;
    const [startTime, endTime] = period.split('|');
    setReportLoading(true);
    setError('');
    setClassReport(null);
    try {
      const { data } = await api.get('/attendance/school/report/class-period', {
        params: { date, classId, startTime, endTime },
      });
      setClassReport(data?.data || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not generate the class attendance report.');
    } finally {
      setReportLoading(false);
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
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-card">
        {([
          ['date', 'By Date', CalendarDays],
          ['class', 'By Class', School],
          ['student', 'By Student', UserRound],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => switchMode(key)}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold sm:text-sm ${
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
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setDateReport(null); }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm"
                />
              </label>
              <button type="button" onClick={runDateReport} disabled={reportLoading} className="min-h-11 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {reportLoading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Shows the selected day across the whole school. Data loads only after Generate Report.</p>
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
                  <div className="border-b border-[var(--color-border-default)] p-4">
                    <p className="font-bold text-[var(--color-text-primary)]">School Attendance · {dateReport.date}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">One row per class. Present and Absent are period-attendance records for the selected day.</p>
                  </div>
                  <div className="divide-y divide-[var(--color-border-subtle)]">
                    {dateReport.classes.map((row) => (
                      <div key={row.classId} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_repeat(5,auto)] sm:items-center">
                        <div>
                          <p className="font-semibold text-[var(--color-text-primary)]">{row.className}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{row.sessions} session{row.sessions === 1 ? '' : 's'} · {row.records} records</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:contents">
                          <div className="text-center sm:px-3"><p className="text-[10px] text-[var(--color-text-tertiary)]">Students</p><p className="font-bold">{row.students}</p></div>
                          <div className="text-center sm:px-3"><p className="text-[10px] text-[var(--color-text-tertiary)]">Present</p><p className="font-bold text-emerald-600">{row.present}</p></div>
                          <div className="text-center sm:px-3"><p className="text-[10px] text-[var(--color-text-tertiary)]">Absent</p><p className="font-bold text-red-600">{row.absent}</p></div>
                        </div>
                        <div className="sm:px-3 sm:text-right"><span className="rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-xs font-bold">{row.percentage}%</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {mode === 'class' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
            <div className="grid gap-3 md:grid-cols-3">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setClassId(''); setPeriod(''); setClassReport(null); }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Class</span>
                <select
                  value={classId}
                  disabled={optionsLoading}
                  onChange={(e) => { setClassId(e.target.value); setPeriod(''); setClassReport(null); }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm disabled:opacity-60"
                >
                  <option value="">{optionsLoading ? 'Loading classes...' : 'Select Class'}</option>
                  {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">Period</span>
                <select
                  value={period}
                  disabled={!classId || optionsLoading}
                  onChange={(e) => { setPeriod(e.target.value); setClassReport(null); }}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm disabled:opacity-60"
                >
                  <option value="">{!classId ? 'Select Class First' : 'Select Period'}</option>
                  {periods.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
                </select>
              </label>
            </div>
            <button type="button" onClick={runClassReport} disabled={!classId || !period || reportLoading} className="mt-3 min-h-11 w-full rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {reportLoading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>

          {classReport && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <SummaryCard label="Students" value={classReport.summary.students} />
                <SummaryCard label="Present" value={classReport.summary.present} tone="present" />
                <SummaryCard label="Absent" value={classReport.summary.absent} tone="absent" />
              </div>

              <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
                <div className="border-b border-[var(--color-border-default)] p-4">
                  <p className="font-bold text-[var(--color-text-primary)]">{classReport.class.name}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{classReport.date} · {classReport.period}{classReport.subjects.length ? ` · ${classReport.subjects.join(', ')}` : ''}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Tap a student to open the student's full attendance report on a separate page.</p>
                </div>
                <div className="divide-y divide-[var(--color-border-subtle)]">
                  {classReport.rows.map((student) => (
                    <button key={student._id} type="button" onClick={() => openStudent(student._id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-[var(--color-surface-secondary)]">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[var(--color-text-primary)]">{student.name}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {student.status === 'present' && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Present</span>}
                        {student.status === 'absent' && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Absent</span>}
                        {!student.status && <span className="text-xs text-[var(--color-text-tertiary)]">Not recorded</span>}
                        {student.excused && <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">Excused</span>}
                        <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
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
