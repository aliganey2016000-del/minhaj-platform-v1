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
import {
  AnswerReveal, FormulaText, InlineFigure, LessonBody, QuestionBody, SummaryHero, isSummarySection, relationMeta, type Relation,
} from '../../shared/components/guuldoon-lesson-body';

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

type PracticeSaved = { best: number; history: { total: number; correct: number; firstTry: number; at: string }[] };
type SavedResult = { chapterId: string; source: string; total: number; correct: number; firstTry: number; at: string };

const CELEBRATION_CSS = `
@keyframes gld-fall { 0% { transform: translate3d(0,-12vh,0) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate3d(var(--dx),108vh,0) rotate(var(--rot)); opacity: .95; } }
@keyframes gld-rise { 0% { transform: translate3d(0,8vh,0) scale(.8); opacity: 0; } 12% { opacity: 1; } 100% { transform: translate3d(var(--dx),-118vh,0) scale(1.1); opacity: .9; } }
@media (prefers-reduced-motion: reduce) { .gld-particle { animation: none !important; opacity: 0 !important; } }
`;

function Celebration({ burst, big }: { burst: number; big?: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!burst) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), big ? 5200 : 3400);
    return () => window.clearTimeout(timer);
  }, [burst, big]);
  if (!visible) return null;
  const flowers = ['🌸', '🌺', '🌼', '🌷', '🎉', '🎊', '✨', '💐'];
  const count = big ? 46 : 26;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      <style>{CELEBRATION_CSS}</style>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={'f' + burst + '-' + i}
          className="gld-particle absolute top-0 text-2xl sm:text-3xl"
          style={{
            left: ((i * 37) % 100) + '%',
            animation: 'gld-fall ' + (2.4 + ((i * 13) % 17) / 10) + 's ease-in ' + (((i * 7) % 12) / 10) + 's both',
            ['--dx' as string]: (((i * 29) % 21) - 10) + 'vw',
            ['--rot' as string]: (((i * 53) % 720) - 360) + 'deg',
          }}
        >{flowers[i % flowers.length]}</span>
      ))}
      {Array.from({ length: big ? 9 : 5 }, (_, i) => (
        <span
          key={'b' + burst + '-' + i}
          className="gld-particle absolute bottom-0 text-4xl sm:text-5xl"
          style={{
            left: (8 + ((i * 41) % 84)) + '%',
            animation: 'gld-rise ' + (3 + ((i * 11) % 14) / 10) + 's ease-out ' + (((i * 5) % 10) / 10) + 's both',
            ['--dx' as string]: (((i * 17) % 13) - 6) + 'vw',
          }}
        >🎈</span>
      ))}
    </div>
  );
}

function ResultCard({ title, sourceLabel, total, correct, firstTry, durationMs, saved, onRetry, onBack }: {
  title: string;
  sourceLabel: string;
  total: number;
  correct: number;
  firstTry: number;
  durationMs: number;
  saved: PracticeSaved | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const verdict = percent >= 90 ? ['Cajiib! 🏆', 'Cutubkan aad ayaad u fahantay.']
    : percent >= 70 ? ['Aad u fiican! 🎉', 'Waad ku dhawdahay heerka sare, sii wad.']
      : percent >= 50 ? ['Wanaagsan 💪', 'Dib u eeg qaybaha aad ku qaldantay oo isku day mar kale.']
        : ['Ha quusan 📖', 'Dib u akhri cutubka, kadibna isku day mar kale.'];
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const stats: [string, string | number, string][] = [
    ['Mar koowaad sax', firstTry, 'from-emerald-500 to-teal-400'],
    ['Wadarta sax', correct, 'from-sky-500 to-indigo-400'],
    ['Khalad', total - correct, 'from-rose-500 to-pink-400'],
    ['Waqtiga', minutes + ' daq', 'from-amber-500 to-orange-400'],
  ];
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-emerald-600 via-teal-500 to-sky-500 p-6 text-center text-white shadow-xl shadow-emerald-600/25 sm:p-8">
        <div aria-hidden="true" className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-white/15" />
        <div aria-hidden="true" className="absolute -bottom-12 -right-8 h-40 w-40 rounded-full bg-amber-300/25" />
        <p className="relative text-[11px] font-black uppercase tracking-[.2em] text-white/80">{sourceLabel} · Natiijada</p>
        <h3 className="relative mt-1 truncate text-lg font-black">{title}</h3>
        <div className="relative mx-auto mt-5 flex h-40 w-40 items-center justify-center rounded-full" style={{ background: 'conic-gradient(#fde68a ' + percent * 3.6 + 'deg, rgba(255,255,255,.22) 0deg)' }}>
          <div className="flex h-[124px] w-[124px] flex-col items-center justify-center rounded-full bg-[#06302f]">
            <strong className="text-4xl font-black tabular-nums">{percent}%</strong>
            <span className="text-[11px] text-white/70">{correct}/{total} sax</span>
          </div>
        </div>
        <p className="relative mt-5 text-2xl font-black">{verdict[0]}</p>
        <p className="relative mt-1 text-sm font-medium text-white/90">{verdict[1]}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value, tone]) => (
          <div key={label} className={'rounded-2xl bg-gradient-to-br p-3 text-center text-white shadow ' + tone}>
            <strong className="block text-2xl font-black tabular-nums">{value}</strong>
            <span className="text-[11px] font-semibold text-white/90">{label}</span>
          </div>
        ))}
      </div>
      <div className="student-glass-card rounded-[24px] p-4">
        <p className="text-sm font-black">{saved ? '✓ Natiijada waa la keydiyay' : 'Natiijada waa la keydinayaa…'}</p>
        {saved && (
          <>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Natiijadaada ugu wanaagsan: <b>{saved.best}%</b> · isku dayada la keydiyay: {saved.history.length}</p>
            <div className="mt-3 flex items-end gap-1.5" aria-label="Isku dayadii hore">
              {[...saved.history].reverse().map((item, i) => {
                const value = Math.round((item.correct / item.total) * 100);
                return <div key={i} title={value + '%'} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t-lg bg-gradient-to-t from-emerald-600 to-teal-300" style={{ height: Math.max(6, value * 0.6) + 'px' }} /><span className="text-[10px] tabular-nums text-[var(--color-text-tertiary)]">{value}</span></div>;
              })}
            </div>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onRetry} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">Dib u bilow</button>
        <button onClick={onBack} className="rounded-xl border border-[var(--color-border-default)] px-4 py-3 text-sm font-black">Cutubyada</button>
      </div>
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
  const [mode, setMode] = useState<'list' | 'lesson' | 'year' | 'hub' | 'practice' | 'result'>('list');
  const [activeChapter, setActiveChapter] = useState<GuuldoonStudentChapter | null>(null);
  const [lesson, setLesson] = useState<LessonPayload | null>(null);
  const [sectionIndex, setSectionIndex] = useState<number | null>(null);
  const [yearCounts, setYearCounts] = useState<{ year: number; count: number }[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [tries, setTries] = useState<Record<string, number>>({});
  const [retryNotice, setRetryNotice] = useState<Record<string, boolean>>({});
  const [firstTry, setFirstTry] = useState<Record<string, boolean>>({});
  const [burst, setBurst] = useState(0);
  const [bigBurst, setBigBurst] = useState(false);
  const [saved, setSaved] = useState<PracticeSaved | null>(null);
  const [finalStats, setFinalStats] = useState({ total: 0, correct: 0, firstTry: 0, durationMs: 0 });
  const [hubHistory, setHubHistory] = useState<SavedResult[]>([]);
  const startedAt = useRef(0);
  const [hubTab, setHubTab] = useState<'understand' | 'past'>('understand');
  const [understandQuestions, setUnderstandQuestions] = useState<Question[]>([]);
  const [practiceSource, setPracticeSource] = useState<'understand' | 'past' | 'single'>('past');
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

  const startPractice = async (chapter: GuuldoonStudentChapter, supplied?: Question[], source: 'understand' | 'past' | 'single' = 'past') => {
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
      setTries({});
      setRetryNotice({});
      setFirstTry({});
      setSaved(null);
      startedAt.current = Date.now();
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
      try {
        const history = await api.get('/guuldoon/courses/' + courseId + '/practice-results', { params: { chapterId: chapter.id } });
        setHubHistory((history.data.data || []) as SavedResult[]);
      } catch {
        setHubHistory([]);
      }
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
    const attempt = tries[question._id] || 0;
    setAnswering(true);
    setError('');
    try {
      const { data } = await api.post('/guuldoon/questions/' + question._id + '/answer', {
        answer: answers[question._id],
        retry: attempt >= 1,
      });
      const result = data.data as Feedback;
      if (result.marked && !result.correct && attempt === 0) {
        setTries(current => ({ ...current, [question._id]: 1 }));
        setRetryNotice(current => ({ ...current, [question._id]: true }));
      } else {
        setTries(current => ({ ...current, [question._id]: attempt + 1 }));
        setRetryNotice(current => ({ ...current, [question._id]: false }));
        setFeedback(current => ({ ...current, [question._id]: result }));
        if (result.marked && result.correct) {
          if (attempt === 0) setFirstTry(current => ({ ...current, [question._id]: true }));
          setBurst(value => value + 1);
        }
      }
      await onProgressChanged?.();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Jawaabta lama gudbin karin.');
    } finally {
      setAnswering(false);
    }
  };

  const retryQuestion = (question: Question) => {
    setRetryNotice(current => ({ ...current, [question._id]: false }));
    setAnswers(current => {
      const next = { ...current };
      delete next[question._id];
      return next;
    });
  };

  const finishPractice = async () => {
    if (!activeChapter) return;
    const marked = questions.filter(question => feedback[question._id]?.marked);
    const correct = marked.filter(question => feedback[question._id]?.correct).length;
    const first = marked.filter(question => firstTry[question._id]).length;
    if (questions.length < 2 || !marked.length) {
      backToList();
      return;
    }
    const durationMs = Math.max(0, Date.now() - startedAt.current);
    setFinalStats({ total: marked.length, correct, firstTry: first, durationMs });
    setSaved(null);
    setMode('result');
    const percent = Math.round((correct / marked.length) * 100);
    setBigBurst(percent >= 70);
    if (percent >= 50) setBurst(value => value + 1);
    try {
      const { data } = await api.post('/guuldoon/courses/' + courseId + '/practice-results', {
        chapterId: activeChapter.id,
        source: practiceSource,
        total: marked.length,
        correct,
        firstTry: first,
        durationMs,
      });
      setSaved({ best: data.data.best, history: data.data.history });
    } catch {
      setError('Natiijada lama keydin karin. Hubi internetka.');
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
                  {hubHistory.filter(item => item.source === 'understand')[0] && <p className="mt-4 text-xs text-[var(--color-text-tertiary)]">Natiijadii ugu dambeysay: <b>{hubHistory.filter(item => item.source === 'understand')[0].correct}/{hubHistory.filter(item => item.source === 'understand')[0].total}</b></p>}
                  <button onClick={() => void startPractice(activeChapter, understandQuestions, 'understand')} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">Bilow</button>
                </>
              ) : <p className="mt-4 rounded-2xl border border-dashed p-5 text-center text-sm text-[var(--color-text-tertiary)]">Su’aalaha fahamka cutubkan wali lama diyaarin.</p>}
            </div>
          ) : (
            <div className="student-glass-card rounded-[26px] p-5">
              <h3 className="text-lg font-black">Imtixaanadii hore</h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Su’aalihii imtixaanadii hore ee cutubkan; ka jawaab, hubi, kuna dar Pass Meter-kaaga.</p>
              <p className="mt-4 text-sm font-bold">{activeChapter.questionCount} su’aalood · {activeChapter.yearCount || activeChapter.yearCounts?.length || 0} sano</p>
              {hubHistory.filter(item => item.source === 'past')[0] && <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Natiijadii ugu dambeysay: <b>{hubHistory.filter(item => item.source === 'past')[0].correct}/{hubHistory.filter(item => item.source === 'past')[0].total}</b></p>}
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
                  <button key={index} disabled={!!currentFeedback || retryNotice[currentQuestion._id]} onClick={() => setAnswers(current => ({ ...current, [currentQuestion._id]: index }))} className={'rounded-2xl border p-4 text-left text-sm font-semibold transition ' + (answers[currentQuestion._id] === index ? (currentFeedback?.marked ? (currentFeedback.correct ? 'border-emerald-500 bg-emerald-500/20 ring-2 ring-emerald-500/40' : 'border-red-500 bg-red-500/15 ring-2 ring-red-500/30') : retryNotice[currentQuestion._id] ? 'border-red-500 bg-red-500/10' : 'border-emerald-500 bg-emerald-500/10') : 'border-[var(--color-border-subtle)] hover:border-emerald-500/40')}>
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
                        disabled={!!currentFeedback || retryNotice[currentQuestion._id]}
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
              <textarea disabled={!!currentFeedback || retryNotice[currentQuestion._id]} value={String(answers[currentQuestion._id] ?? '')} onChange={event => setAnswers(current => ({ ...current, [currentQuestion._id]: event.target.value }))} rows={currentQuestion.type === 'fill' ? 2 : 5} placeholder="Ku qor jawaabtaada..." className="mt-5 w-full rounded-2xl border border-[var(--color-border-default)] bg-transparent p-4 text-sm outline-none focus:border-emerald-500" />
            )}

            {!currentFeedback && !retryNotice[currentQuestion._id] && (
              <button disabled={answering || !isReady(currentQuestion)} onClick={() => void submitAnswer(currentQuestion)} className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50 sm:w-auto">
                {answering ? 'Waa la hubinayaa...' : (tries[currentQuestion._id] || 0) >= 1 ? 'Hubi jawaabta (isku day 2/2)' : 'Hubi jawaabta'}
              </button>
            )}

            {retryNotice[currentQuestion._id] && !currentFeedback && (
              <div role="status" className="mt-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="text-base font-black text-amber-600">😅 Khalad. Isku day mar kale!</p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Jawaabtan ma saxna. Dib u fakar, kadibna dooro jawaab kale.</p>
                <button onClick={() => retryQuestion(currentQuestion)} className="mt-3 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-black text-white">Isku day mar kale</button>
              </div>
            )}

            {currentFeedback && (
              <div role="status" className={'mt-5 rounded-2xl border p-4 ' + (currentFeedback.marked ? currentFeedback.correct ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-teal-500/10' : 'border-red-500/40 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10')}>
                {currentFeedback.marked && currentFeedback.correct && <p className="text-lg font-black text-emerald-600">🎉 Sax! Hambalyo{(tries[currentQuestion._id] || 0) > 1 ? ' — mar labaad ayaad saxday' : ''}!</p>}
                {currentFeedback.marked && !currentFeedback.correct && <p className="text-base font-black text-red-500">❌ Mar labaad ayaad qaldey.</p>}
                {!currentFeedback.marked && <p className="font-black">Jawaabtaada waa la xaqiijin doonaa</p>}
                {currentFeedback.answerDisplay && (!currentFeedback.marked || !currentFeedback.correct) && (
                  <div className="mt-2 rounded-xl bg-[var(--color-surface-primary)]/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-emerald-600">{currentFeedback.marked ? 'Xusuusnow: jawaabta saxda ah' : 'Jawaabta tusaalaha'}</p>
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
                {!currentFeedback.marked && <p className="mt-2 text-xs text-amber-500">{currentFeedback.answerStatus === 'pending' ? 'Su’aashan natiijadeeda Pass Meter-ka laguma darin.' : 'Su’aashan waxay u baahan tahay qiimeyn macallin.'}</p>}
                <button
                  onClick={() => (questionIndex >= questions.length - 1 ? void finishPractice() : setQuestionIndex(index => index + 1))}
                  className="mt-4 w-full rounded-2xl bg-gradient-to-r from-sky-600 to-emerald-500 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-sky-600/20 sm:w-auto"
                >{questionIndex >= questions.length - 1 ? 'Dhammee · arag natiijada ✓' : 'Xiga →'}</button>
              </div>
            )}
          </article>
        </div>
      )}

      {mode === 'result' && activeChapter && (
        <ResultCard
          title={activeChapter.title}
          sourceLabel={practiceSource === 'understand' ? 'Fahamka cutubka' : 'Imtixaanadii hore'}
          total={finalStats.total}
          correct={finalStats.correct}
          firstTry={finalStats.firstTry}
          durationMs={finalStats.durationMs}
          saved={saved}
          onRetry={() => void startPractice(activeChapter, questions, practiceSource)}
          onBack={backToList}
        />
      )}

      <Celebration burst={burst} big={bigBurst && mode === 'result'} />

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
                  <button type="button" onClick={() => { if (!activeChapter) return; setHighlightPopup(null); void startPractice(activeChapter, [question], 'single'); }} className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Ka jawaab</button>
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
