/**
 * Student Course Detail — Syllabus / Content Overview
 *
 * Two views:
 *   Map View  — gamified"learning path" with connected bubbles/nodes
 *   List View — traditional expandable chapters with lesson list
 *
 * Clicking any unlocked item navigates to the learn page.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import api from '../../../lib/axios';
import type { Chapter, QuizItem, AssignmentItem } from '../../admin/pages/course-builder.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TeacherBrief {
  _id: string; teacherId: string;
  profile?: { firstName: string; lastName: string };
}
interface Progress {
  percent: number; completedLessons: number; completedQuizzes: number;
  completedAssignments: number; totalItems: number; completedItems: number;
  status: 'in_progress' | 'completed'; lastAccessed: string | null;
}
interface Course {
  _id: string; title: { en: string; so: string; ar: string }; slug: string;
  description?: { en: string; so: string; ar: string };
  category: string; level: string; duration: number; fee: number;
  teacher?: TeacherBrief; maxStudents: number; enrolledStudents: number;
  thumbnail?: string; status: string; progress: Progress;
}
interface CourseContent {
  _id?: string; course: string; chapters: Chapter[];
  totalDuration: number; totalLessons: number; totalQuizzes: number; totalAssignments: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const itemTypeIcons: Record<string, string> = { lesson: '📖', quiz: '❓', assignment: '📋' };
const catLabels: Record<string, string> = {
  quran: 'Quran', fiqh: 'Fiqh', aqeedah: 'Aqeedah', seerah: 'Seerah',
  arabic: 'Arabic', tajweed: 'Tajweed', hadith: 'Hadith', akhlaq: 'Akhlaq',
};
const levelLabels: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const levelColors: Record<string, string> = {
  beginner: 'bg-emerald-100 text-emerald-700', intermediate: 'bg-amber-100 text-amber-700', advanced: 'bg-red-100 text-red-700',
};

// ---------------------------------------------------------------------------
type ViewMode = 'map' | 'list';

export function StudentCourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';

  const [course, setCourse] = useState<Course | null>(null);
  const [content, setContent] = useState<CourseContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewMode>('map');
  const [expandedCh, setExpandedCh] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    if (!courseId) return;
    setLoading(true); setError('');
    try {
      const myRes = await api.get('/students/my/courses');
      const courses: Course[] = myRes.data.data || [];
      const found = courses.find((c) => c._id === courseId);
      if (!found) { setError('Course not found.'); setLoading(false); return; }
      setCourse(found);
      const cRes = await api.get(`/courses/${courseId}/content`);
      setContent(cRes.data.data as CourseContent);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to load.');
    } finally { setLoading(false); }
  }, [courseId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getTitle = (c: Course) => {
    if (lang==='so' && c.title?.so) return c.title.so;
    if (lang==='ar' && c.title?.ar) return c.title.ar;
    return c.title?.en || 'Untitled';
  };

  // Flatten all items with chapter metadata
  const flatItems = useMemo(() => {
    if (!content) return [];
    const items: { chapter: Chapter; chIdx: number; itemIdx: number; item: any }[] = [];
    content.chapters.forEach((ch, chIdx) => {
      ch.items.forEach((item, itemIdx) => {
        items.push({ chapter: ch, chIdx, itemIdx, item });
      });
    });
    return items;
  }, [content]);

  const completedCount = (course?.progress?.completedItems || 0) + (course?.progress?.completedLessons || 0) + (course?.progress?.completedQuizzes || 0) + (course?.progress?.completedAssignments || 0);
  // Use the flatItems length for total
  const totalItems = flatItems.length;
  const progressPct = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  const launchLearn = (itemIdx: number) => {
    navigate(`/student/courses/${courseId}/learn`, { state: { startItemIdx: itemIdx } });
  };

  // -------------------------------------------------------------------
  // Loading / Error
  // -------------------------------------------------------------------
  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error || !course) return <div className="flex min-h-[400px] items-center justify-center"><div className="text-center"><p className="text-red-500 mb-4">{error || 'Not found'}</p><button onClick={fetchData} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">Retry</button></div></div>;

  return (
    <div className="p-4 sm:p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => navigate('/student/courses')} className="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mb-2">← {t('my_courses')}</button>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text-primary)]">{getTitle(course)}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">{catLabels[course.category] || course.category}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${levelColors[course.level] || ''}`}>{levelLabels[course.level] || course.level}</span>
            </div>
          </div>
          {/* ── View Toggle ── */}
          <div className="flex rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 gap-0.5 shadow-sm">
            <button onClick={() => setView('map')} className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${view==='map'?'bg-primary-600 text-white shadow-sm':'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>🗺️ Map</button>
            <button onClick={() => setView('list')} className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${view==='list'?'bg-primary-600 text-white shadow-sm':'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>📋 List</button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5 shadow-card">
          <div className="flex items-center justify-between text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
            <span>{t('course_progress')}</span>
            <span>{completedCount} / {totalItems} ({progressPct}%)</span>
          </div>
          <div className="w-full h-3 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${progressPct>=100?'bg-green-500':'bg-gradient-to-r from-primary-500 to-amber-500'}`} style={{width:`${progressPct}%`}}/>
          </div>
        </div>

        {/* ── Map View ── */}
        {view === 'map' && (
          <div className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 sm:p-8 shadow-card overflow-hidden">
            <h2 className="text-lg font-extrabold text-[var(--color-text-primary)] mb-6 flex items-center gap-2">🗺️ Learning Path</h2>
            {/* Roadmap visualization */}
            <div className="relative">
              {/* Vertical path line */}
              <div className="absolute left-6 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-400 via-amber-400 to-green-400 rounded-full" />
              <div className="space-y-6 relative z-10">
                {flatItems.map((fi, idx) => {
                  const isCompleted = idx < completedCount;
                  const isUnlocked = idx === completedCount;
                  const isLocked = idx > completedCount;
                  return (
                    <motion.button
                      key={`${fi.item._id || idx}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      disabled={isLocked}
                      onClick={() => !isLocked && launchLearn(idx)}
                      className={`w-full flex items-center gap-4 text-left group ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {/* Node bubble */}
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 border-2 shadow-md transition-all duration-200 ${
                        isCompleted ? 'bg-green-500 border-green-600 text-white' :
                        isUnlocked ? 'bg-primary-500 border-primary-600 text-white ring-4 ring-primary-200 dark:ring-primary-800' :
                        'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                      }`}>
                        {isCompleted ? '✅' : isLocked ? '🔒' : itemTypeIcons[fi.item.type] || '📖'}
                      </div>
                      {/* Content card */}
                      <div className={`flex-1 rounded-xl px-4 py-3 border-2 transition-colors ${
                        isCompleted ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10' :
                        isUnlocked ? 'border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-950/10 group-hover:border-primary-400' :
                        'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] opacity-50'
                      }`}>
                        <p className="text-xs font-bold text-[var(--color-text-secondary)] mb-0.5">
                          Module {fi.chIdx+1} · {itemTypeIcons[fi.item.type] || '📖'} {fi.item.type}
                        </p>
                        <p className={`text-sm font-extrabold ${isCompleted?'text-green-700 dark:text-green-300':isUnlocked?'text-[var(--color-text-primary)]':'text-[var(--color-text-tertiary)]'}`}>
                          {fi.item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">{fi.item.duration || 0} min</span>
                          {isCompleted && <span className="text-[10px] font-bold text-green-600">✓ Done</span>}
                          {isUnlocked && <span className="text-[10px] font-bold text-primary-600">▶ Start</span>}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
                {flatItems.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">No content yet.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── List View ── */}
        {view === 'list' && (
          <div className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 sm:p-8 shadow-card">
            <h2 className="text-lg font-extrabold text-[var(--color-text-primary)] mb-6 flex items-center gap-2">📋 Course Contents</h2>
            {content?.chapters.map((chapter, chIdx) => {
              const chItems = flatItems.filter(fi => fi.chIdx === chIdx);
              const isExpanded = expandedCh.has(chIdx);
              const chCompleted = chItems.length > 0 && chItems.every(fi => flatItems.indexOf(fi) < completedCount);
              return (
                <div key={chapter._id || chIdx} className="mb-3">
                  <button
                    onClick={() => setExpandedCh(prev => { const next = new Set(prev); next.has(chIdx) ? next.delete(chIdx) : next.add(chIdx); return next; })}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-[var(--color-surface-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                  >
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${chCompleted?'bg-green-500 text-white':'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]'}`}>
                      {chCompleted ? '✓' : chIdx+1}
                    </span>
                    <span className="flex-1 text-left text-sm font-extrabold text-[var(--color-text-primary)]">{chapter.title}</span>
                    <span className="text-xs text-[var(--color-text-tertiary)]">{chItems.length} items</span>
                    <span className="text-sm text-[var(--color-text-tertiary)] transition-transform" style={{transform: isExpanded?'rotate(180deg)':'rotate(0deg)'}}>▼</span>
                  </button>
                  {isExpanded && (
                    <div className="ml-11 mt-1 border-l-2 border-[var(--color-border-subtle)] pl-4 space-y-1.5 pt-2 pb-1">
                      {chItems.map((fi, i) => {
                        const globalIdx = flatItems.indexOf(fi);
                        const isCompleted = globalIdx < completedCount;
                        const isUnlocked = globalIdx === completedCount;
                        const isLocked = globalIdx > completedCount;
                        return (
                          <button
                            key={fi.item._id || i}
                            disabled={isLocked}
                            onClick={() => !isLocked && launchLearn(globalIdx)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-colors ${
                              isCompleted ? 'text-green-700 dark:text-green-300 bg-green-50/50 dark:bg-green-950/10' :
                              isUnlocked ? 'text-[var(--color-text-primary)] hover:bg-primary-50 dark:hover:bg-primary-950/20 ring-1 ring-primary-200 dark:ring-primary-800' :
                              'text-[var(--color-text-tertiary)] opacity-50 cursor-not-allowed'
                            }`}>
                            <span className="w-6 h-6 rounded-lg bg-[var(--color-surface-tertiary)] flex items-center justify-center text-xs">
                              {isLocked ? '🔒' : isCompleted ? '✅' : itemTypeIcons[fi.item.type] || '•'}
                            </span>
                            <span className="flex-1 truncate">{fi.item.title}</span>
                            <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">{fi.item.duration || 0}m</span>
                            {isUnlocked && <span className="text-xs font-bold text-primary-600 flex-shrink-0">Start →</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {(!content || content.chapters.length === 0) && <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">No content yet.</p>}
          </div>
        )}

        {/* ── Quick Action ── */}
        <div className="flex justify-center">
          <button
            onClick={() => {
              const nextIdx = completedCount < totalItems ? completedCount : 0;
              navigate(`/student/courses/${courseId}/learn`, { state: { startItemIdx: nextIdx } });
            }}
            className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-500 px-8 py-3.5 text-base font-extrabold text-white shadow-lg shadow-primary-500/25 hover:shadow-primary-600/30 hover:-translate-y-0.5 active:scale-[0.98] transition-all"
          >
            {course.progress?.status === 'completed' ? '📖 Review Course' : completedCount > 0 ? '▶  Resume Learning' : '🚀 Start Course'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StudentCourseDetail;