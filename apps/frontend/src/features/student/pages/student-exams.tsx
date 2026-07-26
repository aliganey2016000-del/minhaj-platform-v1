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

interface Exam {
  _id: string;
  title: string;
  examDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  room: string;
  instructions: string;
  status: string;
  myAttemptStatus: 'in_progress' | 'submitted' | 'auto_submitted' | null;
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

/** Real-time state — computed from now vs. the exam's own start/end, plus this student's attempt. */
function computeState(e: Exam): ExamState {
  if (e.status === 'cancelled') return 'cancelled';

  const datePart = e.examDate.split('T')[0];
  const start = new Date(`${datePart}T${e.startTime}`).getTime();
  const end = new Date(`${datePart}T${e.endTime}`).getTime();
  const now = Date.now();

  if (now < start) return 'upcoming';
  if (now <= end) return 'active';
  return e.myAttemptStatus === 'submitted' || e.myAttemptStatus === 'auto_submitted' ? 'completed' : 'missed';
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

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/exams/my');
        setExams(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || t('error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{counts.upcoming}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Upcoming</p>
          </div>
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{counts.active}</p>
            <p className="text-xs text-green-600 dark:text-green-400">Active</p>
          </div>
          <div className="rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{counts.completed}</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">Completed</p>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{counts.missed}</p>
            <p className="text-xs text-red-600 dark:text-red-400">Missed</p>
          </div>
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
                  <p className="absolute bottom-2.5 start-3.5 end-3.5 text-sm font-bold text-white truncate drop-shadow">{e.title}</p>
                </div>

                <div className="p-4 space-y-2">
                  <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{e.title}</p>
                  {e.course && (
                    <p className="text-xs text-[var(--color-text-secondary)] truncate">
                      📘 {getTitle(e.course)} <span className="text-[var(--color-text-tertiary)]">· {getCat(e.course.category)}</span>
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-text-tertiary)] truncate">🧑‍🏫 {teacherName(e)}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] truncate">🏫 {orgName(e)} · {departmentName(e)} · {className(e)}</p>

                  <div className="space-y-1 text-xs pt-1">
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-tertiary)]">{dateLabel}</span>
                      <span className="font-semibold text-[var(--color-text-primary)]">{new Date(e.examDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-tertiary)]">{timeLabel}</span>
                      <span className="font-semibold text-[var(--color-text-primary)]">{e.startTime} - {e.endTime}</span>
                    </div>
                    {e.room && (
                      <div className="flex justify-between">
                        <span className="text-[var(--color-text-tertiary)]">{lang === 'so' ? 'Qolka' : lang === 'ar' ? 'القاعة' : 'Room'}</span>
                        <span className="font-semibold text-[var(--color-text-primary)]">{e.room}</span>
                      </div>
                    )}
                  </div>

                  {state === 'active' && (
                    <button
                      onClick={() => navigate(`/student/exams/active?examId=${e._id}`)}
                      className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/25 hover:from-green-600 hover:to-emerald-700 transition-all active:scale-[0.98]"
                    >
                      🚀 {lang === 'so' ? 'Bilow Imtixaanka' : lang === 'ar' ? 'ابدأ الامتحان' : 'Start Exam'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentExams;
