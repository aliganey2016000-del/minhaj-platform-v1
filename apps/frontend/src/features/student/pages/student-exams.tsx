/**
 * My Exam Schedule — Student
 *
 * Cards share the exact same visual design as the admin "Papers & Approval"
 * exam cards (full 16:9 course thumbnail with title/status overlaid on a
 * bottom gradient scrim, auto-generated gradient placeholder when the
 * course has no thumbnail) — one card design used everywhere an exam is
 * shown as a card, not a bespoke student-only look.
 *
 * Tabs reflect the exam's actual real-time state relative to now and this
 * student's own attempt, not just the teacher-set admin status:
 *   Upcoming  — hasn't started yet
 *   Active    — happening right now (between start and end time)
 *   Completed — time is over AND this student submitted an attempt
 *   Missed    — time is over and this student never submitted one
 */

import { useEffect, useState } from 'react';
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
  // Progress-based scheduling instead of a fixed calendar window — see
  // exam-eligibility.ts on the backend. These are only meaningful when
  // autoSchedule is true (null for fixed-schedule exams). myScheduledStart/
  // End are this student's own personal window, computed once from the
  // moment they became eligible — not a shared class-wide date.
  autoSchedule?: boolean;
  milestone?: 'mid' | 'final' | null;
  myScheduledStart?: string | null;
  myScheduledEnd?: string | null;
  myMetPrerequisites?: boolean | null;
  // Latest retake request this student filed for this exam, if any — see
  // ExamAppeal (type: 'retake_request'). 'approved' resets and reopens the
  // window server-side, so it doesn't itself block filing a new request if
  // the student misses that reopened window too; only 'pending'/
  // 'under_review' does.
  myRetakeRequestStatus?: 'pending' | 'under_review' | 'approved' | 'rejected' | null;
  course?: {
    _id: string;
    title: { en: string; so: string; ar: string };
    category: string;
    thumbnail?: string;
    class?: { title?: string; section?: string; department?: { name?: string } };
    school?: { name?: string };
    teacher?: { profile?: { firstName?: string; lastName?: string } };
  };
  school?: { name?: string };
}

type ExamState = 'upcoming' | 'active' | 'completed' | 'missed' | 'cancelled';

const catLabels: Record<string, { so: string; ar: string }> = {
  quran: { so: "Qur'aanka", ar: 'القرآن' },
  fiqh: { so: 'Fiqhiga', ar: 'الفقه' },
  aqeedah: { so: 'Cajiidada', ar: 'العقيدة' },
  seerah: { so: 'Siirada', ar: 'السيرة' },
  arabic: { so: 'Carabiga', ar: 'العربية' },
  tajweed: { so: 'Tajwiidka', ar: 'التجويد' },
  hadith: { so: 'Xadiithka', ar: 'الحديث' },
  akhlaq: { so: 'Akhlaaqda', ar: 'الأخلاق' },
};

const STATE_META: Record<ExamState, { label: string; color: string }> = {
  upcoming: { label: 'Upcoming', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  active: { label: 'Active', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  completed: { label: 'Completed', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  missed: { label: 'Missed', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

const TABS: { key: 'all' | ExamState; icon: string }[] = [
  { key: 'all', icon: '📋' },
  { key: 'upcoming', icon: '⏳' },
  { key: 'active', icon: '🟢' },
  { key: 'completed', icon: '✅' },
  { key: 'missed', icon: '⚠️' },
];

/** Real-time state — computed from now vs. the exam's own start/end, plus this student's attempt. Auto-scheduled exams use this student's own personal window (myScheduledStart/End) instead of a shared calendar date: locked (upcoming) until they finish the prerequisites, then upcoming again until their personal window opens, active during it, and missed once it closes without a submission. */
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
  const datePart = e.examDate.split('T')[0];
  const start = new Date(`${datePart}T${e.startTime}`).getTime();
  const end = new Date(`${datePart}T${e.endTime}`).getTime();
  const now = Date.now();

  if (now < start) return 'upcoming';
  if (now <= end) return 'active';
  return submitted ? 'completed' : 'missed';
}

/** Start timestamp for an upcoming exam, whichever scheduling mode it uses — null if not yet known (e.g. auto-scheduled but prerequisites not met). */
function getUpcomingStart(e: Exam): number | null {
  if (e.autoSchedule) return e.myScheduledStart ? new Date(e.myScheduledStart).getTime() : null;
  if (!e.examDate || !e.startTime) return null;
  return new Date(`${e.examDate.split('T')[0]}T${e.startTime}`).getTime();
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return days > 0 ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Ticks every second so an upcoming exam's remaining time counts down live, without the whole card list needing to re-render. */
function Countdown({ target, lang }: { target: number; lang: 'en' | 'so' | 'ar' }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = target - Date.now();
  const label = lang === 'so' ? 'Waqtiga ka haray' : lang === 'ar' ? 'الوقت المتبقي' : 'Time remaining';
  return (
    <div className="flex items-center justify-between rounded-lg bg-[var(--color-surface-tertiary)] px-3 py-2">
      <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">⏱️ {label}</span>
      <span className="text-xs font-mono font-bold text-[var(--color-text-primary)] tabular-nums">
        {remaining > 0 ? formatCountdown(remaining) : (lang === 'so' ? 'Hadda ayuu furmayaa…' : lang === 'ar' ? 'يفتح الآن…' : 'Opening now…')}
      </span>
    </div>
  );
}

// Same deterministic gradient set + hash as the admin Papers & Approval
// cards, so a course without a thumbnail still looks intentional and
// matches identically wherever it's shown.
const PLACEHOLDER_GRADIENTS = [
  'from-emerald-400 to-teal-600',
  'from-violet-400 to-indigo-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',
  'from-sky-400 to-blue-600',
];
function placeholderGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_GRADIENTS[hash % PLACEHOLDER_GRADIENTS.length];
}

// Same course -> school/class/department/teacher chain the admin cards show.
function orgName(e: Exam): string {
  return e.school?.name || e.course?.school?.name || '—';
}
function departmentName(e: Exam): string {
  return e.course?.class?.department?.name || '—';
}
function className(e: Exam): string {
  const cls = e.course?.class;
  if (!cls?.title) return '—';
  return cls.section ? `${cls.title} - ${cls.section}` : cls.title;
}
function teacherName(e: Exam): string {
  const p = e.course?.teacher?.profile;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ');
  return name || '—';
}

export function StudentExams() {
  const { t, i18n } = useTranslation('common');
  const navigate = useNavigate();
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | ExamState>('all');
  const [retakeModal, setRetakeModal] = useState<Exam | null>(null);
  const [retakeReason, setRetakeReason] = useState('');
  const [retakeSubmitting, setRetakeSubmitting] = useState(false);
  const [retakeError, setRetakeError] = useState('');

  // computeState() reads Date.now() internally — this tick just forces a
  // periodic re-render so an exam whose countdown hits zero actually flips
  // from Upcoming to Active on screen, not only once the page is reloaded.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const fetchExams = async () => {
    try {
      const { data } = await api.get('/exams/my');
      setExams(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const submitRetakeRequest = async () => {
    if (!retakeModal) return;
    setRetakeSubmitting(true);
    setRetakeError('');
    try {
      await api.post(`/exams/${retakeModal._id}/appeals`, {
        type: 'retake_request',
        description: retakeReason.trim() || 'Requesting a retake for this exam.',
      });
      setRetakeModal(null);
      setRetakeReason('');
      await fetchExams();
    } catch (err: any) {
      setRetakeError(err.response?.data?.message || 'Failed to submit retake request');
    } finally {
      setRetakeSubmitting(false);
    }
  };

  useEffect(() => {
    fetchExams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const withState = exams.map((e) => ({ exam: e, state: computeState(e) }));
  const counts = {
    all: withState.length,
    upcoming: withState.filter((x) => x.state === 'upcoming').length,
    active: withState.filter((x) => x.state === 'active').length,
    completed: withState.filter((x) => x.state === 'completed').length,
    missed: withState.filter((x) => x.state === 'missed').length,
    cancelled: withState.filter((x) => x.state === 'cancelled').length,
  };
  const filtered = tab === 'all' ? withState : withState.filter((x) => x.state === tab);

  const getTitle = (course: any) => {
    if (lang === 'so' && course?.title?.so) return course.title.so;
    if (lang === 'ar' && course?.title?.ar) return course.title.ar;
    return course?.title?.en || '';
  };
  const getCat = (c: string) => (catLabels as any)[c]?.[lang] || c;
  const dateLabel = lang === 'so' ? 'Taariikh' : lang === 'ar' ? 'التاريخ' : 'Date';
  const timeLabel = lang === 'so' ? 'Waqti' : lang === 'ar' ? 'الوقت' : 'Time';
  const tabLabel = (k: 'all' | ExamState) => (k === 'all' ? 'All' : STATE_META[k].label);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📖 {t('exams')}</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {counts.all} {t('total')} — {counts.upcoming} Upcoming, {counts.active} Active, {counts.completed} Completed, {counts.missed} Missed
          </p>
        </div>

        {/* Status cards double as filter tabs — click one to narrow the
            list below to just that status; click the active one again to
            clear back to All (same interaction as the pill tabs below). */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {([
            { key: 'all' as const, count: counts.all, label: 'All', border: 'border-slate-200 dark:border-slate-700', bg: 'bg-slate-50 dark:bg-slate-800/40', text: 'text-slate-700 dark:text-slate-200', sub: 'text-slate-600 dark:text-slate-400', ring: 'ring-slate-500' },
            { key: 'upcoming' as const, count: counts.upcoming, label: 'Upcoming', border: 'border-blue-200 dark:border-blue-900/50', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', sub: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500' },
            { key: 'active' as const, count: counts.active, label: 'Active', border: 'border-green-200 dark:border-green-900/50', bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-300', sub: 'text-green-600 dark:text-green-400', ring: 'ring-green-500' },
            { key: 'completed' as const, count: counts.completed, label: 'Completed', border: 'border-purple-200 dark:border-purple-900/50', bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-300', sub: 'text-purple-600 dark:text-purple-400', ring: 'ring-purple-500' },
            { key: 'missed' as const, count: counts.missed, label: 'Missed', border: 'border-red-200 dark:border-red-900/50', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', sub: 'text-red-600 dark:text-red-400', ring: 'ring-red-500' },
          ]).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setTab(s.key)}
              className={`rounded-xl border ${s.border} ${s.bg} p-4 text-center transition-all hover:shadow-sm ${
                tab === s.key ? `ring-2 ${s.ring} ring-offset-1` : ''
              }`}
            >
              <p className={`text-2xl font-bold ${s.text}`}>{s.count}</p>
              <p className={`text-xs ${s.sub}`}>{s.label}</p>
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map(({ key, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
              }`}
            >
              <span>{icon}</span> {tabLabel(key)}
              <span className={`rounded-full px-1.5 text-[10px] ${tab === key ? 'bg-white/20' : 'bg-[var(--color-surface-secondary)]'}`}>{counts[key]}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">📖</p>
            <p className="text-lg">{t('no_data')}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(({ exam: e, state }) => (
              <div
                key={e._id}
                className={`rounded-2xl border overflow-hidden bg-[var(--color-surface-primary)] hover:shadow-lg hover:-translate-y-0.5 transition-all ${
                  state === 'cancelled' || state === 'missed' ? 'border-red-300 opacity-70' : 'border-[var(--color-border-default)]'
                }`}
              >
                {/* Thumbnail — identical to the admin Papers & Approval card */}
                <div className="relative aspect-[16/9] w-full overflow-hidden">
                  {e.course?.thumbnail ? (
                    <img src={e.course.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className={`h-full w-full bg-gradient-to-br ${placeholderGradient(e.course?._id || e._id)} flex items-center justify-center text-6xl`}>
                      📝
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute top-3 end-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold flex-shrink-0 ${STATE_META[state].color}`}>
                      {STATE_META[state].label}
                    </span>
                  </div>
                  <p className="absolute bottom-2.5 start-3.5 end-3.5 text-sm font-bold text-white truncate drop-shadow">{toTitleCase(e.title)}</p>
                </div>

                <div className="p-4 space-y-2">
                  <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{toTitleCase(e.title)}</p>
                  {e.course && (
                    <p className="text-xs text-[var(--color-text-secondary)] truncate">
                      📘 {getTitle(e.course)} <span className="text-[var(--color-text-tertiary)]">· {getCat(e.course.category)}</span>
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-text-tertiary)] truncate">🧑‍🏫 {teacherName(e)}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] truncate">🏫 {orgName(e)} · {departmentName(e)} · {className(e)}</p>

                  <div className="space-y-1 text-xs pt-1">
                    {e.autoSchedule ? (
                      e.myScheduledStart ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-[var(--color-text-tertiary)]">{dateLabel}</span>
                            <span className="font-semibold text-[var(--color-text-primary)]">{new Date(e.myScheduledStart).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--color-text-tertiary)]">{timeLabel}</span>
                            <span className="font-semibold text-[var(--color-text-primary)]">
                              {new Date(e.myScheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {e.myScheduledEnd ? ` – ${new Date(e.myScheduledEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-[var(--color-text-tertiary)]">{lang === 'so' ? 'Jadwalka' : lang === 'ar' ? 'الجدول' : 'Schedule'}</span>
                          <span className="font-semibold text-[var(--color-text-primary)]">
                            🤖 {lang === 'so' ? 'Automatic' : lang === 'ar' ? 'تلقائي' : 'Automatic'}
                          </span>
                        </div>
                      )
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-[var(--color-text-tertiary)]">{dateLabel}</span>
                          <span className="font-semibold text-[var(--color-text-primary)]">{e.examDate ? new Date(e.examDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--color-text-tertiary)]">{timeLabel}</span>
                          <span className="font-semibold text-[var(--color-text-primary)]">{e.startTime} - {e.endTime}</span>
                        </div>
                      </>
                    )}
                    {e.room && (
                      <div className="flex justify-between">
                        <span className="text-[var(--color-text-tertiary)]">{lang === 'so' ? 'Qolka' : lang === 'ar' ? 'القاعة' : 'Room'}</span>
                        <span className="font-semibold text-[var(--color-text-primary)]">{e.room}</span>
                      </div>
                    )}
                  </div>

                  {e.autoSchedule && state === 'upcoming' && !e.myMetPrerequisites && (
                    <p className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      🔒 {lang === 'so'
                        ? (e.milestone === 'mid' ? 'Dhammaystir cashiradii ka horeeyay si loo furo imtixaankan.' : 'Dhammaystir koorsada oo dhan si loo furo imtixaankan.')
                        : (e.milestone === 'mid' ? 'Complete the required lessons to unlock this exam.' : 'Complete the whole course to unlock this exam.')}
                    </p>
                  )}

                  {e.autoSchedule && state === 'upcoming' && e.myMetPrerequisites && e.myScheduledStart && (
                    <p className="rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                      📅 {lang === 'so'
                        ? `Imtixaankan wuxuu kuu furmayaa ${new Date(e.myScheduledStart).toLocaleString()}.`
                        : lang === 'ar'
                        ? `سيفتح هذا الامتحان لك في ${new Date(e.myScheduledStart).toLocaleString()}.`
                        : `This exam opens for you on ${new Date(e.myScheduledStart).toLocaleString()}.`}
                    </p>
                  )}

                  {state === 'upcoming' && (!e.autoSchedule || e.myMetPrerequisites) && getUpcomingStart(e) !== null && (
                    <Countdown target={getUpcomingStart(e)!} lang={lang} />
                  )}

                  {state === 'active' && (
                    <button
                      onClick={() => navigate(`/student/exams/active?examId=${e._id}`)}
                      className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/25 hover:from-green-600 hover:to-emerald-700 transition-all active:scale-[0.98]"
                    >
                      🚀 {lang === 'so' ? 'Bilow Imtixaanka' : lang === 'ar' ? 'ابدأ الامتحان' : 'Start Exam'}
                    </button>
                  )}

                  {state === 'missed' && (
                    <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[11px] font-medium text-red-700 dark:text-red-400">
                      ⚠️ {lang === 'so' ? 'Imtixaankan waad seegtay — 0 dhibco ayaa lagu siiyay.' : lang === 'ar' ? 'لقد فاتك هذا الامتحان — حصلت على 0 نقطة.' : "You missed this exam — scored 0."}
                    </p>
                  )}

                  {state === 'missed' && (
                    e.myRetakeRequestStatus === 'pending' || e.myRetakeRequestStatus === 'under_review' ? (
                      <p className="rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                        ⏳ {lang === 'so' ? 'Codsigaaga wuxuu sugayaa ansixinta maamulka.' : lang === 'ar' ? 'طلبك بانتظار موافقة الإدارة.' : 'Your retake request is awaiting admin approval.'}
                      </p>
                    ) : e.myRetakeRequestStatus === 'rejected' ? (
                      <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[11px] font-medium text-red-700 dark:text-red-400">
                        🚫 {lang === 'so' ? 'Lagu ma ogola inaad dib ugu laabato imtixaankan — la xiriir maamulka.' : lang === 'ar' ? 'غير مسموح لك بإعادة هذا الامتحان — يرجى التواصل مع الإدارة.' : 'You are not allowed to retake this exam — contact administration.'}
                      </p>
                    ) : (
                      <button
                        onClick={() => { setRetakeModal(e); setRetakeReason(''); setRetakeError(''); }}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-primary-300 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/30 px-4 py-2.5 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
                      >
                        🔁 {lang === 'so' ? 'Codso Dib U Imtixaan' : lang === 'ar' ? 'طلب إعادة الامتحان' : 'Request Retake'}
                      </button>
                    )
                  )}

                  {state === 'completed' && (
                    <button
                      onClick={() => navigate(`/student/exams/${e._id}/review`)}
                      className="mt-1 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                    >
                      📋 {lang === 'so' ? 'Eeg Jawaabaha' : lang === 'ar' ? 'مراجعة الإجابات' : 'Review Answers'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {retakeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => !retakeSubmitting && setRetakeModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-primary)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">🔁 {lang === 'so' ? 'Codso Dib U Imtixaan' : lang === 'ar' ? 'طلب إعادة الامتحان' : 'Request Retake'}</h3>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-4">{toTitleCase(retakeModal.title)}</p>
            {retakeError && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{retakeError}</p>}
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">
              {lang === 'so' ? 'Sababta (ikhtiyaari)' : lang === 'ar' ? 'السبب (اختياري)' : 'Reason (optional)'}
            </label>
            <textarea
              value={retakeReason}
              onChange={(e) => setRetakeReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm mb-4"
              placeholder={lang === 'so' ? 'Maxaad u seegtay imtixaanka?' : lang === 'ar' ? 'لماذا فاتك الامتحان؟' : 'Why did you miss the exam?'}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRetakeModal(null)}
                disabled={retakeSubmitting}
                className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-60"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={submitRetakeRequest}
                disabled={retakeSubmitting}
                className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors"
              >
                {retakeSubmitting ? '...' : (lang === 'so' ? 'Dir Codsiga' : lang === 'ar' ? 'إرسال الطلب' : 'Submit Request')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StudentExams;
