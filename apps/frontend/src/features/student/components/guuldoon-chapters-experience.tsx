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

const ANSWER_PATTERN = /\s*\((?:Answers?|Ans)[:.]\s*([\s\S]+)\)\s*$/i;

function splitAnswer(text: string): { question: string; answer: string } {
  const match = ANSWER_PATTERN.exec(text);
  if (!match) return { question: text, answer: '' };
  return { question: text.slice(0, match.index).trim(), answer: match[1].trim() };
}

function AnswerReveal({ answer }: { answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="mt-1.5 block">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600">
        {open ? 'Qari jawaabta' : 'Muuji jawaabta'}
      </button>
      {open && (
        <span className="mt-2 block rounded-xl border-l-4 border-emerald-500 bg-emerald-500/10 px-3 py-2 text-sm font-semibold">
          <span className="block text-[10px] font-black uppercase tracking-wide text-emerald-600">Jawaabta buugga</span>
          <FormulaText text={answer} />
        </span>
      )}
    </span>
  );
}

function LessonFigures({ figures }: { figures: string[] }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  if (!figures.length) return null;
  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-black text-sky-500">
        <ImageIcon size={14} /> {open ? 'Qari sawirada buugga' : 'Sawirada buugga (' + figures.length + ' bog)'}
      </button>
      {open && (
        <div className="mt-3 grid gap-3">
          {figures.map((figure, index) => (
            <button key={figure} type="button" onClick={() => setZoom(figure)} className="overflow-hidden rounded-2xl border bg-white text-left" aria-label={'Fur sawirka ' + (index + 1)}>
              <img src={figure} alt={'Bog buugga ' + (index + 1)} loading="lazy" className="w-full" />
            </button>
          ))}
        </div>
      )}
      {zoom && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] overflow-auto bg-black/90 p-3" onClick={() => setZoom(null)}>
          <button type="button" className="fixed right-3 top-3 z-[81] rounded-full bg-white px-4 py-2 text-sm font-black text-black" onClick={() => setZoom(null)}>Xidh</button>
          <img src={zoom} alt="" className="mx-auto mt-12 w-[220%] max-w-none sm:w-full sm:max-w-3xl" onClick={event => event.stopPropagation()} />
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
        if (block.kind === 'p') { const { question, answer } = splitAnswer(block.text); return <p key={index}>{inline(question)}{answer && <AnswerReveal answer={answer} />}</p>; }
        if (block.kind === 'ul') return <ul key={index} className="space-y-2 pl-1">{block.items.map((item, i) => <li key={i} className="flex gap-3"><span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><span>{(() => { const { question, answer } = splitAnswer(item); return <>{inline(question)}{answer && <AnswerReveal answer={answer} />}</>; })()}</span></li>)}</ul>;
        if (block.kind === 'ol') return <ol key={index} className="space-y-2">{block.items.map((item, i) => <li key={i} className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-black text-emerald-600">{i + 1}</span><span>{(() => { const { question, answer } = splitAnswer(item); return <>{inline(question)}{answer && <AnswerReveal answer={answer} />}</>; })()}</span></li>)}</ol>;
        const meta = calloutMeta[block.tag] || calloutMeta.note;
        return (
          <aside key={index} className={'rounded-2xl border-l-4 p-4 ' + meta.className}>
            <p className="mb-2 text-xs font-black uppercase tracking-wide"><span aria-hidden="true">{meta.icon} </span>{meta.label}{block.title ? ' · ' + block.title : ''}</p>
            <div className="space-y-1.5">
              {block.lines.map((line, i) => line.startsWith('- ')
                ? <p key={i} className="flex gap-2"><span aria-hidden="true">•</span><span>{inline(line.slice(2))}</span></p>
                : <p key={i} className={block.tag === 'formula' ? 'font-mono text-[.95em]' : ''} dir={block.tag === 'formula' ? 'ltr' : undefined}>{inline(line)}</p>)}
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
  const [mode, setMode] = useState<'list' | 'lesson' | 'year' | 'practice'>('list');
  const [activeChapter, setActiveChapter] = useState<GuuldoonStudentChapter | null>(null);
  const [lesson, setLesson] = useState<LessonPayload | null>(null);
  const [sectionIndex, setSectionIndex] = useState<number | null>(null);
  const [yearCounts, setYearCounts] = useState<{ year: number; count: number }[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
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
      const payload = data.data as LessonPayload;
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
        params: { year, limit: 200 },
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

  const startPractice = async (chapter: GuuldoonStudentChapter, supplied?: Question[]) => {
    setLoading(true);
    setError('');
    try {
      let rows: Question[] = supplied || [];
      if (!supplied) {
        const { data } = await api.get('/guuldoon/courses/' + courseId + '/chapters/' + chapter.id + '/questions', {
          params: { limit: 30 },
        });
        rows = (data.data.questions || []) as Question[];
      }
      if (!rows.length) {
        setError('Cutubkan wali su’aalo published ah laguma darin.');
        return;
      }
      setActiveChapter(chapter);
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

  const submitAnswer = async (question: Question) => {
    if (answers[question._id] === undefined || answering) return;
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
                  <p className="mt-1 text-xs leading-5 text-emerald-50/70">Akhri → Tababar → Su’aalaha sannadaha.</p>
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
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sm font-black text-sky-500">2</span>
                          <div className="min-w-0 flex-1"><p className="text-sm font-black">{chapter.started ? 'Sii wad tababarka' : 'Tababar'}</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{chapter.questionCount} su’aalood</p></div>
                          <button onClick={() => void startPractice(chapter)} className="rounded-xl border border-sky-500/30 px-3 py-2 text-xs font-black text-sky-500">Bilow</button>
                        </div>

                        <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-sm font-black text-amber-500">3</span>
                          <div className="min-w-0 flex-1"><p className="text-sm font-black">Su’aalaha sanad kasta</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{years.length ? years.length + ' sano, dooro sanad si aad u aragto sidii loo weydiiyay' : 'Su’aalo published ah wali ma jiraan.'}</p></div>
                          <button
                            disabled={!years.length}
                            onClick={() => void loadYearQuestions(chapter, years[0].year)}
                            className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs font-black text-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >Dooro</button>
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
                    <button key={section.id} type="button" onClick={() => setSectionIndex(index)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/45 p-4 text-left transition hover:border-emerald-500/30 hover:bg-emerald-500/[.06]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-xs font-black text-emerald-500">{section.order}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">{section.title}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{section.pageFrom ? 'Bogagga ' + section.pageFrom + (section.pageTo ? '–' + section.pageTo : '') : 'Qoraalka casharka'}</p>
                      </div>
                      <ChevronRight size={18} className="text-[var(--color-text-tertiary)]" />
                    </button>
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

                <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold">
                  {(Object.keys(relationMeta) as Relation[]).map(relation => (
                    <span key={relation} className={'rounded-full px-2.5 py-1 ' + relationMeta[relation].className}>{relationMeta[relation].label}</span>
                  ))}
                </div>

                <LessonFigures key={section.id} figures={section.figureFiles || []} />

                <div dir={section.direction === 'rtl' || section.language === 'ar' ? 'rtl' : section.direction === 'ltr' ? 'ltr' : 'auto'} className="mt-5">
                  <LessonBody content={section.contentText || 'Qoraalka casharka wali lama gelin.'} highlights={section.highlights || []} visible={highlightsVisible} onOpen={setHighlightPopup} />
                </div>

                <div className="mt-7 grid grid-cols-2 gap-2 sm:flex sm:justify-between">
                  <button disabled={sectionIndex === 0} onClick={() => setSectionIndex(index => Math.max(0, (index || 0) - 1))} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-35"><ChevronLeft size={16} /> Hore</button>
                  {!isLast ? (
                    <button onClick={() => setSectionIndex(index => Math.min(lesson.sections.length - 1, (index || 0) + 1))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white">Qaybta xigta <ChevronRight size={16} /></button>
                  ) : (
                    <button disabled={!activeChapter} onClick={() => activeChapter && void startPractice(activeChapter)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">Bilow tababarka</button>
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
                  {(question.figureUrl || question.figureFiles?.length) && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-500"><ImageIcon size={12} /> Sawir leh</span>}
                  <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-500">{question.type.toUpperCase()}</span>
                </div>
                <p dir={question.direction === 'rtl' || question.language === 'ar' ? 'rtl' : 'auto'} className="mt-3 text-sm font-semibold leading-6"><FormulaText text={question.textSo} /></p>
                <button onClick={() => void startPractice(activeChapter, [question])} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white">Ka jawaab</button>
              </article>
            ))}
          </div>
        </div>
      )}

      {mode === 'practice' && activeChapter && currentQuestion && (
        <div className="space-y-4">
          <div className="student-glass-card flex flex-wrap items-center justify-between gap-3 rounded-[24px] p-4">
            <button onClick={backToList} className="inline-flex items-center gap-2 text-sm font-black"><ArrowLeft size={17} /> Cutubyada</button>
            <div className="min-w-0 flex-1 text-center"><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Tababar</p><h2 className="truncate font-black">{activeChapter.title}</h2></div>
            <span className="text-xs font-bold text-[var(--color-text-tertiary)]">{questionIndex + 1}/{questions.length}</span>
          </div>

          <article className="student-glass-card rounded-[28px] p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-500">{currentQuestion.examYear || '—'} · Su’aal {currentQuestion.number} · {currentQuestion.marks} dhibcood</span>
              <span className="rounded-full bg-violet-500/10 px-3 py-1 text-violet-500">{currentQuestion.type.toUpperCase()}</span>
            </div>

            <h3 dir={currentQuestion.direction === 'rtl' || currentQuestion.language === 'ar' ? 'rtl' : 'auto'} className="mt-5 text-lg font-black leading-8"><FormulaText text={currentQuestion.textSo} /></h3>
            {(currentQuestion.figureFiles?.length ? currentQuestion.figureFiles : currentQuestion.figureUrl ? [currentQuestion.figureUrl] : []).map((figure, index) => <img key={figure + index} src={figure} alt="" className="mt-4 max-h-72 rounded-xl object-contain" />)}

            {currentQuestion.type === 'mcq' && currentQuestion.options?.length ? (
              <div className="mt-5 grid gap-3">
                {currentQuestion.options.map((option, index) => (
                  <button key={index} disabled={!!currentFeedback} onClick={() => setAnswers(current => ({ ...current, [currentQuestion._id]: index }))} className={'rounded-2xl border p-4 text-left text-sm font-semibold transition ' + (answers[currentQuestion._id] === index ? 'border-emerald-500 bg-emerald-500/10' : 'border-[var(--color-border-subtle)] hover:border-emerald-500/40')}>
                    {String.fromCharCode(65 + index)}. {option}
                  </button>
                ))}
              </div>
            ) : (
              <textarea disabled={!!currentFeedback} value={String(answers[currentQuestion._id] ?? '')} onChange={event => setAnswers(current => ({ ...current, [currentQuestion._id]: event.target.value }))} rows={5} placeholder="Ku qor jawaabtaada..." className="mt-5 w-full rounded-2xl border border-[var(--color-border-default)] bg-transparent p-4 text-sm outline-none focus:border-emerald-500" />
            )}

            {!currentFeedback ? (
              <button disabled={answering || answers[currentQuestion._id] === undefined} onClick={() => void submitAnswer(currentQuestion)} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{answering ? 'Waa la hubinayaa...' : 'Gudbi jawaabta'}</button>
            ) : (
              <div className={'mt-5 rounded-2xl border p-4 ' + (currentFeedback.marked ? currentFeedback.correct ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10')}>
                <p className="font-black">{currentFeedback.marked ? currentFeedback.correct ? '✓ Sax' : '✕ Khalad' : 'Jawaab la xaqiijin doonaa'}</p>
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
