/**
 * Exam Paper Edit Page — Dedicated full-page editor for one exam's paper,
 * same pattern as QuizEditPage: navigating here takes over the entire
 * workspace instead of opening in place. Question authoring itself is the
 * shared ExamPaperEditor (also used by Papers & Approval) — same engine as
 * quiz editing.
 */

import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useCourseContent } from './course-builder.api';
import { ExamPaperEditor } from '../components/exam-paper-editor';
import type { ExamItem } from './course-builder.types';

export function ExamPaperEditPage() {
  const { courseId, itemId } = useParams<{ courseId: string; itemId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const { content, loading, error, fetchContent } = useCourseContent(courseId!);

  const basePath = location.pathname.startsWith('/teacher') ? '/teacher' : '/admin';
  const backToBuilder = () => navigate(`${basePath}/courses/${courseId}/builder`);

  const chapterIdx = content?.chapters.findIndex((ch) => ch.items.some((it) => it._id === itemId && it.type === 'exam')) ?? -1;
  const examItem: ExamItem | undefined = chapterIdx >= 0
    ? (content!.chapters[chapterIdx].items.find((it) => it._id === itemId && it.type === 'exam') as ExamItem | undefined)
    : undefined;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Loading exam...</p>
        </div>
      </div>
    );
  }

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

  if (!examItem) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="text-center space-y-4">
          <p className="text-4xl">🔍</p>
          <p className="font-semibold text-[var(--color-text-primary)]">Exam not found</p>
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

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      {/* Sticky header: Back / title — ExamPaperEditor carries its own Save Draft / Submit actions */}
      <div className="sticky top-0 z-20 border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <button
            onClick={backToBuilder}
            className="text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-1"
          >
            ← Back to Course Builder
          </button>
          <h1 className="text-sm lg:text-base font-bold text-[var(--color-text-primary)] truncate flex items-center gap-1.5 mt-0.5">
            <span>🎓</span> {content?.chapters[chapterIdx]?.title} · {examItem.title} — Exam Paper
          </h1>
        </div>
      </div>

      {/* Editor — 100% of the workspace, no curriculum tree alongside it */}
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <ExamPaperEditor examId={examItem.examId} chapters={content?.chapters || []} />
      </div>
    </div>
  );
}

export default ExamPaperEditPage;
