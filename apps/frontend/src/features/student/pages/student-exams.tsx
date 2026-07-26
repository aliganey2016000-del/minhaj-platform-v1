/**
 * My Exam Schedule — Student
 *
 * Cards share the exact same visual design as the admin "Papers & Approval"
 * exam cards (full 16:9 course thumbnail with title/status overlaid on a
 * bottom gradient scrim, auto-generated gradient placeholder when the
 * course has no thumbnail) — one card design used everywhere an exam is
 * shown as a card, not a bespoke student-only look.
 */

import { useEffect, useState } from 'react';
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
  course?: { _id: string; title: { en: string; so: string; ar: string }; category: string; thumbnail?: string };
}

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
const statusLabels: Record<string, { so: string; ar: string }> = {
  scheduled: { so: 'La Qorsheeyey', ar: 'مجدول' },
  ongoing: { so: 'Socda', ar: 'جاري' },
  completed: { so: 'Dhameystiran', ar: 'مكتمل' },
  cancelled: { so: 'La Joojiyey', ar: 'ملغي' },
};
const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ongoing: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

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

export function StudentExams() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('all');

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

  const upcoming = exams.filter((e) => e.status === 'scheduled' || e.status === 'ongoing');
  const completed = exams.filter((e) => e.status === 'completed');
  const cancelled = exams.filter((e) => e.status === 'cancelled');
  const filtered = filter === 'upcoming' ? upcoming : filter === 'completed' ? completed : exams;

  const getTitle = (course: any) => {
    if (lang === 'so' && course?.title?.so) return course.title.so;
    if (lang === 'ar' && course?.title?.ar) return course.title.ar;
    return course?.title?.en || '';
  };
  const getStatus = (s: string) => (statusLabels as any)[s]?.[lang] || s;
  const getCat = (c: string) => (catLabels as any)[c]?.[lang] || c;
  const dateLabel = lang === 'so' ? 'Taariikh' : lang === 'ar' ? 'التاريخ' : 'Date';
  const timeLabel = lang === 'so' ? 'Waqti' : lang === 'ar' ? 'الوقت' : 'Time';
  const marksLabel = lang === 'so' ? 'Dhibcaha' : lang === 'ar' ? 'الدرجة' : 'Marks';

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📖 {t('exams')}</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {exams.length} {t('total')} — {upcoming.length} {t('upcoming')}, {completed.length} {t('completed')}, {cancelled.length} {t('cancelled')}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{upcoming.length}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">{t('upcoming')}</p>
          </div>
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{completed.length}</p>
            <p className="text-xs text-green-600 dark:text-green-400">{t('completed')}</p>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{cancelled.length}</p>
            <p className="text-xs text-red-600 dark:text-red-400">{t('cancelled')}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {(['all', 'upcoming', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                filter === f
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
              }`}
            >
              {f === 'all' ? 'All' : f === 'upcoming' ? t('upcoming') : t('completed')}
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
            {filtered.map((e) => (
              <div
                key={e._id}
                className={`rounded-2xl border overflow-hidden bg-[var(--color-surface-primary)] hover:shadow-lg hover:-translate-y-0.5 transition-all ${
                  e.status === 'cancelled' ? 'border-red-300 opacity-60' : 'border-[var(--color-border-default)]'
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
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize flex-shrink-0 ${statusColors[e.status] || 'bg-gray-100 text-gray-500'}`}>
                      {getStatus(e.status)}
                    </span>
                  </div>
                  <p className="absolute bottom-2.5 start-3.5 end-3.5 text-sm font-bold text-white truncate drop-shadow">{e.title}</p>
                </div>

                <div className="p-4 space-y-2">
                  {e.course && (
                    <p className="text-xs text-[var(--color-text-secondary)] truncate">
                      📘 {getTitle(e.course)} <span className="text-[var(--color-text-tertiary)]">· {getCat(e.course.category)}</span>
                    </p>
                  )}

                  <div className="space-y-1 text-xs pt-1">
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-tertiary)]">{dateLabel}</span>
                      <span className="font-semibold text-[var(--color-text-primary)]">{new Date(e.examDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-tertiary)]">{timeLabel}</span>
                      <span className="font-semibold text-[var(--color-text-primary)]">{e.startTime} - {e.endTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-tertiary)]">{marksLabel}</span>
                      <span className="font-semibold text-[var(--color-text-primary)]">{e.totalMarks} / {e.passingMarks} {lang === 'so' ? 'gudub' : lang === 'ar' ? 'نجاح' : 'pass'}</span>
                    </div>
                    {e.room && (
                      <div className="flex justify-between">
                        <span className="text-[var(--color-text-tertiary)]">{lang === 'so' ? 'Qolka' : lang === 'ar' ? 'القاعة' : 'Room'}</span>
                        <span className="font-semibold text-[var(--color-text-primary)]">{e.room}</span>
                      </div>
                    )}
                  </div>
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
