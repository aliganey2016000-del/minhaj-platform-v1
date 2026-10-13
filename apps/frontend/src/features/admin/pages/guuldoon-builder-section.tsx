import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, ExternalLink, Loader2, Plus } from 'lucide-react';
import api from '../../../lib/axios';
import { LessonCard, QuestionCard } from '../components/guuldoon-builder/chapter-card';
import { LessonEditor, QuestionEditor } from '../components/guuldoon-builder/editors';
import { errorMessage, type ChapterContent, type Overview, type QuestionRow } from '../components/guuldoon-builder/types';

type Section = 'lessons' | 'years' | 'practice';
type Editing =
  | { kind: 'lesson'; id: string }
  | { kind: 'question'; id: string }
  | null;

const builderBase = '/guuldoon/admin/builder';
const TITLES: Record<Section, { title: string; tone: string }> = {
  lessons: { title: 'Cashar: akhri cutubka', tone: 'text-emerald-500' },
  years: { title: 'Su’aalaha sanad kasta', tone: 'text-amber-500' },
  practice: { title: 'Tababar', tone: 'text-sky-500' },
};

/** One part of a chapter (lessons, past-exam questions, or practice) on its own page. */
export function GuuldoonBuilderSection() {
  const { courseId, chapterId, section: sectionParam } = useParams<{ courseId: string; chapterId: string; section: string }>();
  const navigate = useNavigate();
  const section: Section | null = sectionParam === 'lessons' || sectionParam === 'years' || sectionParam === 'practice' ? sectionParam : null;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error' } | null>(null);

  const notify = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadContent = useCallback(async () => {
    if (!courseId || !chapterId) return;
    try {
      const [overviewResponse, contentResponse] = await Promise.all([
        api.get(`${builderBase}/courses/${courseId}`),
        api.get(`${builderBase}/courses/${courseId}/chapters/${encodeURIComponent(chapterId)}`),
      ]);
      setOverview(overviewResponse.data.data);
      setContent(contentResponse.data.data);
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error, 'Cutubka lama soo rari karin.'));
    } finally {
      setLoading(false);
    }
  }, [courseId, chapterId]);

  useEffect(() => { void loadContent(); }, [loadContent]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [sectionParam]);

  const backToChapters = () => navigate(`/admin/global-courses/${courseId}/guuldoon-builder?chapter=${encodeURIComponent(chapterId || '')}`);
  const onOpenLesson = (lessonId: string) => navigate(`/admin/global-courses/${courseId}/guuldoon-builder/chapters/${encodeURIComponent(chapterId || '')}/lessons/${lessonId}`);
  const onOpenLegacyBuilder = () => navigate(`/admin/courses/${courseId}/builder`);

  const chapters = overview?.chapters || [];
  const chapter = chapters.find(row => row.id === chapterId) || content?.chapter || null;
  const imported = overview?.mode === 'imported';

  const pastExams = useMemo(() => (content?.exams || []).filter(exam => exam.kind !== 'practice').sort((a, b) => b.year - a.year), [content]);
  const practiceExams = useMemo(() => (content?.exams || []).filter(exam => exam.kind === 'practice'), [content]);
  const examLabel = useMemo(() => new Map((content?.exams || []).map(exam => [exam.id, exam.kind === 'practice' ? 'Tababar' : String(exam.year)])), [content]);
  const questionsByExam = useMemo(() => {
    const map = new Map<string, QuestionRow[]>();
    for (const question of content?.questions || []) map.set(question.examId, [...(map.get(question.examId) || []), question]);
    return map;
  }, [content]);
  const selectedExam = useMemo(() => {
    if (!pastExams.length) return null;
    const chosen = pastExams.find(exam => exam.year === year);
    if (chosen) return chosen;
    return pastExams.find(exam => (questionsByExam.get(exam.id) || []).length) || pastExams[0];
  }, [pastExams, year, questionsByExam]);
  const practiceQuestions = useMemo(() => practiceExams.flatMap(exam => questionsByExam.get(exam.id) || []), [practiceExams, questionsByExam]);

  const run = async (action: () => Promise<unknown>, success: string, closeEditor = true) => {
    setSaving(true);
    setEditError('');
    try {
      await action();
      await loadContent();
      notify(success);
      if (closeEditor) setEditing(null);
    } catch (error) {
      const message = errorMessage(error, 'Lama kaydin karin.');
      if (closeEditor) setEditError(message); else notify(message, 'error');
    } finally {
      setSaving(false);
    }
  };
  const patchExam = (examId: string, body: Record<string, unknown>, message: string) =>
    run(() => api.patch(`/guuldoon/admin/exams/${examId}`, body), message, false);

  const roundButton = 'rounded-xl border px-3 py-2 text-xs font-black';

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;
  if (!section || !courseId || !chapterId || !content || !chapter) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <button onClick={backToChapters} className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Cutubyada</button>
        <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{loadError || 'Bogga lama helin.'}</div>
      </div>
    );
  }
  const meta = TITLES[section];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <button onClick={backToChapters} className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Cutubyada · {chapter.title}</button>
      <header className="student-glass-card rounded-[24px] p-4 sm:p-5">
        <p className={`text-[11px] font-black uppercase tracking-[.16em] ${meta.tone}`}>{`Cutub ${chapter.order}`}</p>
        <h1 className="mt-1 break-words text-xl font-black sm:text-2xl" dir="auto">{meta.title}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]" dir="auto">{chapter.title}</p>
      </header>
      {loadError && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500">{loadError}</div>}

      <div className="space-y-2">
            {section === 'lessons' && (
              <div className="space-y-2">
                {content.lessons.map((lesson, lessonIndex) => editing?.kind === 'lesson' && editing.id === lesson.id ? (
                  <LessonEditor
                    key={lesson.id}
                    lesson={lesson}
                    saving={saving}
                    error={editError}
                    onCancel={() => { setEditing(null); setEditError(''); }}
                    onSave={payload => void run(() => api.patch(`${builderBase}/lessons/${lesson.id}`, payload), 'Casharka waa la kaydiyay')}
                    onDelete={() => void run(() => api.delete(`${builderBase}/lessons/${lesson.id}`), 'Casharka waa la tirtiray')}
                  />
                ) : (
                  <LessonCard key={lesson.id} lesson={lesson} index={lessonIndex} onOpen={() => onOpenLesson(lesson.id)} onEdit={() => { setEditError(''); setEditing({ kind: 'lesson', id: lesson.id }); }} />
                ))}
                {!content.lessons.length && editing?.kind !== 'lesson' && <p className="py-2 text-xs text-[var(--color-text-tertiary)]">Cashar wali looma gelin cutubkan.</p>}
                {editing?.kind === 'lesson' && editing.id === 'new' && (
                  <LessonEditor
                    lesson={null}
                    saving={saving}
                    error={editError}
                    onCancel={() => { setEditing(null); setEditError(''); }}
                    onSave={payload => void run(() => api.post(`${builderBase}/courses/${courseId}/chapters/${encodeURIComponent(chapter.id)}/lessons`, payload), 'Casharka waa la abuuray')}
                  />
                )}
                {imported && editing?.kind !== 'lesson' && <button type="button" onClick={() => { setEditError(''); setEditing({ kind: 'lesson', id: 'new' }); }} className="inline-flex items-center gap-1 rounded-xl border border-dashed border-[var(--color-border-default)] px-3 py-2 text-xs font-bold"><Plus size={14} /> Cashar cusub</button>}
                {!imported && <button type="button" onClick={onOpenLegacyBuilder} className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-bold"><ExternalLink size={14} /> Wax ka beddel Chapters & Lessons</button>}
              </div>
            )}
            {section === 'years' && selectedExam && (
              <div className="space-y-2">
                <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1" role="group" aria-label="Dooro sanad">
                  {pastExams.map(exam => (
                    <button key={exam.id} type="button" aria-pressed={selectedExam.id === exam.id} onClick={() => { setYear(exam.year); setEditing(null); }} className={'shrink-0 rounded-lg px-3 py-1.5 text-xs font-black tabular-nums ' + (selectedExam.id === exam.id ? 'bg-amber-500 text-white' : 'text-[var(--color-text-secondary)]')}>
                      {exam.year}<span className="ml-1 opacity-70">{(questionsByExam.get(exam.id) || []).length}</span>{!exam.published && <span className="ml-1 opacity-70" title="Draft">·d</span>}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button type="button" disabled={saving} onClick={() => void patchExam(selectedExam.id, { published: !selectedExam.published }, selectedExam.published ? 'Imtixaanka waa la qariyay' : 'Imtixaanka waa la daabacay')} className={`${roundButton} ${selectedExam.published ? 'border-emerald-500/40 text-emerald-500' : 'border-slate-500/40'}`}>{selectedExam.published ? 'Published · Unpublish' : 'Draft · Publish'}</button>
                  <button type="button" disabled={saving} onClick={() => void patchExam(selectedExam.id, { answerKeyStatus: selectedExam.answerKeyStatus === 'verified' ? 'pending' : 'verified' }, 'Xaaladda answer key waa la beddelay')} className={`${roundButton} ${selectedExam.answerKeyStatus === 'verified' ? 'border-emerald-500/40 text-emerald-500' : 'border-amber-500/40 text-amber-500'}`}>Answer key: {selectedExam.answerKeyStatus}</button>
                </div>
                {(questionsByExam.get(selectedExam.id) || []).map(question => editing?.kind === 'question' && editing.id === question.id ? (
                  <QuestionEditor
                    key={question.id}
                    question={question}
                    chapters={chapters}
                    exams={content.exams}
                    defaultExamId={question.examId}
                    defaultChapterId={chapter.id}
                    saving={saving}
                    error={editError}
                    onCancel={() => { setEditing(null); setEditError(''); }}
                    onSave={payload => void run(() => api.patch(`${builderBase}/questions/${question.id}`, payload), 'Su’aasha waa la kaydiyay')}
                    onDelete={() => void run(() => api.delete(`${builderBase}/questions/${question.id}`), 'Su’aasha waa la tirtiray')}
                  />
                ) : (
                  <QuestionCard key={question.id} question={question} years={examLabel} onEdit={() => { setEditError(''); setEditing({ kind: 'question', id: question.id }); }} />
                ))}
                {!(questionsByExam.get(selectedExam.id) || []).length && editing?.kind !== 'question' && <p className="py-2 text-xs text-[var(--color-text-tertiary)]">Sannadkan cutubkan su’aalo kuma jiraan.</p>}
                {editing?.kind === 'question' && editing.id === 'new' ? (
                  <QuestionEditor
                    question={null}
                    newType="mcq"
                    chapters={chapters}
                    exams={content.exams}
                    defaultExamId={selectedExam.id}
                    defaultChapterId={chapter.id}
                    saving={saving}
                    error={editError}
                    onCancel={() => { setEditing(null); setEditError(''); }}
                    onSave={payload => void run(() => api.post(`${builderBase}/courses/${courseId}/questions`, payload), 'Su’aasha waa la abuuray')}
                  />
                ) : (
                  <button type="button" onClick={() => { setEditError(''); setEditing({ kind: 'question', id: 'new' }); }} className="inline-flex items-center gap-1 rounded-xl border border-dashed border-[var(--color-border-default)] px-3 py-2 text-xs font-bold"><Plus size={14} /> Su’aal cusub</button>
                )}
              </div>
            )}
            {!practiceExams.length && <p className="pl-3 text-[11px] text-[var(--color-text-tertiary)] sm:pl-6"><BookOpen size={12} className="mr-1 inline" />Tababar ma jiro. Ku dar imtixaan <code>kind = practice</code> Excel-ka.</p>}
            {section === 'practice' && (
              <div className="space-y-2">
                {practiceQuestions.map(question => editing?.kind === 'question' && editing.id === question.id ? (
                  <QuestionEditor
                    key={question.id}
                    question={question}
                    chapters={chapters}
                    exams={content.exams}
                    defaultExamId={question.examId}
                    defaultChapterId={chapter.id}
                    saving={saving}
                    error={editError}
                    onCancel={() => { setEditing(null); setEditError(''); }}
                    onSave={payload => void run(() => api.patch(`${builderBase}/questions/${question.id}`, payload), 'Su’aasha waa la kaydiyay')}
                    onDelete={() => void run(() => api.delete(`${builderBase}/questions/${question.id}`), 'Su’aasha waa la tirtiray')}
                  />
                ) : (
                  <QuestionCard key={question.id} question={question} years={examLabel} onEdit={() => { setEditError(''); setEditing({ kind: 'question', id: question.id }); }} />
                ))}
                {!practiceQuestions.length && editing?.kind !== 'question' && <p className="py-2 text-xs text-[var(--color-text-tertiary)]">Cutubkan su’aalo tababar ah kuma jiraan.</p>}
                {editing?.kind === 'question' && editing.id === 'new' ? (
                  <QuestionEditor
                    question={null}
                    newType="mcq"
                    chapters={chapters}
                    exams={content.exams}
                    defaultExamId={practiceExams[0].id}
                    defaultChapterId={chapter.id}
                    saving={saving}
                    error={editError}
                    onCancel={() => { setEditing(null); setEditError(''); }}
                    onSave={payload => void run(() => api.post(`${builderBase}/courses/${courseId}/questions`, payload), 'Su’aasha waa la abuuray')}
                  />
                ) : (
                  <button type="button" onClick={() => { setEditError(''); setEditing({ kind: 'question', id: 'new' }); }} className="inline-flex items-center gap-1 rounded-xl border border-dashed border-[var(--color-border-default)] px-3 py-2 text-xs font-bold"><Plus size={14} /> Su’aal cusub</button>
                )}
              </div>
            )}
      </div>

      {toast && (
        <div role="status" aria-live="polite" className={'fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-xl ' + (toast.tone === 'error' ? 'bg-red-600' : 'bg-slate-900')}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
