import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';
import { toTitleCase } from '../../../lib/format';

interface Exam {
  _id: string;
  title: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  room: string;
  instructions: string;
  status: string;
  myAttemptStatus: 'in_progress' | 'submitted' | 'auto_submitted' | null;
  autoSchedule?: boolean;
  milestone?: 'mid' | 'final' | null;
  myScheduledStart?: string | null;
  myScheduledEnd?: string | null;
  myMetPrerequisites?: boolean | null;
  myRetakeRequestStatus?: 'pending' | 'under_review' | 'approved' | 'rejected' | null;
  mySeatRoom?: string;
  mySeatBuilding?: string;
  mySeat?: string;
  course?: {
    _id: string;
    title: { en: string; so: string; ar: string };
    category: string;
    thumbnail?: string;
    class?: { _id?: string; title?: string; section?: string; department?: { name?: string } };
    school?: { name?: string };
    teacher?: { profile?: { firstName?: string; lastName?: string } };
  };
  school?: { name?: string };
}

interface MyClassInfo { _id: string; title: string; section?: string; department?: { _id?: string; name?: string } | null; }
interface MySchoolInfo { _id: string; name: string; }
interface DepartmentBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section?: string; }
type ExamState = 'upcoming' | 'active' | 'completed' | 'missed' | 'cancelled';

const STATE_META: Record<ExamState, { label: string; dot: string; pill: string }> = {
  upcoming: { label: 'Upcoming', dot: 'bg-blue-500', pill: 'bg-blue-500/10 text-blue-600 dark:text-blue-300' },
  active: { label: 'Active', dot: 'bg-emerald-500', pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  completed: { label: 'Completed', dot: 'bg-violet-500', pill: 'bg-violet-500/10 text-violet-600 dark:text-violet-300' },
  missed: { label: 'Missed', dot: 'bg-red-500', pill: 'bg-red-500/10 text-red-600 dark:text-red-300' },
  cancelled: { label: 'Cancelled', dot: 'bg-slate-400', pill: 'bg-slate-500/10 text-slate-500' },
};

const catLabels: Record<string, { so: string; ar: string }> = {
  quran: { so: "Qur'aanka", ar: 'القرآن' }, fiqh: { so: 'Fiqhiga', ar: 'الفقه' },
  aqeedah: { so: 'Cajiidada', ar: 'العقيدة' }, seerah: { so: 'Siirada', ar: 'السيرة' },
  arabic: { so: 'Carabiga', ar: 'العربية' }, tajweed: { so: 'Tajwiidka', ar: 'التجويد' },
  hadith: { so: 'Xadiithka', ar: 'الحديث' }, akhlaq: { so: 'Akhlaaqda', ar: 'الأخلاق' },
};

function computeState(e: Exam): ExamState {
  if (e.status === 'cancelled') return 'cancelled';
  const submitted = e.myAttemptStatus === 'submitted' || e.myAttemptStatus === 'auto_submitted';
  if (e.autoSchedule) {
    if (submitted) return 'completed';
    if (!e.myScheduledStart || !e.myScheduledEnd) return 'upcoming';
    const start = new Date(e.myScheduledStart).getTime();
    const end = new Date(e.myScheduledEnd).getTime();
    const now = Date.now();
    if (now < start) return 'upcoming';
    if (now <= end) return 'active';
    return 'missed';
  }
  if (!e.examDate || !e.startTime || !e.endTime) return 'upcoming';
  const date = e.examDate.split('T')[0];
  const start = new Date(`${date}T${e.startTime}`).getTime();
  const end = new Date(`${date}T${e.endTime}`).getTime();
  const now = Date.now();
  if (now < start) return 'upcoming';
  if (now <= end) return 'active';
  return submitted ? 'completed' : 'missed';
}

function getStart(e: Exam): number | null {
  if (e.autoSchedule) return e.myScheduledStart ? new Date(e.myScheduledStart).getTime() : null;
  if (!e.examDate || !e.startTime) return null;
  return new Date(`${e.examDate.split('T')[0]}T${e.startTime}`).getTime();
}

function getEnd(e: Exam): number | null {
  if (e.autoSchedule) return e.myScheduledEnd ? new Date(e.myScheduledEnd).getTime() : null;
  if (!e.examDate || !e.endTime) return null;
  return new Date(`${e.examDate.split('T')[0]}T${e.endTime}`).getTime();
}

function formatTime(e: Exam): string {
  const start = getStart(e);
  const end = getEnd(e);
  if (!start) return '—';
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const a = new Date(start).toLocaleTimeString([], opts);
  const b = end ? new Date(end).toLocaleTimeString([], opts) : '';
  return b ? `${a} – ${b}` : a;
}

function formatDateKey(e: Exam): string | null {
  const start = getStart(e);
  return start ? new Date(start).toISOString().slice(0, 10) : null;
}

function Countdown({ target, lang }: { target: number; lang: 'en' | 'so' | 'ar' }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((target - Date.now()) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const value = days > 0 ? `${days}d ${String(hours).padStart(2, '0')}h` : `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const label = lang === 'so' ? 'Waqtiga ka haray' : lang === 'ar' ? 'الوقت المتبقي' : 'Starts in';
  return <div className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-tertiary)] px-3 py-2"><span className="text-[11px] text-[var(--color-text-tertiary)]">⏱ {label}</span><span className="font-mono text-xs font-bold tabular-nums text-[var(--color-text-primary)]">{value}</span></div>;
}

function DayHeading({ dateKey, first }: { dateKey: string; first: boolean }) {
  const date = new Date(`${dateKey}T12:00:00`);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  const label = dateKey === todayKey ? 'Today' : dateKey === tomorrowKey ? 'Tomorrow' : date.toLocaleDateString([], { weekday: 'long' });
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border ${first ? 'border-primary-500/30 bg-primary-500/10' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}>
        <span className="text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">{date.toLocaleDateString([], { month: 'short' })}</span>
        <span className="text-lg font-bold leading-none text-[var(--color-text-primary)]">{date.getDate()}</span>
      </div>
      <div>
        <p className="text-sm font-bold text-[var(--color-text-primary)]">{label}</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">{date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      </div>
      <div className="h-px flex-1 bg-[var(--color-border-default)]" />
    </div>
  );
}

function examTitle(e: Exam, lang: 'en' | 'so' | 'ar') {
  if (lang === 'so' && e.course?.title?.so) return e.course.title.so;
  if (lang === 'ar' && e.course?.title?.ar) return e.course.title.ar;
  return e.course?.title?.en || e.title;
}

function teacherName(e: Exam) {
  const p = e.course?.teacher?.profile;
  return [p?.firstName, p?.lastName].filter(Boolean).join(' ') || '—';
}

function className(e: Exam) {
  const c = e.course?.class;
  if (!c?.title) return '—';
  return c.section ? `${c.title} - ${c.section}` : c.title;
}

function orgName(e: Exam) { return e.school?.name || e.course?.school?.name || '—'; }
function departmentName(e: Exam) { return e.course?.class?.department?.name || '—'; }

export function StudentExams() {
  const { t, i18n } = useTranslation('common');
  const navigate = useNavigate();
  const lang = (i18n.language as 'en' | 'so' | 'ar') || 'en';
  const [exams, setExams] = useState<Exam[]>([]);
  const [myClass, setMyClass] = useState<MyClassInfo | null>(null);
  const [mySchool, setMySchool] = useState<MySchoolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | ExamState>('all');
  const [viewMode, setViewMode] = useState<'myClass' | 'other'>('myClass');
  const [browseDepartments, setBrowseDepartments] = useState<DepartmentBrief[]>([]);
  const [browseClassOptions, setBrowseClassOptions] = useState<ClassBrief[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [browseExams, setBrowseExams] = useState<Exam[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [retakeModal, setRetakeModal] = useState<Exam | null>(null);
  const [retakeReason, setRetakeReason] = useState('');
  const [retakeSubmitting, setRetakeSubmitting] = useState(false);
  const [retakeError, setRetakeError] = useState('');
  const [, setNow] = useState(0);

  const fetchExams = async () => {
    try {
      const { data } = await api.get('/exams/my');
      setExams(data.data?.exams || []);
      setMyClass(data.data?.myClass || null);
      setMySchool(data.data?.mySchool || null);
    } catch (err: any) {
      setError(err.response?.data?.message || t('error_occurred'));
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchExams(); }, [t]);
  useEffect(() => { const id = setInterval(() => setNow((v) => v + 1), 30000); return () => clearInterval(id); }, []);

  useEffect(() => {
    if (viewMode !== 'other' || !mySchool?._id) return;
    api.get('/departments', { params: { school: mySchool._id } }).then(({ data }) => setBrowseDepartments(data.data || [])).catch(() => setBrowseDepartments([]));
  }, [viewMode, mySchool]);

  const handleBrowseDeptChange = (deptId: string) => {
    setSelectedDept(deptId); setSelectedClassId(''); setBrowseExams([]); setBrowseClassOptions([]);
    if (!deptId) return;
    api.get('/classes/browse', { params: { department: deptId } }).then(({ data }) => setBrowseClassOptions(data.data || [])).catch(() => setBrowseClassOptions([]));
  };

  const handleBrowseClassChange = (classId: string) => {
    setSelectedClassId(classId); setBrowseExams([]); setBrowseError('');
    if (!classId) return;
    setBrowseLoading(true);
    api.get('/exams/browse', { params: { classId } }).then(({ data }) => setBrowseExams(data.data || [])).catch((err: any) => setBrowseError(err.response?.data?.message || 'Failed to load exams for this class')).finally(() => setBrowseLoading(false));
  };

  const submitRetakeRequest = async () => {
    if (!retakeModal) return;
    setRetakeSubmitting(true); setRetakeError('');
    try {
      await api.post(`/exams/${retakeModal._id}/appeals`, { type: 'retake_request', description: retakeReason.trim() || 'Requesting a retake for this exam.' });
      setRetakeModal(null); setRetakeReason(''); await fetchExams();
    } catch (err: any) { setRetakeError(err.response?.data?.message || 'Failed to submit retake request'); }
    finally { setRetakeSubmitting(false); }
  };

  const myClassExams = myClass ? exams.filter((e) => !e.course?.class?._id || e.course.class._id === myClass._id) : exams;
  const withState = useMemo(() => myClassExams.map((exam) => ({ exam, state: computeState(exam) })), [exams, myClass]);
  const counts = useMemo(() => ({
    all: withState.length,
    upcoming: withState.filter((x) => x.state === 'upcoming').length,
    active: withState.filter((x) => x.state === 'active').length,
    completed: withState.filter((x) => x.state === 'completed').length,
    missed: withState.filter((x) => x.state === 'missed').length,
  }), [withState]);
  const filtered = tab === 'all' ? withState : withState.filter((x) => x.state === tab);
  const grouped = useMemo(() => {
    const map = new Map<string, { exam: Exam; state: ExamState }[]>();
    [...filtered].sort((a, b) => (getStart(a.exam) ?? Infinity) - (getStart(b.exam) ?? Infinity)).forEach((item) => {
      const key = formatDateKey(item.exam) || 'unscheduled';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return [...map.entries()];
  }, [filtered]);
  const nextExam = [...withState].filter((x) => x.state === 'upcoming' && getStart(x.exam)).sort((a, b) => getStart(a.exam)! - getStart(b.exam)!)[0];

  const getCat = (c: string) => lang === 'en' ? c : catLabels[c]?.[lang] || c;
  const statusCards = [
    { key: 'all' as const, label: 'All', count: counts.all, icon: '▦' },
    { key: 'upcoming' as const, label: 'Upcoming', count: counts.upcoming, icon: '◷' },
    { key: 'active' as const, label: 'Active', count: counts.active, icon: '●' },
    { key: 'completed' as const, label: 'Completed', count: counts.completed, icon: '✓' },
    { key: 'missed' as const, label: 'Missed', count: counts.missed, icon: '!' },
  ];

  const renderExam = ({ exam: e, state }: { exam: Exam; state: ExamState }) => {
    const meta = STATE_META[state];
    const start = getStart(e);
    const isToday = start ? new Date(start).toDateString() === new Date().toDateString() : false;
    return (
      <article key={e._id} className={`group relative overflow-hidden rounded-2xl border bg-[var(--color-surface-primary)] transition-all hover:-translate-y-0.5 hover:shadow-xl ${state === 'active' ? 'border-emerald-400/60 shadow-emerald-500/10' : 'border-[var(--color-border-default)]'}`}>
        <div className="flex flex-col sm:flex-row">
          <div className="flex min-w-0 flex-1 items-center gap-3 p-4 sm:p-5">
            <div className={`hidden h-14 w-1 rounded-full sm:block ${meta.dot}`} />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${meta.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
                {isToday && <span className="rounded-full bg-primary-500/10 px-2 py-1 text-[10px] font-bold text-primary-600 dark:text-primary-300">Today</span>}
              </div>
              <h3 className="truncate text-base font-bold text-[var(--color-text-primary)] sm:text-lg">{toTitleCase(e.title)}</h3>
              <p className="mt-0.5 truncate text-sm font-medium text-[var(--color-text-secondary)]">{examTitle(e, lang)} <span className="text-[var(--color-text-tertiary)]">· {getCat(e.course?.category || '')}</span></p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--color-text-tertiary)]">
                <span>🕐 <b className="text-[var(--color-text-secondary)]">{formatTime(e)}</b></span>
                {e.mySeatRoom && <span>📍 <b className="text-[var(--color-text-secondary)]">{e.mySeatRoom}{e.mySeatBuilding ? ` · ${e.mySeatBuilding}` : ''}{e.mySeat ? ` · Seat ${e.mySeat}` : ''}</b></span>}
                {!e.mySeatRoom && e.room && <span>📍 <b className="text-[var(--color-text-secondary)]">{e.room}</b></span>}
                <span>👨‍🏫 <b className="text-[var(--color-text-secondary)]">{teacherName(e)}</b></span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col justify-center gap-2 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]/40 p-4 sm:w-56 sm:border-l sm:border-t-0 sm:p-5">
            <div className="text-xs text-[var(--color-text-tertiary)]">{e.autoSchedule ? 'Personal schedule' : 'Exam time'}</div>
            <div className="text-sm font-bold text-[var(--color-text-primary)]">{formatTime(e)}</div>
            {state === 'upcoming' && start && <Countdown target={start} lang={lang} />}
            {state === 'active' && <button onClick={() => navigate(`/student/exams/active?examId=${e._id}`)} className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition hover:brightness-105 active:scale-[.98]">🚀 {lang === 'so' ? 'Bilow Imtixaanka' : 'Start Exam'}</button>}
            {state === 'completed' && <button onClick={() => navigate(`/student/exams/${e._id}/review`)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]">📋 {lang === 'so' ? 'Eeg Jawaabaha' : 'Review Answers'}</button>}
            {state === 'missed' && (e.myRetakeRequestStatus === 'pending' || e.myRetakeRequestStatus === 'under_review' ? <span className="rounded-xl bg-blue-500/10 px-3 py-2 text-center text-[11px] font-semibold text-blue-600 dark:text-blue-300">⏳ Retake request pending</span> : e.myRetakeRequestStatus === 'rejected' ? <span className="rounded-xl bg-red-500/10 px-3 py-2 text-center text-[11px] font-semibold text-red-600 dark:text-red-300">🚫 Retake request rejected</span> : <button onClick={() => { setRetakeModal(e); setRetakeReason(''); setRetakeError(''); }} className="w-full rounded-xl border border-primary-500/30 bg-primary-500/10 px-4 py-2.5 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-500/15">🔁 Request Retake</button>)}
          </div>
        </div>
        {e.autoSchedule && state === 'upcoming' && !e.myMetPrerequisites && <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">🔒 {lang === 'so' ? 'Dhammaystir casharradii loo baahnaa si imtixaanka loo furo.' : 'Complete the required lessons to unlock this exam.'}</div>}
      </article>
    );
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="px-6 py-20 text-center"><p className="mb-4 text-red-500">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  return (
    <div className="min-h-full px-4 pb-12 pt-20 sm:px-6 lg:px-10 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary-500/10 px-3 py-1.5 text-xs font-bold text-primary-600 dark:text-primary-300">📅 Exam Schedule</div>
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">{lang === 'so' ? 'Jadwalka Imtixaanka' : lang === 'ar' ? 'جدول الامتحانات' : 'My Exam Schedule'}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{myClass ? `${myClass.title}${myClass.section ? ` · Section ${myClass.section}` : ''}` : 'My class'} {mySchool?.name ? `· ${mySchool.name}` : ''}</p>
            </div>
            {nextExam && getStart(nextExam.exam) && <div className="w-full rounded-2xl bg-gradient-to-br from-primary-600 to-emerald-600 p-4 text-white shadow-lg shadow-primary-600/15 sm:max-w-xs"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/70">Next exam</p><p className="mt-1 truncate text-sm font-bold">{toTitleCase(nextExam.exam.title)}</p><p className="mt-2 text-lg font-extrabold">{new Date(getStart(nextExam.exam)!).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</p><p className="text-xs text-white/80">{formatTime(nextExam.exam)}</p></div>}
          </div>
        </header>

        <div className="flex w-full overflow-x-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 scrollbar-none">
          <button onClick={() => setViewMode('myClass')} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${viewMode === 'myClass' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>🏫 My Class{myClass ? ` · ${myClass.title}${myClass.section ? `-${myClass.section}` : ''}` : ''}</button>
          <button onClick={() => setViewMode('other')} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${viewMode === 'other' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>🌐 Other Classes</button>
        </div>

        {viewMode === 'other' ? (
          <>
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={selectedDept} onChange={(e) => handleBrowseDeptChange(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-primary-500/30"><option value="">Select Level / Grade...</option>{browseDepartments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select>
                <select value={selectedClassId} onChange={(e) => handleBrowseClassChange(e.target.value)} disabled={!selectedDept} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] outline-none disabled:opacity-50"><option value="">Select Class / Stream...</option>{browseClassOptions.map((c) => <option key={c._id} value={c._id}>{c.title}{c.section ? ` - ${c.section}` : ''}</option>)}</select>
              </div>
            </div>
            {browseLoading && <div className="py-12 text-center text-sm text-[var(--color-text-tertiary)]">Loading schedule…</div>}
            {browseError && <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-center text-sm text-red-500">{browseError}</div>}
            {!browseLoading && !browseError && selectedClassId && browseExams.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center text-[var(--color-text-tertiary)]"><div className="text-4xl">📅</div><p className="mt-3 font-semibold">No exams scheduled for this class.</p></div>}
            {!browseLoading && !browseError && browseExams.length > 0 && <div className="space-y-4">{browseExams.sort((a,b) => (getStart(a) ?? Infinity) - (getStart(b) ?? Infinity)).map((e) => renderExam({ exam: e, state: computeState(e) }))}</div>}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {statusCards.map((s) => <button key={s.key} onClick={() => setTab(s.key)} className={`rounded-2xl border p-3 text-left transition-all sm:p-4 ${tab === s.key ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-tertiary)]'}`}><div className="flex items-center justify-between"><span className="text-lg font-bold text-[var(--color-text-tertiary)]">{s.icon}</span><span className="text-2xl font-extrabold text-[var(--color-text-primary)]">{s.count}</span></div><p className="mt-1 text-[11px] font-semibold text-[var(--color-text-tertiary)] sm:text-xs">{s.label}</p></button>)}
            </div>

            {grouped.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center text-[var(--color-text-tertiary)]"><div className="text-5xl">📅</div><p className="mt-3 font-semibold">{t('no_data')}</p></div> : (
              <div className="space-y-5">
                {grouped.map(([dateKey, items], index) => <section key={dateKey}><DayHeading dateKey={dateKey} first={index === 0} /><div className="space-y-3">{items.map(renderExam)}</div></section>)}
              </div>
            )}
          </>
        )}
      </div>

      {retakeModal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !retakeSubmitting && setRetakeModal(null)}><div className="w-full max-w-sm rounded-3xl bg-[var(--color-surface-primary)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}><h3 className="text-lg font-bold text-[var(--color-text-primary)]">🔁 Request Retake</h3><p className="mb-4 mt-1 text-sm text-[var(--color-text-tertiary)]">{toTitleCase(retakeModal.title)}</p>{retakeError && <p className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">{retakeError}</p>}<label className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Reason (optional)</label><textarea value={retakeReason} onChange={(e) => setRetakeReason(e.target.value)} rows={3} className="mb-4 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="Why did you miss the exam?" /><div className="flex gap-2"><button onClick={() => setRetakeModal(null)} disabled={retakeSubmitting} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm">{t('cancel')}</button><button onClick={submitRetakeRequest} disabled={retakeSubmitting} className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{retakeSubmitting ? '...' : 'Submit Request'}</button></div></div></div>}
    </div>
  );
}

export default StudentExams;
