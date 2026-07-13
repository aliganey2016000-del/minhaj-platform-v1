/**
 * Course Content Builder — Enterprise-grade drag-and-drop curriculum builder.
 *
 * Supports: modules (chapters), lessons, quizzes, assignments with full
 * reordering, inline editing, publish/draft workflow, autosave, and
 * responsive dark mode.
 */

import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCourseContent, useAutoSave, generateTempId } from './course-builder.api';
import { AssignmentEditor } from './components/builder-assignment-editor';
import type {
  ChapterItem,
  CourseContent,
  QuizItem,
  AssignmentItem,
  DragPayload,
} from './course-builder.types';

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

// ---------------------------------------------------------------------------
// Type icon + color helpers
// ---------------------------------------------------------------------------
const itemTypeMeta: Record<string, { icon: string; label: string; color: string }> = {
  lesson: { icon: '📖', label: 'Lesson', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  quiz: { icon: '❓', label: 'Quiz', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  assignment: { icon: '📋', label: 'Assignment', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function CourseBuilder() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const {
    content,
    loading,
    saving,
    error,
    lastSaved,
    fetchContent,
    saveContent,
    reorderChapters,
    reorderItems,
    toggleChapterCollapse,
    updateContentLocally,
  } = useCourseContent(courseId!);

  // Auto-save
  const { saveNow } = useAutoSave(
    useCallback(() => saveContent(), [saveContent]),
    content,
    4000,
  );

  // Local UI state
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [editingChapterIdx, setEditingChapterIdx] = useState<number | null>(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState('');
  const [editingItem, setEditingItem] = useState<{
    chapterIdx: number;
    itemIdx: number;
  } | null>(null);
  const [addingItemChapter, setAddingItemChapter] = useState<number | null>(null);

  // Drag state
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [dragOverChapterIdx, setDragOverChapterIdx] = useState<number | null>(null);
  const [dragOverItemIdx, setDragOverItemIdx] = useState<{ chapterIdx: number; itemIdx: number } | null>(null);

  // Notification toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // -----------------------------------------------------------------------
  // Chapter CRUD
  // -----------------------------------------------------------------------
  const handleAddChapter = () => {
    if (!newChapterTitle.trim()) return;
    updateContentLocally((prev) => ({
      ...prev,
      chapters: [
        ...prev.chapters,
        {
          _id: generateTempId(),
          title: newChapterTitle.trim(),
          order: prev.chapters.length,
          status: 'draft' as const,
          collapsed: false,
          items: [],
          _isNew: true,
        },
      ],
    }));
    setNewChapterTitle('');
    setAddingChapter(false);
  };

  const handleDeleteChapter = (chapterIdx: number) => {
    if (!window.confirm('Delete this module and all its content?')) return;
    updateContentLocally((prev) => ({
      ...prev,
      chapters: prev.chapters
        .filter((_, i) => i !== chapterIdx)
        .map((ch, i) => ({ ...ch, order: i })),
    }));
  };

  const handleUpdateChapterTitle = (chapterIdx: number) => {
    if (!editingChapterTitle.trim()) return;
    updateContentLocally((prev) => ({
      ...prev,
      chapters: prev.chapters.map((ch, i) =>
        i === chapterIdx ? { ...ch, title: editingChapterTitle.trim() } : ch,
      ),
    }));
    setEditingChapterIdx(null);
  };

  const handleToggleChapterStatus = (chapterIdx: number) => {
    updateContentLocally((prev) => ({
      ...prev,
      chapters: prev.chapters.map((ch, i) =>
        i === chapterIdx
          ? { ...ch, status: ch.status === 'published' ? 'draft' : 'published' as const }
          : ch,
      ),
    }));
  };

  // -----------------------------------------------------------------------
  // Item CRUD
  // -----------------------------------------------------------------------
  const handleAddItem = async (chapterIdx: number, type: 'lesson' | 'quiz' | 'assignment') => {
    if (!content) return;
    const baseItem: any = {
      _id: generateTempId(),
      type,
      order: content.chapters[chapterIdx]?.items.length || 0,
      status: 'draft',
      duration: 0,
      _isNew: true,
      _isEditing: true,
    };

    if (type === 'lesson') {
      baseItem.title = 'New Lesson';
      baseItem.content = '';
      baseItem.videoUrl = '';
      baseItem.videoDuration = 0;
      baseItem.featuredImage = '';
      baseItem.attachments = [];
    } else if (type === 'quiz') {
      baseItem.title = 'New Quiz';
      baseItem.description = '';
      baseItem.questions = [];
      baseItem.passingScore = 60;
      baseItem.timeLimit = 0;
    } else if (type === 'assignment') {
      baseItem.title = 'New Assignment';
      baseItem.description = '';
      baseItem.instructions = '';
      baseItem.maxScore = 100;
      baseItem.allowedFileTypes = [];
      baseItem.attachments = [];
    }

    const newContent: CourseContent = {
      ...content,
      chapters: content.chapters.map((ch, i) =>
        i === chapterIdx ? { ...ch, items: [...ch.items, baseItem] } : ch,
      ),
    };

    updateContentLocally(() => newContent);
    setAddingItemChapter(null);

    if (type === 'lesson' || type === 'quiz') {
      // Persist immediately so the dedicated edit page can find this
      // lesson/quiz via a fresh fetch right after navigating.
      try {
        await saveContent(newContent);
        navigate(`/admin/courses/${courseId}/${type === 'lesson' ? 'lessons' : 'quizzes'}/${baseItem._id}/edit`);
      } catch {
        showToast(`Failed to create ${type}. Please try again.`, 'error');
      }
    } else {
      const newItemIdx = content.chapters[chapterIdx]?.items.length || 0;
      setEditingItem({ chapterIdx, itemIdx: newItemIdx });
    }
  };

  const handleDeleteItem = (chapterIdx: number, itemIdx: number) => {
    if (!window.confirm('Delete this item?')) return;
    updateContentLocally((prev) => ({
      ...prev,
      chapters: prev.chapters.map((ch, i) =>
        i === chapterIdx
          ? { ...ch, items: ch.items.filter((_, j) => j !== itemIdx).map((it, j) => ({ ...it, order: j })) }
          : ch,
      ),
    }));
    setEditingItem(null);
  };

  const handleSaveItem = (chapterIdx: number, itemIdx: number, updatedItem: ChapterItem) => {
    updateContentLocally((prev) => ({
      ...prev,
      chapters: prev.chapters.map((ch, i) =>
        i === chapterIdx
          ? {
              ...ch,
              items: ch.items.map((it, j) =>
                j === itemIdx ? { ...updatedItem, _isEditing: false, _isNew: false } : it,
              ),
            }
          : ch,
      ),
    }));
    setEditingItem(null);
  };

  const handleToggleItemStatus = (chapterIdx: number, itemIdx: number) => {
    updateContentLocally((prev) => ({
      ...prev,
      chapters: prev.chapters.map((ch, i) =>
        i === chapterIdx
          ? {
              ...ch,
              items: ch.items.map((it, j) =>
                j === itemIdx
                  ? { ...it, status: it.status === 'published' ? 'draft' as const : 'published' as const }
                  : it,
              ),
            }
          : ch,
      ),
    }));
  };

  // -----------------------------------------------------------------------
  // Drag & Drop — Chapters
  // -----------------------------------------------------------------------
  const handleChapterDragStart = (e: React.DragEvent, chapterIdx: number) => {
    const ch = content?.chapters[chapterIdx];
    if (!ch) return;
    setDragPayload({ type: 'chapter', chapterIndex: chapterIdx, id: ch._id });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ch._id);
  };

  const handleChapterDragOver = (e: React.DragEvent, chapterIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverChapterIdx(chapterIdx);
  };

  const handleChapterDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    setDragOverChapterIdx(null);
    if (!dragPayload || dragPayload.type !== 'chapter') return;

    const fromIdx = dragPayload.chapterIndex;
    if (fromIdx === targetIdx) return;

    setDragPayload(null);

    updateContentLocally((prev) => {
      const chapters = [...prev.chapters];
      const [moved] = chapters.splice(fromIdx, 1);
      chapters.splice(targetIdx, 0, moved);
      return {
        ...prev,
        chapters: chapters.map((ch, i) => ({ ...ch, order: i })),
      };
    });

    // Persist reorder
    const chapterIds = content?.chapters.map((ch) => ch._id) || [];
    const ids = [...chapterIds];
    const [movedId] = ids.splice(fromIdx, 1);
    ids.splice(targetIdx, 0, movedId);
    reorderChapters(ids).catch(() => fetchContent());
  };

  const handleChapterDragEnd = () => {
    setDragPayload(null);
    setDragOverChapterIdx(null);
  };

  // -----------------------------------------------------------------------
  // Drag & Drop — Items within a chapter
  // -----------------------------------------------------------------------
  const handleItemDragStart = (e: React.DragEvent, chapterIdx: number, itemIdx: number) => {
    const item = content?.chapters[chapterIdx]?.items[itemIdx];
    if (!item) return;
    setDragPayload({
      type: 'chapter-item',
      chapterIndex: chapterIdx,
      itemIndex: itemIdx,
      id: item._id,
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item._id);
  };

  const handleItemDragOver = (e: React.DragEvent, chapterIdx: number, itemIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverItemIdx({ chapterIdx, itemIdx });
  };

  const handleItemDrop = (e: React.DragEvent, targetChapterIdx: number, targetItemIdx: number) => {
    e.preventDefault();
    setDragOverItemIdx(null);
    if (!dragPayload || dragPayload.type !== 'chapter-item') return;
    if (dragPayload.chapterIndex !== targetChapterIdx) return; // Only within same chapter for now

    const fromIdx = dragPayload.itemIndex!;
    if (fromIdx === targetItemIdx) return;

    setDragPayload(null);

    updateContentLocally((prev) => ({
      ...prev,
      chapters: prev.chapters.map((ch, i) => {
        if (i !== targetChapterIdx) return ch;
        const items = [...ch.items];
        const [moved] = items.splice(fromIdx, 1);
        items.splice(targetItemIdx, 0, moved);
        return { ...ch, items: items.map((it, j) => ({ ...it, order: j })) };
      }),
    }));

    // Persist
    const chapter = content?.chapters[targetChapterIdx];
    if (chapter) {
      const itemIds = chapter.items.map((it) => it._id);
      const ids = [...itemIds];
      const [movedId] = ids.splice(fromIdx, 1);
      ids.splice(targetItemIdx, 0, movedId);
      reorderItems(chapter._id, ids).catch(() => fetchContent());
    }
  };

  const handleItemDragEnd = () => {
    setDragPayload(null);
    setDragOverItemIdx(null);
  };

  // -----------------------------------------------------------------------
  // Manual Save
  // -----------------------------------------------------------------------
  const handleManualSave = async () => {
    try {
      await saveNow();
      showToast('Content saved successfully!', 'success');
    } catch {
      showToast('Failed to save. Please try again.', 'error');
    }
  };

  // -----------------------------------------------------------------------
  // Render — Loading
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Loading curriculum...</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render — Error
  // -----------------------------------------------------------------------
  if (error && !content) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="text-center space-y-4">
          <p className="text-red-500">{error}</p>
          <button onClick={fetchContent} className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const chapters = content?.chapters || [];

  // Compute stats
  const totalLessons = chapters.reduce((sum, ch) => sum + ch.items.filter((it) => it.type === 'lesson').length, 0);
  const totalQuizzes = chapters.reduce((sum, ch) => sum + ch.items.filter((it) => it.type === 'quiz').length, 0);
  const totalAssignments = chapters.reduce((sum, ch) => sum + ch.items.filter((it) => it.type === 'assignment').length, 0);
  const publishedChapters = chapters.filter((ch) => ch.status === 'published').length;
  const totalItems = totalLessons + totalQuizzes + totalAssignments;
  const publishedItems = chapters.reduce(
    (sum, ch) => sum + ch.items.filter((it) => it.status === 'published').length,
    0,
  );
  const totalDuration = chapters.reduce(
    (sum, ch) => sum + ch.items.reduce((s, it) => s + (it.duration || 0), 0),
    0,
  );

  // -----------------------------------------------------------------------
  // Render — Main
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-20 left-1/2 -translate-x-1/2 z-[100] rounded-xl px-5 py-3 text-sm font-semibold shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : toast.type === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-primary-600 text-white'
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-5xl px-4 py-20 lg:py-10 space-y-6">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <button
              onClick={() => navigate('/admin/courses')}
              className="text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors mb-1 flex items-center gap-1"
            >
              ← Back to Courses
            </button>
            <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text-primary)]">
              🏗️ Course Content Builder
            </h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
              Drag & drop to organize modules, lessons, quizzes, and assignments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Save status */}
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {saving ? (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  Saving...
                </span>
              ) : lastSaved ? (
                <span className="text-green-600 dark:text-green-400">
                  ✓ Saved {new Date(lastSaved).toLocaleTimeString()}
                </span>
              ) : null}
            </span>

            <button
              onClick={handleManualSave}
              disabled={saving}
              className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50"
            >
              💾 Save Now
            </button>
          </div>
        </motion.div>

        {/* ── Stats Cards ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3"
        >
          <StatCard label="Modules" value={chapters.length} sub={`${publishedChapters} published`} icon="📦" />
          <StatCard label="Lessons" value={totalLessons} sub="" icon="📖" />
          <StatCard label="Quizzes" value={totalQuizzes} sub="" icon="❓" />
          <StatCard label="Assignments" value={totalAssignments} sub="" icon="📋" />
          <StatCard label="Items" value={totalItems} sub={`${publishedItems} published`} icon="📊" />
          <StatCard label="Duration" value={`${totalDuration}m`} sub="total est." icon="⏱️" />
        </motion.div>

        {/* ── Chapters List ── */}
        <div className="space-y-3">
          <AnimatePresence>
            {chapters.length === 0 && (
              <motion.div
                {...fadeUp}
                className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-12 text-center"
              >
                <p className="text-5xl mb-4">📦</p>
                <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
                  No modules yet
                </p>
                <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
                  Start building your curriculum by adding a module below.
                </p>
                <button
                  onClick={() => setAddingChapter(true)}
                  className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
                >
                  + Add First Module
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {chapters.map((chapter, chIdx) => (
            <motion.div
              key={chapter._id}
              layout
              {...fadeUp}
              transition={{ delay: chIdx * 0.05 }}
              draggable
              onDragStart={(e: any) => handleChapterDragStart(e, chIdx)}
              onDragOver={(e: any) => handleChapterDragOver(e, chIdx)}
              onDrop={(e: any) => handleChapterDrop(e, chIdx)}
              onDragEnd={handleChapterDragEnd}
              className={`rounded-2xl border bg-[var(--color-surface-primary)] shadow-card transition-all duration-200 ${
                dragOverChapterIdx === chIdx && dragPayload?.type === 'chapter'
                  ? 'border-primary-400 ring-2 ring-primary-200 dark:ring-primary-800 scale-[1.01]'
                  : 'border-[var(--color-border-default)]'
              }`}
            >
              {/* Chapter Header */}
              <div className="flex items-center gap-3 px-5 py-4">
                {/* Drag Handle */}
                <span className="cursor-grab text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors select-none text-lg" title="Drag to reorder">
                  ⠿
                </span>

                {/* Collapse Toggle */}
                <button
                  onClick={() => toggleChapterCollapse(chapter._id)}
                  className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  <span className={`inline-block transition-transform duration-200 ${chapter.collapsed ? '' : 'rotate-90'}`}>
                    ▶
                  </span>
                </button>

                {/* Title (edit or display) */}
                {editingChapterIdx === chIdx ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      className="flex-1 rounded-lg border border-primary-400 bg-[var(--color-surface-secondary)] px-3 py-1.5 text-sm font-semibold outline-none ring-1 ring-primary-200"
                      value={editingChapterTitle}
                      onChange={(e) => setEditingChapterTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateChapterTitle(chIdx);
                        if (e.key === 'Escape') setEditingChapterIdx(null);
                      }}
                      autoFocus
                    />
                    <button onClick={() => handleUpdateChapterTitle(chIdx)} className="text-xs text-primary-600 hover:text-primary-700 font-semibold">Save</button>
                    <button onClick={() => setEditingChapterIdx(null)} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">Cancel</button>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-[var(--color-text-tertiary)] bg-[var(--color-surface-tertiary)] rounded-md px-1.5 py-0.5">
                      {chIdx + 1}
                    </span>
                    <h3 className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                      {chapter.title}
                    </h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      chapter.status === 'published'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                    }`}>
                      {chapter.status}
                    </span>
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {chapter.items.length} items
                    </span>
                  </div>
                )}

                {/* Chapter Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingChapterIdx(chIdx);
                      setEditingChapterTitle(chapter.title);
                    }}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-xs"
                    title="Rename"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleToggleChapterStatus(chIdx)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-xs"
                    title={chapter.status === 'published' ? 'Unpublish' : 'Publish'}
                  >
                    {chapter.status === 'published' ? '📥' : '📤'}
                  </button>
                  <button
                    onClick={() => handleDeleteChapter(chIdx)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-xs"
                    title="Delete module"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Chapter Body (items) */}
              <AnimatePresence>
                {!chapter.collapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4 space-y-2">
                      {/* Chapter description */}
                      {chapter.description && (
                        <p className="text-xs text-[var(--color-text-tertiary)] pb-2 border-b border-[var(--color-border-subtle)]">
                          {chapter.description}
                        </p>
                      )}

                      {/* Items */}
                      {chapter.items.length === 0 && (
                        <p className="text-xs text-[var(--color-text-tertiary)] py-4 text-center border border-dashed border-[var(--color-border-default)] rounded-lg">
                          No lessons, quizzes, or assignments yet. Add one below.
                        </p>
                      )}

                      {chapter.items.map((item, itemIdx) => (
                        <div key={item._id}>
                          <div
                            draggable
                            onDragStart={(e: any) => handleItemDragStart(e, chIdx, itemIdx)}
                            onDragOver={(e: any) => handleItemDragOver(e, chIdx, itemIdx)}
                            onDrop={(e: any) => handleItemDrop(e, chIdx, itemIdx)}
                            onDragEnd={handleItemDragEnd}
                            className={`flex items-center gap-3 rounded-xl border p-3 transition-all duration-150 group ${
                              dragOverItemIdx?.chapterIdx === chIdx && dragOverItemIdx?.itemIdx === itemIdx && dragPayload?.type === 'chapter-item'
                                ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-950/20'
                                : 'border-transparent hover:border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'
                            }`}
                          >
                            {/* Item drag handle */}
                            <span className="cursor-grab text-[var(--color-text-tertiary)] select-none text-sm">
                              ⠿
                            </span>

                            {/* Type badge */}
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${itemTypeMeta[item.type]?.color || 'bg-gray-100 text-gray-600'}`}>
                              {itemTypeMeta[item.type]?.icon} {itemTypeMeta[item.type]?.label}
                            </span>

                            {/* Title + meta */}
                            <div
                              className={`flex-1 min-w-0 ${item.type === 'lesson' || item.type === 'quiz' ? 'cursor-pointer' : ''}`}
                              onClick={() => {
                                if (item.type === 'lesson') {
                                  navigate(`/admin/courses/${courseId}/lessons/${item._id}/edit`);
                                } else if (item.type === 'quiz') {
                                  navigate(`/admin/courses/${courseId}/quizzes/${item._id}/edit`);
                                }
                              }}
                            >
                              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                {item.title}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                                <span>{item.duration || 0} min</span>
                                <span>·</span>
                                <span className={`${
                                  item.status === 'published'
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}>
                                  {item.status}
                                </span>
                                {item.type === 'quiz' && (
                                  <>
                                    <span>·</span>
                                    <span>{(item as QuizItem).questions?.length || 0} questions</span>
                                  </>
                                )}
                                {item.type === 'assignment' && (
                                  <>
                                    <span>·</span>
                                    <span>Max {(item as AssignmentItem).maxScore} pts</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Item Actions */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  if (item.type === 'lesson') navigate(`/admin/courses/${courseId}/lessons/${item._id}/edit`);
                                  else if (item.type === 'quiz') navigate(`/admin/courses/${courseId}/quizzes/${item._id}/edit`);
                                  else setEditingItem({ chapterIdx: chIdx, itemIdx });
                                }}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors text-xs"
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleToggleItemStatus(chIdx, itemIdx)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-xs"
                                title={item.status === 'published' ? 'Unpublish' : 'Publish'}
                              >
                                {item.status === 'published' ? '📥' : '📤'}
                              </button>
                              <button
                                onClick={() => handleDeleteItem(chIdx, itemIdx)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-xs"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          {/* Item Editor (inline) — lessons & quizzes now open a dedicated full-page editor instead */}
                          <AnimatePresence>
                            {editingItem?.chapterIdx === chIdx && editingItem?.itemIdx === itemIdx && (
                              <motion.div {...scaleIn} className="mt-2">
                                {item.type === 'assignment' && (
                                  <AssignmentEditor
                                    assignment={item as AssignmentItem}
                                    onSave={(updated) => handleSaveItem(chIdx, itemIdx, updated)}
                                    onCancel={() => setEditingItem(null)}
                                  />
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}

                      {/* Add Item Row */}
                      {addingItemChapter === chIdx ? (
                        <motion.div {...scaleIn} className="flex items-center gap-2 p-2 border border-dashed border-primary-400 rounded-xl bg-primary-50/50 dark:bg-primary-950/20">
                          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Add:</span>
                          <button onClick={() => handleAddItem(chIdx, 'lesson')} className="rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-3 py-1.5 text-xs font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors">
                            📖 Lesson
                          </button>
                          <button onClick={() => handleAddItem(chIdx, 'quiz')} className="rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-3 py-1.5 text-xs font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors">
                            ❓ Quiz
                          </button>
                          <button onClick={() => handleAddItem(chIdx, 'assignment')} className="rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-3 py-1.5 text-xs font-semibold hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-colors">
                            📋 Assignment
                          </button>
                          <button onClick={() => setAddingItemChapter(null)} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] ml-2">
                            Cancel
                          </button>
                        </motion.div>
                      ) : (
                        <button
                          onClick={() => setAddingItemChapter(chIdx)}
                          className="w-full text-center text-xs font-medium text-[var(--color-text-tertiary)] hover:text-primary-600 dark:hover:text-primary-400 py-2 border border-dashed border-[var(--color-border-default)] rounded-lg hover:border-primary-400 transition-colors"
                        >
                          + Add Lesson, Quiz, or Assignment
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* ── Add Chapter ── */}
        {addingChapter ? (
          <motion.div
            {...scaleIn}
            className="rounded-2xl border border-dashed border-primary-400 bg-primary-50/30 dark:bg-primary-950/20 p-4 flex items-center gap-3"
          >
            <span className="text-sm font-semibold text-[var(--color-text-secondary)]">New Module:</span>
            <input
              className="flex-1 rounded-lg border border-primary-300 bg-[var(--color-surface-primary)] px-3 py-2 text-sm outline-none ring-1 ring-primary-200"
              placeholder="Module title..."
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddChapter();
                if (e.key === 'Escape') { setAddingChapter(false); setNewChapterTitle(''); }
              }}
              autoFocus
            />
            <button onClick={handleAddChapter} className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-semibold hover:bg-primary-700 transition-colors">
              Add
            </button>
            <button onClick={() => { setAddingChapter(false); setNewChapterTitle(''); }} className="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
              Cancel
            </button>
          </motion.div>
        ) : (
          <motion.button
            {...fadeUp}
            onClick={() => setAddingChapter(true)}
            className="w-full rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 text-sm font-semibold text-[var(--color-text-tertiary)] hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-400 transition-all"
          >
            + Add Module
          </motion.button>
        )}

        {/* ── Bottom action bar ── */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-default)]">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Changes are auto-saved every few seconds. You can also save manually.
          </p>
          <button
            onClick={handleManualSave}
            disabled={saving}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? 'Saving...' : '💾 Save All Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card Sub-component
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-card">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium text-[var(--color-text-tertiary)]">{label}</span>
      </div>
      <p className="text-xl font-bold text-[var(--color-text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--color-text-tertiary)]">{sub}</p>}
    </div>
  );
}

export default CourseBuilder;