import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookText,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ListFilter,
  Loader2,
  X,
} from 'lucide-react';
import api from '../../../lib/axios';

type Relation = 'direct' | 'indirect' | 'similar' | 'derived';
type Filter = 'order' | 'important' | 'notStarted';

type ChapterItem = {
  id: string;
  title: string;
  type: string;
  contentText?: string;
  pageFrom?: number | null;
  pageTo?: number | null;
  language?: 'so' | 'en' | 'ar';
  direction?: 'ltr' | 'rtl' | 'auto';
};

export type GuuldoonStudentChapter = {
  id: string;
  title: string;
  order: number;
  examWeight: number;
  mastery: number;
  attempts: number;
  started?: boolean;
  questionCount: number;
  practiceCount?: number;
  yearCount?: number;
  yearCounts?: { year: number; count: number }[];
  outsideBook?: boolean;
  items: ChapterItem[];
};

type Question = {
  _id: string;
  number: number;
  type: 'mcq' | 'structured' | 'fill' | 'match';
  language?: 'so' | 'en' | 'ar';
  direction?: 'ltr' | 'rtl' | 'auto';
  textSo: string;
  textEn?: string;
  options?: string[];
  marks: number;
  figureUrl?: string;
  figureFiles?: string[];
  chapterId: string;
  topicTags?: string[];
  answerStatus: 'verified' | 'pending';
  examYear?: number | null;
  bookRef?: { bookId?: string; pageFrom?: number; pageTo?: number };
  answerDisplay?: string;
  explanation?: string;
  answerVerified?: boolean;
};

type LessonHighlight = {
  anchorText: string;
  relation: Relation;
  questions: Question[];
};

type LessonSection = {
  id: string;
  externalId: string;
  order: number;
  title: string;
  type: string;
  url?: string;
  contentText: string;
  figureFiles?: string[];
  pageFrom?: number | null;
  pageTo?: number | null;
  language?: 'so' | 'en' | 'ar';
  direction?: 'ltr' | 'rtl' | 'auto';
  highlights: LessonHighlight[];
};

type LessonPayload = {
  chapter: { id: string; title: string; language: 'so' | 'en' | 'ar'; outsideBook?: boolean };
  sections: LessonSection[];
};

type Feedback = {
  marked: boolean;
  correct: boolean | null;
  answerStatus: 'verified' | 'pending';
  answerDisplay?: string;
  explanation?: string;
  explanationStatus?: 'verified' | 'draft';
  explainerAudioUrl?: string;
  bookRef?: { bookId?: string; pageFrom?: number; pageTo?: number };
  message?: string;
};

type Props = {
  courseId: string;
  passMeter: number;
  chapters: GuuldoonStudentChapter[];
  initialChapterId?: string | null;
  onProgressChanged?: () => void | Promise<void>;
};

const relationMeta: Record<Relation, { label: string; reason: string; className: string }> = {
  direct: {
    label: 'Toos',
    reason: 'Jawaabta si toos ah ayay ugu qoran tahay qaybtan buugga.',
    className: 'bg-emerald-400/20 text-emerald-500 ring-1 ring-emerald-400/35',
  },
  indirect: {
    label: 'Dadban',
    reason: 'Su’aashu waxay u baahan tahay isku-dar ama fikir ka imanaya qaybtan.',
    className: 'bg-sky-400/20 text-sky-500 ring-1 ring-sky-400/35',
  },
  similar: {
    label: 'U eg',
    reason: 'Fikradda waa isku mid, laakiin tiro ama eray ayaa la beddelay.',
    className: 'bg-amber-300/20 text-amber-500 ring-1 ring-amber-300/35',
  },
  derived: {
    label: 'Laga dhaliyay',
    reason: 'Su’aashu waxay ka dhalatay formula ama qaanuun ku jira qaybtan.',
    className: 'bg-rose-400/20 text-rose-500 ring-1 ring-rose-400/35',
  },
};

function masteryColour(value: number) {
  if (value < 50) return 'text-red-500';
  if (value < 75) return 'text-amber-500';
  return 'text-emerald-500';
}

function masteryBar(value: number) {
  if (value < 50) return 'bg-red-500';
  if (value < 75) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function FormulaText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$|\*\*[^*]+?\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-black">{part.slice(2, -2)}</strong>;
        const formula = part.startsWith('$') && part.endsWith('$');
        return formula
          ? <span key={index} className="mx-0.5 rounded bg-slate-500/10 px-1.5 py-0.5 font-mono text-[.95em]" dir="ltr">{part.replace(/^\$+|\$+$/g, '')}</span>
          : <span key={index}>{part}</span>;
      })}
    </>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

function HighlightedText({ text, highlights, visible, onOpen }: {
  text: string;
  highlights: LessonHighlight[];
  visible: boolean;
  onOpen: (highlight: LessonHighlight) => void;
}) {
  if (!visible || !highlights.length) return <FormulaText text={text} />;

  const matches: { start: number; end: number; highlight: LessonHighlight }[] = [];
  highlights.forEach(highlight => {
    const words = highlight.anchorText.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const regex = new RegExp(words.map(escapeRegExp).join('\\s+'), 'i');
    const match = regex.exec(text);
    if (!match) return;
    matches.push({ start: match.index, end: match.index + match[0].length, highlight });
  });
  matches.sort((a, b) => a.start - b.start);

  const accepted: typeof matches = [];
  matches.forEach(match => {
    if (!accepted.some(previous => match.start < previous.end)) accepted.push(match);
  });
  if (!accepted.length) return <FormulaText text={text} />;

  const output: ReactNode[] = [];
  let cursor = 0;
  accepted.forEach((match, index) => {
    if (match.start > cursor) {
      output.push(<FormulaText key={'plain-' + index} text={text.slice(cursor, match.start)} />);
    }
    output.push(
      <button
        key={'highlight-' + index}
        type="button"
        className={'mx-0.5 inline rounded px-1 py-0.5 text-left font-semibold underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ' + relationMeta[match.highlight.relation].className}
        onClick={() => onOpen(match.highlight)}
        aria-label={relationMeta[match.highlight.relation].label + ': ' + match.highlight.anchorText}
      >
        <FormulaText text={text.slice(match.start, match.end)} />
      </button>,
    );
    cursor = match.end;
  });
  if (cursor < text.length) output.push(<FormulaText key="tail" text={text.slice(cursor)} />);
  return <>{output}</>;
}

const ANSWER_PATTERN = /\s*\((Answers?|Ans|Solution)[:.]\s*([\s\S]+)\)\s*$/i;

function splitAnswer(text: string): { question: string; answer: string; fromBook: boolean } {
  const match = ANSWER_PATTERN.exec(text);
  if (!match) return { question: text, answer: '', fromBook: false };
  return { question: text.slice(0, match.index).trim(), answer: match[2].trim(), fromBook: match[1].toLowerCase() !== 'solution' };
}

const FIGURE_MARKER = /\{\{fig:([^|}]+)\|([^}]*)\}\}/g;

function splitFigures(text: string): { text: string; figures: { src: string; caption: string }[] } {
  const figures: { src: string; caption: string }[] = [];
  const clean = text.replace(FIGURE_MARKER, (_all, src: string, caption: string) => {
    figures.push({ src: src.trim(), caption: caption.trim() });
    return '';
  }).replace(/\s{2,}/g, ' ').trim();
  return { text: clean, figures };
}

function QuestionBody({ text, render }: { text: string; render: (value: string) => ReactNode }) {
  const { question, answer, fromBook } = splitAnswer(text);
  const { text: plain, figures } = splitFigures(question);
  return (
    <>
      {render(plain)}
      {figures.map((figure, index) => <span key={figure.src + index} className="mt-2 block"><InlineFigure src={figure.src} caption={figure.caption} /></span>)}
      {answer && <AnswerReveal answer={answer} fromBook={fromBook} />}
    </>
  );
}

function AnswerReveal({ answer, fromBook, note }: { answer: string; fromBook: boolean; note?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="mt-1.5 block">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600">
        {open ? 'Qari jawaabta' : 'Muuji jawaabta'}
      </button>
      {open && (
        <span className="mt-2 block rounded-xl border-l-4 border-emerald-500 bg-emerald-500/10 px-3 py-2 text-sm font-semibold">
          <span className="block text-[10px] font-black uppercase tracking-wide text-emerald-600">{fromBook ? 'Jawaabta buugga' : 'Jawaabta'}</span>
          <span className="block whitespace-pre-line"><FormulaText text={answer} /></span>
          {note && <span className="mt-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">{note}</span>}
        </span>
      )}
    </span>
  );
}

const isTrueFalse = (question: Question) => question.type === 'mcq' && question.options?.length === 2 && question.options[0] === 'True' && question.options[1] === 'False';

function matchParts(question: Question) {
  const options = question.options || [];
  return {
    lefts: options.filter(item => item.startsWith('L|')).map(item => item.slice(2)),
    rights: options.filter(item => item.startsWith('R|')).map(item => item.slice(2)),
  };
}

const isMatchQuestion = (question: Question) => question.type === 'match' && matchParts(question).lefts.length >= 2;

function QuestionFigures({ question }: { question: Question }) {
  const files = question.figureFiles?.length ? question.figureFiles : question.figureUrl ? [question.figureUrl] : [];
  return <>{files.map((figure, index) => <div key={figure + index} className="mt-3"><InlineFigure src={figure} caption={files.length > 1 ? 'Sawir ' + (index + 1) : ''} /></div>)}</>;
}

function InlineFigure({ src, caption }: { src: string; caption: string }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-2.5">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex w-full items-center gap-2 text-left text-sm font-black text-sky-500">
        <ImageIcon size={16} aria-hidden="true" />
        <span className="flex-1">{open ? 'Qari sawirka' : 'Muuji sawirka'}{caption ? ' · ' + caption : ''}</span>
      </button>
      {open && (
        <button type="button" onClick={() => setZoom(true)} className="mt-3 block w-full overflow-hidden rounded-xl bg-white shadow-sm" aria-label={'Taabo si aad u weyneyso sawirka ' + caption}>
          <img src={src} alt={caption} loading="lazy" className="mx-auto min-h-40 w-full object-contain" />
          <span className="block bg-sky-500/10 py-1 text-center text-[11px] font-bold text-sky-500">Taabo si aad u weyneyso</span>
        </button>
      )}
      {zoom && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] overflow-auto bg-black/90 p-3" onClick={() => setZoom(false)}>
          <button type="button" className="fixed right-3 top-3 z-[81] rounded-full bg-white px-4 py-2 text-sm font-black text-black" onClick={() => setZoom(false)}>Xidh</button>
          <img src={src} alt={caption} className="mx-auto mt-14 w-[200%] max-w-none sm:w-full sm:max-w-3xl" onClick={event => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

type LessonBlock =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'callout'; tag: string; title: string; lines: string[] };

function parseLesson(content: string): LessonBlock[] {
  const blocks: LessonBlock[] = [];
  content.replace(/\r/g, '').split(/\n{2,}/).forEach(raw => {
    const chunk = raw.trim();
    if (!chunk) return;
    const lines = chunk.split('\n');
    if (lines.every(line => line.startsWith('>'))) {
      const body = lines.map(line => line.replace(/^>\s?/, ''));
      const tag = /^\[!(\w+)\]\s*(.*)$/.exec(body[0] || '');
      if (tag) blocks.push({ kind: 'callout', tag: tag[1].toLowerCase(), title: tag[2].trim(), lines: body.slice(1) });
      else blocks.push({ kind: 'callout', tag: 'note', title: '', lines: body });
    } else if (lines.every(line => /^- /.test(line))) {
      blocks.push({ kind: 'ul', items: lines.map(line => line.slice(2)) });
    } else if (lines.every(line => /^\d+\.\s/.test(line))) {
      blocks.push({ kind: 'ol', items: lines.map(line => line.replace(/^\d+\.\s/, '')) });
    } else if (chunk.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: chunk.slice(4) });
    } else if (chunk.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: chunk.slice(3) });
    } else {
      blocks.push({ kind: 'p', text: chunk.replace(/\n/g, ' ') });
    }
  });
  return blocks;
}

const calloutMeta: Record<string, { label: string; icon: string; className: string }> = {
  goal: { label: 'Hadafka cashirka', icon: '🎯', className: 'border-emerald-500/40 bg-emerald-500/10' },
  formula: { label: 'Qaanuun / Formula', icon: '🧮', className: 'border-violet-500/40 bg-violet-500/10' },
  example: { label: 'Tusaale', icon: '✏️', className: 'border-sky-500/40 bg-sky-500/10' },
  note: { label: 'Xusuusnow', icon: '💡', className: 'border-amber-500/40 bg-amber-500/10' },
  try: { label: 'Isku day', icon: '🧪', className: 'border-rose-500/40 bg-rose-500/10' },
};

const summaryPalette = [
  { band: 'from-emerald-500 to-teal-400', soft: 'border-emerald-500/30 bg-emerald-500/[.07]', text: 'text-emerald-500' },
  { band: 'from-sky-500 to-indigo-400', soft: 'border-sky-500/30 bg-sky-500/[.07]', text: 'text-sky-500' },
  { band: 'from-violet-500 to-fuchsia-400', soft: 'border-violet-500/30 bg-violet-500/[.07]', text: 'text-violet-500' },
  { band: 'from-amber-500 to-orange-400', soft: 'border-amber-500/30 bg-amber-500/[.07]', text: 'text-amber-500' },
  { band: 'from-rose-500 to-pink-400', soft: 'border-rose-500/30 bg-rose-500/[.07]', text: 'text-rose-500' },
];

const isSummarySection = (section: { title: string }) => /^chapter summary/i.test(section.title.trim());

function SummaryHero() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-500 to-sky-500 p-5 text-white shadow-lg shadow-emerald-600/20 sm:p-7">
      <div aria-hidden="true" className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/15 blur-sm" />
      <div aria-hidden="true" className="absolute -bottom-10 left-1/3 h-24 w-24 rounded-full bg-amber-300/25 blur-md" />
      <p className="relative text-[11px] font-black uppercase tracking-[.2em] text-white/80">⭐ Xusuusnow</p>
      <h3 className="relative mt-1 text-2xl font-black leading-tight sm:text-3xl">Waxyaabaha la xifdiyo</h3>
      <p className="relative mt-2 max-w-xl text-sm font-medium text-white/90">Kuwa sanadaha leh waa la weydiiyay imtixaanadii hore. Kuwa kale waxay ku jiraan buugga, waxaana laga yaabaa inay soo baxaan imtixaanka dambe.</p>
    </div>
  );
}

function YearChips({ years }: { years: string[] }) {
  if (!years.length) return <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-black text-sky-500">🔮 Laga yaabo imtixaanka dambe</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-black text-amber-600">🔥 {years.length > 1 ? years.length + ' jeer la weydiiyay' : 'La weydiiyay'}</span>
      {years.map(year => <span key={year} className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-1 text-[11px] font-black tabular-nums">{year}</span>)}
    </span>
  );
}

function LessonBody({ content, highlights, visible, onOpen }: {
  content: string;
  highlights: LessonHighlight[];
  visible: boolean;
  onOpen: (highlight: LessonHighlight) => void;
}) {
  const blocks = useMemo(() => parseLesson(content), [content]);
  const inline = (text: string) => <HighlightedText text={text} highlights={highlights} visible={visible} onOpen={onOpen} />;
  return (
    <div className="space-y-4 text-[15px] leading-7 text-[var(--color-text-primary)] sm:text-base sm:leading-8">
      {blocks.map((block, index) => {
        if (block.kind === 'h2') return <h4 key={index} className="mt-8 flex items-center gap-2 border-b border-emerald-500/30 pb-2 text-lg font-black text-emerald-600 first:mt-0 sm:text-xl"><span className="h-5 w-1.5 rounded-full bg-emerald-500" />{inline(block.text)}</h4>;
        if (block.kind === 'h3') return <h5 key={index} className="mt-5 text-base font-black text-[var(--color-text-primary)] sm:text-lg">{inline(block.text)}</h5>;
        if (block.kind === 'p') return <div key={index}><QuestionBody text={block.text} render={inline} /></div>;
        if (block.kind === 'ul') return <ul key={index} className="space-y-2 pl-1">{block.items.map((item, i) => <li key={i} className="flex gap-3"><span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><span className="min-w-0 flex-1"><QuestionBody text={item} render={inline} /></span></li>)}</ul>;
        if (block.kind === 'ol') return <ol key={index} className="space-y-2">{block.items.map((item, i) => <li key={i} className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-black text-emerald-600">{i + 1}</span><span className="min-w-0 flex-1"><QuestionBody text={item} render={inline} /></span></li>)}</ol>;
        if (block.tag === 'figure' && block.lines[0]) return <InlineFigure key={index} src={block.lines[0].trim()} caption={block.title} />;
        if (block.tag === 'stats') {
          const tiles = block.lines.map(line => line.split(' | '));
          return (
            <div key={index} className="grid grid-cols-3 gap-2">
              {tiles.map(([value, label], i) => (
                <div key={i} className={'rounded-2xl bg-gradient-to-br p-3 text-center text-white shadow ' + summaryPalette[i % summaryPalette.length].band}>
                  <strong className="block text-2xl font-black tabular-nums sm:text-3xl">{value}</strong>
                  <span className="block text-[11px] font-semibold leading-tight text-white/90">{label}</span>
                </div>
              ))}
            </div>
          );
        }
        if (block.tag === 'memorize' || block.tag === 'fact' || (block.tag === 'formula' && /\s\|(\s|$)/.test(block.title))) {
          const [name, yearText = ''] = block.title.split(/\s\|\s?/);
          const years = yearText.split(',').map(item => item.trim()).filter(Boolean);
          const tone = summaryPalette[index % summaryPalette.length];
          const formula = block.tag === 'formula';
          return (
            <article key={index} className={'overflow-hidden rounded-2xl border ' + tone.soft}>
              <div className={'h-1.5 bg-gradient-to-r ' + tone.band} />
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h5 className={'flex min-w-0 items-center gap-2 text-base font-black ' + tone.text}><span aria-hidden="true">{formula ? '🧮' : block.tag === 'fact' ? '📌' : '🧠'}</span><span className="min-w-0">{name}</span></h5>
                  <YearChips years={years} />
                </div>
                <div className="mt-3 space-y-1.5">
                  {block.lines.map((line, i) => formula
                    ? i === 0
                      ? <p key={i} dir="ltr" className="overflow-x-auto rounded-xl bg-[var(--color-surface-primary)] px-3 py-2.5 text-center font-mono text-lg font-black sm:text-xl">{inline(line)}</p>
                      : <p key={i} className="text-sm leading-6 text-[var(--color-text-secondary)]">{inline(line)}</p>
                    : line.startsWith('- ')
                      ? <div key={i} className="flex gap-2"><span aria-hidden="true" className={tone.text}>●</span><span className="min-w-0 flex-1"><QuestionBody text={line.slice(2)} render={inline} /></span></div>
                      : <div key={i} className="font-semibold"><QuestionBody text={line} render={inline} /></div>)}
                </div>
              </div>
            </article>
          );
        }
        const meta = calloutMeta[block.tag] || calloutMeta.note;
        return (
          <aside key={index} className={'rounded-2xl border-l-4 p-4 ' + meta.className}>
            <p className="mb-2 text-xs font-black uppercase tracking-wide"><span aria-hidden="true">{meta.icon} </span>{meta.label}{block.title ? ' · ' + block.title : ''}</p>
            <div className="space-y-1.5">
              {block.lines.map((line, i) => {
                const bullet = line.startsWith('- ');
                if (block.tag === 'formula') return <p key={i} className="font-mono text-[.95em]" dir="ltr">{inline(line)}</p>;
                return bullet
                  ? <div key={i} className="flex gap-2"><span aria-hidden="true">•</span><span className="min-w-0 flex-1"><QuestionBody text={line.slice(2)} render={inline} /></span></div>
                  : <div key={i}><QuestionBody text={line} render={inline} /></div>;
              })}
            </div>
          </aside>
        );
      })}
    </div>
  );
}

export function GuuldoonChaptersExperience({
  courseId,
  passMeter,
  chapters,
  initialChapterId,
  onProgressChanged,
}: Props) {
  const [filter, setFilter] = useState<Filter>('order');
  const [openChapterId, setOpenChapterId] = useState<string | null>(initialChapterId || chapters[0]?.id || null);
  const [mode, setMode] = useState<'list' | 'lesson' | 'year' | 'hub' | 'practice'>('list');
  const [activeChapter, setActiveChapter] = useState<GuuldoonStudentChapter | null>(null);
  const [lesson, setLesson] = useState<LessonPayload | null>(null);
  const [sectionIndex, setSectionIndex] = useState<number | null>(null);
  const [yearCounts, setYearCounts] = useState<{ year: number; count: number }[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [hubTab, setHubTab] = useState<'understand' | 'past'>('understand');
  const [understandQuestions, setUnderstandQuestions] = useState<Question[]>([]);
  const [practiceSource, setPracticeSource] = useState<'understand' | 'past'>('past');
  const [loading, setLoading] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState('');
  const [highlightsVisible, setHighlightsVisible] = useState(true);
  const [highlightPopup, setHighlightPopup] = useState<LessonHighlight | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialChapterId) setOpenChapterId(initialChapterId);
  }, [initialChapterId]);

  useEffect(() => {
    if (!highlightPopup) return;
    const previous = document.activeElement as HTMLElement | null;
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHighlightPopup(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [highlightPopup]);

  const sortedChapters = useMemo(() => {
    const rows = [...chapters];
    if (filter === 'important') return rows.sort((a, b) => b.examWeight - a.examWeight || a.order - b.order);
    if (filter === 'notStarted') return rows.filter(chapter => !chapter.started && chapter.attempts === 0).sort((a, b) => a.order - b.order);
    return rows.sort((a, b) => a.order - b.order);
  }, [chapters, filter]);

  const nextChapter = useMemo(
    () => [...chapters].sort((a, b) => a.order - b.order).find(chapter => chapter.mastery < 75) || chapters[0],
    [chapters],
  );
  const totalWeight = chapters.reduce((sum, chapter) => sum + Number(chapter.examWeight || 0), 0);

  const loadLesson = async (chapter: GuuldoonStudentChapter, page?: number | null) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/guuldoon/courses/' + courseId + '/chapters/' + chapter.id + '/lesson');
      const raw = data.data as LessonPayload;
      const ordered = [...raw.sections.filter(section => !isSummarySection(section)), ...raw.sections.filter(isSummarySection)].map((section, i) => ({ ...section, order: i + 1 }));
      const payload: LessonPayload = { ...raw, sections: ordered };
      let nextIndex: number | null = null;
      if (page) {
        const match = payload.sections.findIndex(section => {
          const from = section.pageFrom || section.pageTo;
          const to = section.pageTo || section.pageFrom;
          return !!from && !!to && page >= from && page <= to;
        });
        if (match >= 0) nextIndex = match;
      }
      setActiveChapter(chapter);
      setLesson(payload);
      setSectionIndex(nextIndex);
      setMode('lesson');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Casharka cutubka lama furi karin.');
    } finally {
      setLoading(false);
    }
  };

  const loadYearQuestions = async (chapter: GuuldoonStudentChapter, year: number) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/guuldoon/courses/' + courseId + '/chapters/' + chapter.id + '/questions', {
        params: { year, limit: 200, review: 1 },
      });
      setActiveChapter(chapter);
      setYearCounts(data.data.yearCounts || chapter.yearCounts || []);
      setSelectedYear(year);
      setQuestions(data.data.questions || []);
      setMode('year');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Su’aalaha sannadka lama furi karin.');
    } finally {
      setLoading(false);
    }
  };

  const startPractice = async (chapter: GuuldoonStudentChapter, supplied?: Question[], source: 'understand' | 'past' = 'past') => {
    setLoading(true);
    setError('');
    try {
      let rows: Question[] = supplied || [];
      if (!supplied) {
        const { data } = await api.get('/guuldoon/courses/' + courseId + '/chapters/' + chapter.id + '/questions', {
          params: { limit: 60 },
        });
        rows = (data.data.questions || []) as Question[];
      }
      if (!rows.length) {
        setError('Cutubkan wali su’aalo published ah laguma darin.');
        return;
      }
      setActiveChapter(chapter);
      setPracticeSource(source);
      setQuestions(rows);
      setQuestionIndex(0);
      setAnswers({});
      setFeedback({});
      setMode('practice');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Tababarka lama furi karin.');
    } finally {
      setLoading(false);
    }
  };

  const openHub = async (chapter: GuuldoonStudentChapter) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/guuldoon/courses/' + courseId + '/chapters/' + chapter.id + '/questions', {
        params: { kind: 'practice', limit: 200 },
      });
      const rows = (data.data.questions || []) as Question[];
      setUnderstandQuestions(rows);
      setHubTab(rows.length ? 'understand' : 'past');
      setActiveChapter(chapter);
      setMode('hub');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Tababarka lama furi karin.');
    } finally {
      setLoading(false);
    }
  };

  const isReady = (question: Question) => {
    const value = answers[question._id];
    if (isMatchQuestion(question)) {
      const expected = matchParts(question).lefts.length;
      return Array.isArray(value) && value.length === expected && value.every(item => Number.isInteger(item) && item >= 0);
    }
    return value !== undefined && String(value).trim() !== '';
  };

  const submitAnswer = async (question: Question) => {
    if (!isReady(question) || answering) return;
    setAnswering(true);
    setError('');
    try {
      const { data } = await api.post('/guuldoon/questions/' + question._id + '/answer', {
        answer: answers[question._id],
      });
      setFeedback(current => ({ ...current, [question._id]: data.data }));
      await onProgressChanged?.();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Jawaabta lama gudbin karin.');
    } finally {
      setAnswering(false);
    }
  };

  const backToList = () => {
    setMode('list');
    setLesson(null);
    setSectionIndex(null);
    setQuestions([]);
    setSelectedYear(null);
    setHighlightPopup(null);
  };

  const currentQuestion = mode === 'practice' ? questions[questionIndex] : null;
  const currentFeedback = currentQuestion ? feedback[currentQuestion._id] : undefined;

  return (
    <div className="space-y-4">
      {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-500">{error}</div>}

      {mode === 'list' && (
        <>
          <div className="grid gap-3 lg:grid-cols-[.82fr_1.18fr]">
            <div className="student-dashboard-hero rounded-[26px] p-5 text-white">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-200">Pass Meter</p>
              <div className="mt-4 flex items-center gap-5">
                <div
                  className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'conic-gradient(rgb(52 211 153) ' + (passMeter * 3.6) + 'deg, rgba(255,255,255,.12) 0deg)' }}
                >
                  <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full bg-[#071b1d]">
                    <strong className="text-3xl">{passMeter}%</strong>
                    <span className="text-[10px] text-white/50">Diyaar-garow</span>
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-black">Cutubyada</h2>
                  <p className="mt-1 text-xs leading-5 text-emerald-50/70">Akhri → Su’aalaha sannadaha → Tababar.</p>
                </div>
              </div>
            </div>

            <div className="student-glass-card rounded-[26px] p-5">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Cutubka xiga</p>
              {nextChapter ? (
                <>
                  <h3 className="mt-2 text-lg font-black">{nextChapter.title}</h3>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{nextChapter.examWeight}% imtixaanka · {nextChapter.mastery}% mastery</p>
                  <button onClick={() => void loadLesson(nextChapter)} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white">Akhri cutubka</button>
                </>
              ) : <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Cutubyo lama hayo.</p>}
            </div>
          </div>

          <div className="student-glass-card rounded-[22px] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-black">Weight strip</span>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">{Math.round(totalWeight)}%</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
              {chapters.filter(chapter => chapter.examWeight > 0).map((chapter, index) => (
                <div
                  key={chapter.id}
                  title={chapter.title + ': ' + chapter.examWeight + '%'}
                  className={index % 4 === 0 ? 'bg-emerald-500' : index % 4 === 1 ? 'bg-teal-400' : index % 4 === 2 ? 'bg-sky-500' : 'bg-amber-400'}
                  style={{ width: (totalWeight ? (chapter.examWeight / totalWeight) * 100 : 0) + '%' }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Cutubyada</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">Hal cutub mar keliya ayuu furmaa.</p>
            </div>
            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1">
              <ListFilter size={15} className="ml-2 shrink-0 text-[var(--color-text-tertiary)]" />
              {([
                ['order', 'Isku xigga'],
                ['important', 'Ugu muhiimsan'],
                ['notStarted', 'Aan bilaabin'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={'shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ' + (filter === value ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)]')}
                >{label}</button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {sortedChapters.map((chapter, index) => {
              const open = openChapterId === chapter.id;
              const years = chapter.yearCounts || [];
              return (
                <article key={chapter.id} className="student-glass-card overflow-hidden rounded-[24px]">
                  <button
                    type="button"
                    onClick={() => setOpenChapterId(open ? null : chapter.id)}
                    aria-expanded={open}
                    className="w-full p-4 text-left sm:p-5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 font-black text-emerald-500">{chapter.order || index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 flex-1 font-black">{chapter.title}</h3>
                          {chapter.outsideBook && <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-bold text-violet-500">Other topics · outside the book</span>}
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl bg-emerald-500/10 p-2"><strong className="block text-sm text-emerald-500">{chapter.examWeight}%</strong><span className="text-[9px] text-[var(--color-text-tertiary)]">Imtixaanka</span></div>
                          <div className="rounded-xl bg-sky-500/10 p-2"><strong className="block text-sm text-sky-500">{chapter.questionCount}</strong><span className="text-[9px] text-[var(--color-text-tertiary)]">Su’aalo</span></div>
                          <div className="rounded-xl bg-amber-500/10 p-2"><strong className="block text-sm text-amber-500">{chapter.yearCount || years.length}</strong><span className="text-[9px] text-[var(--color-text-tertiary)]">Sannado</span></div>
                        </div>

                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                            <div className={'h-full ' + masteryBar(chapter.mastery)} style={{ width: chapter.mastery + '%' }} />
                          </div>
                          <strong className={'text-xs ' + masteryColour(chapter.mastery)}>{chapter.mastery}%</strong>
                        </div>
                      </div>
                      <ChevronDown className={'mt-1 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')} size={20} />
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-[var(--color-border-subtle)] p-4 sm:p-5">
                      <div className="grid gap-2">
                        <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-sm font-black text-emerald-500">1</span>
                          <div className="min-w-0 flex-1"><p className="text-sm font-black">Cashar: akhri cutubka</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{chapter.items.length} qaybood</p></div>
                          <button
                            onClick={() => void loadLesson(chapter)}
                            className={'rounded-xl px-3 py-2 text-xs font-black ' + (!chapter.started ? 'bg-emerald-600 text-white' : 'border border-emerald-500/30 text-emerald-500')}
                          >Akhri</button>
                        </div>

                        <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-sm font-black text-amber-500">2</span>
                          <div className="min-w-0 flex-1"><p className="text-sm font-black">Su’aalaha sanad kasta</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{years.length ? years.length + ' sano · su’aalaha iyo jawaabaha saxda ah' : 'Su’aalo published ah wali ma jiraan.'}</p></div>
                          <button
                            disabled={!years.length}
                            onClick={() => void loadYearQuestions(chapter, years[0].year)}
                            className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs font-black text-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >Fur</button>
                        </div>

                        <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sm font-black text-sky-500">3</span>
                          <div className="min-w-0 flex-1"><p className="text-sm font-black">{chapter.started ? 'Sii wad tababarka' : 'Tababar'}</p><p className="text-[11px] text-[var(--color-text-tertiary)]">Fahamka cutubka ({chapter.practiceCount || 0}) · imtixaanadii hore ({chapter.questionCount})</p></div>
                          <button onClick={() => void openHub(chapter)} className="rounded-xl border border-sky-500/30 px-3 py-2 text-xs font-black text-sky-500">Bilow</button>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {mode === 'lesson' && lesson && (
        <div className="space-y-4">
          <div className="student-glass-card flex flex-wrap items-center justify-between gap-3 rounded-[24px] p-4">
            <button onClick={backToList} className="inline-flex items-center gap-2 text-sm font-black text-[var(--color-text-secondary)] hover:text-emerald-500">
              <ArrowLeft size={17} /> Cutubyada
            </button>
            <div className="min-w-0 flex-1 sm:text-center"><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Cashar</p><h2 className="truncate font-black">{lesson.chapter.title}</h2></div>
            <button
              type="button"
              onClick={() => setHighlightsVisible(value => !value)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)]/50 px-3 py-2 text-xs font-bold"
              aria-pressed={highlightsVisible}
            >
              {highlightsVisible ? <Eye size={15} /> : <EyeOff size={15} />} {highlightsVisible ? 'Qari highlight' : 'Muuji highlight'}
            </button>
          </div>

          {sectionIndex === null ? (
            <div className="student-glass-card rounded-[26px] p-5 sm:p-6">
              <h3 className="text-xl font-black">Qaybaha cutubka</h3>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Dooro qaybta aad rabto inaad akhrido.</p>
              {lesson.sections.length ? (
                <div className="mt-5 space-y-2">
                  {lesson.sections.map((section, index) => (
                    isSummarySection(section) ? (
                      <button key={section.id} type="button" onClick={() => setSectionIndex(index)} className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-500 to-sky-500 p-4 text-left text-white shadow-lg shadow-emerald-600/20 transition hover:brightness-110">
                        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 text-lg">⭐</span>
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">Chapter summary</p><p className="mt-1 text-xs text-white/85">Waxyaabaha la xifdiyo · sanadaha la weydiiyay</p></div>
                        <ChevronRight size={18} />
                      </button>
                    ) : (
                    <button key={section.id} type="button" onClick={() => setSectionIndex(index)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/45 p-4 text-left transition hover:border-emerald-500/30 hover:bg-emerald-500/[.06]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-xs font-black text-emerald-500">{section.order}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">{section.title}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{section.pageFrom ? 'Bogagga ' + section.pageFrom + (section.pageTo ? '–' + section.pageTo : '') : 'Qoraalka casharka'}</p>
                      </div>
                      <ChevronRight size={18} className="text-[var(--color-text-tertiary)]" />
                    </button>
                    )
                  ))}
                </div>
              ) : <div className="mt-5 rounded-2xl border border-dashed p-7 text-center text-sm text-[var(--color-text-tertiary)]">Qoraalka qaybaha casharka wali laguma darin content_text.</div>}
            </div>
          ) : (() => {
            const section = lesson.sections[sectionIndex];
            if (!section) return null;
            const isLast = sectionIndex === lesson.sections.length - 1;
            return (
              <article className="student-glass-card rounded-[28px] p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Qaybta {section.order}</p>
                    <h3 className="mt-1 text-xl font-black sm:text-2xl">{section.title}</h3>
                    {section.pageFrom && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Bogagga {section.pageFrom}{section.pageTo ? '–' + section.pageTo : ''}</p>}
                  </div>
                  <button onClick={() => setSectionIndex(null)} className="rounded-xl border px-3 py-2 text-xs font-bold">Qaybaha</button>
                </div>

                {isSummarySection(section) && <div className="mt-5"><SummaryHero /></div>}

                <div className={'mt-5 flex-wrap gap-2 text-[10px] font-bold ' + (isSummarySection(section) ? 'hidden' : 'flex')}>
                  {(Object.keys(relationMeta) as Relation[]).map(relation => (
                    <span key={relation} className={'rounded-full px-2.5 py-1 ' + relationMeta[relation].className}>{relationMeta[relation].label}</span>
                  ))}
                </div>

                <div dir={section.direction === 'rtl' || section.language === 'ar' ? 'rtl' : section.direction === 'ltr' ? 'ltr' : 'auto'} className="mt-5">
                  <LessonBody content={section.contentText || 'Qoraalka casharka wali lama gelin.'} highlights={isSummarySection(section) ? [] : section.highlights || []} visible={highlightsVisible} onOpen={setHighlightPopup} />
                </div>

                <div className="mt-7 grid grid-cols-2 gap-2 sm:flex sm:justify-between">
                  <button disabled={sectionIndex === 0} onClick={() => setSectionIndex(index => Math.max(0, (index || 0) - 1))} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-35"><ChevronLeft size={16} /> Hore</button>
                  {!isLast ? (
                    <button onClick={() => setSectionIndex(index => Math.min(lesson.sections.length - 1, (index || 0) + 1))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white">Qaybta xigta <ChevronRight size={16} /></button>
                  ) : (
                    <button disabled={!activeChapter} onClick={() => activeChapter && void openHub(activeChapter)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">Bilow tababarka</button>
                  )}
                </div>
              </article>
            );
          })()}
        </div>
      )}

      {mode === 'year' && activeChapter && (
        <div className="space-y-4">
          <div className="student-glass-card flex flex-wrap items-center gap-3 rounded-[24px] p-4">
            <button onClick={backToList} className="inline-flex items-center gap-2 text-sm font-black"><ArrowLeft size={17} /> Cutubyada</button>
            <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Su’aalaha sanad kasta</p><h2 className="truncate font-black">{activeChapter.title}</h2></div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2" role="group" aria-label="Dooro sanad">
            {yearCounts.map(item => {
              const selected = selectedYear === item.year;
              const strength = Math.round(8 + 22 * (item.count / Math.max(1, ...yearCounts.map(y => y.count))));
              return (
                <button
                  key={item.year}
                  onClick={() => void loadYearQuestions(activeChapter, item.year)}
                  aria-pressed={selected}
                  style={selected ? undefined : { background: 'color-mix(in srgb, rgb(16 185 129) ' + strength + '%, var(--color-surface-primary))' }}
                  className={'flex flex-col items-center gap-0.5 rounded-2xl border px-1.5 py-2.5 transition ' + (selected ? 'border-emerald-500 bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'border-[var(--color-border-default)]')}
                >
                  <b className="text-base font-extrabold tabular-nums">{item.year}</b>
                  <span className={'text-[11.5px] ' + (selected ? 'text-white/85' : 'text-[var(--color-text-tertiary)]')}>{item.count} su’aal</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3">
            {loading ? <div className="p-8 text-center"><Loader2 className="mx-auto animate-spin" /></div> : questions.map(question => (
              <article key={question._id} className="student-glass-card rounded-[24px] p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-500">{selectedYear} · Su’aal {question.number}</span>
                  <span className="rounded-full bg-slate-500/10 px-2.5 py-1">{question.marks} dhibcood</span>
                  <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-500">{question.type.toUpperCase()}</span>
                </div>
                <p dir={question.direction === 'rtl' || question.language === 'ar' ? 'rtl' : 'auto'} className="mt-3 text-sm font-semibold leading-6"><FormulaText text={question.textSo} /></p>
                <QuestionFigures question={question} />
                {question.type === 'mcq' && question.options?.length ? (
                  <ol className="mt-3 space-y-1.5 text-sm">
                    {question.options.map((option, index) => <li key={index} className="rounded-xl bg-[var(--color-surface-tertiary)]/50 px-3 py-2"><b className="mr-1.5">{String.fromCharCode(65 + index)}.</b><FormulaText text={option} /></li>)}
                  </ol>
                ) : null}
                {question.answerDisplay
                  ? <AnswerReveal answer={question.answerDisplay} fromBook={false} note={[question.explanation, question.answerVerified === false ? 'Jawaabtan wali lama xaqiijin.' : ''].filter(Boolean).join(' ')} />
                  : <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Jawaabta wali lama gelin.</p>}
              </article>
            ))}
          </div>
        </div>
      )}

      {mode === 'hub' && activeChapter && (
        <div className="space-y-4">
          <div className="student-glass-card flex flex-wrap items-center gap-3 rounded-[24px] p-4">
            <button onClick={backToList} className="inline-flex items-center gap-2 text-sm font-black"><ArrowLeft size={17} /> Cutubyada</button>
            <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Tababar</p><h2 className="truncate font-black">{activeChapter.title}</h2></div>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1" role="tablist">
            {([['understand', 'Fahamka cutubka'], ['past', 'Imtixaanadii hore']] as const).map(([value, label]) => (
              <button key={value} role="tab" aria-selected={hubTab === value} onClick={() => setHubTab(value)} className={'rounded-xl px-3 py-2.5 text-sm font-black ' + (hubTab === value ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)]')}>{label}</button>
            ))}
          </div>

          {hubTab === 'understand' ? (
            <div className="student-glass-card rounded-[26px] p-5">
              <h3 className="text-lg font-black">Fahamka cutubka</h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Su’aalo ka kooban qaybaha ugu muhiimsan casharka: MCQ, True/False, Matching iyo jawaab gaaban. Jawaabta waa la hubiyaa isla markiiba.</p>
              {understandQuestions.length ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    {[
                      ['MCQ', understandQuestions.filter(question => question.type === 'mcq' && !isTrueFalse(question)).length],
                      ['True / False', understandQuestions.filter(isTrueFalse).length],
                      ['Matching', understandQuestions.filter(question => question.type === 'match').length],
                      ['Jawaab gaaban', understandQuestions.filter(question => question.type === 'fill').length],
                    ].map(([label, count]) => (
                      <div key={String(label)} className="rounded-xl bg-emerald-500/10 p-3"><strong className="block text-lg text-emerald-500">{count}</strong><span className="text-[10px] text-[var(--color-text-tertiary)]">{label}</span></div>
                    ))}
                  </div>
                  <button onClick={() => void startPractice(activeChapter, understandQuestions, 'understand')} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">Bilow</button>
                </>
              ) : <p className="mt-4 rounded-2xl border border-dashed p-5 text-center text-sm text-[var(--color-text-tertiary)]">Su’aalaha fahamka cutubkan wali lama diyaarin.</p>}
            </div>
          ) : (
            <div className="student-glass-card rounded-[26px] p-5">
              <h3 className="text-lg font-black">Imtixaanadii hore</h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Su’aalihii imtixaanadii hore ee cutubkan; ka jawaab, hubi, kuna dar Pass Meter-kaaga.</p>
              <p className="mt-4 text-sm font-bold">{activeChapter.questionCount} su’aalood · {activeChapter.yearCount || activeChapter.yearCounts?.length || 0} sano</p>
              <button disabled={!activeChapter.questionCount} onClick={() => void startPractice(activeChapter, undefined, 'past')} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40">Bilow</button>
            </div>
          )}
        </div>
      )}

      {mode === 'practice' && activeChapter && currentQuestion && (
        <div className="space-y-4">
          <div className="student-glass-card flex flex-wrap items-center justify-between gap-3 rounded-[24px] p-4">
            <button onClick={backToList} className="inline-flex items-center gap-2 text-sm font-black"><ArrowLeft size={17} /> Cutubyada</button>
            <div className="min-w-0 flex-1 text-center"><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">{practiceSource === 'understand' ? 'Fahamka cutubka' : 'Imtixaanadii hore'}</p><h2 className="truncate font-black">{activeChapter.title}</h2></div>
            <span className="text-xs font-bold text-[var(--color-text-tertiary)]">{questionIndex + 1}/{questions.length}</span>
          </div>

          <article className="student-glass-card rounded-[28px] p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-500">{practiceSource === 'understand' ? 'Su’aal ' + currentQuestion.number : (currentQuestion.examYear || '—') + ' · Su’aal ' + currentQuestion.number + ' · ' + currentQuestion.marks + ' dhibcood'}</span>
              <span className="rounded-full bg-violet-500/10 px-3 py-1 text-violet-500">{isTrueFalse(currentQuestion) ? 'TRUE / FALSE' : currentQuestion.type.toUpperCase()}</span>
            </div>

            <h3 dir={currentQuestion.direction === 'rtl' || currentQuestion.language === 'ar' ? 'rtl' : 'auto'} className="mt-5 text-lg font-black leading-8"><FormulaText text={currentQuestion.textSo} /></h3>
            <QuestionFigures question={currentQuestion} />

            {currentQuestion.type === 'mcq' && currentQuestion.options?.length ? (
              <div className="mt-5 grid gap-3">
                {currentQuestion.options.map((option, index) => (
                  <button key={index} disabled={!!currentFeedback} onClick={() => setAnswers(current => ({ ...current, [currentQuestion._id]: index }))} className={'rounded-2xl border p-4 text-left text-sm font-semibold transition ' + (answers[currentQuestion._id] === index ? 'border-emerald-500 bg-emerald-500/10' : 'border-[var(--color-border-subtle)] hover:border-emerald-500/40')}>
                    {String.fromCharCode(65 + index)}. {option}
                  </button>
                ))}
              </div>
            ) : isMatchQuestion(currentQuestion) ? (
              <div className="mt-5 space-y-3">
                {matchParts(currentQuestion).lefts.map((left, leftIndex) => {
                  const chosen = Array.isArray(answers[currentQuestion._id]) ? (answers[currentQuestion._id] as number[])[leftIndex] : undefined;
                  const rights = matchParts(currentQuestion).rights;
                  return (
                    <div key={leftIndex} className="rounded-2xl border border-[var(--color-border-subtle)] p-3">
                      <p className="text-sm font-semibold"><b className="mr-1.5">{leftIndex + 1}.</b><FormulaText text={left} /></p>
                      <select
                        disabled={!!currentFeedback}
                        value={chosen === undefined || chosen < 0 ? '' : String(chosen)}
                        onChange={event => setAnswers(current => {
                          const next = Array.isArray(current[currentQuestion._id]) ? [...(current[currentQuestion._id] as number[])] : [];
                          while (next.length < rights.length && next.length < matchParts(currentQuestion).lefts.length) next.push(-1);
                          next[leftIndex] = Number(event.target.value);
                          return { ...current, [currentQuestion._id]: next };
                        })}
                        className="mt-2 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2.5 text-sm"
                        aria-label={'Dooro isku xirka ' + (leftIndex + 1)}
                      >
                        <option value="">Dooro…</option>
                        {rights.map((right, rightIndex) => <option key={rightIndex} value={rightIndex}>{right}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            ) : (
              <textarea disabled={!!currentFeedback} value={String(answers[currentQuestion._id] ?? '')} onChange={event => setAnswers(current => ({ ...current, [currentQuestion._id]: event.target.value }))} rows={currentQuestion.type === 'fill' ? 2 : 5} placeholder="Ku qor jawaabtaada..." className="mt-5 w-full rounded-2xl border border-[var(--color-border-default)] bg-transparent p-4 text-sm outline-none focus:border-emerald-500" />
            )}

            {!currentFeedback ? (
              <button disabled={answering || !isReady(currentQuestion)} onClick={() => void submitAnswer(currentQuestion)} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{answering ? 'Waa la hubinayaa...' : 'Gudbi jawaabta'}</button>
            ) : (
              <div className={'mt-5 rounded-2xl border p-4 ' + (currentFeedback.marked ? currentFeedback.correct ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10')}>
                <p className="font-black">{currentFeedback.marked ? currentFeedback.correct ? '✓ Sax' : '✕ Khalad' : 'Jawaab la xaqiijin doonaa'}</p>
                {currentFeedback.answerDisplay && currentFeedback.marked && !currentFeedback.correct && (
                  <div className="mt-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">Jawaabta saxda ah</p>
                    <p className="mt-1 whitespace-pre-line text-sm font-semibold leading-6"><FormulaText text={currentFeedback.answerDisplay} /></p>
                  </div>
                )}
                {currentFeedback.explanation && (
                  <div className="mt-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">{currentFeedback.explanationStatus === 'draft' ? 'Sharaxaad qabyo' : 'Sharaxaad'}</p>
                    <p className="mt-1 text-sm leading-6">{currentFeedback.explanation}</p>
                  </div>
                )}
                {currentFeedback.explainerAudioUrl && <audio controls preload="none" className="mt-3 w-full" src={currentFeedback.explainerAudioUrl} />}
                {currentFeedback.bookRef?.pageFrom && (
                  <button type="button" onClick={() => void loadLesson(activeChapter, currentFeedback.bookRef?.pageFrom)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-500">
                    <BookText size={15} /> Bogga buugga {currentFeedback.bookRef.pageFrom}{currentFeedback.bookRef.pageTo ? '–' + currentFeedback.bookRef.pageTo : ''}
                  </button>
                )}
                {!currentFeedback.marked && <p className="mt-2 text-xs text-amber-500">{currentFeedback.answerStatus === 'pending' ? 'Jawaab la xaqiijin doonaa. Natiijadan Pass Meter-ka laguma darin.' : 'Su’aashan waxay u baahan tahay qiimeyn macallin.'}</p>}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => Math.max(0, index - 1))} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-35">Hore</button>
              <button disabled={questionIndex >= questions.length - 1} onClick={() => setQuestionIndex(index => Math.min(questions.length - 1, index + 1))} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-35">Xiga</button>
            </div>
          </article>
        </div>
      )}

      {loading && mode !== 'year' && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/15 backdrop-blur-[1px]"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

      {highlightPopup && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onMouseDown={() => setHighlightPopup(null)} role="presentation">
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="highlight-dialog-title" className="max-h-[86vh] w-full overflow-y-auto rounded-t-[28px] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-2xl outline-none sm:max-w-2xl sm:rounded-[28px] sm:p-6" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={'inline-flex rounded-full px-3 py-1 text-xs font-black ' + relationMeta[highlightPopup.relation].className}>{relationMeta[highlightPopup.relation].label}</span>
                <h3 id="highlight-dialog-title" className="mt-3 text-lg font-black">Xiriirka imtixaanka</h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{relationMeta[highlightPopup.relation].reason}</p>
              </div>
              <button type="button" onClick={() => setHighlightPopup(null)} className="rounded-xl p-2 hover:bg-[var(--color-surface-tertiary)]" aria-label="Xir"><X size={18} /></button>
            </div>
            <div className="mt-4 rounded-2xl bg-[var(--color-surface-tertiary)]/60 p-3 text-sm font-semibold"><FormulaText text={highlightPopup.anchorText} /></div>
            <div className="mt-4 space-y-3">
              {highlightPopup.questions.map(question => (
                <article key={question._id} className="rounded-2xl border border-[var(--color-border-subtle)] p-4">
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold text-[var(--color-text-tertiary)]"><span>{question.examYear || '—'} · Su’aal {question.number}</span><span>·</span><span>{question.type.toUpperCase()}</span><span>·</span><span>{question.marks} dhibcood</span></div>
                  <p className="mt-2 text-sm font-semibold leading-6"><FormulaText text={question.textSo} /></p>
                  <button type="button" onClick={() => { if (!activeChapter) return; setHighlightPopup(null); void startPractice(activeChapter, [question]); }} className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Ka jawaab</button>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GuuldoonChaptersExperience;
