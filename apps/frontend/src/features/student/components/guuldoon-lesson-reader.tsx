
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Eye, EyeOff, PlayCircle, X } from 'lucide-react';
import type {
  GuuldoonChapterSummary,
  GuuldoonHighlightQuestion,
  GuuldoonLessonPayload,
  GuuldoonRelation,
} from './guuldoon-chapters-types';
import { relationMeta } from './guuldoon-chapters-types';

export function GuuldoonFormulaText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => part.startsWith('$') && part.endsWith('$')
        ? <span key={index} className="mx-0.5 rounded bg-slate-500/10 px-1.5 py-0.5 font-mono text-[.95em]" dir="ltr">{part}</span>
        : <span key={index}>{part}</span>)}
    </>
  );
}

function regexForAnchor(anchor: string): RegExp | null {
  const tokens = anchor.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const escaped = tokens.map(token => token.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'));
  try {
    return new RegExp(escaped.join('\\s+'), 'i');
  } catch {
    return null;
  }
}

function HighlightedText({
  text,
  highlights,
  enabled,
  onOpen,
}: {
  text: string;
  highlights: GuuldoonHighlightQuestion[];
  enabled: boolean;
  onOpen: (questions: GuuldoonHighlightQuestion[]) => void;
}) {
  if (!enabled || !highlights.length || !text) return <GuuldoonFormulaText text={text} />;

  const grouped = new Map<string, GuuldoonHighlightQuestion[]>();
  highlights.forEach(highlight => {
    const key = highlight.anchorText.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) || []), highlight]);
  });

  const ranges: Array<{ start: number; end: number; questions: GuuldoonHighlightQuestion[] }> = [];
  grouped.forEach(questions => {
    const regex = regexForAnchor(questions[0].anchorText);
    const match = regex?.exec(text);
    if (match && match.index >= 0) ranges.push({ start: match.index, end: match.index + match[0].length, questions });
  });
  ranges.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const accepted: typeof ranges = [];
  let boundary = -1;
  ranges.forEach(range => {
    if (range.start < boundary) return;
    accepted.push(range);
    boundary = range.end;
  });
  if (!accepted.length) return <GuuldoonFormulaText text={text} />;

  const nodes: ReactNode[] = [];
  let offset = 0;
  accepted.forEach((range, index) => {
    if (range.start > offset) nodes.push(<GuuldoonFormulaText key={'plain-' + index} text={text.slice(offset, range.start)} />);
    const meta = relationMeta[range.questions[0].relation];
    nodes.push(
      <button
        key={'mark-' + index}
        type="button"
        onClick={() => onOpen(range.questions)}
        className={'rounded px-1 py-0.5 text-left font-semibold underline decoration-2 underline-offset-2 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ' + meta.className}
        aria-label={meta.label + ': ' + range.questions.length + ' su’aalood imtixaan'}
      >
        <GuuldoonFormulaText text={text.slice(range.start, range.end)} />
      </button>,
    );
    offset = range.end;
  });
  if (offset < text.length) nodes.push(<GuuldoonFormulaText key="plain-end" text={text.slice(offset)} />);
  return <>{nodes}</>;
}

export function GuuldoonLessonReader({
  chapter,
  lesson,
  sectionIndex,
  setSectionIndex,
  mode,
  setMode,
  onBack,
  onPractice,
  onQuestion,
}: {
  chapter: GuuldoonChapterSummary;
  lesson: GuuldoonLessonPayload | null;
  sectionIndex: number;
  setSectionIndex: (index: number | ((current: number) => number)) => void;
  mode: 'lesson-list' | 'lesson-section';
  setMode: (mode: 'lesson-list' | 'lesson-section') => void;
  onBack: () => void;
  onPractice: () => void;
  onQuestion: (question: GuuldoonHighlightQuestion) => void;
}) {
  const [highlightsVisible, setHighlightsVisible] = useState(true);
  const [highlightGroup, setHighlightGroup] = useState<GuuldoonHighlightQuestion[] | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentSection = lesson?.sections[sectionIndex];

  useEffect(() => {
    if (!highlightGroup) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHighlightGroup(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [highlightGroup]);

  if (mode === 'lesson-list') {
    return (
      <section className="space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-tertiary)] hover:text-emerald-500">
          <ArrowLeft size={15} /> Cutubyada
        </button>
        <div className="student-glass-card rounded-[26px] p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Cashar</p>
          <h2 className="mt-1 text-2xl font-black">{chapter.title}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Dooro qaybta aad rabto inaad akhrido. Bogagga buugga ayaa lagu tusayaa qayb kasta.</p>
        </div>
        {!lesson?.sections.length ? (
          <div className="student-glass-card rounded-2xl p-8 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-3 font-black">Qoraalka casharka wali lama gelin.</p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Resources.content_text ayaa loo baahan yahay.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {lesson.sections.map((section, index) => (
              <button
                key={section.id}
                onClick={() => { setSectionIndex(index); setMode('lesson-section'); }}
                className="student-glass-card flex w-full items-center gap-4 rounded-2xl p-4 text-left transition hover:border-emerald-400/30"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-sm font-black text-emerald-500">{section.sectionNumber}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{section.title}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                    {section.pageFrom ? 'Bogagga ' + section.pageFrom + (section.pageTo && section.pageTo !== section.pageFrom ? '–' + section.pageTo : '') : 'Bog lama cayimin'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (!currentSection) return null;
  const last = sectionIndex === (lesson?.sections.length || 1) - 1;
  return (
    <section className="space-y-4">
      <button onClick={() => setMode('lesson-list')} className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-tertiary)] hover:text-emerald-500">
        <ArrowLeft size={15} /> Qaybaha casharka
      </button>
      <article className="student-glass-card rounded-[28px] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[.12em] text-emerald-500">
              {currentSection.sectionNumber} · {currentSection.pageFrom ? 'Bogga ' + currentSection.pageFrom + (currentSection.pageTo && currentSection.pageTo !== currentSection.pageFrom ? '–' + currentSection.pageTo : '') : 'Cashar'}
            </p>
            <h2 className="mt-2 text-xl font-black sm:text-2xl">{currentSection.title}</h2>
          </div>
          <button
            type="button"
            onClick={() => setHighlightsVisible(value => !value)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-bold hover:border-emerald-400/30"
          >
            {highlightsVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {highlightsVisible ? 'Qari highlight' : 'Muuji highlight'}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" aria-label="Noocyada highlight-ka">
          {(Object.entries(relationMeta) as [GuuldoonRelation, typeof relationMeta[GuuldoonRelation]][]).map(([key, meta]) => (
            <span key={key} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/50 px-2.5 py-1 text-[10px] font-bold">
              <span className={'h-2 w-2 rounded-full ' + meta.dot} /> {meta.label}
            </span>
          ))}
        </div>

        <div
          dir={currentSection.direction === 'rtl' || currentSection.language === 'ar' ? 'rtl' : currentSection.direction === 'ltr' ? 'ltr' : 'auto'}
          className="mt-6 whitespace-pre-wrap text-[15px] font-medium leading-8 text-[var(--color-text-primary)] sm:text-base sm:leading-9"
        >
          <HighlightedText text={currentSection.contentText} highlights={currentSection.highlights} enabled={highlightsVisible} onOpen={setHighlightGroup} />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-5">
          <button
            disabled={sectionIndex === 0}
            onClick={() => setSectionIndex(index => Math.max(0, index - 1))}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-bold disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Hore
          </button>
          {!last ? (
            <button onClick={() => setSectionIndex(index => Math.min((lesson?.sections.length || 1) - 1, index + 1))} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-500">
              Qaybta xigta <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={onPractice} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-500">
              Bilow tababarka <PlayCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </article>

      {highlightGroup && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={event => { if (event.currentTarget === event.target) setHighlightGroup(null); }}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Faahfaahinta highlight-ka"
            tabIndex={-1}
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-[28px] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-2xl outline-none sm:max-w-xl sm:rounded-[28px] sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set<GuuldoonRelation>(highlightGroup.map(item => item.relation))).map((relation: GuuldoonRelation) => (
                    <span key={relation} className={'rounded-full px-2.5 py-1 text-[10px] font-black ' + relationMeta[relation].className}>{relationMeta[relation].label}</span>
                  ))}
                </div>
                <h3 className="mt-3 text-lg font-black">Xiriirka imtixaanka</h3>
              </div>
              <button autoFocus onClick={() => setHighlightGroup(null)} aria-label="Xir" className="rounded-xl border border-[var(--color-border-subtle)] p-2 hover:bg-[var(--color-surface-tertiary)]"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{relationMeta[highlightGroup[0].relation].reason}</p>
            <div className="mt-5 space-y-3">
              {highlightGroup.map(question => (
                <div key={question.questionId} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/45 p-4">
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold text-[var(--color-text-tertiary)]">
                    <span>{question.examYear || '—'} · Su’aal {question.number}</span>
                    <span>· {question.type.toUpperCase()}</span>
                    <span>· {question.marks} dhibcood</span>
                  </div>
                  <p dir={question.direction === 'rtl' || question.language === 'ar' ? 'rtl' : 'auto'} className="mt-2 text-sm font-semibold leading-6"><GuuldoonFormulaText text={question.text} /></p>
                  <button
                    onClick={() => { setHighlightGroup(null); onQuestion(question); }}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white"
                  >
                    Ka jawaab <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
