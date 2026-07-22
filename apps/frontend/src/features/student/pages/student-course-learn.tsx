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

import { useState, useEffect, useCallback, useMemo, useId, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../lib/axios';
import type { Chapter, LessonItem, QuizItem, AssignmentItem } from '../../admin/pages/course-builder.types';
import { QuestionPreview } from '../../../components/shared/quiz-question-preview';
import { HtmlPreview } from '../../../components/shared/html-preview';
import { InteractiveGateLessonView } from '../components/interactive-gate-lesson-view';
import { useOnlineStatus } from '../../shared/hooks/useOnlineStatus';
import { getDownloadedCourse, queueAction } from '../../../lib/offline-store';
import { sanitizeHtml } from '../../../lib/sanitize-html';

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
  meetingLink?: string;
  isLive?: boolean;
  accessMode?: 'open' | 'restricted';
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
  const location = useLocation();
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const isOnline = useOnlineStatus();

  // Data
  const [course, setCourse] = useState<EnrolledCourse | null>(null);
  const [content, setContent] = useState<CourseContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usingOfflineCopy, setUsingOfflineCopy] = useState(false);

  // UI state
  const [activeItemIdx, setActiveItemIdx] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [markingComplete, setMarkingComplete] = useState(false);
  // Track locally which flat-item indices have been marked completed
  const [locallyCompleted, setLocallyCompleted] = useState<Set<number>>(new Set());
  // Track whether quiz is finished (hide mark-complete during active quiz)
  const [quizFinished, setQuizFinished] = useState(false);
  // Result of the just-finished quiz, so "Mark as Completed" can report real XP to gamification
  const [quizResult, setQuizResult] = useState<{ correctCount: number; total: number } | null>(null);
  // Track which flat-item indices have cleared their Interactive Gate (all Stop & Check blocks passed)
  const [gateCleared, setGateCleared] = useState<Set<number>>(new Set());
  // When the current item was opened, so completion can report real time-on-task
  const itemStartRef = useRef<number>(Date.now());

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

  // Fetch enrolled course + content — falls back to the offline-downloaded
  // copy (IndexedDB) when there's no connection.
  const fetchData = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError('');

    if (!navigator.onLine) {
      const offlineCopy = await getDownloadedCourse(courseId);
      if (offlineCopy) {
        setCourse(offlineCopy.course);
        setContent(offlineCopy.content);
        setUsingOfflineCopy(true);
        setLoading(false);
        return;
      }
      setError(
        lang === 'so'
          ? 'Adiga waxaad tahay offline oo koorsadan lama soo dejin. Ku xir internet-ka ama soo deji koorsada si aad offline ugu isticmaasho.'
          : lang === 'ar'
            ? 'أنت غير متصل ولم يتم تنزيل هذه الدورة. اتصل بالإنترنت أو نزّل الدورة لاستخدامها دون اتصال.'
            : "You're offline and this course hasn't been downloaded. Connect to the internet or download the course first for offline use."
      );
      setLoading(false);
      return;
    }

    setUsingOfflineCopy(false);
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
  }, [courseId, t, lang]);

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

  // Honor the startItemIdx passed via navigation state
  useEffect(() => {
    const state = location.state as { startItemIdx?: number } | null;
    if (typeof state?.startItemIdx === 'number' && flatItems.length > 0) {
      const idx = Math.min(state.startItemIdx, flatItems.length - 1);
      setActiveItemIdx(idx);
      setActiveChapterIdx(flatItems[idx]?.chapterIdx || 0);
    }
    // Only run once on mount (when flatItems first loads)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatItems.length > 0]);

  // Reset the time-on-task clock whenever the student moves to a different item
  useEffect(() => {
    itemStartRef.current = Date.now();
    setQuizResult(null);
  }, [activeItemIdx]);

  const currentItem = flatItems[activeItemIdx] || null;
  const totalItems = flatItems.length;
  const completedCount = course?.progress?.completedLessons
    ? (course.progress.completedLessons + (course.progress.completedQuizzes || 0) + (course.progress.completedAssignments || 0))
    : 0;

  // Determine which items are locked — all items beyond the unlocked range are locked.
  // Only enforced when the course's accessMode is 'restricted'; otherwise every
  // lesson is open regardless of completion order.
  const isRestrictedCourse = course?.accessMode === 'restricted';
  const unlockedCount = isRestrictedCourse ? Math.min(completedCount + 1, totalItems) : totalItems;

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

  const handleMarkComplete = async () => {
    if (!currentItem || markingComplete) return;
    setMarkingComplete(true);

    const timeSpentSeconds = Math.round((Date.now() - itemStartRef.current) / 1000);
    const progressBody = { courseId, itemType: currentItem.item.type };

    // Offline: queue everything for replay on reconnect, update local state
    // optimistically (there's no server response to refresh from yet).
    if (!navigator.onLine) {
      try {
        await queueAction({ type: 'mark-complete', url: '/students/my/progress', body: progressBody });
        if (currentItem.item.type === 'lesson') {
          await queueAction({ type: 'gamification-lesson', url: '/gamification/complete-lesson', body: { timeSpentSeconds } });
        } else if (currentItem.item.type === 'quiz' && quizResult) {
          await queueAction({
            type: 'gamification-quiz',
            url: '/gamification/complete-quiz',
            body: { score: quizResult.correctCount, totalQuestions: quizResult.total, timeSpentSeconds },
          });
        }
        await queueAction({ type: 'gamification-streak', url: '/gamification/streak/update', body: {} });

        setLocallyCompleted((prev) => new Set(prev).add(activeItemIdx));
        if (activeItemIdx < totalItems - 1) {
          const nextIdx = activeItemIdx + 1;
          setActiveItemIdx(nextIdx);
          setActiveChapterIdx(flatItems[nextIdx]?.chapterIdx || 0);
        }
      } catch (err) {
        console.error('Failed to queue offline progress:', err);
      } finally {
        setMarkingComplete(false);
      }
      return;
    }

    try {
      await api.post('/students/my/progress', progressBody);

      // Award real XP/streak/badges — best-effort, must never block completion
      // if the gamification service has a hiccup.
      const awardGamification = async () => {
        if (currentItem.item.type === 'lesson') {
          await api.post('/gamification/complete-lesson', { timeSpentSeconds });
        } else if (currentItem.item.type === 'quiz' && quizResult) {
          await api.post('/gamification/complete-quiz', {
            score: quizResult.correctCount,
            totalQuestions: quizResult.total,
            timeSpentSeconds,
          });
        }
        await api.post('/gamification/streak/update');
      };
      awardGamification().catch((err) => console.error('Gamification update failed:', err));

      // Optimistically update local state
      setLocallyCompleted((prev) => new Set(prev).add(activeItemIdx));
      // Refresh course data to get updated progress from server
      const myCoursesRes = await api.get('/students/my/courses');
      const courses: EnrolledCourse[] = myCoursesRes.data.data || [];
      const updated = courses.find((c) => c._id === courseId);
      if (updated) setCourse(updated);
      // Auto-advance to next item if available
      if (activeItemIdx < totalItems - 1) {
        const nextIdx = activeItemIdx + 1;
        setActiveItemIdx(nextIdx);
        setActiveChapterIdx(flatItems[nextIdx]?.chapterIdx || 0);
      }
    } catch (err: any) {
      // Silent fail — the user can try again
      console.error('Failed to mark progress:', err);
    } finally {
      setMarkingComplete(false);
    }
  };

  const isCurrentItemCompleted = activeItemIdx < completedCount || locallyCompleted.has(activeItemIdx);

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

      {/* ── Join Live (Google Meet) — shown whenever the teacher has gone live ── */}
      {course?.isLive && course.meetingLink && (
        <a
          href={course.meetingLink}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed top-3 end-3 z-[60] flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-red-700 transition-colors animate-pulse"
        >
          <span className="h-2 w-2 rounded-full bg-white" />
          Join Live ↗
        </a>
      )}

      {/* ── Offline banner ── */}
      {(!isOnline || usingOfflineCopy) && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500 dark:bg-amber-600 px-4 py-2 text-xs font-semibold text-white">
          <span>📴</span>
          {!isOnline
            ? (lang === 'so' ? 'Waxaad tahay offline — waxaad ku aragtaysaa koorsada nooca soo dejisan.' : lang === 'ar' ? 'أنت غير متصل — تشاهد النسخة التي تم تنزيلها.' : "You're offline — viewing the downloaded copy.")
            : (lang === 'so' ? 'Waxaad ku aragtaysaa nooca soo dejisan (offline).' : lang === 'ar' ? 'تشاهد النسخة التي تم تنزيلها (غير متصلة).' : 'Viewing the downloaded (offline) copy.')}
        </div>
      )}

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

                  {/* ── AI Tutor Button ── */}
                  <button
                    type="button"
                    onClick={() => navigate(`/student/courses/${courseId}/ai-tutor${currentItem ? `?lessonId=${currentItem.item._id || ''}` : ''}`)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all shadow-sm"
                  >
                    <span>💬</span>
                    <span>Chat with AI Tutor</span>
                  </button>
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

                {currentItem.item.type === 'lesson' && (
                  (currentItem.item as LessonItem).deliveryMode === 'interactive_gate' ? (
                    <InteractiveGateLessonView
                      lesson={currentItem.item as LessonItem}
                      courseId={courseId!}
                      onGateCleared={() => setGateCleared((prev) => new Set(prev).add(activeItemIdx))}
                    />
                  ) : (
                    <LessonView lesson={currentItem.item as LessonItem} />
                  )
                )}
                {currentItem.item.type === 'quiz' && (
                  <QuizView
                    quiz={currentItem.item as QuizItem}
                    courseId={courseId!}
                    onComplete={(result) => { setQuizFinished(true); setQuizResult(result); }}
                  />
                )}
                {currentItem.item.type === 'assignment' && <AssignmentView assignment={currentItem.item as AssignmentItem} />}

                {/* ── Mark as Completed Button (hidden during live quiz, or while an Interactive Gate lesson is still locked) ── */}
                {(() => {
                  const isGateLesson = currentItem.item.type === 'lesson' && (currentItem.item as LessonItem).deliveryMode === 'interactive_gate';
                  const isGateLocked = isGateLesson && !isCurrentItemCompleted && !gateCleared.has(activeItemIdx);
                  if (currentItem.item.type === 'quiz' && !quizFinished) return null;
                  if (isGateLocked) {
                    return (
                      <div className="rounded-2xl bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)] px-6 py-4 text-center text-sm text-[var(--color-text-tertiary)]">
                        🔒 Complete every Stop &amp; Check block above to unlock "Mark as Completed".
                      </div>
                    );
                  }
                  return (
                <div className="pt-2">
                  {isCurrentItemCompleted ? (
                    <div className="flex items-center justify-center gap-2 rounded-2xl bg-green-50 dark:bg-green-950/20 border-2 border-green-300 dark:border-green-700 px-6 py-4 text-green-700 dark:text-green-300">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-base font-bold">✓ Completed</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleMarkComplete}
                      disabled={markingComplete}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-600/30 disabled:shadow-none transition-all duration-300 active:scale-[0.98]"
                    >
                      {markingComplete ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      <span>{markingComplete ? 'Saving...' : 'Mark as Completed'}</span>
                    </button>
                  )}
                </div>
                  );
                })()}

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
        <HtmlPreview
          html={lesson.content}
          className="prose prose-sm dark:prose-invert max-w-none text-[var(--color-text-primary)] [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_li]:text-sm [&_a]:text-primary-600 [&_a]:underline [&_a]:hover:text-primary-700 [&_img]:rounded-xl [&_img]:max-w-full [&_img]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-primary-400 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[var(--color-text-secondary)] [&_blockquote]:my-4 [&_code]:bg-[var(--color-surface-tertiary)] [&_code]:rounded-md [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-[var(--color-surface-tertiary)] [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:mb-4"
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
// Quiz View — gamified single-question step-by-step for children
// ===========================================================================
function QuizView({ quiz, courseId, onComplete }: { quiz: QuizItem; courseId: string; onComplete?: (result: { correctCount: number; total: number }) => void }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<any>(null);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  // The real correct/incorrect verdict + explanation, from the server — the
  // client never has the answer key (stripQuizSecrets removes it), so this
  // can't be computed locally like it used to be before that strip existed.
  const [checkResult, setCheckResult] = useState<{ correct: boolean; explanation?: string } | null>(null);
  const [results, setResults] = useState<boolean[]>([]); // track correct/incorrect per question
  const [finished, setFinished] = useState(false);

  const total = quiz.questions.length;
  const q = quiz.questions[currentQ];
  const isCorrect = checked ? checkResult?.correct ?? false : null;

  const correctCount = results.filter(Boolean).length;
  const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const celebratoryMessages = ['🎉 Excellent!', '🌟 Great Job!', '💪 Well Done!', '🏆 Amazing!', '👏 Fantastic!', '⭐ Super Star!'];

  // Grades against POST /quizzes/check — the same server-side evaluateQuestion
  // used by the real graded quiz flow, but without recording an attempt or
  // awarding XP (this inline "learn" page view is practice-only). Sending
  // only this one question's answer keeps the rest of the quiz's answer key
  // unexposed for the remaining questions in the attempt.
  const handleCheck = async () => {
    if (selectedAnswer === null || selectedAnswer === undefined || checking) return;
    setChecking(true);
    setCheckError('');
    try {
      const { data } = await api.post('/quizzes/check', {
        courseId,
        quizId: quiz._id,
        answers: [{ questionId: q._id, answer: selectedAnswer }],
      });
      const graded = data.data?.answers?.find((a: any) => a.questionId === q._id);
      const correct = !!graded?.correct;
      setCheckResult({ correct, explanation: graded?.explanation });
      setResults((prev) => [...prev, correct]);
      setChecked(true);

      if (correct) {
        import('canvas-confetti').then((confetti) => {
          confetti.default({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#22c55e', '#10b981', '#f59e0b', '#3b82f6'],
          });
        });
      }
    } catch (err: any) {
      setCheckError(err.response?.data?.message || 'Could not check your answer. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleNext = () => {
    if (currentQ < total - 1) {
      setCurrentQ((prev) => prev + 1);
      setSelectedAnswer(null);
      setChecked(false);
      setCheckResult(null);
    } else {
      setFinished(true);
      onComplete?.({ correctCount: results.filter(Boolean).length, total });
    }
  };

  const handleRestart = () => {
    setCurrentQ(0);
    setSelectedAnswer(null);
    setChecked(false);
    setCheckResult(null);
    setResults([]);
    setFinished(false);
  };

  const progressPctQ = total > 0 ? Math.round(((currentQ + (checked ? 1 : 0)) / total) * 100) : 0;

  // ── Finished: Score Card ──
  if (finished) {
    return (
      <div className="space-y-5">
        <div className={`rounded-3xl p-6 sm:p-8 text-center ${percent >= quiz.passingScore ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-2 border-green-300 dark:border-green-700' : 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20 border-2 border-red-300 dark:border-red-700'}`}>
          <p className="text-5xl mb-3">{percent >= quiz.passingScore ? '🎉' : '😊'}</p>
          <h3 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)] mb-2">
            {percent >= quiz.passingScore ? 'Congratulations!' : 'Quiz Complete!'}
          </h3>
          <p className="text-4xl font-black mb-2" style={{ color: percent >= quiz.passingScore ? '#16a34a' : '#dc2626' }}>
            {correctCount}/{total}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)] mb-1">
            You scored <span className="font-bold">{percent}%</span>
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-5">Passing score: {quiz.passingScore}%</p>
          {/* Per-question result dots */}
          <div className="flex justify-center gap-1.5 mb-4">
            {results.map((ok, i) => (
              <span key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${ok ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}`}>
                {ok ? '✓' : '✗'}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={handleRestart}
            className="rounded-xl bg-amber-500 hover:bg-amber-600 px-5 py-2 text-sm font-bold text-white transition-all shadow-sm"
          >
            🔄 Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── No questions ──
  if (!q) {
    return <p className="text-sm text-[var(--color-text-tertiary)] italic">No questions yet.</p>;
  }

  return (
    <div className="space-y-5">
      {/* ── Progress Indicator ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-secondary)]">
          <span>Question {currentQ + 1} of {total}</span>
          <span>{progressPctQ}% done</span>
        </div>
        <div className="w-full h-3 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${progressPctQ >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-primary-500 to-amber-500'}`}
            initial={{ width: 0 }}
            animate={{ width: `${progressPctQ}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* ── Question Card ── */}
      <div className="rounded-3xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card p-5 sm:p-7 space-y-5">
        {/* Question text */}
        <div>
          <p className="text-sm font-bold text-[var(--color-text-secondary)] mb-1">
            {itemTypeIcons[q.type] || '📝'} {q.type === 'mcq' ? 'Multiple Choice' : q.type === 'true_false' ? 'True or False' : q.type}
          </p>
          <h3 className="text-lg sm:text-xl font-extrabold text-[var(--color-text-primary)] leading-snug">
            {q.question}
          </h3>
        </div>

        {/* ── MCQ Options — graded by option TEXT server-side (see
            /quizzes/check's evaluateQuestion), not index, since options
            arrive in a server-shuffled order. `correctIndex` is stripped
            for students, so only the option the student picked can be
            colored after checking — not "which one was actually right". ── */}
        {q.type === 'mcq' && (
          <div className="space-y-2.5">
            {q.options.map((opt, oIdx) => {
              const isSelected = selectedAnswer === opt;
              let style = 'border-2 border-[var(--color-border-default)] text-[var(--color-text-secondary)]';
              let icon: string | null = null;
              if (checked && isSelected) {
                style = isCorrect
                  ? 'border-green-400 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300'
                  : 'border-red-400 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300';
                icon = isCorrect ? '✓' : '✗';
              }
              return (
                <button
                  key={oIdx}
                  type="button"
                  disabled={checked}
                  onClick={() => setSelectedAnswer(opt)}
                  className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-left transition-all duration-200 ${style} ${
                    !checked ? 'hover:bg-[var(--color-surface-secondary)] hover:border-primary-300 active:scale-[0.98]' : ''
                  } ${isSelected && !checked ? 'ring-2 ring-primary-400 bg-primary-50 dark:bg-primary-950/20 border-primary-400' : ''}`}
                >
                  <span className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center text-sm flex-shrink-0 font-bold ${
                    checked && isSelected
                      ? isCorrect ? 'border-green-500 bg-green-500 text-white' : 'border-red-500 bg-red-500 text-white'
                      : isSelected && !checked
                        ? 'border-primary-500 bg-primary-500 text-white'
                        : 'border-[var(--color-border-default)]'
                  }`}>
                    {icon || String.fromCharCode(65 + oIdx)}
                  </span>
                  <span className="flex-1">{opt}</span>
                  {checked && isSelected && isCorrect && (
                    <span className="text-xs font-bold text-green-600 dark:text-green-400 flex-shrink-0">Correct!</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── True/False — `correctAnswer` is stripped for students too, so
            (like MCQ above) only the selected option can be colored. ── */}
        {q.type === 'true_false' && (
          <div className="grid grid-cols-2 gap-3">
            {[true, false].map((val) => {
              const isSelected = selectedAnswer === val;
              let style = 'border-2 border-[var(--color-border-default)] text-[var(--color-text-secondary)]';
              if (checked && isSelected) {
                style = isCorrect
                  ? 'border-green-400 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300'
                  : 'border-red-400 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300';
              }
              return (
                <button
                  key={String(val)}
                  type="button"
                  disabled={checked}
                  onClick={() => setSelectedAnswer(val)}
                  className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-extrabold transition-all duration-200 ${style} ${
                    !checked ? 'hover:bg-[var(--color-surface-secondary)] hover:border-primary-300 active:scale-[0.98]' : ''
                  } ${isSelected && !checked ? 'ring-2 ring-primary-400 bg-primary-50 dark:bg-primary-950/20 border-primary-400' : ''}`}
                >
                  <span className="text-2xl">{val ? '✅' : '❌'}</span>
                  {val ? 'True' : 'False'}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Interactive answer areas for the remaining 8 types. The backend
            strips every answer-revealing field for students (`pairs`,
            `correctIndex`, `blanks`, `answer`, etc. — see
            course-content.controller.ts's stripQuizSecrets) and ships a
            practice-only shape instead (`leftItems`/`rightItems`,
            `wordBank`, `scrambledLetters`...). The old fallback to
            QuestionPreview (an answer-revealing "review" component) had
            nothing left to show once those fields were stripped, so
            "Check Answer" could never be enabled for any of these types.
            None of these are graded here — like mcq/true_false's local
            check, this inline practice view isn't the securely-graded
            flow (that's /courses/:id/quiz/:quizId/take); it just needs
            *some* interaction to enable the Check button. ── */}
        {q.type === 'matching' && (
          <MatchingPairsAnswer
            key={currentQ}
            leftItems={(q as any).leftItems || []}
            rightItems={(q as any).rightItems || []}
            checked={checked}
            onChange={(val) => setSelectedAnswer(val)}
          />
        )}
        {q.type === 'ordering' && (
          <OrderingAnswer
            key={currentQ}
            items={(q as any).items || []}
            checked={checked}
            onChange={(val) => setSelectedAnswer(val)}
          />
        )}
        {q.type === 'picture_choice' && (
          <PictureChoiceAnswer
            key={currentQ}
            choices={(q as any).choices || []}
            checked={checked}
            onChange={(val) => setSelectedAnswer(val)}
          />
        )}
        {q.type === 'fill_blank' && (
          <FillBlankAnswer
            key={currentQ}
            textTemplate={(q as any).textTemplate || ''}
            wordBank={(q as any).wordBank || []}
            checked={checked}
            onChange={(val) => setSelectedAnswer(val)}
          />
        )}
        {q.type === 'word_scramble' && (
          <WordScrambleAnswer
            key={currentQ}
            scrambledLetters={(q as any).scrambledLetters || []}
            hint={(q as any).hint}
            checked={checked}
            onChange={(val) => setSelectedAnswer(val)}
          />
        )}
        {q.type === 'sentence_build' && (
          <SentenceBuildAnswer
            key={currentQ}
            wordBank={(q as any).wordBank || []}
            checked={checked}
            onChange={(val) => setSelectedAnswer(val)}
          />
        )}
        {q.type === 'swipe_sort' && (
          <SwipeSortAnswer
            key={currentQ}
            cards={(q as any).cards || []}
            leftLabel={(q as any).leftLabel || 'Left'}
            rightLabel={(q as any).rightLabel || 'Right'}
            checked={checked}
            onChange={(val) => setSelectedAnswer(val)}
          />
        )}
        {q.type === 'listen_write' && (
          <ListenWriteAnswer
            key={currentQ}
            audioUrl={(q as any).audioUrl || ''}
            hint={(q as any).hint}
            checked={checked}
            onChange={(val) => setSelectedAnswer(val)}
          />
        )}

        {/* ── Fallback for any unrecognized type — read-only preview ── */}
        {![
          'mcq', 'true_false', 'matching', 'ordering', 'picture_choice',
          'fill_blank', 'word_scramble', 'sentence_build', 'swipe_sort', 'listen_write',
        ].includes(q.type) && (
          <QuestionPreview question={q} index={currentQ} />
        )}

        {/* ── Feedback after check ── */}
        {checked && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="space-y-3"
          >
            {isCorrect ? (
              <div className="rounded-2xl bg-green-50 dark:bg-green-950/20 border-2 border-green-300 dark:border-green-700 p-4 text-center">
                <p className="text-3xl mb-1">🎉</p>
                <p className="text-lg font-extrabold text-green-700 dark:text-green-300">
                  {celebratoryMessages[Math.floor(Math.random() * celebratoryMessages.length)]}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-700 p-4 text-center">
                <p className="text-2xl mb-1">🤔</p>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Not quite! Keep practicing.</p>
              </div>
            )}

            {/* Explanation after check — from the server's per-answer grading
                response, not `q.explanation` (stripped from the client's own
                copy of the question for students). */}
            {checkResult?.explanation && (
              <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <span className="font-extrabold">💡 Explanation:</span> {checkResult.explanation}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {checkError && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-2.5 text-xs font-medium text-red-600 dark:text-red-400 text-center">
            {checkError}
          </div>
        )}
      </div>

      {/* ── Action Button ── */}
      <div className="pt-1">
        {!checked ? (
          <button
            type="button"
            onClick={handleCheck}
            disabled={selectedAnswer === null || selectedAnswer === undefined || checking}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed px-6 py-4 text-base font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-600/30 disabled:shadow-none transition-all duration-300 active:scale-[0.98]"
          >
            {checking ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {checking ? 'Checking...' : 'Check Answer'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 px-6 py-4 text-base font-extrabold text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-600/30 transition-all duration-300 active:scale-[0.98]"
          >
            {currentQ < total - 1 ? (
              <>Next Question <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
            ) : (
              <>See Results <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Matching Pairs — interactive answer for QuizView
// ===========================================================================
function MatchingPairsAnswer({
  leftItems, rightItems, checked, onChange,
}: {
  leftItems: string[];
  rightItems: string[];
  checked: boolean;
  onChange: (pairs: { left: string; right: string }[] | null) => void;
}) {
  const [assigned, setAssigned] = useState<{ left: string; right: string }[]>([]);
  const availableRight = rightItems.filter((r) => !assigned.some((a) => a.right === r));

  const report = (next: { left: string; right: string }[]) =>
    onChange(next.length === leftItems.length ? next : null);

  const assign = (left: string, right: string) => {
    const next = [...assigned.filter((a) => a.left !== left), { left, right }];
    setAssigned(next);
    report(next);
  };
  const unassign = (left: string) => {
    const next = assigned.filter((a) => a.left !== left);
    setAssigned(next);
    report(next);
  };
  const getAssigned = (left: string) => assigned.find((a) => a.left === left)?.right || null;

  return (
    <div className="space-y-3">
      {leftItems.map((left, idx) => {
        const right = getAssigned(left);
        return (
          <div key={idx} className="flex items-center gap-3">
            <div className="flex-1 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 px-4 py-3 text-sm font-semibold text-purple-700 dark:text-purple-300">
              {left}
            </div>
            <span className="text-[var(--color-text-tertiary)] flex-shrink-0">↔</span>
            <div className="flex-1">
              {right ? (
                <button
                  type="button"
                  disabled={checked}
                  onClick={() => unassign(left)}
                  className="w-full rounded-xl border-2 border-primary-400 bg-primary-50 dark:bg-primary-950/20 px-4 py-3 text-sm font-semibold text-primary-700 dark:text-primary-300 disabled:opacity-70 transition-colors"
                >
                  {right}{!checked && ' ✕'}
                </button>
              ) : (
                <select
                  disabled={checked}
                  value=""
                  onChange={(e) => { if (e.target.value) assign(left, e.target.value); }}
                  className="w-full rounded-xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] disabled:opacity-60 cursor-pointer"
                >
                  <option value="">Select a match...</option>
                  {availableRight.map((r, ri) => <option key={ri} value={r}>{r}</option>)}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Ordering — interactive answer for QuizView
// ===========================================================================
function OrderingAnswer({
  items, checked, onChange,
}: {
  items: string[]; checked: boolean; onChange: (order: string[] | null) => void;
}) {
  const [order, setOrder] = useState<string[]>(items);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // The server-shuffled order already counts as a complete (if possibly
  // wrong) answer the moment it's shown — report it once up front so a
  // student who never reorders anything still has "Check Answer" enabled.
  useEffect(() => {
    onChange(items.length > 0 ? items : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reorder = (next: string[]) => {
    setOrder(next);
    onChange(next);
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    reorder(next);
  };
  const moveDown = (idx: number) => {
    if (idx === order.length - 1) return;
    const next = [...order];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    reorder(next);
  };
  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const next = [...order];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    reorder(next);
    setDragIdx(null);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-text-tertiary)] mb-2 text-center">Arrange in the correct order</p>
      {order.map((item, idx) => (
        <div
          key={item}
          draggable={!checked}
          onDragStart={() => setDragIdx(idx)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(idx)}
          onDragEnd={() => setDragIdx(null)}
          className="flex items-center gap-3"
        >
          <span className="cursor-grab flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center justify-center text-sm font-bold">
            {idx + 1}
          </span>
          <div className="flex-1 rounded-xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">
            {item}
          </div>
          <div className="flex flex-col gap-1">
            <button type="button" disabled={checked} onClick={() => moveUp(idx)} className="w-7 h-7 rounded-lg bg-[var(--color-surface-tertiary)] hover:bg-amber-100 dark:hover:bg-amber-900/30 text-[var(--color-text-secondary)] flex items-center justify-center text-xs disabled:opacity-30 transition-colors">▲</button>
            <button type="button" disabled={checked} onClick={() => moveDown(idx)} className="w-7 h-7 rounded-lg bg-[var(--color-surface-tertiary)] hover:bg-amber-100 dark:hover:bg-amber-900/30 text-[var(--color-text-secondary)] flex items-center justify-center text-xs disabled:opacity-30 transition-colors">▼</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// Picture Choice — interactive answer for QuizView
// ===========================================================================
function PictureChoiceAnswer({
  choices, checked, onChange,
}: {
  choices: { image: string; label?: string }[]; checked: boolean; onChange: (image: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const pick = (image: string) => {
    setSelected(image);
    onChange(image);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {choices.map((c, idx) => (
        <button
          key={idx}
          type="button"
          disabled={checked}
          onClick={() => pick(c.image)}
          className={`relative rounded-xl border-2 overflow-hidden transition-all ${
            selected === c.image ? 'border-primary-500 shadow-md shadow-primary-500/20' : 'border-[var(--color-border-default)] hover:border-primary-300'
          } disabled:cursor-not-allowed`}
        >
          <div className="aspect-square bg-[var(--color-surface-tertiary)] flex items-center justify-center">
            {c.image ? <img src={c.image} alt={c.label || `Choice ${idx + 1}`} className="w-full h-full object-cover" /> : <span className="text-3xl opacity-30">🖼️</span>}
          </div>
          {c.label && <p className="text-xs text-center py-1.5 text-[var(--color-text-secondary)] truncate px-1">{c.label}</p>}
        </button>
      ))}
    </div>
  );
}

// ===========================================================================
// Fill in the Blank — interactive answer for QuizView
// ===========================================================================
function FillBlankAnswer({
  textTemplate, wordBank, checked, onChange,
}: {
  textTemplate: string; wordBank: string[]; checked: boolean; onChange: (blanks: string[] | null) => void;
}) {
  const segments = textTemplate.split('___');
  const blankCount = segments.length - 1;
  const [filled, setFilled] = useState<string[]>(Array(blankCount).fill(''));

  const report = (next: string[]) => onChange(next.every(Boolean) ? next : null);

  const fillNext = (word: string) => {
    const idx = filled.findIndex((w) => !w);
    if (idx === -1) return;
    const next = [...filled];
    next[idx] = word;
    setFilled(next);
    report(next);
  };
  const clearBlank = (idx: number) => {
    const next = [...filled];
    next[idx] = '';
    setFilled(next);
    report(next);
  };

  const usedCounts: Record<string, number> = {};
  for (const w of filled) if (w) usedCounts[w] = (usedCounts[w] || 0) + 1;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-5 py-4 text-sm leading-loose text-[var(--color-text-primary)]">
        {segments.map((seg, i) => (
          <span key={i}>
            {seg}
            {i < blankCount && (
              <button
                type="button"
                disabled={checked || !filled[i]}
                onClick={() => clearBlank(i)}
                className={`inline-flex items-center justify-center min-w-[70px] mx-1 px-2 py-0.5 rounded-lg border-b-2 font-semibold text-sm align-baseline ${
                  filled[i]
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300'
                    : 'border-dashed border-[var(--color-text-tertiary)] text-[var(--color-text-tertiary)]'
                }`}
              >
                {filled[i] || '_____'}
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {wordBank.map((word, idx) => {
          const usedSoFar = wordBank.slice(0, idx).filter((w) => w === word).length;
          const isUsed = usedSoFar < (usedCounts[word] || 0);
          return (
            <button
              key={idx}
              type="button"
              disabled={checked || isUsed}
              onClick={() => fillNext(word)}
              className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all ${
                isUsed
                  ? 'opacity-30 cursor-not-allowed border-[var(--color-border-subtle)] text-[var(--color-text-tertiary)]'
                  : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/20'
              }`}
            >
              {word}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Word Scramble — interactive answer for QuizView
// ===========================================================================
function WordScrambleAnswer({
  scrambledLetters, hint, checked, onChange,
}: {
  scrambledLetters: string[]; hint?: string; checked: boolean; onChange: (word: string | null) => void;
}) {
  const [usedIndices, setUsedIndices] = useState<number[]>([]);
  const [showHint, setShowHint] = useState(false);

  const report = (next: number[]) =>
    onChange(next.length === scrambledLetters.length ? next.map((i) => scrambledLetters[i]).join('') : null);

  const pickLetter = (idx: number) => {
    if (usedIndices.includes(idx)) return;
    const next = [...usedIndices, idx];
    setUsedIndices(next);
    report(next);
  };
  const removeAt = (position: number) => {
    const next = usedIndices.filter((_, i) => i !== position);
    setUsedIndices(next);
    report(next);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center gap-1.5 min-h-[3rem] flex-wrap">
        {usedIndices.length === 0 && (
          <span className="text-xs text-[var(--color-text-tertiary)]">Tap the letters below to build the word</span>
        )}
        {usedIndices.map((letterIdx, pos) => (
          <button
            key={pos}
            type="button"
            disabled={checked}
            onClick={() => removeAt(pos)}
            className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-400 text-primary-700 dark:text-primary-300 font-bold text-lg flex items-center justify-center"
          >
            {scrambledLetters[letterIdx]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {scrambledLetters.map((letter, idx) => (
          <button
            key={idx}
            type="button"
            disabled={checked || usedIndices.includes(idx)}
            onClick={() => pickLetter(idx)}
            className={`w-10 h-10 rounded-lg border-2 font-bold text-lg flex items-center justify-center transition-all ${
              usedIndices.includes(idx)
                ? 'opacity-20 cursor-not-allowed border-[var(--color-border-subtle)]'
                : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/20'
            }`}
          >
            {letter}
          </button>
        ))}
      </div>
      {hint && (
        <div className="text-center">
          <button type="button" onClick={() => setShowHint((s) => !s)} className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline">
            💡 {showHint ? hint : 'Show hint'}
          </button>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Sentence Builder — interactive answer for QuizView
// ===========================================================================
function SentenceBuildAnswer({
  wordBank, checked, onChange,
}: {
  wordBank: string[]; checked: boolean; onChange: (words: string[] | null) => void;
}) {
  const [usedIndices, setUsedIndices] = useState<number[]>([]);

  // At least one word placed counts as a complete-enough answer here — this
  // inline view never grades sentence order locally (see the header comment
  // on the interactive answer areas above), it just needs an interaction.
  const report = (next: number[]) => onChange(next.length > 0 ? next.map((i) => wordBank[i]) : null);

  const addWord = (idx: number) => {
    if (usedIndices.includes(idx)) return;
    const next = [...usedIndices, idx];
    setUsedIndices(next);
    report(next);
  };
  const removeAt = (position: number) => {
    const next = usedIndices.filter((_, i) => i !== position);
    setUsedIndices(next);
    report(next);
  };

  return (
    <div className="space-y-5">
      <div className="min-h-[4rem] rounded-2xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 flex flex-wrap gap-2 items-center">
        {usedIndices.length === 0 && <span className="text-xs text-[var(--color-text-tertiary)]">Tap words below to build the sentence…</span>}
        {usedIndices.map((wordIdx, pos) => (
          <button
            key={pos}
            type="button"
            disabled={checked}
            onClick={() => removeAt(pos)}
            className="rounded-lg bg-primary-100 dark:bg-primary-900/30 border border-primary-400 px-3 py-1.5 text-sm font-semibold text-primary-700 dark:text-primary-300"
          >
            {wordBank[wordIdx]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {wordBank.map((word, idx) => (
          <button
            key={idx}
            type="button"
            disabled={checked || usedIndices.includes(idx)}
            onClick={() => addWord(idx)}
            className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all ${
              usedIndices.includes(idx)
                ? 'opacity-30 cursor-not-allowed border-[var(--color-border-subtle)] text-[var(--color-text-tertiary)]'
                : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/20'
            }`}
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// Swipe Sort — interactive answer for QuizView
// ===========================================================================
function SwipeSortAnswer({
  cards, leftLabel, rightLabel, checked, onChange,
}: {
  cards: { text: string }[]; leftLabel: string; rightLabel: string; checked: boolean;
  onChange: (sorted: { text: string; side: 'left' | 'right' }[] | null) => void;
}) {
  const [assigned, setAssigned] = useState<{ text: string; side: 'left' | 'right' }[]>([]);

  const getSide = (text: string) => assigned.find((s) => s.text === text)?.side;

  const assign = (text: string, side: 'left' | 'right') => {
    const next = [...assigned.filter((s) => s.text !== text), { text, side }];
    setAssigned(next);
    onChange(next.length === cards.length ? next : null);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 mb-2 text-center">
        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">⬅ {leftLabel}</div>
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">{rightLabel} ➡</div>
      </div>
      {cards.map((card, idx) => {
        const side = getSide(card.text);
        return (
          <div key={idx} className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-2">
            <button
              type="button"
              disabled={checked}
              onClick={() => assign(card.text, 'left')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${side === 'left' ? 'bg-rose-500 text-white' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)] hover:bg-rose-100 dark:hover:bg-rose-950/30'}`}
            >
              ⬅
            </button>
            <div className="flex-1 text-sm font-medium text-[var(--color-text-primary)] text-center">{card.text}</div>
            <button
              type="button"
              disabled={checked}
              onClick={() => assign(card.text, 'right')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${side === 'right' ? 'bg-blue-500 text-white' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)] hover:bg-blue-100 dark:hover:bg-blue-950/30'}`}
            >
              ➡
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Listen & Write — interactive answer for QuizView
// ===========================================================================
function ListenWriteAnswer({
  audioUrl, hint, checked, onChange,
}: {
  audioUrl: string; hint?: string; checked: boolean; onChange: (val: string | null) => void;
}) {
  const [value, setValue] = useState('');
  const [showHint, setShowHint] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleChange = (val: string) => {
    setValue(val);
    onChange(val.trim() ? val : null);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-5 flex flex-col items-center gap-3">
        {audioUrl ? (
          <>
            <button
              type="button"
              onClick={() => audioRef.current?.play()}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-lg"
              aria-label="Play audio"
            >
              ▶
            </button>
            <audio ref={audioRef} src={audioUrl} controls className="w-full h-9" />
          </>
        ) : (
          <p className="text-xs text-[var(--color-text-tertiary)]">Audio unavailable.</p>
        )}
      </div>
      <input
        type="text"
        value={value}
        disabled={checked}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Type what you heard..."
        className="w-full rounded-2xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-5 py-4 text-sm font-medium text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors disabled:opacity-70"
      />
      {hint && (
        <div className="text-center">
          <button type="button" onClick={() => setShowHint((s) => !s)} className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline">
            💡 {showHint ? hint : 'Show hint'}
          </button>
        </div>
      )}
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
          <div className="prose prose-sm dark:prose-invert max-w-none text-[var(--color-text-primary)] bg-[var(--color-surface-secondary)] rounded-xl p-4 border border-[var(--color-border-default)]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(assignment.instructions) }} />
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