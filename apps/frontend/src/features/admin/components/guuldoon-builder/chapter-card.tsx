import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import api from '../../../../lib/axios';
import { accentFor, masteryTone } from './accents';
import { ChapterEditor } from './editors';
import { isSummarySection } from '../../../shared/components/guuldoon-lesson-body';
import { errorMessage, type ChapterRow, type LessonRow, type QuestionRow } from './types';

type Section = 'lessons' | 'years' | 'practice' | null;

type Props = {
  courseId: string;
  chapter: ChapterRow;
  index: number;
  open: boolean;
  imported: boolean;
  onToggle: () => void;
  onChanged: () => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
  /** Each part of a chapter opens on its own page. */
  onOpenSection: (section: Exclude<Section, null>) => void;
};

const builderBase = '/guuldoon/admin/builder';

export function QuestionCard({ question, years, onEdit }: { question: QuestionRow; years: Map<string, string>; onEdit: () => void }) {
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

export function LessonCard({ lesson, index, onOpen, onEdit }: { lesson: LessonRow; index: number; onOpen: () => void; onEdit: () => void }) {
  const accent = accentFor(index);
  const summary = isSummarySection(lesson);
  const pages = lesson.pageFrom ? `Bogga ${lesson.pageFrom}${lesson.pageTo && lesson.pageTo !== lesson.pageFrom ? '–' + lesson.pageTo : ''}` : '';
  const body = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${accent.soft} ${accent.text}`}>{summary ? '⭐' : index + 1}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 break-words text-sm font-black" dir="auto">{lesson.title}</span>
        {pages && <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-500">{pages}</span>}
        {lesson.type !== 'note' && <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-black text-sky-500">{lesson.type}</span>}
        {lesson.manuallyEdited && <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] font-black text-violet-500">La beddelay</span>}
      </span>
    </>
  );
  return (
    <div className="flex items-center rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
      {lesson.readOnly ? (
        <div className="flex min-w-0 flex-1 items-center gap-3 p-3">{body}</div>
      ) : (
        <button type="button" onClick={onOpen} aria-label={`Fur casharka ${lesson.title}`} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
          {body}
          <ChevronRight size={18} className="shrink-0 text-[var(--color-text-tertiary)]" aria-hidden="true" />
        </button>
      )}
      {!lesson.readOnly && <button type="button" onClick={onEdit} aria-label={`Wax ka beddel casharka ${lesson.title}`} className="m-3 ml-0 shrink-0 rounded-xl border border-[var(--color-border-default)] p-2 text-[var(--color-text-tertiary)] hover:border-emerald-500 hover:text-emerald-500"><Pencil size={15} /></button>}
    </div>
  );
}

export function GuuldoonBuilderChapterCard({ courseId, chapter, index, imported, open, onToggle, onChanged, notify, onOpenSection }: Props) {
  const accent = accentFor(index);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => { if (open) articleRef.current?.scrollIntoView({ block: 'start' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) { setEditing(false); setEditError(''); } }, [open]);

  const saveChapter = async (payload: Record<string, unknown>) => {
    setSaving(true);
    setEditError('');
    try {
      await api.patch(`${builderBase}/courses/${courseId}/chapters/${encodeURIComponent(chapter.id)}`, payload);
      onChanged();
      notify('Cutubka waa la kaydiyay');
      setEditing(false);
    } catch (error) {
      setEditError(errorMessage(error, 'Lama kaydin karin.'));
    } finally {
      setSaving(false);
    }
  };

  const weak = chapter.avgMastery;
  const tone = weak === null ? null : masteryTone(weak);

  const steps: { section: Exclude<Section, null>; title: string; hint: string; action: string; badge: string; button: string }[] = [
    { section: 'lessons', title: 'Cashar: akhri cutubka', hint: `${chapter.lessonCount} qaybood`, action: 'Akhri', badge: 'bg-emerald-500/10 text-emerald-500', button: 'border-emerald-500/30 text-emerald-500' },
    { section: 'years', title: 'Su’aalaha sanad kasta', hint: chapter.years.length ? `${chapter.years.length} sano · ${chapter.questionCount} su’aalood` : 'Su’aalo wali ma jiraan.', action: 'Fur', badge: 'bg-amber-500/10 text-amber-500', button: 'border-amber-500/30 text-amber-500' },
    { section: 'practice', title: 'Tababar', hint: `Fahamka cutubka (${chapter.practiceCount}) · Imtixaanadii hore (${chapter.questionCount})`, action: 'Fur', badge: 'bg-sky-500/10 text-sky-500', button: 'border-sky-500/30 text-sky-500' },
  ];

  const stepClass = 'flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3';
  const roundButton = 'rounded-xl border px-3 py-2 text-xs font-black';
  const editPen = 'shrink-0 rounded-xl border border-[var(--color-border-default)] p-2 text-[var(--color-text-tertiary)] hover:border-emerald-500 hover:text-emerald-500';

  return (
    <article ref={articleRef} className="student-glass-card scroll-mt-4 overflow-hidden rounded-[24px]">
      {editing ? (
        <div className="p-4">
          <ChapterEditor
            chapter={chapter}
            imported={imported}
            saving={saving}
            error={editError}
            onCancel={() => { setEditing(false); setEditError(''); }}
            onSave={payload => void saveChapter(payload)}
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
          <button type="button" onClick={() => { if (!open) onToggle(); setEditing(true); }} aria-label={`Wax ka beddel cutubka ${chapter.title}`} className={`${editPen} m-4 sm:m-5`}><Pencil size={15} /></button>
        </div>
      )}

      {open && (
        <div className="space-y-2 border-t border-[var(--color-border-subtle)] p-4 sm:p-5">
          {steps.map((step, stepIndex) => (
            <div key={step.section} className={stepClass}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-black ${step.badge}`}>{stepIndex + 1}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-black">{step.title}</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{step.hint}</p></div>
              <button type="button" onClick={() => onOpenSection(step.section)} className={`${roundButton} ${step.button}`}>{step.action}</button>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

