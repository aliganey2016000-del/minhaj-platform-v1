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

  const found = (() => {
    if (!content || !quizId) return { chapterIdx: -1, itemIdx: -1, quiz: null as QuizItem | null };
    for (let ci = 0; ci < content.chapters.length; ci++) {
      const items = content.chapters[ci].items || [];
      for (let ii = 0; ii < items.length; ii++) {
        const item = items[ii];
        if (item._id === quizId && item.type === 'quiz') return { chapterIdx: ci, itemIdx: ii, quiz: item as QuizItem };
      }
    }
    return { chapterIdx: -1, itemIdx: -1, quiz: null as QuizItem | null };
  })();
  const { chapterIdx, itemIdx, quiz } = found;

  useEffect(() => {
    if (quiz?.randomConfig?.enabled) {
      setMode('random');
      setRandomConfig(quiz.randomConfig);
    }
  }, [quiz?.randomConfig?.enabled, quiz?.randomConfig]);

  const handleSave = async (updated: QuizItem) => {
    if (!content || chapterIdx === -1 || itemIdx === -1) return;
    const nextContent: CourseContent = {
      ...content,
      chapters: content.chapters.map((ch, ci) => ci === chapterIdx
        ? { ...ch, items: ch.items.map((it, ii) => ii === itemIdx ? { ...updated, _isEditing: false, _isNew: false } : it) }
        : ch),
    };
    setSaving(true);
    setSaveError('');
    updateContentLocally(() => nextContent);
    try { await saveContent(nextContent); backToBuilder(); }
    catch { setSaveError('Failed to save quiz. Please try again.'); }
    finally { setSaving(false); }
  };

  const handleRandomSave = () => {
    if (!quiz || !randomConfig) { setSaveError('Configure the Random Quiz Generator and review the quiz before saving.'); return; }
    void handleSave({ ...quiz, randomConfig: { ...randomConfig, enabled: true } });
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]"><div className="flex flex-col items-center gap-4"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /><p className="text-sm text-[var(--color-text-tertiary)]">Loading quiz...</p></div></div>;
  if (error && !content) return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]"><div className="text-center space-y-4"><p className="text-red-500">{error}</p><button onClick={fetchContent} className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white">Retry</button></div></div>;
  if (!quiz) return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]"><div className="text-center space-y-4"><p className="text-4xl">🔍</p><p className="font-semibold text-[var(--color-text-primary)]">Quiz not found</p><button onClick={backToBuilder} className="rounded-xl border px-5 py-2 text-sm font-medium">← Back to Course Builder</button></div></div>;

  return <div className="min-h-screen bg-[var(--color-surface-secondary)]">
    <div className="sticky top-0 z-20 border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 backdrop-blur-md"><div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between gap-4"><div className="min-w-0"><button onClick={backToBuilder} className="text-xs font-medium text-[var(--color-text-tertiary)]">← Back to Course Builder</button><h1 className="text-sm lg:text-base font-bold truncate mt-0.5"><span>❓</span> {content?.chapters[chapterIdx]?.title} · Quiz {itemIdx + 1}</h1></div><div className="flex items-center gap-2"><button type="button" onClick={backToBuilder} className="rounded-xl border px-4 py-2 text-sm font-medium">Cancel</button><button type="button" onClick={mode === 'random' ? handleRandomSave : undefined} form={mode === 'random' ? undefined : FORM_ID} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : '💾 Save Changes'}</button></div></div></div>
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-4">
      {saveError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{saveError}</div>}
      <div className="rounded-2xl border bg-[var(--color-surface-primary)] p-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button type="button" onClick={() => setMode('manual')} className={`rounded-xl px-4 py-3 text-left ${mode === 'manual' ? 'bg-primary-600 text-white' : ''}`}><span className="block text-sm font-bold">✍️ Manual Quiz</span><span className="mt-1 block text-[10px] opacity-80">Write and edit exact questions.</span></button>
        <button type="button" onClick={() => setMode('manual')} className="rounded-xl px-4 py-3 text-left"><span className="block text-sm font-bold">✨ AI Quiz Generator</span><span className="mt-1 block text-[10px] opacity-70">Uses the existing AI generator in the manual editor.</span></button>
        <button type="button" onClick={() => setMode('random')} className={`rounded-xl px-4 py-3 text-left ${mode === 'random' ? 'bg-indigo-600 text-white' : ''}`}><span className="block text-sm font-bold">🎲 Random Quiz Generator</span><span className="mt-1 block text-[10px] opacity-80">Same structure, different questions per student.</span></button>
      </div>
      {mode === 'random' ? <RandomQuizGenerator chapters={content?.chapters || []} quiz={quiz} value={randomConfig || quiz.randomConfig} onChange={setRandomConfig} /> : <QuizEditor quiz={quiz} onSave={handleSave} onCancel={backToBuilder} formId={FORM_ID} hideActions chapters={content?.chapters || []} />}
    </div>
  </div>;
}
export default QuizEditPage;
