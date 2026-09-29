import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';

type Status = 'present' | 'absent';
type ReasonCode = '' | 'sick' | 'medical' | 'family_emergency' | 'school_activity' | 'suspension' | 'transport_delay' | 'other';

interface Session {
  _id: string;
  className: string;
  course?: { _id: string; title?: { en?: string }; courseCode?: string };
  teacherName: string;
  regularTeacherName?: string;
  isSubstitute?: boolean;
  startTime: string;
  endTime: string;
  room?: { name?: string } | string | null;
  roomName?: string;
  attendance: {
    present: number;
    absent: number;
    locked: boolean;
    completionStatus?: 'not_taken' | 'partial' | 'complete';
    expectedStudents?: number | null;
    recordedStudents?: number;
  };
}

interface RosterStudent {
  _id: string;
  studentId: string;
  name: string;
  attendance?: { status: Status; notes?: string; reasonCode?: ReasonCode; locked?: boolean } | null;
}

interface SessionDetail {
  schedule: Session;
  locked: boolean;
  completionStatus?: 'not_taken' | 'partial' | 'complete';
  roster: RosterStudent[];
}

interface Draft {
  status: Status;
  reasonCode: ReasonCode;
  notes: string;
}

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

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function subject(session: Session) {
  return session.course?.title?.en || session.course?.courseCode || 'Subject';
}

function roomLabel(session: Session) {
  if (session.roomName) return session.roomName;
  if (typeof session.room === 'string') return session.room;
  return session.room?.name || '';
}

function prettyDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function TeacherSchoolAttendance() {
  const [date, setDate] = useState(localDate());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [calendarDay, setCalendarDay] = useState<{ name?: string; type?: string; isInstructional?: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rosterSearch, setRosterSearch] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/attendance/school/sessions', { params: { date } });
      setSessions(response.data?.data?.sessions || []);
      setCalendarDay(response.data?.data?.calendarDay || null);
      setSelectedId('');
      setDetail(null);
      setDrafts({});
      setRosterSearch('');
    } catch (e: any) {
      setSessions([]);
      setError(e?.response?.data?.message || 'Could not load your school attendance sessions.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const openSession = async (sessionId: string) => {
    setSelectedId(sessionId);
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await api.get(`/attendance/school/session/${sessionId}`, { params: { date } });
      const next: SessionDetail = response.data?.data;
      setDetail(next);
      const nextDrafts: Record<string, Draft> = {};
      for (const student of next.roster || []) {
        nextDrafts[student._id] = {
          status: student.attendance?.status === 'absent' ? 'absent' : 'present',
          reasonCode: student.attendance?.status === 'absent' ? (student.attendance?.reasonCode || '') : '',
          notes: student.attendance?.notes || '',
        };
      }
      setDrafts(nextDrafts);
      requestAnimationFrame(() => document.getElementById('attendance-roster')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e: any) {
      setDetail(null);
      setError(e?.response?.data?.message || 'Could not open this attendance session.');
    } finally {
      setLoading(false);
    }
  };

  const classOptions = useMemo(() => Array.from(new Set(sessions.map((s) => s.className))).sort(), [sessions]);
  const subjectOptions = useMemo(() => Array.from(new Set(sessions.map(subject))).sort(), [sessions]);

  const visibleSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((session) => {
      if (classFilter !== 'all' && session.className !== classFilter) return false;
      if (subjectFilter !== 'all' && subject(session) !== subjectFilter) return false;
      if (!q) return true;
      return `${session.className} ${subject(session)} ${session.startTime} ${session.endTime} ${roomLabel(session)}`.toLowerCase().includes(q);
    });
  }, [sessions, search, classFilter, subjectFilter]);

  const visibleRoster = useMemo(() => {
    const rows = detail?.roster || [];
    const q = rosterSearch.trim().toLowerCase();
    return q ? rows.filter((row) => row.name.toLowerCase().includes(q) || row.studentId.toLowerCase().includes(q)) : rows;
  }, [detail, rosterSearch]);

  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.attendance.completionStatus === 'complete').length;
    const pending = sessions.length - completed;
    const students = sessions.reduce((sum, s) => sum + Math.max(0, Number(s.attendance.expectedStudents ?? s.attendance.recordedStudents ?? 0)), 0);
    return { completed, pending, students, percent: sessions.length ? Math.round((completed / sessions.length) * 100) : 0 };
  }, [sessions]);

  const markAll = (status: Status) => {
    if (!detail || detail.locked) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const student of detail.roster) {
        const previous = next[student._id] || { status: 'present' as Status, reasonCode: '' as ReasonCode, notes: '' };
        next[student._id] = { ...previous, status, ...(status === 'present' ? { reasonCode: '' as ReasonCode } : {}) };
      }
      return next;
    });
  };

  const save = async () => {
    if (!detail?.schedule?.course?._id || detail.locked || !detail.roster.length) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.post('/attendance', {
        course: detail.schedule.course._id,
        schedule: detail.schedule._id,
        date,
        records: detail.roster.map((student) => ({ student: student._id, ...(drafts[student._id] || { status: 'present' }) })),
      });
      setMessage('Attendance submitted and locked successfully.');
      await loadSessions();
      await openSession(detail.schedule._id);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not submit attendance.');
    } finally {
      setSaving(false);
    }
  };

  const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-3 pt-4 sm:p-5 md:p-6 lg:p-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-600"><CalendarDays className="h-4 w-4"/><span className="text-xs font-black uppercase tracking-widest">Teacher</span></div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">School Attendance</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Take attendance for your scheduled classes and track student participation.</p>
        </div>


      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}
      {calendarDay?.isInstructional === false && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"><strong>{calendarDay.name || 'Non-instructional day'}:</strong> attendance is closed.</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={card + ' p-4'}>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/30"><BookOpen className="h-6 w-6"/></div>
            <div><p className="text-2xl font-black">{sessions.length}</p><p className="text-xs font-bold">Today's Classes</p><p className="hidden text-[11px] text-[var(--color-text-tertiary)] sm:block">Scheduled for this date</p></div>
          </div>
        </div>
        <div className={card + ' p-4'}>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-50 p-3 text-amber-600 dark:bg-amber-950/30"><Clock3 className="h-6 w-6"/></div>
            <div><p className="text-2xl font-black">{stats.pending}</p><p className="text-xs font-bold">Pending</p><p className="hidden text-[11px] text-[var(--color-text-tertiary)] sm:block">Awaiting attendance</p></div>
          </div>
        </div>
        <div className={card + ' p-4'}>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/30"><CheckCircle2 className="h-6 w-6"/></div>
            <div><p className="text-2xl font-black">{stats.completed}</p><p className="text-xs font-bold">Completed</p><p className="hidden text-[11px] text-[var(--color-text-tertiary)] sm:block">Attendance taken</p></div>
          </div>
        </div>
        <div className={card + ' p-4'}>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-violet-50 p-3 text-violet-600 dark:bg-violet-950/30"><Users className="h-6 w-6"/></div>
            <div><p className="text-2xl font-black">{stats.students}</p><p className="text-xs font-bold">Total Students</p><p className="hidden text-[11px] text-[var(--color-text-tertiary)] sm:block">Across today's classes</p></div>
          </div>
        </div>
      </section>

      <section className="relative">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search classes..."
              className="min-h-12 w-full rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className={
              'relative inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border px-3.5 text-sm font-black shadow-sm transition sm:px-4 ' +
              (filtersOpen
                ? 'border-emerald-500 bg-emerald-600 text-white'
                : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]')
            }
          >
            <SlidersHorizontal className="h-4 w-4"/>
            <span className="hidden min-[390px]:inline">All Filters</span>
            {(classFilter !== 'all' || subjectFilter !== 'all' || date !== localDate()) && (
              <span className={
                'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black ' +
                (filtersOpen ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-700')
              }>
                {(classFilter !== 'all' ? 1 : 0) + (subjectFilter !== 'all' ? 1 : 0) + (date !== localDate() ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div className={card + ' absolute right-0 top-[calc(100%+8px)] z-40 w-full p-4 sm:w-[520px]'}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-[var(--color-text-primary)]">All Filters</h3>
                <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">Filter scheduled classes by date, class and subject.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDate(localDate());
                  setClassFilter('all');
                  setSubjectFilter('all');
                }}
                className="rounded-lg px-2.5 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                Reset
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="min-w-0">
                <span className="mb-1.5 block text-[11px] font-bold text-[var(--color-text-secondary)]">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm"
                />
              </label>

              <label className="min-w-0">
                <span className="mb-1.5 block text-[11px] font-bold text-[var(--color-text-secondary)]">Class</span>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm"
                >
                  <option value="all">All Classes</option>
                  {classOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label className="min-w-0">
                <span className="mb-1.5 block text-[11px] font-bold text-[var(--color-text-secondary)]">Subject</span>
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm"
                >
                  <option value="all">All Subjects</option>
                  {subjectOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="mt-4 min-h-11 w-full rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-500"
            >
              Apply Filters
            </button>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-black text-[var(--color-text-primary)]">Scheduled Classes ({visibleSessions.length})</h2><p className="text-xs text-[var(--color-text-tertiary)]">{prettyDate(date)}</p></div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-tertiary)]"><SlidersHorizontal className="h-3.5 w-3.5"/>Time</span>
          </div>

          {loading && !detail ? (
            <div className={card + ' p-12 text-center'}><Loader2 className="mx-auto h-7 w-7 animate-spin text-emerald-600"/></div>
          ) : visibleSessions.length === 0 ? (
            <div className={card + ' p-12 text-center text-sm text-[var(--color-text-tertiary)]'}>No assigned classes match these filters.</div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-1">
              {visibleSessions.map((session, index) => {
                const complete = session.attendance.completionStatus === 'complete';
                const students = Number(session.attendance.expectedStudents ?? session.attendance.recordedStudents ?? 0);
                const room = roomLabel(session);
                return (
                  <article key={session._id} className={`${card} overflow-hidden transition hover:border-emerald-400 ${selectedId === session._id ? 'ring-1 ring-emerald-500/40' : ''}`}>
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${index % 3 === 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' : index % 3 === 1 ? 'bg-violet-50 text-violet-600 dark:bg-violet-950/30' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/30'}`}>
                          <BookOpen className="h-5 w-5"/>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div><h3 className="font-black text-[var(--color-text-primary)]">{session.className}</h3><p className="mt-0.5 text-sm font-bold text-emerald-600">{subject(session)}</p></div>
                            {complete ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>{session.attendance.locked ? 'Completed' : 'Reopened'}</span> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">Not taken</span>}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-text-tertiary)]">
                            <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5"/>{session.startTime}–{session.endTime}</span>
                            {room && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5"/>{room}</span>}
                            {students > 0 && <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5"/>{students} students</span>}
                            {session.isSubstitute && <span className="inline-flex items-center gap-1.5 font-semibold text-blue-600"><ShieldCheck className="h-3.5 w-3.5"/>Substitute</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]/40 p-3 sm:px-5">
                      <button type="button" onClick={() => void openSession(session._id)} className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${complete ? 'border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)]' : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'}`}>
                        {complete ? <><BarChart3 className="h-4 w-4"/>View Attendance</> : <>Take Attendance<ArrowRight className="h-4 w-4"/></>}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="hidden space-y-4 xl:block">
          <div className={card + ' p-5'}>
            <h3 className="font-black">Today's Overview</h3>
            <div className="mt-5 flex items-center gap-5">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(rgb(16 185 129) ${stats.percent}%, rgba(148,163,184,.18) 0)` }}>
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-[var(--color-surface-primary)]"><span className="text-2xl font-black">{stats.percent}%</span><span className="text-[10px] text-[var(--color-text-tertiary)]">Completed</span></div>
              </div>
              <div className="space-y-2 text-xs">
                <p><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500"/>{stats.completed} Completed</p>
                <p><span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-400"/>{stats.pending} Pending</p>
              </div>
            </div>
            <div className="mt-5 border-t border-[var(--color-border-subtle)] pt-4">
              <div className="flex items-center justify-between text-xs"><span className="font-bold">Today's Classes</span><span>{stats.completed} of {sessions.length} completed</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-secondary)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.percent}%` }}/></div>
            </div>
          </div>

          <div className={card + ' p-4'}>
            <h3 className="font-black">Quick Actions</h3>
            <div className="mt-3 space-y-2">
              <Link to="/teacher/schedule" className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--color-border-subtle)] px-3 text-sm font-semibold hover:bg-[var(--color-surface-secondary)]"><span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4"/>View Full Schedule</span><ArrowRight className="h-4 w-4"/></Link>
              <button type="button" onClick={() => window.print()} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--color-border-subtle)] px-3 text-sm font-semibold hover:bg-[var(--color-surface-secondary)]"><span className="inline-flex items-center gap-2"><BarChart3 className="h-4 w-4"/>Print Attendance Summary</span><ArrowRight className="h-4 w-4"/></button>
            </div>
          </div>
        </aside>
      </section>

      {detail && (
        <section id="attendance-roster" className={card + ' scroll-mt-4 overflow-hidden'}>
          {detail.completionStatus === 'complete' && !detail.locked && <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">Attendance has been reopened by administration. Review the existing records, make the correction, then submit again.</div>}
          <div className="border-b border-[var(--color-border-default)] p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><p className="text-lg font-black text-[var(--color-text-primary)]">{detail.schedule.className} · {subject(detail.schedule)}</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{detail.schedule.startTime}–{detail.schedule.endTime}{detail.schedule.isSubstitute ? ` · Covering for ${detail.schedule.regularTeacherName || 'regular teacher'}` : ''}</p></div>
              <div className="relative lg:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/><input value={rosterSearch} onChange={(e) => setRosterSearch(e.target.value)} placeholder="Search student..." className="min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-9 pr-3 text-sm"/></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={detail.locked} onClick={() => markAll('present')} className="min-h-10 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-50">All Present</button>
              <button type="button" disabled={detail.locked} onClick={() => markAll('absent')} className="min-h-10 rounded-xl bg-red-600 px-4 text-xs font-bold text-white disabled:opacity-50">All Absent</button>
            </div>
          </div>

          <div className="grid divide-y divide-[var(--color-border-subtle)] lg:grid-cols-2 lg:divide-y-0">
            {visibleRoster.map((student) => {
              const draft = drafts[student._id] || { status: 'present' as Status, reasonCode: '' as ReasonCode, notes: '' };
              return <div key={student._id} className="border-b border-[var(--color-border-subtle)] p-4 lg:border-r">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1"><p className="font-bold text-[var(--color-text-primary)]">{student.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId}</p></div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={detail.locked} onClick={() => setDrafts((current) => ({ ...current, [student._id]: { ...draft, status: 'present', reasonCode: '' } }))} className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border px-3 text-xs font-black disabled:opacity-50 ${draft.status === 'present' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--color-border-default)]'}`}><Check className="h-3.5 w-3.5"/>Present</button>
                    <button type="button" disabled={detail.locked} onClick={() => setDrafts((current) => ({ ...current, [student._id]: { ...draft, status: 'absent' } }))} className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border px-3 text-xs font-black disabled:opacity-50 ${draft.status === 'absent' ? 'border-red-500 bg-red-500 text-white' : 'border-[var(--color-border-default)]'}`}><X className="h-3.5 w-3.5"/>Absent</button>
                  </div>
                </div>
                {draft.status === 'absent' && <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
                  <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 text-xs font-semibold"><input type="checkbox" checked={!!draft.reasonCode} disabled={detail.locked} onChange={(e) => setDrafts((current) => ({ ...current, [student._id]: { ...draft, reasonCode: e.target.checked ? (draft.reasonCode || 'other') : '' } }))}/>Excused</label>
                  {draft.reasonCode ? <select value={draft.reasonCode} disabled={detail.locked} onChange={(e) => setDrafts((current) => ({ ...current, [student._id]: { ...draft, reasonCode: e.target.value as ReasonCode } }))} className="min-h-10 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 text-xs">{REASONS.filter((reason) => reason.value).map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select> : <div/>}
                  <input value={draft.notes} disabled={detail.locked} onChange={(e) => setDrafts((current) => ({ ...current, [student._id]: { ...draft, notes: e.target.value } }))} placeholder="Note (optional)" className="min-h-10 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-xs"/>
                </div>}
              </div>;
            })}
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--color-text-tertiary)]">{detail.roster.length} active student{detail.roster.length === 1 ? '' : 's'} · full roster submission required</p>
            <button type="button" onClick={save} disabled={saving || detail.locked || !detail.roster.length} className="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white disabled:opacity-50">{saving ? 'Submitting...' : detail.locked ? 'Submitted & Locked' : 'Submit Attendance'}</button>
          </div>
        </section>
      )}
    </div>
  );
}

export default TeacherSchoolAttendance;
