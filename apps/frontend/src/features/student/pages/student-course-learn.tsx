/**
 * Student Course Learn — Full LMS learning experience for enrolled students.
 *
 * Layout:
 *   Desktop: Student sidebar | Course Content sidebar (sticky) | Lesson area
 *   Mobile:  Lesson area + floating Course Content drawer
 *
 * Features: progress tracking, locked/unlocked lessons, video player,
 * HTML content, attachments, Previous/Next navigation.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../lib/axios';
import type { Chapter, LessonItem, QuizItem, AssignmentItem } from '../../admin/pages/course-builder.types';
import { QuestionPreview } from '../../../components/shared/quiz-question-preview';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeacherBrief {
  _id: string;
  teacherId: string;
  profile?: { firstName: string; lastName: string };
}

interface Progress {
  _id: string;
  completedLessons: number;
  completedQuizzes: number;
  completedAssignments: number;
  totalItems: number;
  status: 'in_progress' | 'completed';
  lastAccessed: string | null;
  progressPercent?: number;
}

interface EnrolledCourse {
  _id: string;
  title: { en: string; so: string; ar: string };
  slug: string;
  description?: { en: string; so: string; ar: string };
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

interface CourseContent {
  _id?: string;
  course: string;
  chapters: Chapter[];
  totalDuration: number;
  totalLessons: number;
  totalQuizzes: number;
  totalAssignments: number;
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

const levelColors: Record<string, string> = {
  beginner: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const itemTypeIcons: Record<string, string> = {
  lesson: '📖', quiz: '❓', assignment: '📋',
};

function extractVideoEmbed(url: string): { type: 'youtube' | 'vimeo' | 'direct' | null; id: string } {
  if (!url) return { type: null, id: '' };
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return { type: 'youtube', id: ytMatch[1] };
  const vmMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vmMatch) return { type: 'vimeo', id: vmMatch[1] };
  if (/\.(mp4|webm|ogg|mov|mkv|avi)(\?.*)?$/i.test(url)) return { type: 'direct', id: url };
  return { type: null, id: '' };
}

function getFileIcon(type: string): string {
  if (type.includes('pdf')) return '📕';
  if (type.includes('doc')) return '📘';
  if (type.includes('zip') || type.includes('rar')) return '📦';
  if (type.includes('image')) return '🖼️';
  if (type.includes('video')) return '🎬';
  if (type.includes('audio')) return '🎵';
  if (type.includes('ppt')) return '📊';
  if (type.includes('xls') || type.includes('sheet')) return '📈';
  return '📄';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StudentCourseLearn() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';

  // Data
  const [course, setCourse] = useState<EnrolledCourse | null>(null);
  const [content, setContent] = useState<CourseContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [activeItemIdx, setActiveItemIdx] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);

  const getTitle = (c: EnrolledCourse) => {
    if (lang === 'so' && c.title?.so) return c.title.so;
    if (lang === 'ar' && c.title?.ar) return c.title.ar;
    return c.title?.en || 'Untitled';
  };

  const getDescription = (c: EnrolledCourse) => {
    if (lang === 'so' && (c as any).description?.so) return (c as any).description.so;
    if (lang === 'ar' && c.description?.ar) return c.description.ar;
    return c.description?.en || '';
  };

  // Fetch enrolled course + content
  const fetchData = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    try {
      // Fetch enrolled courses to find this one and get progress
      const myCoursesRes = await api.get('/students/my/courses');
      const courses: EnrolledCourse[] = myCoursesRes.data.data || [];
      const foundCourse = courses.find((c) => c._id === courseId);
      if (!foundCourse) {
        setError('Course not found or not enrolled.');
        setLoading(false);
        return;
      }
      setCourse(foundCourse);

      // Fetch course content
      const contentRes = await api.get(`/courses/${courseId}/content`);
      setContent(contentRes.data.data as CourseContent);
    } catch (err: any) {
      setError(err.response?.data?.message || t('error_occurred'));
    } finally {
      setLoading(false);
    }
  }, [courseId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lock scroll when drawer is open on mobile
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  // Flatten all items
  const flatItems = useMemo(() => {
    if (!content) return [];
    const items: { chapter: Chapter; chapterIdx: number; itemIdx: number; item: any }[] = [];
    content.chapters.forEach((ch, chIdx) => {
      ch.items.forEach((item, itemIdx) => {
        items.push({ chapter: ch, chapterIdx: chIdx, itemIdx, item });
      });
    });
    return items;
  }, [content]);

  const currentItem = flatItems[activeItemIdx] || null;
  const totalItems = flatItems.length;
  const completedCount = course?.progress?.completedLessons
    ? (course.progress.completedLessons + (course.progress.completedQuizzes || 0) + (course.progress.completedAssignments || 0))
    : 0;

  // Determine which items are locked — all items beyond the unlocked range are locked
  // Simple lock logic: first N items unlocked where N = completedCount + 1 (current)
  const unlockedCount = Math.min(completedCount + 1, totalItems);

  const goToPrev = () => {
    if (activeItemIdx > 0) {
      const newIdx = activeItemIdx - 1;
      setActiveItemIdx(newIdx);
      setActiveChapterIdx(flatItems[newIdx]?.chapterIdx || 0);
    }
  };

  const goToNext = () => {
    if (activeItemIdx < unlockedCount - 1) {
      const newIdx = activeItemIdx + 1;
      setActiveItemIdx(newIdx);
      setActiveChapterIdx(flatItems[newIdx]?.chapterIdx || 0);
    }
  };

  const jumpToItem = (flatIdx: number) => {
    if (flatIdx < 0 || flatIdx >= unlockedCount) return; // Cannot jump to locked items
    setActiveItemIdx(flatIdx);
    setActiveChapterIdx(flatItems[flatIdx]?.chapterIdx || 0);
    setDrawerOpen(false);
  };

  // Compute summary
  const totalLessons = content?.totalLessons || flatItems.filter((f) => f.item.type === 'lesson').length;
  const totalQuizzes = content?.totalQuizzes || flatItems.filter((f) => f.item.type === 'quiz').length;
  const totalAssignments = content?.totalAssignments || flatItems.filter((f) => f.item.type === 'assignment').length;
  const progressPct = course?.progress?.progressPercent ?? 0;
  const isCompleted = course?.progress?.status === 'completed';

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="text-center space-y-4">
          <p className="text-red-500">{error || 'Course not found'}</p>
          <button onClick={fetchData} className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700">{t('retry')}</button>
        </div>
      </div>
    );
  }

  const teacherName = course.teacher?.profile
    ? `${course.teacher.profile.firstName} ${course.teacher.profile.lastName}`
    : 'Unassigned';

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      {/* ── Mobile: Top-left hamburger for Course Content (overlays portal sidebar button) ── */}
      <button
        onClick={() => setDrawerOpen(true)}
        className={`lg:hidden fixed top-3 start-3 z-[60] rounded-xl bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] p-2.5 shadow-lg transition-opacity ${
          drawerOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        aria-label="Open course contents"
      >
        <svg className="h-5 w-5 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex">
        {/* ================================================================ */}
        {/* DESKTOP: Course Content Sidebar */}
        {/* ================================================================ */}
        <aside className="hidden lg:block w-72 flex-shrink-0 h-screen sticky top-0 border-r border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden">
          <div className="flex flex-col h-full">
            {/* Sidebar Header with progress */}
            <div className="p-4 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => navigate('/student/courses')}
                  className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  ← {t('my_courses')}
                </button>
              </div>
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                📑 {t('course_progress')}
              </h3>
              {/* Mini progress bar */}
              <div className="space-y-2">
                <div className="w-full h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${progressPct >= 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                    style={{ width: `${Math.min(progressPct, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-[var(--color-text-tertiary)]">
                  <span>{completedCount}/{totalItems} {t('completed_lessons')}</span>
                  <span className="font-semibold">{progressPct}%</span>
                </div>
                {isCompleted && (
                  <span className="inline-block rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs font-semibold">
                    ✅ {t('completed')}
                  </span>
                )}
              </div>
            </div>

            {/* Chapter/Item tree */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {content?.chapters.map((chapter, chIdx) => {
                const chapterItems = flatItems.filter((f) => f.chapterIdx === chIdx);
                const isActiveChapter = chIdx === activeChapterIdx;

                return (
                  <div key={chapter._id}>
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      isActiveChapter ? 'bg-primary-50 dark:bg-primary-950/30' : 'hover:bg-[var(--color-surface-secondary)]'
                    }`}>
                      <span className="text-xs font-mono text-[var(--color-text-tertiary)] w-5 text-right flex-shrink-0">
                        {String(chIdx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs font-bold text-[var(--color-text-primary)] truncate flex-1">
                        {chapter.title}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">
                        {chapter.items.length}
                      </span>
                    </div>

                    <div className="ml-5 border-l border-[var(--color-border-default)] mt-0.5 space-y-0.5">
                      {chapterItems.map((fi) => {
                        const flatIdx = flatItems.indexOf(fi);
                        const isActive = fi.chapterIdx === currentItem?.chapterIdx && fi.itemIdx === currentItem?.itemIdx;
                        const isLocked = flatIdx >= unlockedCount;
                        const isCompletedItem = flatIdx < completedCount;

                        return (
                          <button
                            key={fi.item._id}
                            onClick={() => !isLocked && jumpToItem(flatIdx)}
                            disabled={isLocked}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                              isActive
                                ? 'bg-primary-600 text-white shadow-sm'
                                : isLocked
                                  ? 'text-[var(--color-text-tertiary)] opacity-50 cursor-not-allowed'
                                  : isCompletedItem
                                    ? 'text-green-600 dark:text-green-400 hover:bg-[var(--color-surface-secondary)]'
                                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
                            }`}
                          >
                            <span className="w-4 text-center flex-shrink-0">
                              {isLocked ? '🔒' : isCompletedItem ? '✅' : itemTypeIcons[fi.item.type] || '•'}
                            </span>
                            <span className="truncate flex-1">{fi.item.title}</span>
                            <span className="text-[10px] opacity-60 flex-shrink-0">{fi.item.duration || 0}m</span>
                          </button>
                        );
                      })}
                      {chapterItems.length === 0 && (
                        <p className="text-[10px] text-[var(--color-text-tertiary)] px-3 py-2 italic">Empty</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {(!content || content.chapters.length === 0) && (
                <div className="text-center py-8 text-[var(--color-text-tertiary)]">
                  <p className="text-3xl mb-2">📭</p>
                  <p className="text-xs">{t('no_data')}</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ================================================================ */}
        {/* MOBILE: Slide-out Drawer */}
        {/* ================================================================ */}
        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-black/50 lg:hidden"
                onClick={() => setDrawerOpen(false)}
              />
              <motion.aside
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                className="fixed top-0 left-0 z-50 w-[85vw] max-w-sm h-full bg-[var(--color-surface-primary)] shadow-2xl lg:hidden flex flex-col"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-default)]">
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">📑 {t('course_progress')}</h3>
                  <button onClick={() => setDrawerOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {/* Mobile drawer content — simplified */}
                  <div className="p-4 space-y-1">
                    {/* Progress bar */}
                    <div className="mb-4">
                      <div className="w-full h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden mb-1">
                        <div className={`h-full rounded-full transition-all duration-500 ${progressPct >= 100 ? 'bg-green-500' : 'bg-primary-500'}`} style={{ width: `${Math.min(progressPct, 100)}%` }} />
                      </div>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{completedCount}/{totalItems} — {progressPct}%</p>
                    </div>

                    {content?.chapters.map((chapter, chIdx) => {
                      const chapterItems = flatItems.filter((f) => f.chapterIdx === chIdx);
                      return (
                        <div key={chapter._id}>
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">{String(chIdx + 1).padStart(2, '0')}. {chapter.title}</span>
                          </div>
                          <div className="ml-5 border-l border-[var(--color-border-default)] space-y-0.5">
                            {chapterItems.map((fi) => {
                              const flatIdx = flatItems.indexOf(fi);
                              const isActive = fi.chapterIdx === currentItem?.chapterIdx && fi.itemIdx === currentItem?.itemIdx;
                              const isLocked = flatIdx >= unlockedCount;
                              const isCompletedItem = flatIdx < completedCount;

                              return (
                                <button
                                  key={fi.item._id}
                                  onClick={() => { jumpToItem(flatIdx); setDrawerOpen(false); }}
                                  disabled={isLocked}
                                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                                    isActive ? 'bg-primary-600 text-white'
                                    : isLocked ? 'text-[var(--color-text-tertiary)] opacity-50 cursor-not-allowed'
                                    : isCompletedItem ? 'text-green-600'
                                    : 'text-[var(--color-text-secondary)]'
                                  }`}
                                >
                                  <span className="w-4 text-center flex-shrink-0">
                                    {isLocked ? '🔒' : isCompletedItem ? '✅' : itemTypeIcons[fi.item.type] || '•'}
                                  </span>
                                  <span className="truncate">{fi.item.title}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ================================================================ */}
        {/* MAIN CONTENT */}
        {/* ================================================================ */}
        <div className="flex-1 min-w-0">
          <div className="mx-auto max-w-4xl px-4 py-6 lg:py-8 pb-20 lg:pb-6">
            {/* Hero */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl overflow-hidden border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card mb-6"
            >
              <div className="relative w-full aspect-video max-h-56 lg:max-h-80 bg-gradient-to-br from-primary-100 via-primary-50 to-sky-100 dark:from-primary-900/40 dark:via-sky-900/30 dark:to-primary-950/50 overflow-hidden">
                {course.thumbnail ? (
                  <img src={course.thumbnail} alt={getTitle(course)} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-7xl opacity-30 select-none">📚</span>
                  </div>
                )}
                <div className="absolute top-3 left-3">
                  <span className="rounded-full bg-black/60 backdrop-blur-md px-2.5 py-0.5 text-xs font-semibold text-white">
                    {categoryLabels[course.category] || course.category}
                  </span>
                </div>
              </div>

              <div className="p-4 lg:p-6 space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <h1 className="text-lg lg:text-2xl font-bold text-[var(--color-text-primary)] flex-1">
                    {getTitle(course)}
                  </h1>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${levelColors[course.level] || 'bg-gray-100 text-gray-600'}`}>
                    {levelLabels[course.level] || course.level}
                  </span>
                </div>

                {getDescription(course) && (
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{getDescription(course)}</p>
                )}

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-[var(--color-text-tertiary)]">
                    <span>{t('completion_percentage')}</span>
                    <span>{completedCount}/{totalItems} {t('completed_lessons')}</span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${progressPct >= 100 ? 'bg-green-500' : 'bg-primary-500'}`} style={{ width: `${Math.min(progressPct, 100)}%` }} />
                  </div>
                </div>

                {/* Desktop meta */}
                <div className="hidden lg:flex flex-wrap items-center gap-4 text-sm text-[var(--color-text-tertiary)]">
                  <span className="inline-flex items-center gap-1.5"><span>👨‍🏫</span><span className="font-medium text-[var(--color-text-primary)]">{teacherName}</span></span>
                  <span className="inline-flex items-center gap-1.5"><span>⏱️</span><span>{course.duration} weeks</span></span>
                  <span className="inline-flex items-center gap-1.5"><span>📦</span><span>{content?.chapters.length || 0} modules</span></span>
                  <span className="inline-flex items-center gap-1.5"><span>📊</span><span>{totalItems} items</span></span>
                </div>
                <div className="lg:hidden flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
                  <span>👨‍🏫 {teacherName}</span>
                  <span>⏱️ {course.duration}w</span>
                  <span>📦 {content?.chapters.length || 0} mod</span>
                </div>
              </div>
            </motion.div>

            {/* Current Item */}
            {currentItem ? (
              <motion.div
                key={`${currentItem.chapterIdx}-${currentItem.itemIdx}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card p-4 lg:p-7 space-y-5"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-[var(--color-text-tertiary)] bg-[var(--color-surface-tertiary)] rounded-md px-2 py-0.5">
                      {t('Module')} {currentItem.chapterIdx + 1}: {currentItem.chapter.title}
                    </span>
                    <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                      {itemTypeIcons[currentItem.item.type]} {currentItem.item.type}
                    </span>
                  </div>
                  <h2 className="text-lg lg:text-xl font-bold text-[var(--color-text-primary)]">
                    {currentItem.item.title}
                  </h2>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-text-tertiary)]">
                    <span>{currentItem.item.duration || 0} min</span>
                    <span>·</span>
                    <span>{currentItem.item.status}</span>
                  </div>
                </div>

                <hr className="border-[var(--color-border-default)]" />

                {currentItem.item.type === 'lesson' && <LessonView lesson={currentItem.item as LessonItem} />}
                {currentItem.item.type === 'quiz' && <QuizView quiz={currentItem.item as QuizItem} />}
                {currentItem.item.type === 'assignment' && <AssignmentView assignment={currentItem.item as AssignmentItem} />}

                {/* Navigation */}
                <hr className="border-[var(--color-border-default)]" />
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={goToPrev}
                    disabled={activeItemIdx === 0}
                    className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    ← {t('previous') || 'Previous'}
                  </button>
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {activeItemIdx + 1} / {totalItems}
                  </span>
                  <button
                    onClick={goToNext}
                    disabled={activeItemIdx >= unlockedCount - 1}
                    className="rounded-xl bg-primary-600 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {t('next') || 'Next'} →
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 lg:p-12 text-center">
                <p className="text-4xl lg:text-5xl mb-4">📖</p>
                <p className="text-base lg:text-lg font-semibold text-[var(--color-text-primary)] mb-2">
                  {t('continue_learning')}
                </p>
                <p className="text-sm text-[var(--color-text-tertiary)]">
                  Select a lesson from the sidebar to begin.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Floating FAB */}
      <button
        onClick={() => setDrawerOpen(true)}
        className={`lg:hidden fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-2xl bg-primary-600 text-white px-4 py-3 shadow-lg hover:bg-primary-700 active:scale-95 transition-all ${
          drawerOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        aria-label="Open course contents"
      >
        <span className="text-lg">📑</span>
        <span className="text-sm font-semibold">{t('course_progress')}</span>
        <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-bold">
          {activeItemIdx + 1}/{totalItems}
        </span>
      </button>
    </div>
  );
}

// ===========================================================================
// Lesson View
// ===========================================================================
function LessonView({ lesson }: { lesson: LessonItem }) {
  const video = extractVideoEmbed(lesson.videoUrl || '');
  const [embedFailed, setEmbedFailed] = useState(false);

  const showUnavailable = lesson.videoUrl && (video.type === null || embedFailed);

  return (
    <div className="space-y-5">
      {video.type === 'youtube' && !embedFailed && (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0&modestbranding=1&controls=1&showinfo=0&iv_load_policy=3`}
            title="Course Video"
            className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
            onError={() => setEmbedFailed(true)}
          />
        </div>
      )}
      {video.type === 'vimeo' && !embedFailed && (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
          <iframe
            src={`https://player.vimeo.com/video/${video.id}?title=0&byline=0&portrait=0&dnt=1`}
            title="Course Video"
            className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
            onError={() => setEmbedFailed(true)}
          />
        </div>
      )}
      {video.type === 'direct' && (
        <div className="rounded-xl overflow-hidden bg-black">
          <video controls className="w-full rounded-xl" preload="metadata" controlsList="nodownload noremoteplayback" disablePictureInPicture>
            <source src={video.id} />
            <p className="text-white p-4 text-sm text-center">Your browser does not support the video tag.</p>
          </video>
        </div>
      )}

      {showUnavailable && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
          <p className="text-4xl mb-3">🎬</p>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">Video Unavailable</p>
          <p className="text-xs text-amber-600 dark:text-amber-400">This video cannot be played at this time.</p>
        </div>
      )}

      {lesson.featuredImage && (
        <img src={lesson.featuredImage} alt="Featured" className="w-full rounded-xl object-cover max-h-80" />
      )}

      {lesson.content && (
        <div
          className="prose prose-sm dark:prose-invert max-w-none text-[var(--color-text-primary)] [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_li]:text-sm [&_a]:text-primary-600 [&_a]:underline [&_a]:hover:text-primary-700 [&_img]:rounded-xl [&_img]:max-w-full [&_img]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-primary-400 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[var(--color-text-secondary)] [&_blockquote]:my-4 [&_code]:bg-[var(--color-surface-tertiary)] [&_code]:rounded-md [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-[var(--color-surface-tertiary)] [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:mb-4"
          dangerouslySetInnerHTML={{ __html: lesson.content }}
        />
      )}

      {lesson.attachments.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-[var(--color-text-primary)] mb-3 flex items-center gap-2"><span>📎</span> Attachments</h4>
          <div className="space-y-2">
            {lesson.attachments.map((att, idx) => (
              <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 hover:bg-[var(--color-surface-tertiary)] hover:border-primary-300 transition-all group">
                <span className="text-lg">{getFileIcon(att.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-primary-600">{att.name}</p>
                  {att.size && <p className="text-xs text-[var(--color-text-tertiary)]">{formatFileSize(att.size)}</p>}
                </div>
                <span className="text-primary-500">⬇</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Quiz View
// ===========================================================================
function QuizView({ quiz }: { quiz: QuizItem }) {
  return (
    <div className="space-y-4">
      {quiz.description && <p className="text-sm text-[var(--color-text-secondary)]">{quiz.description}</p>}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-2">
          <span className="text-xs text-amber-600 dark:text-amber-400">Passing</span>
          <p className="font-bold text-amber-700 dark:text-amber-300">{quiz.passingScore}%</p>
        </div>
        {quiz.timeLimit ? (
          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-2">
            <span className="text-xs text-blue-600 dark:text-blue-400">Time Limit</span>
            <p className="font-bold text-blue-700 dark:text-blue-300">{quiz.timeLimit} min</p>
          </div>
        ) : (
          <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-2">
            <span className="text-xs text-green-600 dark:text-green-400">Time</span>
            <p className="font-bold text-green-700 dark:text-green-300">No limit</p>
          </div>
        )}
      </div>
      {quiz.questions.length > 0 && (
        <div className="space-y-4 mt-4">
          <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Questions</h4>
          {quiz.questions.map((q, qIdx) => (
            <QuestionPreview key={qIdx} question={q} index={qIdx} />
          ))}
        </div>
      )}
      {quiz.questions.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)] italic">No questions yet.</p>}
    </div>
  );
}

// ===========================================================================
// Assignment View
// ===========================================================================
function AssignmentView({ assignment }: { assignment: AssignmentItem }) {
  return (
    <div className="space-y-4">
      {assignment.description && <p className="text-sm text-[var(--color-text-secondary)]">{assignment.description}</p>}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-2">
          <span className="text-xs text-blue-600 dark:text-blue-400">Max Score</span>
          <p className="font-bold text-blue-700 dark:text-blue-300">{assignment.maxScore} pts</p>
        </div>
        {assignment.dueDate && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-2">
            <span className="text-xs text-red-600 dark:text-red-400">Due Date</span>
            <p className="font-bold text-red-700 dark:text-red-300">{new Date(assignment.dueDate).toLocaleDateString()}</p>
          </div>
        )}
      </div>
      {assignment.instructions && (
        <div>
          <h4 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">📝 Instructions</h4>
          <div className="prose prose-sm dark:prose-invert max-w-none text-[var(--color-text-primary)] bg-[var(--color-surface-secondary)] rounded-xl p-4 border border-[var(--color-border-default)]" dangerouslySetInnerHTML={{ __html: assignment.instructions }} />
        </div>
      )}
      {assignment.attachments.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-[var(--color-text-primary)] mb-3 flex items-center gap-2"><span>📎</span> Attachments</h4>
          <div className="space-y-2">
            {assignment.attachments.map((att, idx) => (
              <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 hover:bg-[var(--color-surface-tertiary)] hover:border-primary-300 transition-all group">
                <span className="text-lg">{getFileIcon(att.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-primary-600">{att.name}</p>
                  {att.size && <p className="text-xs text-[var(--color-text-tertiary)]">{formatFileSize(att.size)}</p>}
                </div>
                <span className="text-primary-500">⬇</span>
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl border-2 border-dashed border-[var(--color-border-default)] p-6 text-center">
        <p className="text-3xl mb-2">📤</p>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">Submit Your Work</p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Upload your completed assignment here.</p>
      </div>
    </div>
  );
}

export default StudentCourseLearn;