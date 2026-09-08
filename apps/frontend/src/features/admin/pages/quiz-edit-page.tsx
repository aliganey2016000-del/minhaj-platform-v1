/**
 * Quiz Edit Page — Dedicated full-page editor for a single quiz.
 *
 * Manual and AI authoring remain available through QuizEditor. Random Quiz
 * Generator is added as a first-class builder mode without changing the
 * existing manual/AI question engine.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useCourseContent } from './course-builder.api';
import { QuizEditor } from './components/builder-quiz-editor';
import { RandomQuizGenerator } from './components/random-quiz-generator';
import type { CourseContent, QuizItem } from './course-builder.types';
import type { RandomQuizConfig } from './course-builder.random-quiz';

const FORM_ID = 'quiz-edit-form';

type BuilderMode = 'manual' | 'random';

export function QuizEditPage() {
  const { courseId, quizId } = useParams<{ courseId: string; quizId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { content, loading, error, fetchContent, saveContent, updateContentLocally } = useCourseContent(courseId!);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [mode, setMode] = useState<BuilderMode>('manual');
  const [randomConfig, setRandomConfig] = useState<RandomQuizConfig | undefined>();

  const basePath = location.pathname.startsWith('/teacher') ? '/teacher' : '/admin';
  const backToBuilder = () => navigate(`${basePath}/courses/${courseId}/builder`);

  let chapterIdx = -1;
  let itemIdx = -1;
  let quiz: QuizItem | null = null;
  content?.chapters.forEach((ch, ci) => {
    ch.items.forEach((it, ii) => {
      if (it._id === quizId && it.type === 'quiz') {
        chapterIdx = ci;
        itemIdx = ii;
        quiz = it as QuizItem;
      }
    });
  });

  useEffect(() => {
    if (quiz?.randomConfig?.enabled) {
      setMode('random');
      setRandomConfig(quiz.randomConfig);
    }
  }, [quiz?.randomConfig?.enabled]);

  const handleSave = async (updated: QuizItem) => {
    if (!content || chapterIdx === -1 || itemIdx === -1) return;
    const nextContent: CourseContent = {
      ...content,
      chapters: content.chapters.map((ch, ci) =>
        ci === chapterIdx
          ? { ...ch, items: ch.items.map((it, ii) => ii === itemIdx ? { ...updated, _isEditing: false, _isNew: false } : it) }
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
      setSaveError('Failed to save quiz. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRandomSave = () => {
    if (!quiz || !randomConfig) {
      setSaveError('Configure the Random Quiz Generator and review the quiz before saving.');
      return;
    }
    void handleSave({ ...quiz, randomConfig: { ...randomConfig, enabled: true } });
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]"><div className="flex flex-col items-center gap-4"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /><p className="text-sm text-[var(--color-text-tertiary)]">Loading quiz...</p></div></div>;
  }

  if (error && !content) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]"><div className="text-center space-y-4"><p className="text-red-500">{error}</p><button onClick={fetchContent} className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700">Retry</button></div></div>;
  }

  if (!quiz) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]"><div className="text-center space-y-4"><p className="text-4xl">🔍</p><p className="font-semibold text-[var(--color-text-primary)]">Quiz not found</p><button onClick={backToBuilder} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">← Back to Course Builder</button></div></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      <div className="sticky top-0 z-20 border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <button onClick={backToBuilder} className="text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-1">← Back to Course Builder</button>
            <h1 className="text-sm lg:text-base font-bold text-[var(--color-text-primary)] truncate flex items-center gap-1.5 mt-0.5"><span>❓</span> {content?.chapters[chapterIdx]?.title} · Quiz {itemIdx + 1}</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={backToBuilder} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
            <button type="button" onClick={mode === 'random' ? handleRandomSave : undefined} form={mode === 'random' ? undefined : FORM_ID} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">{saving ? 'Saving...' : '💾 Save Changes'}</button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6 space-y-4">
        {saveError && <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">{saveError}</div>}

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button type="button" onClick={() => setMode('manual')} className={`rounded-xl px-4 py-3 text-left transition ${mode === 'manual' ? 'bg-primary-600 text-white shadow-sm' : 'hover:bg-[var(--color-surface-tertiary)]'}`}><span className="block text-sm font-bold">✍️ Manual Quiz</span><span className="mt-1 block text-[10px] opacity-80">Write and edit the exact questions.</span></button>
          <button type="button" onClick={() => setMode('manual')} className="rounded-xl px-4 py-3 text-left transition hover:bg-[var(--color-surface-tertiary)]"><span className="block text-sm font-bold">✨ AI Quiz Generator</span><span className="mt-1 block text-[10px] text-[var(--color-text-secondary)]">Open the existing AI generator inside the manual editor.</span></button>
          <button type="button" onClick={() => setMode('random')} className={`rounded-xl px-4 py-3 text-left transition ${mode === 'random' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-[var(--color-surface-tertiary)]'}`}><span className="block text-sm font-bold">🎲 Random Quiz Generator</span><span className="mt-1 block text-[10px] opacity-80">Same structure, different questions per student.</span></button>
        </div>

        {mode === 'random' ? (
          <RandomQuizGenerator
            chapters={content?.chapters || []}
            quiz={quiz}
            value={randomConfig || quiz.randomConfig}
            onChange={setRandomConfig}
          />
        ) : (
          <QuizEditor quiz={quiz} onSave={handleSave} onCancel={backToBuilder} formId={FORM_ID} hideActions chapters={content?.chapters || []} />
        )}
      </div>
    </div>
  );
}

export default QuizEditPage;
