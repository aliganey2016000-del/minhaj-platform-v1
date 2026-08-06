/**
 * Available Courses — Student Catalog with i18n
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen, Search, GraduationCap, School, Clock, Users, Sparkles,
  CheckCircle2, Lock, X, ChevronLeft, ChevronRight, ChevronDown, SlidersHorizontal,
  Inbox, AlertCircle, XCircle, FilterX,
} from 'lucide-react';
import api from '../../../lib/axios';

interface TeacherBrief { _id: string; teacherId: string; profile?: { firstName: string; lastName: string }; }
interface Course {
  _id: string; title: { en: string; so: string; ar: string }; slug: string; description: { en: string }; category: string; level: string; duration: number; fee: number;
  teacher?: TeacherBrief; maxStudents: number; enrolledStudents: number; thumbnail?: string; status: string; startDate?: string; isEnrolled: boolean;
  class?: { _id: string; title: string; section: string; gradeLevel?: number } | null;
}
interface Category { value: string; label: { en: string }; }

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

export function StudentAvailable() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en'|'so'|'ar';
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  // Thumbnail URLs that failed to load — those cards fall back to the
  // gradient placeholder instead of the browser's broken-image icon.
  const [brokenThumbnails, setBrokenThumbnails] = useState<Set<string>>(new Set());
  const markThumbnailBroken = (id: string) => setBrokenThumbnails((prev) => new Set(prev).add(id));
  const [myClass, setMyClass] = useState<{ title: string; section: string } | null>(null);
  // Default view is scoped to the student's CURRENT grade only — a Grade
  // 12 student shouldn't be handed 40+ courses spanning every grade they
  // ever passed through. This reveals the rest on demand.
  const [includeEarlierGrades, setIncludeEarlierGrades] = useState(false);
  const [earlierGradesCount, setEarlierGradesCount] = useState(0);
  const limit = 12;

  const fetchCourses = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { page: String(page), limit: String(limit) };
      if (search) params.search = search; if (level) params.level = level;
      if (includeEarlierGrades) params.includeEarlierGrades = 'true';
      const { data } = await api.get('/courses/available', { params });
      setCourses(data.data || []); setTotal(data.meta?.total || 0);
      if (typeof data.meta?.earlierGradesCount === 'number') setEarlierGradesCount(data.meta.earlierGradesCount);
    } catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setLoading(false); }
  }, [page, search, level, includeEarlierGrades, t]);

  useEffect(() => { fetchCourses(); api.get('/courses/categories').then(r => setCategories(r.data.data || [])).catch(() => {}); }, [fetchCourses]);
  useEffect(() => { api.get('/students/my/dashboard').then(r => setMyClass(r.data.data?.class || null)).catch(() => {}); }, []);

  const handleEnroll = async (courseId: string) => {
    setEnrollingId(courseId); setMessage(''); setError('');
    try { await api.post(`/courses/${courseId}/self-enroll`); setMessage(t('successfully_enrolled')); setCourses(prev => prev.map(c => c._id===courseId?{...c,isEnrolled:true,enrolledStudents:c.enrolledStudents+1}:c)); }
    catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setEnrollingId(null); }
  };
  const handleUnenroll = async (courseId: string) => {
    if (!window.confirm('Are you sure?')) return; setEnrollingId(courseId); setMessage(''); setError('');
    try { await api.post(`/courses/${courseId}/self-unenroll`); setMessage(t('successfully_unenrolled')); setCourses(prev => prev.map(c => c._id===courseId?{...c,isEnrolled:false,enrolledStudents:c.enrolledStudents-1}:c)); }
    catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setEnrollingId(null); }
  };

  const getTitle = (c: Course) => { if(lang==='so'&&c.title.so)return c.title.so; if(lang==='ar'&&c.title.ar)return c.title.ar; return c.title.en; };
  const getCat = (c: string) => catLabels[c]?.[lang] || c;
  const getLevel = (l: string) => levelLabels[l]?.[lang] || l;
  const getFee = (fee: number) => fee > 0 ? `$${fee}` : lang === 'so' ? 'Bilaash' : lang === 'ar' ? 'مجاني' : 'Free';
  const isFull = (c: Course) => c.enrolledStudents >= c.maxStudents;
  const seatRatio = (c: Course) => Math.min((c.enrolledStudents / c.maxStudents) * 100, 100);
  const totalPages = Math.ceil(total / limit);
  const hasActiveFilters = !!(search || level);
  const clearFilters = () => { setSearch(''); setLevel(''); setPage(1); };
  const clearFiltersLabel = lang === 'so' ? 'Nadiifi Shaandhada' : lang === 'ar' ? 'مسح الفلاتر' : 'Clear filters';
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  if (loading && courses.length === 0) return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary-600 to-emerald-600 p-6 text-white shadow-lg lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-56 w-56 rounded-full bg-black/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-white/25 backdrop-blur-sm">
                <Sparkles className="h-3 w-3" strokeWidth={2} /> {lang === 'so' ? 'Cusub' : lang === 'ar' ? 'جديد' : 'New'}
              </span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight lg:text-3xl">{t('browse_courses')}</h1>
              <p className="mt-1.5 text-sm text-white/80">{total} {t('published_courses')}</p>
              {myClass && (
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25 backdrop-blur-sm">
                  <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} /> {lang === 'so' ? 'Fasalkaaga' : lang === 'ar' ? 'صفك' : 'Your Class'}: {myClass.title} — {myClass.section}
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <div className="min-w-[92px] rounded-2xl bg-white/10 px-4 py-3 text-center ring-1 ring-white/15 backdrop-blur-sm">
                <p className="text-xl font-bold">{total}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/70">{lang === 'so' ? 'Koorsooyin' : lang === 'ar' ? 'الدورات' : 'Courses'}</p>
              </div>
              <div className="min-w-[92px] rounded-2xl bg-white/10 px-4 py-3 text-center ring-1 ring-white/15 backdrop-blur-sm">
                <p className="text-xl font-bold">{categories.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/70">{lang === 'so' ? 'Qaybaha' : lang === 'ar' ? 'الفئات' : 'Categories'}</p>
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400">
            <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 flex-shrink-0" strokeWidth={2} /> {message}</span>
            <button onClick={() => setMessage('')} className="flex-shrink-0 text-xs underline underline-offset-2 hover:no-underline">Dismiss</button>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
            <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 flex-shrink-0" strokeWidth={2} /> {error}</span>
            <button onClick={() => setError('')} className="flex-shrink-0 text-xs underline underline-offset-2 hover:no-underline">Dismiss</button>
          </div>
        )}

        {/* Filters toolbar */}
        <div className="space-y-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" strokeWidth={2} />
              <input
                type="text"
                placeholder={t('search_courses')}
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] py-3 pl-10 pr-4 text-sm transition-colors focus:border-primary-500 focus:bg-[var(--color-surface-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <div className="relative sm:w-56">
              <SlidersHorizontal className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" strokeWidth={2} />
              <select
                value={level}
                onChange={e => { setLevel(e.target.value); setPage(1); }}
                className="w-full appearance-none rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] py-3 pl-10 pr-9 text-sm transition-colors focus:border-primary-500 focus:bg-[var(--color-surface-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">{t('all_levels')}</option>
                <option value="beginner">{levelLabels.beginner[lang]}</option>
                <option value="intermediate">{levelLabels.intermediate[lang]}</option>
                <option value="advanced">{levelLabels.advanced[lang]}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" strokeWidth={2} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            {hasActiveFilters && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-tertiary)] hover:text-red-600 transition-colors">
                <FilterX className="h-3.5 w-3.5" strokeWidth={2} /> {clearFiltersLabel}
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
              {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" />}
              {total} results
            </span>
          </div>
        </div>

        {/* Earlier-grades toggle — default view only shows the student's
            current grade; this reveals/hides material from grades already
            passed through. */}
        {!includeEarlierGrades && earlierGradesCount > 0 && (
          <button
            onClick={() => { setIncludeEarlierGrades(true); setPage(1); }}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/30 px-4 py-3 text-left transition-colors hover:bg-primary-100 dark:hover:bg-primary-900/40"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-primary-700 dark:text-primary-300">
              <BookOpen className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              {lang === 'so' ? `${earlierGradesCount} course oo ka socda fasalladii hore ayaa jira` : lang === 'ar' ? `${earlierGradesCount} دورة من الصفوف السابقة متاحة` : `${earlierGradesCount} course${earlierGradesCount === 1 ? '' : 's'} from earlier grades available`}
            </span>
            <span className="flex-shrink-0 text-xs font-semibold text-primary-600 dark:text-primary-400 underline underline-offset-2">
              {lang === 'so' ? 'Tus' : lang === 'ar' ? 'إظهار' : 'Show'}
            </span>
          </button>
        )}
        {includeEarlierGrades && (
          <button
            onClick={() => { setIncludeEarlierGrades(false); setPage(1); }}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-tertiary)]"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
              <BookOpen className="h-4 w-4 flex-shrink-0 opacity-60" strokeWidth={1.75} />
              {lang === 'so' ? 'Waxaa la muujinayaa course-yada fasalladii hore sidoo kale' : lang === 'ar' ? 'يتم عرض دورات الصفوف السابقة أيضًا' : 'Showing courses from earlier grades too'}
            </span>
            <span className="flex-shrink-0 text-xs font-semibold text-[var(--color-text-tertiary)] underline underline-offset-2">
              {lang === 'so' ? 'Qari' : lang === 'ar' ? 'إخفاء' : 'Hide'}
            </span>
          </button>
        )}

        {/* Course Cards Grid */}
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border-default)] py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-surface-tertiary)]">
              <Inbox className="h-8 w-8 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
            </div>
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">{t('no_courses_found')}</p>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Try adjusting your search or filters.</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-5 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors">
                {clearFiltersLabel}
              </button>
            )}
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-5 transition-opacity duration-200 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            {courses.map(c => (
              <div
                key={c._id}
                className="group relative flex flex-col rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden cursor-pointer"
                onClick={() => setSelectedCourse(c)}
              >
                {/* Thumbnail — fixed 16:9 aspect ratio */}
                <div className="relative w-full aspect-video overflow-hidden bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/40 dark:to-primary-800/30">
                  {c.thumbnail && !brokenThumbnails.has(c._id) ? (
                    <img
                      src={c.thumbnail}
                      alt={c.title.en}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={() => markThumbnailBroken(c._id)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
                      <BookOpen className="h-12 w-12 text-emerald-600/40" strokeWidth={1.5} />
                    </div>
                  )}
                  {/* Subtle bottom gradient for badge legibility */}
                  <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/40 to-transparent" />
                  {/* Category badge */}
                  <div className="absolute top-2.5 left-2.5">
                    <span className="rounded-full bg-black/60 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-semibold text-white tracking-wide">
                      {getCat(c.category)}
                    </span>
                  </div>
                  {/* Enrolled / Full badges */}
                  {c.isEnrolled && (
                    <div className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-green-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                      <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} /> Enrolled
                    </div>
                  )}
                  {isFull(c) && !c.isEnrolled && (
                    <div className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                      <Lock className="h-3 w-3" strokeWidth={2.5} /> {t('class_full')}
                    </div>
                  )}
                  {/* Price badge */}
                  <div className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-0.5 text-xs font-bold text-white">
                    {getFee(c.fee)}
                  </div>
                  {/* Level pill — bottom left */}
                  <div className="absolute bottom-2.5 left-2.5 rounded-full bg-white/90 dark:bg-black/40 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-primary)]">
                    {getLevel(c.level)}
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
                    <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] truncate">
                      <GraduationCap className="h-3.5 w-3.5 flex-shrink-0 opacity-60" strokeWidth={1.75} />
                      {c.teacher.profile.firstName} {c.teacher.profile.lastName}
                    </p>
                  )}

                  {/* Class */}
                  {c.class && (
                    <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] truncate">
                      <School className="h-3.5 w-3.5 flex-shrink-0 opacity-60" strokeWidth={1.75} />
                      {c.class.title} ({c.class.section})
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 opacity-60" strokeWidth={2} />
                      {c.duration} {lang === 'so' ? 'usbuuc' : lang === 'ar' ? 'أسبوع' : 'w'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 opacity-60" strokeWidth={2} />
                      {c.enrolledStudents}/{c.maxStudents}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isFull(c) ? 'bg-red-500' : seatRatio(c) >= 80 ? 'bg-amber-500' : 'bg-primary-500'}`}
                      style={{ width: `${seatRatio(c)}%` }}
                    />
                  </div>

                  {/* Spacer pushes button to bottom */}
                  <div className="flex-1" />

                  {/* Enroll button — sticks to bottom */}
                  <div onClick={e => e.stopPropagation()}>
                    {c.isEnrolled ? (
                      <button
                        onClick={() => handleUnenroll(c._id)}
                        disabled={enrollingId === c._id}
                        className="w-full rounded-xl border border-red-300 dark:border-red-800 px-4 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-all"
                      >
                        {enrollingId === c._id ? '...' : t('unenroll')}
                      </button>
                    ) : isFull(c) ? (
                      <button disabled className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-gray-500 cursor-not-allowed">
                        {t('class_full')}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleEnroll(c._id)}
                        disabled={enrollingId === c._id}
                        className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
                      >
                        {enrollingId === c._id ? t('enrolling') : t('enroll_now')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col items-center justify-between gap-3 pt-2 sm:flex-row">
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {lang === 'so' ? `Muujinaya ${rangeStart}–${rangeEnd} ee ${total}` : lang === 'ar' ? `عرض ${rangeStart}–${rangeEnd} من ${total}` : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
            </span>
            <div className="flex items-center gap-3">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2} /> {lang === 'so' ? 'Hore' : lang === 'ar' ? 'السابق' : 'Prev'}
              </button>
              <span className="text-sm text-[var(--color-text-tertiary)]">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {lang === 'so' ? 'Xiga' : lang === 'ar' ? 'التالي' : 'Next'} <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Course Detail Modal */}
      {selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelectedCourse(null)}>
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Thumbnail */}
            <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/40 dark:to-primary-800/30">
              {selectedCourse.thumbnail && !brokenThumbnails.has(selectedCourse._id) ? (
                <img
                  src={selectedCourse.thumbnail}
                  alt={selectedCourse.title.en}
                  className="h-full w-full object-cover"
                  onError={() => markThumbnailBroken(selectedCourse._id)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
                  <BookOpen className="h-14 w-14 text-emerald-600/40" strokeWidth={1.5} />
                </div>
              )}
              <button
                onClick={() => setSelectedCourse(null)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-6">
              <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{getTitle(selectedCourse)}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-3 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">{getCat(selectedCourse.category)}</span>
                <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">{getLevel(selectedCourse.level)}</span>
                <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">{getFee(selectedCourse.fee)}</span>
              </div>
              {selectedCourse.description?.en && <p className="mt-4 text-sm text-[var(--color-text-secondary)]">{selectedCourse.description.en}</p>}

              <div className="mt-4 divide-y divide-[var(--color-border-default)] rounded-xl border border-[var(--color-border-default)] px-4">
                <div className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]"><Clock className="h-3.5 w-3.5" strokeWidth={1.75} /> Duration</span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">{selectedCourse.duration} weeks</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]"><GraduationCap className="h-3.5 w-3.5" strokeWidth={1.75} /> Teacher</span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">{selectedCourse.teacher?.profile ? `${selectedCourse.teacher.profile.firstName} ${selectedCourse.teacher.profile.lastName}` : 'TBA'}</span>
                </div>
                {selectedCourse.class && (
                  <div className="flex items-center justify-between py-3">
                    <span className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]"><School className="h-3.5 w-3.5" strokeWidth={1.75} /> Class</span>
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">{selectedCourse.class.title} ({selectedCourse.class.section})</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]"><Users className="h-3.5 w-3.5" strokeWidth={1.75} /> Capacity</span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">{selectedCourse.enrolledStudents}/{selectedCourse.maxStudents}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">{selectedCourse.isEnrolled ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} /> : <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} />} Status</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${selectedCourse.isEnrolled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                    {selectedCourse.isEnrolled ? 'Enrolled' : 'Not enrolled'}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex gap-2" onClick={e => e.stopPropagation()}>
                {selectedCourse.isEnrolled ? (
                  <button onClick={() => { handleUnenroll(selectedCourse._id); setSelectedCourse(null); }} className="flex-1 rounded-xl border border-red-300 dark:border-red-800 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">{t('unenroll')}</button>
                ) : (
                  <button onClick={() => { handleEnroll(selectedCourse._id); setSelectedCourse(null); }} disabled={isFull(selectedCourse)} className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                    {isFull(selectedCourse) ? t('class_full') : t('enroll_now')}
                  </button>
                )}
                <button onClick={() => setSelectedCourse(null)} className="flex-1 rounded-xl border border-[var(--color-border-default)] py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default StudentAvailable;
