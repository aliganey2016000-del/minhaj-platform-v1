/**
 * Lesson Edit Page — Dedicated full-page editor for a single lesson.
 *
 * Replaces the old inline "expand in place" editing flow: navigating here
 * takes over the entire workspace (no chapter/lesson list), with
 * Back / Cancel / Save actions pinned in the header.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCourseContent } from './course-builder.api';
import { LessonEditor } from './components/builder-lesson-editor';
import type { CourseContent, LessonItem } from './course-builder.types';

const FORM_ID = 'lesson-edit-form';

export function LessonEditPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const navigate = useNavigate();

  const { content, loading, error, fetchContent, saveContent, updateContentLocally } = useCourseContent(courseId!);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const backToBuilder = () => navigate(`/admin/courses/${courseId}/builder`);

  // Locate the chapter + item indices for this lesson.
  let chapterIdx = -1;
  let itemIdx = -1;
  let lesson: LessonItem | null = null;
  content?.chapters.forEach((ch, ci) => {
    ch.items.forEach((it, ii) => {
      if (it._id === lessonId && it.type === 'lesson') {
        chapterIdx = ci;
        itemIdx = ii;
        lesson = it as LessonItem;
      }
    });
  });

  const handleSave = async (updated: LessonItem) => {
    if (!content || chapterIdx === -1 || itemIdx === -1) return;
    const nextContent: CourseContent = {
      ...content,
      chapters: content.chapters.map((ch, ci) =>
        ci === chapterIdx
          ? {
              ...ch,
              items: ch.items.map((it, ii) =>
                ii === itemIdx ? { ...updated, _isEditing: false, _isNew: false } : it,
              ),
            }
          : ch,
      ),
    };

    setSaving(true);
    setSaveError('');
    updateContentLocally(() => nextContent);
    try {
      await saveContent(nextContent);
      backToBuilder();
    } catch {
      setSaveError('Failed to save lesson. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Loading lesson...</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Load error
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

  // -----------------------------------------------------------------------
  // Lesson not found (bad id, deleted, or not a lesson item)
  // -----------------------------------------------------------------------
  if (!lesson) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="text-center space-y-4">
          <p className="text-4xl">🔍</p>
          <p className="font-semibold text-[var(--color-text-primary)]">Lesson not found</p>
          <button
            onClick={backToBuilder}
            className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors"
          >
            ← Back to Course Builder
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main — full-page editor, no chapter/lesson list
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      {/* Sticky header: Back / title / Cancel + Save */}
      <div className="sticky top-0 z-20 border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={backToBuilder}
              className="text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-1"
            >
              ← Back to Course Builder
            </button>
            <h1 className="text-sm lg:text-base font-bold text-[var(--color-text-primary)] truncate flex items-center gap-1.5 mt-0.5">
              <span>📖</span> {content?.chapters[chapterIdx]?.title} · Lesson {itemIdx + 1}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={backToBuilder}
              className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form={FORM_ID}
              disabled={saving}
              className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? 'Saving...' : '💾 Save Lesson'}
            </button>
          </div>
        </div>
      </div>

      {/* Editor — 100% of the workspace, no curriculum tree alongside it */}
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        {saveError && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {saveError}
          </div>
        )}

        <LessonEditor lesson={lesson} onSave={handleSave} onCancel={backToBuilder} formId={FORM_ID} hideActions />
      </div>
    </div>
  );
}

export default LessonEditPage;
