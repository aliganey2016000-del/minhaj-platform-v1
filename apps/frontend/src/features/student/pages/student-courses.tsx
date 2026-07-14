/**
 * My Courses — Enrolled courses with progress tracking
 * Design matches Browse Courses for consistent UI/UX.
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TeacherBrief { _id: string; teacherId: string; profile?: { firstName: string; lastName: string }; }
interface Progress {
  percent: number;
  completedLessons: number;
  completedQuizzes: number;
  completedAssignments: number;
  totalLessons: number;
  totalQuizzes: number;
  totalAssignments: number;
  totalItems: number;
  completedItems: number;
  status: 'in_progress' | 'completed';
  lastAccessed: string | null;
}
interface Course {
  _id: string;
  title: { en: string; so: string; ar: string };
  slug: string;
  description?: { en: string };
  category: string;
  level: string;
  duration: number;
  fee: number;
  teacher?: TeacherBrief;
  maxStudents: number;
  enrolledStudents: number;
  thumbnail?: string;
  status: string;
  progress: Progress;
}

// ---------------------------------------------------------------------------
// L10n Labels (shared with Browse Courses)
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

const levelLabels: Record<string, { en: string; so: string; ar: string }> = {
  beginner: { en: 'Beginner', so: 'Bilowga', ar: 'مبتدئ' },
  intermediate: { en: 'Intermediate', so: 'Dhexdhexaad', ar: 'متوسط' },
  advanced: { en: 'Advanced', so: 'Heer Sare', ar: 'متقدم' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StudentCourses() {
  const { t, i18n } = useTranslation('common');
  const navigate = useNavigate();
  const lang = i18n.language as 'en' | 'so' | 'ar';

  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // -----------------------------------------------------------------------
  // Fetch enrolled courses
  // -----------------------------------------------------------------------
  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/students/my/courses');
      const list: Course[] = data.data || [];
      setCourses(list);
    } catch (err: any) {
      setError(err.response?.data?.message || t('error_occurred'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // -----------------------------------------------------------------------
  // Client-side filtering
  // -----------------------------------------------------------------------
  useEffect(() => {
    let result = [...courses];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const title = ((c.title?.en || '') + ' ' + (c.title?.so || '') + ' ' + (c.title?.ar || '')).toLowerCase();
        const desc = (c.description?.en || '').toLowerCase();
        return title.includes(q) || desc.includes(q);
      });
    }

    if (statusFilter) {
      result = result.filter((c) => (c.progress?.status || 'in_progress') === statusFilter);
    }

    if (categoryFilter) {
      result = result.filter((c) => (c.category || '') === categoryFilter);
    }

    if (levelFilter) {
      result = result.filter((c) => (c.level || '') === levelFilter);
    }

    setFilteredCourses(result);
  }, [courses, search, statusFilter, categoryFilter, levelFilter]);

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  const getTitle = (c: Course) => {
    if (lang === 'so' && c.title?.so) return c.title.so;
    if (lang === 'ar' && c.title?.ar) return c.title.ar;
    return c.title?.en || 'Untitled';
  };

  const getCat = (cat: string) => catLabels[cat]?.[lang] || cat;
  const getLevel = (lv: string) => levelLabels[lv]?.[lang] || lv;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('never_accessed');
    const d = new Date(dateStr);
    return d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : lang === 'so' ? 'so-SO' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // -----------------------------------------------------------------------
  // Statistics
  // -----------------------------------------------------------------------
  const stats = {
    total: courses.length,
    inProgress: courses.filter((c) => (c.progress?.status || 'in_progress') === 'in_progress').length,
    completed: courses.filter((c) => c.progress?.status === 'completed').length,
    certificates: courses.filter((c) => c.progress?.status === 'completed').length,
  };

  // -----------------------------------------------------------------------
  // Unique filter values from data
  // -----------------------------------------------------------------------
  const uniqueCategories = [...new Set(courses.map((c) => c.category).filter(Boolean))];
  const uniqueLevels = [...new Set(courses.map((c) => c.level).filter(Boolean))];

  // -----------------------------------------------------------------------
  // Loading / Error states
  // -----------------------------------------------------------------------
  if (loading && courses.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  if (error && courses.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-lg text-red-500">{error}</p>
          <button onClick={fetchCourses} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
            📚 {t('my_courses')}
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {stats.total} {t('enrolled_courses')}
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card flex items-center gap-3">
            <span className="text-2xl">📘</span>
            <div>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.total}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">{t('total_courses')}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card flex items-center gap-3">
            <span className="text-2xl">🔄</span>
            <div>
              <p className="text-2xl font-bold text-amber-600">{stats.inProgress}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">{t('in_progress')}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">{t('completed')}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card flex items-center gap-3">
            <span className="text-2xl">🎓</span>
            <div>
              <p className="text-2xl font-bold text-primary-600">{stats.certificates}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">{t('certificates')}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder={t('search_courses')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter('')}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                !categoryFilter
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
              }`}
            >
              {t('all_categories')}
            </button>
            {uniqueCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  categoryFilter === cat
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
                }`}
              >
                {getCat(cat)}
              </button>
            ))}
          </div>

          {/* Level + Status dropdowns */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2 text-sm"
            >
              <option value="">{t('all_levels')}</option>
              {Object.keys(levelLabels).map((lv) => (
                <option key={lv} value={lv}>{getLevel(lv)}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2 text-sm"
            >
              <option value="">{t('all_statuses')}</option>
              <option value="in_progress">{t('in_progress')}</option>
              <option value="completed">{t('completed')}</option>
            </select>

            <span className="text-xs text-[var(--color-text-tertiary)] self-center ml-2">
              {filteredCourses.length} {t('total')}
            </span>
          </div>
        </div>

        {/* Empty State */}
        {courses.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">📚</p>
            <p className="text-lg">{t('no_courses_enrolled')}</p>
            <p className="text-sm mt-1">{t('browse_to_enroll')}</p>
            <button
              onClick={() => navigate('/student/available')}
              className="mt-4 inline-block rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
            >
              {t('browse_courses')}
            </button>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-lg">{t('no_courses_found')}</p>
            <p className="text-sm">Try adjusting your filters.</p>
          </div>
        ) : (
          /* Course Cards Grid — identical layout to Browse Courses */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredCourses.map((c) => {
              const progress = c.progress || {} as Progress;
              const isCompleted = progress.status === 'completed';
              const pct = progress.percent || 0;

              return (
                <div
                  key={c._id}
                  className="group relative flex flex-col rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden cursor-pointer"
                  onClick={() => setSelectedCourse(c)}
                >
                  {/* Thumbnail */}
                  <div className="relative w-full aspect-video overflow-hidden bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/40 dark:to-primary-800/30">
                    {c.thumbnail ? (
                      <img
                        src={c.thumbnail}
                        alt={c.title.en}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl opacity-30 select-none">📚</span>
                      </div>
                    )}
                    {/* Category badge */}
                    <div className="absolute top-2.5 left-2.5">
                      <span className="rounded-full bg-black/60 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-semibold text-white tracking-wide">
                        {getCat(c.category)}
                      </span>
                    </div>
                    {/* Status badge */}
                    <div className="absolute top-2.5 right-2.5">
                      {isCompleted ? (
                        <span className="rounded-full bg-green-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                          ✅ {t('completed')}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                          🔄 {t('in_progress')}
                        </span>
                      )}
                    </div>
                    {/* Level badge */}
                    <div className="absolute bottom-2.5 left-2.5 rounded-full bg-white/90 dark:bg-black/40 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-primary)]">
                      {getLevel(c.level)}
                    </div>
                    {/* Completion percentage */}
                    <div className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-0.5 text-xs font-bold text-white">
                      {pct}%
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="flex flex-col flex-1 p-4 gap-2.5">
                    {/* Title */}
                    <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-[var(--color-text-primary)] group-hover:text-primary-600 transition-colors">
                      {getTitle(c)}
                    </h3>

                    {/* Teacher */}
                    {c.teacher?.profile && (
                      <p className="text-xs text-[var(--color-text-tertiary)] truncate">
                        👨‍🏫 {c.teacher.profile.firstName} {c.teacher.profile.lastName}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {c.duration} {lang === 'so' ? 'usbuuc' : lang === 'ar' ? 'أسبوع' : 'w'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        {progress.totalLessons || 0} {lang === 'so' ? 'cashar' : lang === 'ar' ? 'درس' : 'lessons'}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="w-full h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)]">
                        <span>{progress.completedItems || 0}/{progress.totalItems || 0} {t('completed_lessons')}</span>
                        <span>{t('completion_percentage')}: {pct}%</span>
                      </div>
                    </div>

                    {/* Last Accessed */}
                    <p className="text-[10px] text-[var(--color-text-tertiary)] opacity-70">
                      {t('last_accessed')}: {formatDate(progress.lastAccessed || null)}
                    </p>

                    {/* Spacer pushes button to bottom */}
                    <div className="flex-1" />

                    {/* Action button */}
                    <div onClick={(e) => e.stopPropagation()}>
                      {isCompleted ? (
                        <button
                          onClick={() => navigate(`/student/courses/${c._id}`)}
                          className="w-full rounded-xl bg-green-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-all shadow-sm hover:shadow-md"
                        >
                          🎓 {t('view_progress')}
                        </button>
                      ) : (progress.totalItems || 0) > 0 ? (
                        <button
                          onClick={() => navigate(`/student/courses/${c._id}`)}
                          className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-primary-700 active:bg-primary-800 transition-all shadow-sm hover:shadow-md"
                        >
                          ▶ {t('continue_learning')}
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/student/courses/${c._id}`)}
                          className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-primary-700 active:bg-primary-800 transition-all shadow-sm hover:shadow-md"
                        >
                          📖 {t('resume')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Course Detail Modal */}
        {selectedCourse && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setSelectedCourse(null)}
          >
            <div
              className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{getTitle(selectedCourse)}</h2>
                <button
                  onClick={() => setSelectedCourse(null)}
                  className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-3">
                {/* Badges */}
                <div className="flex gap-2 flex-wrap">
                  <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-3 py-1 text-xs font-medium text-primary-700">
                    {getCat(selectedCourse.category)}
                  </span>
                  <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium">
                    {getLevel(selectedCourse.level)}
                  </span>
                  {(() => {
                    const p = selectedCourse.progress || ({} as Progress);
                    return (
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                        p.status === 'completed'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}>
                        {p.status === 'completed' ? t('completed') : t('in_progress')}
                      </span>
                    );
                  })()}
                </div>

                {selectedCourse.description?.en && (
                  <p className="text-sm text-[var(--color-text-secondary)]">{selectedCourse.description.en}</p>
                )}

                {/* Progress */}
                <div className="space-y-1.5">
                  <span className="text-xs text-[var(--color-text-tertiary)]">{t('course_progress')}</span>
                  <div className="w-full h-3 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (selectedCourse.progress?.percent || 0) >= 100 ? 'bg-green-500' : 'bg-primary-500'
                      }`}
                      style={{ width: `${Math.min(selectedCourse.progress?.percent || 0, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {selectedCourse.progress?.completedItems || 0}/{selectedCourse.progress?.totalItems || 0} items • {selectedCourse.progress?.percent || 0}%
                  </p>
                </div>

                {/* Stats rows */}
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-xs text-[var(--color-text-tertiary)]">{t('completed_lessons')}</span>
                  <span className="text-sm font-medium">{selectedCourse.progress?.completedLessons || 0}/{selectedCourse.progress?.totalLessons || 0}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-xs text-[var(--color-text-tertiary)]">Quizzes</span>
                  <span className="text-sm font-medium">{selectedCourse.progress?.completedQuizzes || 0}/{selectedCourse.progress?.totalQuizzes || 0}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-xs text-[var(--color-text-tertiary)]">{t('assignments')}</span>
                  <span className="text-sm font-medium">{selectedCourse.progress?.completedAssignments || 0}/{selectedCourse.progress?.totalAssignments || 0}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-xs text-[var(--color-text-tertiary)]">{t('duration')}</span>
                  <span className="text-sm font-medium">{selectedCourse.duration || 0} weeks</span>
                </div>
                {selectedCourse.teacher?.profile && (
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-xs text-[var(--color-text-tertiary)]">{t('teacher')}</span>
                    <span className="text-sm font-medium">
                      {selectedCourse.teacher.profile.firstName} {selectedCourse.teacher.profile.lastName}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1.5">
                  <span className="text-xs text-[var(--color-text-tertiary)]">{t('last_accessed')}</span>
                  <span className="text-sm font-medium">{formatDate(selectedCourse.progress?.lastAccessed || null)}</span>
                </div>
              </div>

              <div className="mt-5 flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    navigate(`/student/courses/${selectedCourse._id}/learn`);
                    setSelectedCourse(null);
                  }}
                  className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
                >
                  {(selectedCourse.progress?.status || '') === 'completed' ? t('view_progress') : t('continue_learning')}
                </button>
                <button
                  onClick={() => setSelectedCourse(null)}
                  className="flex-1 rounded-xl border border-[var(--color-border-default)] py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)]"
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentCourses;