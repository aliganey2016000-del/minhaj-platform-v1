/**
 * Student Assignments — Redesigned Course-Style Cards + Submission Modal
 *
 * Tabs: All | Active | Upcoming | Overdue
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseBrief {
  _id: string;
  title: { en: string; so: string; ar: string };
  slug: string;
  category: string;
  thumbnail?: string;
}

interface Assignment {
  _id: string;
  title: string;
  description: string;
  course?: CourseBrief;
  startDate?: string | null;
  dueDate: string;
  totalMarks: number;
  allowLateSubmission: boolean;
  attachments: { url: string; name: string; allowDownload: boolean }[];
  isActive: boolean;
  isUpcoming: boolean;
  isOverdue: boolean;
}

// ---------------------------------------------------------------------------
// L10n helpers
// ---------------------------------------------------------------------------

const catLabels: Record<string, { en: string; so: string; ar: string }> = {
  quran: { en: 'Quran', so: "Qur'aanka", ar: 'القرآن' },
  fiqh: { en: 'Fiqh', so: 'Fiqhiga', ar: 'الفقه' },
  aqeedah: { en: 'Aqeedah', so: 'Cajiidada', ar: 'العقيدة' },
  seerah: { en: 'Seerah', so: 'Siirada', ar: 'السيرة' },
  arabic: { en: 'Arabic', so: 'Carabiga', ar: 'العربية' },
  tajweed: { en: 'Tajweed', so: 'Tajwiidka', ar: 'التجويد' },
  hadith: { en: 'Hadith', so: 'Xadiithka', ar: 'الحديث' },
  akhlaq: { en: 'Akhlaq', so: 'Akhlaaqda', ar: 'الأخلاق' },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StudentAssignments() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'overdue'>('all');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/assignments/my');
        setAssignments(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || t('error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  // ── Client-side filtering ──
  const filtered = assignments.filter((a) => {
    if (filter === 'active') return a.isActive;
    if (filter === 'upcoming') return a.isUpcoming;
    if (filter === 'overdue') return a.isOverdue;
    return true;
  });

  // ── Counts ──
  const activeCount = assignments.filter((a) => a.isActive).length;
  const upcomingCount = assignments.filter((a) => a.isUpcoming).length;
  const overdueCount = assignments.filter((a) => a.isOverdue).length;

  const getCourseTitle = (course: CourseBrief | undefined) => {
    if (!course) return '';
    return course.title?.[lang] || course.title?.en || '';
  };

  const getCategory = (cat: string) =>
    catLabels[cat]?.[lang] || catLabels[cat]?.en || cat;

  // ── Status badge for card overlay ──
  const getStatusBadge = (a: Assignment) => {
    if (a.isOverdue) {
      return {
        classes:
          'rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm',
        label:
          lang === 'so' ? '⚠️ Dhaafay' : lang === 'ar' ? '⚠️ متأخر' : '⚠️ Overdue',
      };
    }
    if (a.isActive) {
      return {
        classes:
          'rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm',
        label:
          lang === 'so' ? '🟢 Firfircoon' : lang === 'ar' ? '🟢 نشط' : '🟢 Active',
      };
    }
    if (a.isUpcoming) {
      return {
        classes:
          'rounded-full bg-blue-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm',
        label:
          lang === 'so' ? '⏳ Soo socda' : lang === 'ar' ? '⏳ قادم' : '⏳ Upcoming',
      };
    }
    return {
      classes:
        'rounded-full bg-gray-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm',
      label:
        lang === 'so'
          ? '✅ Dhammeystiran'
          : lang === 'ar'
            ? '✅ مكتمل'
            : '✅ Completed',
    };
  };

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" />
      </div>
    );
  if (error)
    return (
      <div className="text-center py-20">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white"
        >
          {t('retry')}
        </button>
      </div>
    );

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* ── Page Header ── */}
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
            📝 {t('assignments')}
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {assignments.length} {t('total')} — {activeCount}{' '}
            {lang === 'so' ? 'Firfircoon' : lang === 'ar' ? 'نشط' : 'Active'},{' '}
            {upcomingCount} {t('upcoming')}, {overdueCount} {t('overdue')}
          </p>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label={lang === 'so' ? 'Dhammaan' : lang === 'ar' ? 'الكل' : 'All'}
            value={assignments.length}
            color="from-gray-50 to-gray-100 dark:from-gray-800/20 dark:to-gray-800/30"
            textColor="text-gray-700 dark:text-gray-300"
            border="border-gray-200 dark:border-gray-700"
          />
          <StatCard
            label={lang === 'so' ? 'Firfircoon' : lang === 'ar' ? 'نشط' : 'Active'}
            value={activeCount}
            color="from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20"
            textColor="text-green-700 dark:text-green-300"
            border="border-green-200 dark:border-green-800"
          />
          <StatCard
            label={t('upcoming')}
            value={upcomingCount}
            color="from-blue-50 to-sky-50 dark:from-blue-950/20 dark:to-sky-950/20"
            textColor="text-blue-700 dark:text-blue-300"
            border="border-blue-200 dark:border-blue-800"
          />
          <StatCard
            label={t('overdue')}
            value={overdueCount}
            color="from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20"
            textColor="text-red-700 dark:text-red-300"
            border="border-red-200 dark:border-red-800"
          />
        </div>

        {/* ── Filter Tabs ── */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'upcoming', 'overdue'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                filter === f
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
              }`}
            >
              {f === 'all'
                ? lang === 'so'
                  ? 'Dhammaan'
                  : lang === 'ar'
                    ? 'الكل'
                    : 'All'
                : f === 'active'
                  ? lang === 'so'
                    ? 'Firfircoon'
                    : lang === 'ar'
                      ? 'نشط'
                      : 'Active'
                  : f === 'upcoming'
                    ? t('upcoming')
                    : t('overdue')}
            </button>
          ))}
        </div>

        {/* ── Empty State ── */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">📝</p>
            <p className="text-lg">
              {lang === 'so'
                ? 'Wax xog ah ma jiraan'
                : lang === 'ar'
                  ? 'لا توجد بيانات'
                  : 'No assignments'}
            </p>
          </div>
        ) : (
          /* ── Assignment Cards Grid (course-card style) ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((a) => {
              const badge = getStatusBadge(a);
              return (
                <div
                  key={a._id}
                  className="group relative flex flex-col rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                >
                  {/* ── Thumbnail Header ── */}
                  <div className="relative w-full aspect-video overflow-hidden bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/30">
                    {a.course?.thumbnail ? (
                      <img
                        src={a.course.thumbnail}
                        alt={getCourseTitle(a.course)}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl opacity-20 select-none">📝</span>
                      </div>
                    )}
                    {/* Course name badge — top left */}
                    <div className="absolute top-2.5 left-2.5">
                      <span className="rounded-full bg-black/60 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-semibold text-white tracking-wide">
                        {getCourseTitle(a.course)}
                      </span>
                    </div>
                    {/* Status badge — top right */}
                    <div className="absolute top-2.5 right-2.5">
                      <span className={badge.classes}>{badge.label}</span>
                    </div>
                    {/* Category — bottom left */}
                    {a.course?.category && (
                      <div className="absolute bottom-2.5 left-2.5 rounded-full bg-white/90 dark:bg-black/40 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-primary)]">
                        {getCategory(a.course.category)}
                      </div>
                    )}
                  </div>

                  {/* ── Card Body ── */}
                  <div className="flex flex-col flex-1 p-4 gap-3">
                    {/* Title */}
                    <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-[var(--color-text-primary)]">
                      {a.title}
                    </h3>

                    {/* Description */}
                    {a.description && (
                      <p className="text-xs text-[var(--color-text-tertiary)] line-clamp-2 leading-relaxed">
                        {a.description}
                      </p>
                    )}

                    {/* Metrics grid */}
                    <div className="grid grid-cols-3 gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
                      <div className="flex flex-col items-center rounded-lg bg-[var(--color-surface-tertiary)] py-1.5">
                        <span className="text-xs font-bold text-[var(--color-text-primary)]">
                          📅
                        </span>
                        <span className="truncate max-w-[60px]">
                          {new Date(a.dueDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="flex flex-col items-center rounded-lg bg-[var(--color-surface-tertiary)] py-1.5">
                        <span className="text-xs font-bold text-[var(--color-text-primary)]">
                          🏆
                        </span>
                        <span>
                          {a.totalMarks}{' '}
                          {lang === 'so'
                            ? 'Dhib'
                            : lang === 'ar'
                              ? 'درجة'
                              : 'pts'}
                        </span>
                      </div>
                      <div className="flex flex-col items-center rounded-lg bg-[var(--color-surface-tertiary)] py-1.5">
                        <span className="text-xs font-bold text-[var(--color-text-primary)]">
                          📎
                        </span>
                        <span>
                          {a.attachments.length}{' '}
                          {lang === 'so'
                            ? 'Fayl'
                            : lang === 'ar'
                              ? 'ملف'
                              : 'files'}
                        </span>
                      </div>
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* ── Action Button ── */}
                    <button
                      onClick={() => navigate(`/student/assignments/${a._id}`)}
                      className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-sm hover:shadow-md"
                    >
                      {lang === 'so'
                        ? '🏗️ Eeg & Gudbi Shaqada'
                        : lang === 'ar'
                          ? '🏗️ عرض وتسليم العمل'
                          : '🏗️ View & Submit Work'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Reusable Stat Card ──
function StatCard({
  label,
  value,
  color,
  textColor,
  border,
}: {
  label: string;
  value: number;
  color: string;
  textColor: string;
  border: string;
}) {
  return (
    <div
      className={`rounded-xl border ${border} bg-gradient-to-br ${color} p-4 text-center`}
    >
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
    </div>
  );
}

export default StudentAssignments;