import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ExternalLink, Loader2, Pencil, Plus } from 'lucide-react';
import api from '../../../../lib/axios';
import { accentFor, masteryTone } from './accents';
import { ChapterEditor, LessonEditor, QuestionEditor } from './editors';
import { LessonBody, SummaryHero, isSummarySection } from '../../../shared/components/guuldoon-lesson-body';
import { errorMessage, type ChapterContent, type ChapterRow, type LessonRow, type QuestionRow } from './types';

type Section = 'lessons' | 'years' | 'practice' | null;
type Editing =
  | { kind: 'chapter' }
  | { kind: 'lesson'; id: string }
  | { kind: 'question'; id: string }
  | null;

type Props = {
  courseId: string;
  chapter: ChapterRow;
  index: number;
  chapters: ChapterRow[];
  open: boolean;
  imported: boolean;
  onToggle: () => void;
  onChanged: () => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
  onOpenLegacyBuilder: () => void;
};

const builderBase = '/guuldoon/admin/builder';

function QuestionCard({ question, years, onEdit }: { question: QuestionRow; years: Map<string, string>; onEdit: () => void }) {
  const label = years.get(question.examId) || '';
  return (
    <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black">
            <span className="rounded-md bg-slate-500/10 px-2 py-0.5">Q{question.number}</span>
            <span className={'rounded-md px-2 py-0.5 ' + (label === 'Tababar' ? 'bg-sky-500/10 text-sky-500' : 'bg-amber-500/10 text-amber-500')}>{label || '—'}</span>
            <span className={'rounded-md px-2 py-0.5 ' + (question.answerStatus === 'verified' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500')}>{question.answerStatus === 'verified' ? 'Verified' : 'Pending'}</span>
            {question.manuallyEdited && <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-violet-500">La beddelay</span>}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm font-bold leading-6" dir="auto">{question.textSo}</p>
          {question.type === 'mcq' ? (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {question.options.map((option, optionIndex) => (
                <li key={optionIndex} dir="auto" className={'min-w-0 break-words rounded-lg border px-2.5 py-1.5 text-xs ' + (question.answer === optionIndex ? 'border-emerald-500 bg-emerald-500/10 font-black text-emerald-500' : 'border-[var(--color-border-subtle)]')}>
                  {question.answer === optionIndex ? '✓ ' : ''}{option}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]"><span className="font-black">Jawaabta:</span> <span dir="auto" className="whitespace-pre-line">{question.answerDisplay || 'Weli lama gelin'}</span></p>
          )}
        </div>
        <button type="button" onClick={onEdit} aria-label={`Wax ka beddel su’aasha ${question.number}`} className="shrink-0 rounded-xl border border-[var(--color-border-default)] p-2 text-[var(--color-text-tertiary)] hover:border-emerald-500 hover:text-emerald-500"><Pencil size={15} /></button>
      </div>
    </div>
  );
}

/** One-line teaser for the collapsed lesson: the text without callout tags, headings or bold markers. */
function plainPreview(content: string, max = 170): string {
  const text = content
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/^>\s?\[!\w+\]\s*/, '').replace(/^>\s?/, '').replace(/^#{1,3}\s+/, '').replace(/^-\s+/, ''))
    .join(' ')
    .replace(/\*\*/g, '')
    .replace(/\$/g, '')
    .replace(/\{\{fig:[^}]*\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

function LessonCard({ lesson, index, onEdit }: { lesson: LessonRow; index: number; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const accent = accentFor(index);
  const summary = isSummarySection(lesson);
  const pages = lesson.pageFrom ? `Bogga ${lesson.pageFrom}${lesson.pageTo && lesson.pageTo !== lesson.pageFrom ? '–' + lesson.pageTo : ''}` : '';
  const preview = plainPreview(lesson.contentText);
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
      <div className="flex items-start">
        <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${accent.soft} ${accent.text}`}>{summary ? '⭐' : index + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-0 break-words text-sm font-black" dir="auto">{lesson.title}</span>
              {pages && <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-500">{pages}</span>}
              {lesson.type !== 'note' && <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-black text-sky-500">{lesson.type}</span>}
              {lesson.manuallyEdited && <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] font-black text-violet-500">La beddelay</span>}
            </span>
            {!open && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[var(--color-text-secondary)]" dir="auto">{preview || 'Qoraalka casharka wali lama gelin.'}</span>}
          </span>
          <ChevronDown size={18} className={'mt-1.5 shrink-0 text-[var(--color-text-tertiary)] transition-transform ' + (open ? 'rotate-180' : '')} aria-hidden="true" />
        </button>
        {!lesson.readOnly && <button type="button" onClick={onEdit} aria-label={`Wax ka beddel casharka ${lesson.title}`} className="m-3 shrink-0 rounded-xl border border-[var(--color-border-default)] p-2 text-[var(--color-text-tertiary)] hover:border-emerald-500 hover:text-emerald-500"><Pencil size={15} /></button>}
      </div>
      {open && (
        <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary,transparent)] p-4 sm:p-5" dir={lesson.direction === 'rtl' || lesson.language === 'ar' ? 'rtl' : 'auto'}>
          {summary && <div className="mb-4"><SummaryHero /></div>}
          <LessonBody content={lesson.contentText || 'Qoraalka casharka wali lama gelin.'} highlights={[]} visible={false} onOpen={() => undefined} />
        </div>
      )}
    </div>
  );
}

export function GuuldoonBuilderChapterCard({ courseId, chapter, index, chapters, open, imported, onToggle, onChanged, notify, onOpenLegacyBuilder }: Props) {
  const accent = accentFor(index);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [section, setSection] = useState<Section>(null);
  const [year, setYear] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const loadContent = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get(`${builderBase}/courses/${courseId}/chapters/${encodeURIComponent(chapter.id)}`);
      setContent(data.data);
    } catch (error) {
      setLoadError(errorMessage(error, 'Cutubka lama soo rari karin.'));
    } finally {
      setLoading(false);
    }
  }, [courseId, chapter.id]);

  useEffect(() => { if (open) void loadContent(content !== null); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!open) { setSection(null); setEditing(null); setEditError(''); } }, [open]);

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
      await loadContent(true);
      onChanged();
      notify(success);
      if (closeEditor) setEditing(null);
    } catch (error) {
      const message = errorMessage(error, 'Lama kaydin karin.');
      if (closeEditor) setEditError(message); else notify(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (next: Exclude<Section, null>) => {
    setEditing(null);
    setEditError('');
    setSection(current => current === next ? null : next);
  };

  const patchExam = (examId: string, body: Record<string, unknown>, message: string) =>
    run(() => api.patch(`/guuldoon/admin/exams/${examId}`, body), message, false);

  const weak = chapter.avgMastery;
  const tone = weak === null ? null : masteryTone(weak);

  const stepClass = 'flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3';
  const roundButton = 'rounded-xl border px-3 py-2 text-xs font-black';
  const editPen = 'shrink-0 rounded-xl border border-[var(--color-border-default)] p-2 text-[var(--color-text-tertiary)] hover:border-emerald-500 hover:text-emerald-500';

  return (
    <article className="student-glass-card overflow-hidden rounded-[24px]">
      {editing?.kind === 'chapter' ? (
        <div className="p-4">
          <ChapterEditor
            chapter={chapter}
            imported={imported}
            saving={saving}
            error={editError}
            onCancel={() => { setEditing(null); setEditError(''); }}
            onSave={payload => void run(() => api.patch(`${builderBase}/courses/${courseId}/chapters/${encodeURIComponent(chapter.id)}`, payload), 'Cutubka waa la kaydiyay')}
          />
        </div>
      ) : (
        <div className="flex items-start">
          <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 p-4 text-left sm:p-5">
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black ${accent.soft} ${accent.text}`}>{chapter.order || index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 break-words font-black" dir="auto">{chapter.title}</h3>
                  {chapter.titleAr && chapter.titleAr !== chapter.title && <span dir="rtl" className="text-sm font-bold text-[var(--color-text-tertiary)]">{chapter.titleAr}</span>}
                  {chapter.status === 'draft' && <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-black">Draft</span>}
                  {chapter.outsideBook && <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-bold text-violet-500">Buugga ka baxsan</span>}
                  {chapter.manuallyEdited && <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-black text-violet-500">La beddelay</span>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <div className="rounded-xl bg-emerald-500/10 p-2"><strong className="block text-sm text-emerald-500">{chapter.examWeight}%</strong><span className="text-[10px] text-[var(--color-text-tertiary)]">Imtixaanka{chapter.weightSource === 'auto' ? ' · auto' : ''}</span></div>
                  <div className="rounded-xl bg-sky-500/10 p-2"><strong className="block text-sm text-sky-500">{chapter.questionCount}</strong><span className="text-[10px] text-[var(--color-text-tertiary)]">Su’aalo</span></div>
                  <div className="rounded-xl bg-amber-500/10 p-2"><strong className="block text-sm text-amber-500">{chapter.years.length}</strong><span className="text-[10px] text-[var(--color-text-tertiary)]">Sannado</span></div>
                  <div className="rounded-xl bg-violet-500/10 p-2"><strong className="block text-sm text-violet-500">{chapter.lessonCount}</strong><span className="text-[10px] text-[var(--color-text-tertiary)]">Casharro</span></div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs">
                  <span className="shrink-0 font-bold text-[var(--color-text-tertiary)]">Celceliska ardayda</span>
                  {tone && weak !== null ? (
                    <>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full ${tone.bar}`} style={{ width: `${weak}%` }} /></div>
                      <strong className={tone.text}>{weak}%</strong>
                      <span className="hidden text-[10px] text-[var(--color-text-tertiary)] sm:inline">{chapter.masteryStudents} arday</span>
                    </>
                  ) : <span className="text-[var(--color-text-tertiary)]">weli xog ma jirto</span>}
                </div>
              </div>
              <ChevronDown className={'mt-1 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')} size={20} />
            </div>
          </button>
          <button type="button" onClick={() => { if (!open) onToggle(); setEditing({ kind: 'chapter' }); }} aria-label={`Wax ka beddel cutubka ${chapter.title}`} className={`${editPen} m-4 sm:m-5`}><Pencil size={15} /></button>
        </div>
      )}

      {open && (
        <div className="space-y-2 border-t border-[var(--color-border-subtle)] p-4 sm:p-5">
          {loading && !content && <div className="flex items-center gap-2 py-4 text-sm text-[var(--color-text-tertiary)]"><Loader2 size={16} className="animate-spin" /> Waa la soo rarayaa…</div>}
          {loadError && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500">{loadError} <button type="button" className="underline" onClick={() => void loadContent()}>Mar kale isku day</button></div>}

          {content && (
            <>
              {/* 1 · Lessons */}
              <div className={stepClass}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-sm font-black text-emerald-500">1</span>
                <div className="min-w-0 flex-1"><p className="text-sm font-black">Cashar: akhri cutubka</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{content.lessons.length} qaybood</p></div>
                <button type="button" onClick={() => toggleSection('lessons')} aria-expanded={section === 'lessons'} className={`${roundButton} ${section === 'lessons' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-500/30 text-emerald-500'}`}>{section === 'lessons' ? 'Xir' : 'Akhri'}</button>
              </div>
              {section === 'lessons' && (
                <div className="space-y-2 pl-3 sm:pl-6">
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
                    <LessonCard key={lesson.id} lesson={lesson} index={lessonIndex} onEdit={() => { setEditError(''); setEditing({ kind: 'lesson', id: lesson.id }); }} />
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

              {/* 2 · Past-exam questions per year */}
              <div className={stepClass}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-sm font-black text-amber-500">2</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">Su’aalaha sanad kasta</p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">{chapter.years.length ? `${chapter.years.length} sano · ${chapter.questionCount} su’aalood` : 'Su’aalo wali ma jiraan.'}</p>
                </div>
                <button type="button" disabled={!pastExams.length} onClick={() => toggleSection('years')} aria-expanded={section === 'years'} className={`${roundButton} disabled:opacity-40 ${section === 'years' ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-500/30 text-amber-500'}`}>{section === 'years' ? 'Xir' : 'Fur'}</button>
              </div>
              {section === 'years' && selectedExam && (
                <div className="space-y-2 pl-3 sm:pl-6">
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

              {/* 3 · Practice */}
              <div className={stepClass}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sm font-black text-sky-500">3</span>
                <div className="min-w-0 flex-1"><p className="text-sm font-black">Tababar</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{chapter.practiceCount} su’aalood · jawaabaha la hubiyay</p></div>
                <button type="button" disabled={!practiceExams.length} onClick={() => toggleSection('practice')} aria-expanded={section === 'practice'} className={`${roundButton} disabled:opacity-40 ${section === 'practice' ? 'border-sky-500 bg-sky-500 text-white' : 'border-sky-500/30 text-sky-500'}`}>{section === 'practice' ? 'Xir' : 'Fur'}</button>
              </div>
              {!practiceExams.length && <p className="pl-3 text-[11px] text-[var(--color-text-tertiary)] sm:pl-6"><BookOpen size={12} className="mr-1 inline" />Tababar ma jiro. Ku dar imtixaan <code>kind = practice</code> Excel-ka.</p>}
              {section === 'practice' && (
                <div className="space-y-2 pl-3 sm:pl-6">
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
            </>
          )}
        </div>
      )}
    </article>
  );
}

