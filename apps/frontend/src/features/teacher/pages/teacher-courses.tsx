/**
 * Teacher Courses — Standardized Course Card Grid
 *
 * Matches the Admin Portal's rich card design with top image cover,
 * metadata badges (Organization, Class, Duration, Price), category/level
 * tags, enrollment progress bar, and a top-right three-dots action menu
 * inline with the course title.
 *
 * Clicking the card body navigates to /teacher/courses/:courseId.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  BookOpen, Users, BarChart3, AlertCircle, RefreshCw,
  GraduationCap, Clock, Building2, School, Tag, Wallet
} from 'lucide-react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseCard {
  _id: string;
  title: { en: string; so?: string; ar?: string };
  slug: string;
  description?: { en: string; so?: string; ar?: string };
  category: string;
  level: string;
  duration?: number;
  fee?: number;
  enrolledStudents: number;
  maxStudents: number;
  status: string;
  thumbnail?: string;
  school?: { name: string; slug?: string } | null;
  class?: { title?: string; section?: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const categoryLabels: Record<string, string> = {
  quran: 'Quran', fiqh: 'Fiqh', aqeedah: 'Aqeedah', seerah: 'Seerah',
  arabic: 'Arabic', tajweed: 'Tajweed', hadith: 'Hadith', akhlaq: 'Akhlaq',
};

const levelLabels: Record<string, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
};

const categoryColors: Record<string, string> = {
  quran: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  fiqh: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  aqeedah: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  seerah: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  arabic: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  tajweed: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  hadith: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  akhlaq: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

// ---------------------------------------------------------------------------
// Three-Dots Dropdown (portal-based to avoid card clipping)
// ---------------------------------------------------------------------------

function ThreeDotsMenu({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = i18n.language as 'en' | 'so' | 'ar';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.right - 192, // w-48 = 192px
        zIndex: 100,
      });
    }
    setOpen(!open);
  };

  const navigateTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        className="p-1.5 rounded-lg hover:bg-[var(--color-surface-tertiary)] transition-colors"
        title={lang === 'so' ? 'Ficilada' : lang === 'ar' ? 'إجراءات' : 'Actions'}
      >
        <svg className="h-4 w-4 text-[var(--color-text-tertiary)]" fill="currentColor" viewBox="0 0 16 16">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="w-48 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-elevated py-1"
          >
            <button
              onClick={() => navigateTo(`/teacher/quizzes?courseId=${courseId}`)}
              className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] flex items-center gap-2 transition-colors"
            >
              📝 {lang === 'so' ? 'Quiz-yada' : lang === 'ar' ? 'الاختبارات' : 'View Quizzes'}
            </button>
            <button
              onClick={() => navigateTo(`/teacher/analytics?courseId=${courseId}`)}
              className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] flex items-center gap-2 transition-colors"
            >
              <BarChart3 className="h-3 w-3 inline" />
              {lang === 'so' ? 'Falanqayn' : lang === 'ar' ? 'تحليلات' : 'View Analytics'}
            </button>
            <button
              onClick={() => navigateTo(`/teacher/courses/${courseId}/gate-report`)}
              className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] flex items-center gap-2 transition-colors"
            >
              🎯 {lang === 'so' ? 'Warbixinta Su\'aalaha' : lang === 'ar' ? 'تقرير الأسئلة' : 'Gate Report'}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TeacherCourses() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [coursePermission, setCoursePermission] = useState<string>('STUDENT_VIEW');
  const isReadOnly = coursePermission !== 'COURSE_BUILDER';

  const fetchCourses = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/teacher-portal/dashboard');
      setCourses(data.data?.activeCourses || []);
      setCoursePermission(data.data?.teacher?.coursePermission === 'COURSE_BUILDER' ? 'COURSE_BUILDER' : 'STUDENT_VIEW');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCourses(); }, []);

  // ✅ PERMISSION-BASED ROUTING LOGIC
  // COURSE_BUILDER: Full access to course builder (admin-level authoring)
  // STUDENT_VIEW: Read-only access (lessons view only)
  const handleCardClick = (courseId: string) => {
    if (isReadOnly) {
      // STUDENT_VIEW: Route to lessons (read-only learning path)
      navigate(`/teacher/lessons?courseId=${courseId}`);
    } else {
      // COURSE_BUILDER: Route to admin course builder (full authoring workspace)
      // Route guard in TeacherCourseBuilder wrapper checks permission before rendering
      navigate(`/teacher/courses/${courseId}/builder`);
    }
  };

  // ── Loading skeleton ──
  if (loading) return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-extrabold text-[var(--color-text-primary)] mb-6">
        {lang === 'so' ? 'Koorsooyinkayga' : lang === 'ar' ? 'دوراتي' : 'My Courses'}
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] overflow-hidden animate-pulse">
            <div className="h-40 bg-[var(--color-surface-tertiary)]" />
            <div className="p-5 space-y-3">
              <div className="h-5 w-3/4 bg-[var(--color-surface-tertiary)] rounded" />
              <div className="h-3 w-full bg-[var(--color-surface-tertiary)] rounded" />
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="h-3 bg-[var(--color-surface-tertiary)] rounded" />
                <div className="h-3 bg-[var(--color-surface-tertiary)] rounded" />
                <div className="h-3 bg-[var(--color-surface-tertiary)] rounded" />
                <div className="h-3 bg-[var(--color-surface-tertiary)] rounded" />
              </div>
              <div className="flex gap-4 mt-3">
                <div className="h-4 w-16 bg-[var(--color-surface-tertiary)] rounded-full" />
                <div className="h-4 w-20 bg-[var(--color-surface-tertiary)] rounded-full" />
              </div>
              <div className="h-1.5 bg-[var(--color-surface-tertiary)] rounded-full mt-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--color-text-primary)]">
            {lang === 'so' ? 'Koorsooyinkayga' : lang === 'ar' ? 'دوراتي' : 'My Courses'}
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {lang === 'so'
              ? `Waxaa laguu xilsaaray ${courses.length} koorso`
              : lang === 'ar'
                ? `لديك ${courses.length} دورة`
                : `You are assigned to ${courses.length} course${courses.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={fetchCourses}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {lang === 'so' ? 'Cusbooneysii' : 'Refresh'}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-6 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={fetchCourses} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            {lang === 'so' ? 'Isku day' : 'Retry'}
          </button>
        </div>
      )}

      {/* ── Empty ── */}
      {!error && courses.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--color-surface-tertiary)] mb-6">
            <GraduationCap className="h-10 w-10 text-[var(--color-text-tertiary)]" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">
            {lang === 'so' ? 'Ma jiraan koorsooyin' : lang === 'ar' ? 'لا توجد دورات' : 'No Courses Assigned'}
          </h2>
          <p className="text-sm text-[var(--color-text-tertiary)] max-w-md mx-auto">
            {lang === 'so'
              ? 'Wali laguuma xilsaarin koorsooyin. La xiriir maamulka.'
              : lang === 'ar'
                ? 'لم يتم تعيين أي دورات لك بعد. يرجى التواصل مع الإدارة.'
                : 'No courses have been assigned to you yet. Please contact your administrator.'}
          </p>
          <button onClick={fetchCourses}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
            <RefreshCw className="h-4 w-4" />
            {lang === 'so' ? 'Cusbooneysii' : 'Refresh'}
          </button>
        </div>
      )}

      {/* ── Course Cards ── */}
      {courses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((course) => {
            const enrollmentPercent = course.maxStudents > 0
              ? Math.round((course.enrolledStudents / course.maxStudents) * 100)
              : 0;

            const schoolName = course.school?.name || '—';
            const className = course.class
              ? `${course.class.title || ''} ${course.class.section ? `(${course.class.section})` : ''}`.trim()
              : '—';
            const durationLabel = course.duration
              ? `${course.duration} ${lang === 'so' ? 'usbuuc' : lang === 'ar' ? 'أسبوع' : 'weeks'}`
              : '—';
            const priceLabel = course.fee && course.fee > 0
              ? `$${course.fee}`
              : lang === 'so' ? 'Bilaash' : lang === 'ar' ? 'مجاني' : 'Free';

            return (
              <motion.div
                key={course._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col cursor-pointer"
                onClick={() => handleCardClick(course._id)}
              >
                {/* ── Top Image Cover ── */}
                <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-emerald-700 via-teal-600 to-emerald-800">
                  {course.thumbnail ? (
                    <img
                      src={course.thumbnail}
                      alt={typeof course.title === 'object' ? course.title.en : course.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      {/* Decorative mosque-style pattern */}
                      <svg className="h-20 w-20 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5zm0 17.5c-4.2-1.4-8-4.93-8-9V8.81l8-4 8 4V10.5c0 4.07-3.8 7.6-8 9z"/>
                      </svg>
                    </div>
                  )}
                  {/* Status badge over image */}
                  <span className="absolute top-3 left-3 text-[10px] px-2.5 py-1 rounded-full bg-white/90 dark:bg-black/60 text-emerald-700 dark:text-emerald-300 font-bold shadow-sm backdrop-blur-sm">
                    {course.status === 'published'
                      ? (lang === 'so' ? 'Firfircoon' : lang === 'ar' ? 'منشور' : 'Published')
                      : course.status}
                  </span>
                </div>

                {/* ── Card Body ── */}
                <div className="p-5 flex flex-col flex-1">
                  {/* Course title + three-dots action menu inline */}
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[var(--color-text-primary)] leading-snug line-clamp-2 flex-1 min-w-0">
                      {typeof course.title === 'object'
                        ? course.title[lang] || course.title.en
                        : course.title}
                    </h3>
                    <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <ThreeDotsMenu courseId={course._id} />
                    </div>
                  </div>

                  {/* Metadata spec grid */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="font-medium text-[var(--color-text-secondary)]">
                        {lang === 'so' ? 'Hay\'ad' : lang === 'ar' ? 'المؤسسة' : 'Organization'}:
                      </span>
                      <span className="truncate">{schoolName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                      <School className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="font-medium text-[var(--color-text-secondary)]">
                        {lang === 'so' ? 'Fasal' : lang === 'ar' ? 'الفصل' : 'Class'}:
                      </span>
                      <span className="truncate">{className}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="font-medium text-[var(--color-text-secondary)]">
                        {lang === 'so' ? 'Muddada' : lang === 'ar' ? 'المدة' : 'Duration'}:
                      </span>
                      <span>{durationLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                      <Wallet className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="font-medium text-[var(--color-text-secondary)]">
                        {lang === 'so' ? 'Qiimaha' : lang === 'ar' ? 'السعر' : 'Price'}:
                      </span>
                      <span className={course.fee && course.fee > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                        {priceLabel}
                      </span>
                    </div>
                  </div>

                  {/* Tags row */}
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    {course.category && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${categoryColors[course.category] || 'bg-gray-100 text-gray-700'}`}>
                        {categoryLabels[course.category] || course.category}
                      </span>
                    )}
                    {course.level && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] font-medium capitalize">
                        {levelLabels[course.level] || course.level}
                      </span>
                    )}
                  </div>

                  {/* Enrollment progress */}
                  <div className="mt-auto pt-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-[var(--color-text-tertiary)] flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {lang === 'so' ? 'Isdiiwaangelinta' : lang === 'ar' ? 'التسجيل' : 'Enrollment'}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--color-text-secondary)]">
                        {course.enrolledStudents}/{course.maxStudents}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-600 transition-all duration-500"
                        style={{ width: `${enrollmentPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TeacherCourses;