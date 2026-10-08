import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Eye,
  EyeOff,
  GraduationCap,
  ListFilter,
  BookText,
  Home,
  PlayCircle,
  RotateCcw,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import api from '../../../lib/axios';

type Tab = 'home' | 'chapters' | 'exams' | 'mistakes';

type LessonItem = {
  id: string;
  title: string;
  type: string;
  duration: number;
  videoSeconds: number;
  hasVideo: boolean;
  url?: string;
  contentText?: string;
  pageFrom?: number | null;
  pageTo?: number | null;
  language?: 'so' | 'en' | 'ar';
  direction?: 'ltr' | 'rtl' | 'auto';
  offlineAvailable?: boolean;
  notes: { name: string; url: string; type: string }[];
};

type Chapter = {
  id: string;
  title: string;
  description: string;
  order: number;
  examWeight: number;
  mastery: number;
  confidence: number;
  attempts: number;
  started?: boolean;
  questionCount: number;
  yearCount?: number;
  yearCounts?: { year: number; count: number }[];
  outsideBook?: boolean;
  items: LessonItem[];
};

type ExamSummary = {
  id: string;
  year: number;
  durationMin: number;
  totalMarks: number;
  answerKeyStatus: 'verified' | 'pending';
};

type Experience = {
  course: {
    id: string;
    title: { en?: string; so?: string; ar?: string };
    description?: { en?: string; so?: string; ar?: string };
    thumbnail?: string;
    grade: number;
    language?: 'so' | 'en' | 'ar';
  };
  studentName: string;
  passMeter: number;
  passTarget: number;
  targetExamDate?: string | null;
  chapters: Chapter[];
  weakest: { id: string; title: string; examWeight: number; mastery: number }[];
  continueItem?: (LessonItem & { chapterId: string; chapterTitle: string }) | null;
  exams: ExamSummary[];
  mistakeSummary: { total: number; today: number; tomorrow: number; thisWeek: number };
  glossary: { termSo: string; termEn: string; termAr: string }[];
};

type ExamQuestion = {
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
  topicTags: string[];
  answerStatus: 'verified' | 'pending';
  examYear?: number | null;
  bookRef?: { bookId?: string; pageFrom?: number; pageTo?: number };
  bookAnchorText?: string;
  bookRelation?: 'direct' | 'indirect' | 'similar' | 'derived';
};

type LoadedExam = {
  exam: ExamSummary & { source?: string };
  questions: ExamQuestion[];
};

type HighlightRelation = 'direct' | 'indirect' | 'similar' | 'derived';

type LessonHighlight = {
  anchorText: string;
  relation: HighlightRelation;
  questions: ExamQuestion[];
};

type LessonSection = {
  id: string;
  externalId: string;
  order: number;
  title: string;
  type: string;
  url?: string;
  contentText: string;
  pageFrom?: number | null;
  pageTo?: number | null;
  language?: 'so' | 'en' | 'ar';
  direction?: 'ltr' | 'rtl' | 'auto';
  highlights: LessonHighlight[];
};

type LessonView = {
  chapter: { id: string; title: string; language: 'so' | 'en' | 'ar'; outsideBook?: boolean };
  sections: LessonSection[];
  selectedIndex: number | null;
};

type YearView = {
  chapter: Chapter;
  yearCounts: { year: number; count: number }[];
  selectedYear: number;
  questions: ExamQuestion[];
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

function formatVideo(seconds: number) {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function FormulaText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g).filter(Boolean);
  return <>
    {parts.map((part, index) => {
      const formula = part.startsWith('export function GuuldoonCourseExperience() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('home');
  const [data, setData] = useState<Experience | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const [exam, setExam] = useState<LoadedExam | null>(null);
  const [practiceLabel, setPracticeLabel] = useState('');
  const [examLoading, setExamLoading] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [feedback, setFeedback] = useState<Record<string, any>>({});
  const [answering, setAnswering] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [mistakesLoading, setMistakesLoading] = useState(false);
  const [glossaryTerm, setGlossaryTerm] = useState<Experience['glossary'][number] | null>(null);
  const [resourcePreview, setResourcePreview] = useState<LessonItem | null>(null);
  const [chapterFilter, setChapterFilter] = useState<'order' | 'important' | 'notStarted'>('order');
  const [lessonView, setLessonView] = useState<LessonView | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [yearView, setYearView] = useState<YearView | null>(null);
  const [highlightsVisible, setHighlightsVisible] = useState(true);
  const [highlightPopup, setHighlightPopup] = useState<LessonHighlight | null>(null);

  const loadExperience = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/experience`, {
        params: { _state: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      });
      const payload = response.data as Experience;
      setData(payload);
      setOpenChapter(payload.chapters[0]?.id || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Guuldoon course-ka lama soo rari karin.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { void loadExperience(); }, [loadExperience]);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0 || !exam) return;
    const timer = window.setInterval(() => {
      setSecondsLeft(current => current === null ? null : Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft, exam]);

  useEffect(() => {
    if (!highlightPopup) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHighlightPopup(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [highlightPopup]);

  const daysLeft = useMemo(() => {
    if (!data?.targetExamDate) return null;
    return Math.max(0, Math.ceil((new Date(data.targetExamDate).getTime() - Date.now()) / 86400000));
  }, [data?.targetExamDate]);

  const openExam = async (summary: ExamSummary) => {
    if (!courseId) return;
    setExamLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/exams/${summary.id}`);
      setExam(response.data);
      setPracticeLabel('');
      setQuestionIndex(0);
      setAnswers({});
      setFeedback({});
      setSecondsLeft(summary.durationMin * 60);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Imtixaanka lama furi karin.');
    } finally {
      setExamLoading(false);
    }
  };

  const loadLesson = async (chapter: Chapter, page?: number | null) => {
    if (!courseId) return;
    setLessonLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/chapters/${chapter.id}/lesson`);
      const payload = response.data as LessonView;
      let selectedIndex: number | null = null;
      if (page) {
        const index = payload.sections.findIndex(section => {
          if (!section.pageFrom && !section.pageTo) return false;
          const from = section.pageFrom || section.pageTo || page;
          const to = section.pageTo || section.pageFrom || page;
          return page >= from && page <= to;
        });
        selectedIndex = index >= 0 ? index : null;
      }
      setLessonView({ ...payload, selectedIndex });
      setYearView(null);
      setTab('chapters');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Casharka cutubka lama furi karin.');
    } finally {
      setLessonLoading(false);
    }
  };

  const loadYearQuestions = async (chapter: Chapter, year: number) => {
    if (!courseId) return;
    setExamLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/chapters/${chapter.id}/questions`, { params: { year, limit: 200 } });
      setYearView({
        chapter,
        yearCounts: response.data.yearCounts || chapter.yearCounts || [],
        selectedYear: year,
        questions: response.data.questions || [],
      });
      setLessonView(null);
      setTab('chapters');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Su’aalaha sannadka lama furi karin.');
    } finally {
      setExamLoading(false);
    }
  };

  const answerQuestionSet = (chapter: Chapter, questions: ExamQuestion[], label: string) => {
    if (!questions.length) return;
    setExam({
      exam: {
        id: `practice-${chapter.id}`,
        year: questions[0]?.examYear || 0,
        durationMin: 15,
        totalMarks: questions.reduce((sum, question) => sum + Number(question.marks || 0), 0),
        answerKeyStatus: questions.every(question => question.answerStatus === 'verified') ? 'verified' : 'pending',
      },
      questions,
    });
    setPracticeLabel(label);
    setQuestionIndex(0);
    setAnswers({});
    setFeedback({});
    setSecondsLeft(15 * 60);
    setTab('exams');
  };

  const openChapterPractice = async (chapter: Chapter) => {
    if (!courseId) return;
    setExamLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/chapters/${chapter.id}/questions`, { params: { limit: 20 } });
      const questions = response.data.questions || [];
      if (!questions.length) {
        setError('Cutubkan wali su’aalo imtixaan oo published ah laguma darin.');
        return;
      }
      setExam({
        exam: {
          id: `practice-${chapter.id}`,
          year: 0,
          durationMin: 15,
          totalMarks: questions.reduce((sum: number, question: ExamQuestion) => sum + Number(question.marks || 0), 0),
          answerKeyStatus: 'pending',
        },
        questions,
      });
      setPracticeLabel(`Tababar: ${chapter.title}`);
      setQuestionIndex(0);
      setAnswers({});
      setFeedback({});
      setSecondsLeft(15 * 60);
      setTab('exams');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Su’aalaha cutubka lama furi karin.');
    } finally {
      setExamLoading(false);
    }
  };

  const submitAnswer = async (question: ExamQuestion) => {
    if (answers[question._id] === undefined || answering) return;
    setAnswering(true);
    try {
      const { data: response } = await api.post(`/guuldoon/questions/${question._id}/answer`, {
        answer: answers[question._id],
      });
      setFeedback(current => ({ ...current, [question._id]: response.data }));
      await loadExperience();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Jawaabta lama gudbin karin.');
    } finally {
      setAnswering(false);
    }
  };

  const openLearningItem = (item: LessonItem, fallbackIndex = 0) => {
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.contentText || item.pageFrom || item.pageTo) {
      setResourcePreview(item);
      return;
    }
    navigate(`/student/courses/${courseId}/learn`, { state: { startItemIdx: fallbackIndex } });
  };

  const loadMistakes = useCallback(async () => {
    if (!courseId) return;
    setMistakesLoading(true);
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/mistakes`);
      setMistakes(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Qaladaadka lama soo rari karin.');
    } finally {
      setMistakesLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (tab === 'mistakes') void loadMistakes();
  }, [tab, loadMistakes]);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-500" /></div>;
  }

  if (error && !data) {
    return <div className="mx-auto max-w-xl p-6 text-center"><AlertCircle className="mx-auto text-red-500" size={38} /><p className="mt-3 font-semibold">{error}</p><button onClick={() => void loadExperience()} className="mt-4 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white">Mar kale isku day</button></div>;
  }

  if (!data) return null;

  const sortedChapters = useMemo(() => {
    const rows = [...data.chapters];
    if (chapterFilter === 'important') return rows.sort((a, b) => b.examWeight - a.examWeight || a.order - b.order);
    if (chapterFilter === 'notStarted') return rows.filter(chapter => !chapter.started && chapter.attempts === 0).sort((a, b) => a.order - b.order);
    return rows.sort((a, b) => a.order - b.order);
  }, [data.chapters, chapterFilter]);

  const nextChapter = [...data.chapters].sort((a, b) => a.order - b.order).find(chapter => chapter.mastery < 75) || data.chapters[0];
  const totalWeight = data.chapters.reduce((sum, chapter) => sum + Number(chapter.examWeight || 0), 0);
  const title = data.course.language === 'ar'
    ? (data.course.title?.ar || data.course.title?.en || data.course.title?.so || 'Guuldoon')
    : data.course.language === 'so'
      ? (data.course.title?.so || data.course.title?.en || 'Guuldoon')
      : (data.course.title?.en || data.course.title?.so || 'Guuldoon');
  const currentQuestion = exam?.questions[questionIndex];
  const answeredCount = Object.keys(feedback).length;
  const correctCount = Object.values(feedback).filter((item: any) => item?.marked && item?.correct).length;
  const markedQuestions = exam?.questions.filter(question => feedback[question._id]?.marked) || [];
  const earnedMarks = markedQuestions.reduce((sum, question) => sum + (feedback[question._id]?.correct ? Number(question.marks || 0) : 0), 0);
  const markedTotalMarks = markedQuestions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
  const questionGlossary = currentQuestion
    ? data.glossary.filter(term => {
        const haystack = `${currentQuestion.textSo} ${currentQuestion.textEn || ''}`.toLowerCase();
        return haystack.includes(term.termSo.toLowerCase()) || haystack.includes(term.termEn.toLowerCase());
      }).slice(0, 8)
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-28 sm:p-6 lg:p-8 lg:pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/student/global-courses')} className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)] hover:text-emerald-600">
            <ArrowLeft size={15} /> Guuldoon Courses
          </button>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-600">Guuldoon · Grade {data.course.grade}</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>
        </div>
        <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">
          Question-first learning
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

      <nav className="hidden grid-cols-4 gap-2 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-2 sm:grid">
        {([
          ['home', Home, 'Hoyga'],
          ['chapters', BookOpen, 'Cutubyada'],
          ['exams', GraduationCap, 'Imtixaan'],
          ['mistakes', RotateCcw, 'Qaladaad'],
        ] as const).map(([value, Icon, label]) => (
          <button key={value} onClick={() => setTab(value)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ${tab === value ? 'bg-emerald-700 text-white' : 'hover:bg-[var(--color-surface-tertiary)]'}`}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </nav>

      {tab === 'home' && (
        <div className="space-y-5">
          <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
            <div className="rounded-[28px] border border-emerald-500/20 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-6 text-white shadow-lg">
              <p className="text-sm text-emerald-200">Salaan{data.studentName ? `, ${data.studentName}` : ', arday'}</p>
              <h2 className="mt-2 text-2xl font-black">Diyaar-garowgaaga</h2>
              <div className="mt-6 flex items-center gap-6">
                <div className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(rgb(16 185 129) ${data.passMeter * 3.6}deg, rgba(255,255,255,.12) 0deg)` }}>
                  <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-slate-950">
                    <strong className="text-4xl">{data.passMeter}</strong>
                    <span className="text-xs text-slate-400">/100</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm leading-6 text-slate-300">Qiyaastan waxay ku salaysan tahay tababarkaaga iyo miisaanka su'aalihii hore.</p>
                  <p className="mt-3 text-sm font-bold text-amber-300">Bartilmaameed: {data.passTarget}/100</p>
                  {daysLeft !== null && <p className="mt-1 text-xs text-slate-400">{daysLeft} maalmood ayaa ka hadhay taariikhda la dejiyey.</p>}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-6">
              <div className="flex items-center gap-3"><Target className="text-emerald-500" /><h2 className="text-lg font-black">Tababarka maanta</h2></div>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">15 daqiiqo · xoogga saar cutubyada miisaanka sare leh ee aad ugu daciifsan tahay.</p>
              <div className="mt-4 space-y-3">
                {data.weakest.length ? data.weakest.map(chapter => (
                  <button key={chapter.id} onClick={() => { setOpenChapter(chapter.id); setTab('chapters'); }} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] p-4 text-left hover:border-emerald-500/40">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 font-black text-emerald-600">{chapter.mastery}%</span>
                    <div className="min-w-0 flex-1"><p className="truncate font-bold">{chapter.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{chapter.examWeight}% dhibcaha taariikhiga ah</p></div>
                    <ChevronRight size={18} />
                  </button>
                )) : <p className="text-sm text-[var(--color-text-tertiary)]">Su'aalo tagged ah wali lama gelin.</p>}
              </div>
              <button onClick={() => setTab('chapters')} className="mt-4 w-full rounded-2xl bg-emerald-700 px-5 py-3.5 text-sm font-black text-white">Bilow tababarka maanta</button>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <h3 className="font-black">Sii wad</h3>
              {data.continueItem ? (
                <div className="mt-4">
                  <p className="text-xs text-emerald-600">{data.continueItem.chapterTitle}</p>
                  <p className="mt-1 text-lg font-bold">{data.continueItem.title}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{data.continueItem.type} {data.continueItem.videoSeconds ? `· ${formatVideo(data.continueItem.videoSeconds)}` : ''}</p>
                  <button onClick={() => openLearningItem(data.continueItem!)} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-600"><PlayCircle size={18} /> Sii wad casharka</button>
                </div>
              ) : <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Cashar la sii wado wali ma jiro.</p>}
            </div>

            <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <h3 className="font-black">Buugga Qaladaadkayga</h3>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-red-500/10 p-3"><strong className="block text-xl text-red-500">{data.mistakeSummary.today}</strong><span className="text-[11px]">Maanta</span></div>
                <div className="rounded-xl bg-amber-500/10 p-3"><strong className="block text-xl text-amber-500">{data.mistakeSummary.tomorrow}</strong><span className="text-[11px]">Berri</span></div>
                <div className="rounded-xl bg-blue-500/10 p-3"><strong className="block text-xl text-blue-500">{data.mistakeSummary.thisWeek}</strong><span className="text-[11px]">Usbuucan</span></div>
              </div>
              <button onClick={() => setTab('mistakes')} className="mt-4 text-sm font-bold text-emerald-600">Bilow dib-u-eegista →</button>
            </div>
          </section>

          {data.glossary.length > 0 && (
            <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <h3 className="font-black">Erayo farsamo</h3>
              <div className="mt-3 flex flex-wrap gap-2">{data.glossary.slice(0, 12).map(term => <button key={term.termEn} onClick={() => setGlossaryTerm(term)} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">{term.termSo}</button>)}</div>
            </section>
          )}
        </div>
      )}

      {tab === 'chapters' && (
        <section className="space-y-4">
          {lessonView ? (
            <div className="space-y-4">
              <div className="student-glass-card flex flex-wrap items-center justify-between gap-3 rounded-[24px] p-4">
                <button onClick={() => { setLessonView(null); setHighlightPopup(null); }} className="inline-flex items-center gap-2 text-sm font-black text-[var(--color-text-secondary)] hover:text-emerald-500">
                  <ArrowLeft size={17} /> Cutubyada
                </button>
                <div className="min-w-0 flex-1 sm:text-center">
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Cashar</p>
                  <h2 className="truncate font-black">{lessonView.chapter.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setHighlightsVisible(value => !value)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)]/50 px-3 py-2 text-xs font-bold"
                  aria-pressed={highlightsVisible}
                >
                  {highlightsVisible ? <Eye size={15} /> : <EyeOff size={15} />} {highlightsVisible ? 'Qari highlight' : 'Muuji highlight'}
                </button>
              </div>

              {lessonView.selectedIndex === null ? (
                <>
                  <div className="student-glass-card rounded-[26px] p-5 sm:p-6">
                    <h3 className="text-xl font-black">Qaybaha cutubka</h3>
                    <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Dooro qaybta aad rabto inaad akhrido.</p>
                    {lessonView.sections.length ? (
                      <div className="mt-5 space-y-2">
                        {lessonView.sections.map((section, index) => (
                          <button
                            key={section.id}
                            type="button"
                            onClick={() => setLessonView(current => current ? { ...current, selectedIndex: index } : current)}
                            className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/45 p-4 text-left transition hover:border-emerald-500/30 hover:bg-emerald-500/[.06]"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-xs font-black text-emerald-500">{section.order}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black">{section.title}</p>
                              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                                {section.pageFrom ? `Bogagga ${section.pageFrom}${section.pageTo ? `–${section.pageTo}` : ''}` : 'Qoraalka casharka'}
                              </p>
                            </div>
                            <ChevronRight size={18} className="text-[var(--color-text-tertiary)]" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-5 rounded-2xl border border-dashed p-7 text-center text-sm text-[var(--color-text-tertiary)]">
                        Qoraalka qaybaha casharka wali laguma darin content_text.
                      </div>
                    )}
                  </div>
                </>
              ) : (() => {
                const section = lessonView.sections[lessonView.selectedIndex];
                if (!section) return null;
                const isLast = lessonView.selectedIndex === lessonView.sections.length - 1;
                const chapter = data.chapters.find(item => item.id === lessonView.chapter.id);
                return (
                  <article className="student-glass-card rounded-[28px] p-5 sm:p-7">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Qaybta {section.order}</p>
                        <h3 className="mt-1 text-xl font-black sm:text-2xl">{section.title}</h3>
                        {section.pageFrom && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Bogagga {section.pageFrom}{section.pageTo ? `–${section.pageTo}` : ''}</p>}
                      </div>
                      <button onClick={() => setLessonView(current => current ? { ...current, selectedIndex: null } : current)} className="rounded-xl border px-3 py-2 text-xs font-bold">Qaybaha</button>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold">
                      {(Object.keys(relationMeta) as HighlightRelation[]).map(relation => (
                        <span key={relation} className={`rounded-full px-2.5 py-1 ${relationMeta[relation].className}`}>{relationMeta[relation].label}</span>
                      ))}
                    </div>

                    <div
                      dir={section.direction === 'rtl' || section.language === 'ar' ? 'rtl' : section.direction === 'ltr' ? 'ltr' : 'auto'}
                      className="mt-5 whitespace-pre-wrap text-[15px] leading-8 text-[var(--color-text-primary)] sm:text-base"
                    >
                      <HighlightedLessonText text={section.contentText || 'Qoraalka casharka wali lama gelin.'} highlights={section.highlights || []} visible={highlightsVisible} onHighlight={setHighlightPopup} />
                    </div>

                    <div className="mt-7 grid grid-cols-2 gap-2 sm:flex sm:justify-between">
                      <button
                        disabled={lessonView.selectedIndex === 0}
                        onClick={() => setLessonView(current => current ? { ...current, selectedIndex: Math.max(0, (current.selectedIndex || 0) - 1) } : current)}
                        className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-35"
                      >Hore</button>
                      {!isLast ? (
                        <button
                          onClick={() => setLessonView(current => current ? { ...current, selectedIndex: Math.min(current.sections.length - 1, (current.selectedIndex || 0) + 1) } : current)}
                          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white"
                        >Qaybta xigta</button>
                      ) : (
                        <button
                          disabled={!chapter}
                          onClick={() => chapter && void openChapterPractice(chapter)}
                          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                        >Bilow tababarka</button>
                      )}
                    </div>
                  </article>
                );
              })()}
            </div>
          ) : yearView ? (
            <div className="space-y-4">
              <div className="student-glass-card flex flex-wrap items-center gap-3 rounded-[24px] p-4">
                <button onClick={() => setYearView(null)} className="inline-flex items-center gap-2 text-sm font-black"><ArrowLeft size={17} /> Cutubyada</button>
                <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Su’aalaha sanad kasta</p><h2 className="truncate font-black">{yearView.chapter.title}</h2></div>
              </div>

              <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
                {yearView.yearCounts.map(item => (
                  <button
                    key={item.year}
                    onClick={() => void loadYearQuestions(yearView.chapter, item.year)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-black ${yearView.selectedYear === item.year ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}
                  >
                    {item.year} <span className="opacity-60">· {item.count}</span>
                  </button>
                ))}
              </div>

              <div className="grid gap-3">
                {examLoading ? <div className="p-8 text-center text-sm">Waa la soo rarayaa...</div> : yearView.questions.map(question => (
                  <article key={question._id} className="student-glass-card rounded-[24px] p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-500">{yearView.selectedYear} · Su’aal {question.number}</span>
                      <span className="rounded-full bg-slate-500/10 px-2.5 py-1">{question.marks} dhibcood</span>
                      {question.figureUrl && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-500">Sawir leh</span>}
                      <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-500">{question.type.toUpperCase()}</span>
                    </div>
                    <p dir={question.direction === 'rtl' || question.language === 'ar' ? 'rtl' : 'auto'} className="mt-3 line-clamp-3 text-sm font-semibold leading-6"><FormulaText text={question.textSo} /></p>
                    <button onClick={() => answerQuestionSet(yearView.chapter, [question], `${yearView.selectedYear} · Su’aal ${question.number}`)} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white">Ka jawaab</button>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-[.8fr_1.2fr]">
                <div className="student-dashboard-hero rounded-[26px] p-5 text-white">
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-200">Pass Meter</p>
                  <div className="mt-4 flex items-center gap-5">
                    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(rgb(52 211 153) ${data.passMeter * 3.6}deg, rgba(255,255,255,.12) 0deg)` }}>
                      <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full bg-[#071b1d]">
                        <strong className="text-3xl">{data.passMeter}%</strong>
                        <span className="text-[10px] text-white/50">Diyaar-garow</span>
                      </div>
                    </div>
                    <div><h2 className="text-xl font-black">Cutubyada</h2><p className="mt-1 text-xs leading-5 text-emerald-50/70">Akhri → Tababar → Su’aalaha sannadaha.</p></div>
                  </div>
                </div>

                <div className="student-glass-card rounded-[26px] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Cutubka xiga</p>
                  {nextChapter ? <>
                    <h3 className="mt-2 text-lg font-black">{nextChapter.title}</h3>
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{nextChapter.examWeight}% imtixaanka · {nextChapter.mastery}% mastery</p>
                    <button onClick={() => { setOpenChapter(nextChapter.id); void loadLesson(nextChapter); }} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white">Akhri cutubka</button>
                  </> : <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Cutubyo lama hayo.</p>}
                </div>
              </div>

              <div className="student-glass-card rounded-[22px] p-4">
                <div className="mb-2 flex items-center justify-between"><span className="text-xs font-black">Weight strip</span><span className="text-[10px] text-[var(--color-text-tertiary)]">{Math.round(totalWeight)}%</span></div>
                <div className="flex h-3 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                  {data.chapters.filter(ch => ch.examWeight > 0).map((chapter, index) => (
                    <div key={chapter.id} title={`${chapter.title}: ${chapter.examWeight}%`} className={index % 4 === 0 ? 'bg-emerald-500' : index % 4 === 1 ? 'bg-teal-400' : index % 4 === 2 ? 'bg-sky-500' : 'bg-amber-400'} style={{ width: `${totalWeight ? (chapter.examWeight / totalWeight) * 100 : 0}%` }} />
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-2xl font-black">Cutubyada</h2><p className="text-sm text-[var(--color-text-secondary)]">Hal cutub mar keliya ayuu furmaa.</p></div>
                <div className="flex items-center gap-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1">
                  <ListFilter size={15} className="ml-2 text-[var(--color-text-tertiary)]" />
                  {([
                    ['order', 'Isku xigga'],
                    ['important', 'Ugu muhiimsan'],
                    ['notStarted', 'Aan bilaabin'],
                  ] as const).map(([value, label]) => (
                    <button key={value} onClick={() => setChapterFilter(value)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${chapterFilter === value ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)]'}`}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {sortedChapters.map((chapter, index) => {
                  const open = openChapter === chapter.id;
                  const yearCounts = chapter.yearCounts || [];
                  return (
                    <article key={chapter.id} className="student-glass-card overflow-hidden rounded-[24px]">
                      <button onClick={() => setOpenChapter(open ? null : chapter.id)} aria-expanded={open} className="w-full p-4 text-left sm:p-5">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 font-black text-emerald-500">{chapter.order || index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 flex-1 truncate font-black">{chapter.title}</h3>
                              {chapter.outsideBook && <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-bold text-violet-500">Outside the book</span>}
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-xl bg-emerald-500/8 p-2"><strong className="block text-sm text-emerald-500">{chapter.examWeight}%</strong><span className="text-[9px] text-[var(--color-text-tertiary)]">Imtixaanka</span></div>
                              <div className="rounded-xl bg-sky-500/8 p-2"><strong className="block text-sm text-sky-500">{chapter.questionCount}</strong><span className="text-[9px] text-[var(--color-text-tertiary)]">Su’aalo</span></div>
                              <div className="rounded-xl bg-amber-500/8 p-2"><strong className="block text-sm text-amber-500">{chapter.yearCount || yearCounts.length}</strong><span className="text-[9px] text-[var(--color-text-tertiary)]">Sannado</span></div>
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full ${masteryBar(chapter.mastery)}`} style={{ width: `${chapter.mastery}%` }} /></div>
                              <strong className={`text-xs ${masteryColour(chapter.mastery)}`}>{chapter.mastery}%</strong>
                            </div>
                          </div>
                          <ChevronDown className={`mt-1 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} size={20} />
                        </div>
                      </button>

                      {open && (
                        <div className="border-t border-[var(--color-border-subtle)] p-4 sm:p-5">
                          <div className="grid gap-2">
                            <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3">
                              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-sm font-black text-emerald-500">1</span>
                              <div className="min-w-0 flex-1"><p className="text-sm font-black">Cashar: akhri cutubka</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{chapter.items.length} qaybood</p></div>
                              <button onClick={() => void loadLesson(chapter)} className={`rounded-xl px-3 py-2 text-xs font-black ${!chapter.started ? 'bg-emerald-600 text-white' : 'border border-emerald-500/30 text-emerald-500'}`}>{lessonLoading ? '...' : 'Akhri'}</button>
                            </div>

                            <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3">
                              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sm font-black text-sky-500">2</span>
                              <div className="min-w-0 flex-1"><p className="text-sm font-black">{chapter.started ? 'Sii wad tababarka' : 'Tababar'}</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{chapter.questionCount} su’aalood</p></div>
                              <button onClick={() => void openChapterPractice(chapter)} className="rounded-xl border border-sky-500/30 px-3 py-2 text-xs font-black text-sky-500">Bilow</button>
                            </div>

                            <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3">
                              <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-sm font-black text-amber-500">3</span><div><p className="text-sm font-black">Su’aalaha sanad kasta</p><p className="text-[11px] text-[var(--color-text-tertiary)]">Dooro sannad.</p></div></div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {yearCounts.length ? yearCounts.map(item => {
                                  const tone = item.count >= 8 ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20' : item.count >= 4 ? 'bg-sky-500/15 text-sky-500 border-sky-500/20' : 'bg-amber-500/15 text-amber-500 border-amber-500/20';
                                  return <button key={item.year} onClick={() => void loadYearQuestions(chapter, item.year)} className={`rounded-full border px-3 py-1.5 text-[11px] font-black ${tone}`}>{item.year} · {item.count}</button>;
                                }) : <span className="text-xs text-[var(--color-text-tertiary)]">Su’aalo published ah wali ma jiraan.</span>}
                              </div>
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
        </section>
      )}

      {tab === 'exams' && (
        <section>
          {!exam ? (
            <>
              <div className="mb-5"><h2 className="text-2xl font-black">Safarka Wakhtiga</h2><p className="text-sm text-[var(--color-text-secondary)]">Imtixaannadii hore waa bog gaar ah. Sanad jawaabtiisa aan la hubin waxaa lagu calaamadeeyaa “Jawaab la xaqiijin doonaa”.</p></div>
              {examLoading ? <p>Imtixaanka waa la furayaa...</p> : data.exams.length === 0 ? <div className="rounded-2xl border p-8 text-center text-sm text-[var(--color-text-tertiary)]">Past exams wali lama publish-gareyn.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.exams.map(item => (
                <button key={item.id} onClick={() => void openExam(item)} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md">
                  <div className="flex items-center justify-between"><strong className="text-3xl">{item.year}</strong><GraduationCap className="text-emerald-500" /></div>
                  <p className="mt-3 text-sm">{item.durationMin} daqiiqo · {item.totalMarks} dhibcood</p>
                  <p className={`mt-2 text-xs font-bold ${item.answerKeyStatus === 'verified' ? 'text-emerald-500' : 'text-amber-500'}`}>{item.answerKeyStatus === 'verified' ? 'Answer key la xaqiijiyey' : 'Jawaab la xaqiijin doonaa'}</p>
                </button>
              ))}</div>}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4">
                <button onClick={() => { setExam(null); setSecondsLeft(null); if (practiceLabel) { setPracticeLabel(''); setTab('chapters'); } }} className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16} /> {practiceLabel ? 'Cutubyada' : 'Sanadaha'}</button>
                <div className="text-center"><p className="font-black">{practiceLabel || `Imtixaanka ${exam.exam.year}`}</p><p className="text-xs text-[var(--color-text-tertiary)]">{answeredCount}/{exam.questions.length} laga jawaabay</p></div>
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${secondsLeft === 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}><Clock3 size={15} /> {secondsLeft === null ? '--:--' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}</div>
              </div>

              {currentQuestion ? (
                <article className="rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-emerald-500/10 px-3 py-1 font-black text-emerald-600">{currentQuestion.examYear ? `${currentQuestion.examYear} · ` : exam.exam.year ? `${exam.exam.year} · ` : ''}Su'aal {currentQuestion.number} · {currentQuestion.marks} dhibcood</span><span className="rounded-full bg-violet-500/10 px-3 py-1 font-bold text-violet-500">{currentQuestion.type.toUpperCase()}</span>{currentQuestion.topicTags.slice(0, 3).map(tag => <span key={tag} className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-600">{tag}</span>)}</div>
                  <h3
                    dir={currentQuestion.direction === 'rtl' || currentQuestion.language === 'ar' ? 'rtl' : currentQuestion.direction === 'ltr' ? 'ltr' : 'auto'}
                    className="mt-5 text-lg font-black leading-8"
                  ><FormulaText text={currentQuestion.textSo} /></h3>
                  {(currentQuestion.figureFiles?.length ? currentQuestion.figureFiles : currentQuestion.figureUrl ? [currentQuestion.figureUrl] : []).map((figure, index) => <img key={figure + index} src={figure} alt="" className="mt-4 max-h-72 rounded-xl object-contain" />)}
                  {questionGlossary.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{questionGlossary.map(term => <button key={term.termEn} type="button" onClick={() => setGlossaryTerm(term)} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">{term.termSo} · {term.termEn}</button>)}</div>}
                  {currentQuestion.type === 'mcq' && currentQuestion.options ? (
                    <div className="mt-5 grid gap-3">{currentQuestion.options.map((option, index) => (
                      <button key={index} disabled={!!feedback[currentQuestion._id]} onClick={() => setAnswers(current => ({ ...current, [currentQuestion._id]: index }))} className={`rounded-2xl border p-4 text-left text-sm font-semibold transition ${answers[currentQuestion._id] === index ? 'border-emerald-500 bg-emerald-500/10' : 'border-[var(--color-border-subtle)] hover:border-emerald-500/40'}`}>{String.fromCharCode(65 + index)}. {option}</button>
                    ))}</div>
                  ) : (
                    <textarea disabled={!!feedback[currentQuestion._id]} value={String(answers[currentQuestion._id] ?? '')} onChange={event => setAnswers(current => ({ ...current, [currentQuestion._id]: event.target.value }))} rows={5} placeholder="Ku qor jawaabtaada..." className="mt-5 w-full rounded-2xl border border-[var(--color-border-default)] bg-transparent p-4 text-sm outline-none focus:border-emerald-500" />
                  )}

                  {!feedback[currentQuestion._id] ? (
                    <button disabled={answering || answers[currentQuestion._id] === undefined || secondsLeft === 0} onClick={() => void submitAnswer(currentQuestion)} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{answering ? 'Waa la hubinayaa...' : 'Gudbi jawaabta'}</button>
                  ) : (
                    <div className={`mt-5 rounded-2xl border p-4 ${feedback[currentQuestion._id].marked ? feedback[currentQuestion._id].correct ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                      <p className="font-black">{feedback[currentQuestion._id].marked ? feedback[currentQuestion._id].correct ? '✓ Sax' : '✕ Khalad' : feedback[currentQuestion._id].message || 'Jawaab la xaqiijin doonaa'}</p>
                      {feedback[currentQuestion._id].explanation && <div className="mt-2"><p className="text-[10px] font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">{feedback[currentQuestion._id].explanationStatus === 'draft' ? 'Sharaxaad qabyo' : 'Sharaxaad'}</p><p className="mt-1 text-sm leading-6">{feedback[currentQuestion._id].explanation}</p></div>}
                      {feedback[currentQuestion._id].explainerAudioUrl && <audio controls preload="none" className="mt-3 w-full" src={feedback[currentQuestion._id].explainerAudioUrl} />}
                      {feedback[currentQuestion._id].bookRef?.pageFrom && <button type="button" onClick={() => { const chapter = data.chapters.find(item => item.id === currentQuestion.chapterId); if (chapter) void loadLesson(chapter, feedback[currentQuestion._id].bookRef.pageFrom); }} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-500"><BookText size={15} /> Bogga buugga {feedback[currentQuestion._id].bookRef.pageFrom}{feedback[currentQuestion._id].bookRef.pageTo ? `–${feedback[currentQuestion._id].bookRef.pageTo}` : ''}</button>}
                      {feedback[currentQuestion._id].similar?.length > 0 && <div className="mt-4"><p className="text-xs font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">2 su'aalood oo la mid ah</p><div className="mt-2 space-y-2">{feedback[currentQuestion._id].similar.slice(0, 2).map((similar: any) => <div key={similar._id} className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3 text-sm font-semibold">{similar.textSo}</div>)}</div></div>}
                      {feedback[currentQuestion._id].marked === false && <p className="mt-2 text-xs text-amber-600">{feedback[currentQuestion._id].answerStatus === 'verified' ? 'Su’aashan auto-marking ma leh; qiimeynta macallinka ayaa loo baahan yahay.' : 'Natiijadan laguma darin Pass Meter-ka ilaa answer key-ga la xaqiijiyo.'}</p>}
                    </div>
                  )}

                  <div className="mt-6 flex items-center justify-between">
                    <button disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => Math.max(0, index - 1))} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">Hore</button>
                    <span className="text-xs text-[var(--color-text-tertiary)]">{questionIndex + 1} / {exam.questions.length}</span>
                    <button disabled={questionIndex >= exam.questions.length - 1} onClick={() => setQuestionIndex(index => Math.min(exam.questions.length - 1, index + 1))} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">Xiga</button>
                  </div>
                </article>
              ) : <div className="rounded-2xl border p-6">Su'aalo ma jiraan.</div>}

              {answeredCount > 0 && (
                <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 text-sm">
                  <strong>{answeredCount === exam.questions.length ? 'Natiijada:' : 'Natiijada hadda:'}</strong> {correctCount} sax · {answeredCount} laga jawaabay.
                  {markedTotalMarks > 0 && <span> · {earnedMarks}/{markedTotalMarks} dhibcood oo la xaqiijiyey</span>}
                  {exam.exam.answerKeyStatus === 'pending' && <span> · Qaar ka mid ah jawaabaha lama calaamadin ilaa macallin xaqiijiyo.</span>}
                  {answeredCount === exam.questions.length && <p className="mt-2 text-xs text-emerald-600">Jawaab kasta oo khaldan si toos ah ayay ugu gashay Buugga Qaladaadkayga.</p>}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'mistakes' && (
        <section>
          <div className="mb-5"><h2 className="text-2xl font-black">Buugga Qaladaadkayga</h2><p className="text-sm text-[var(--color-text-secondary)]">Leitner: 1, 2, 4, 7, 14 maalmood. Jawaab khalad ah waxay ku noqotaa sanduuqa 1aad.</p></div>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-red-500/10 p-4"><strong className="block text-2xl text-red-500">{data.mistakeSummary.today}</strong><span className="text-xs">Maanta</span></div>
            <div className="rounded-2xl bg-amber-500/10 p-4"><strong className="block text-2xl text-amber-500">{data.mistakeSummary.tomorrow}</strong><span className="text-xs">Berri</span></div>
            <div className="rounded-2xl bg-blue-500/10 p-4"><strong className="block text-2xl text-blue-500">{data.mistakeSummary.thisWeek}</strong><span className="text-xs">Usbuucan</span></div>
          </div>
          {mistakesLoading ? <p>Qaladaadka waa la soo rarayaa...</p> : mistakes.length === 0 ? <div className="rounded-2xl border p-8 text-center"><Trophy className="mx-auto text-emerald-500" size={36} /><p className="mt-3 font-black">Qalad dib-u-eegis sugaya ma jiro.</p></div> : <div className="space-y-3">{mistakes.map((mistake: any) => (
            <article key={mistake._id} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-black text-red-500">Sanduuq {mistake.box}</span><span className="text-xs text-[var(--color-text-tertiary)]">{new Date(mistake.dueAt).toLocaleDateString()}</span></div>
              <p className="mt-3 font-bold">{mistake.question?.textSo || 'Su’aal'}</p>
            </article>
          ))}</div>}
        </section>
      )}

      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 p-2 shadow-2xl backdrop-blur sm:hidden">
        {([
          ['home', Home, 'Hoyga'],
          ['chapters', BookOpen, 'Cutubyo'],
          ['exams', GraduationCap, 'Imtixaan'],
          ['mistakes', RotateCcw, 'Qaladaad'],
        ] as const).map(([value, Icon, label]) => (
          <button key={value} onClick={() => setTab(value)} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold ${tab === value ? 'bg-emerald-700 text-white' : 'text-[var(--color-text-secondary)]'}`}>
            <Icon size={19} /> {label}
          </button>
        ))}
      </nav>

      {highlightPopup && (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
          onClick={() => setHighlightPopup(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="highlight-dialog-title"
            className="max-h-[86vh] w-full overflow-y-auto rounded-t-[28px] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-2xl sm:max-w-2xl sm:rounded-[28px] sm:p-6"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${relationMeta[highlightPopup.relation].className}`}>{relationMeta[highlightPopup.relation].label}</span>
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
                  <button
                    type="button"
                    onClick={() => {
                      const chapter = data.chapters.find(item => item.id === question.chapterId);
                      if (!chapter) return;
                      setHighlightPopup(null);
                      setLessonView(null);
                      answerQuestionSet(chapter, [question], `${question.examYear || ''} · Su’aal ${question.number}`);
                    }}
                    className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"
                  >Ka jawaab</button>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {resourcePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setResourcePreview(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-wide text-emerald-600">{resourcePreview.type}</p><h3 className="mt-1 text-xl font-black">{resourcePreview.title}</h3></div>
              <button onClick={() => setResourcePreview(null)} className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]"><X size={18} /></button>
            </div>
            {(resourcePreview.pageFrom || resourcePreview.pageTo) && <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Buugga: bogga {resourcePreview.pageFrom || '—'}{resourcePreview.pageTo ? `–${resourcePreview.pageTo}` : ''}</p>}
            {resourcePreview.contentText && <div dir={resourcePreview.direction === 'rtl' || resourcePreview.language === 'ar' ? 'rtl' : resourcePreview.direction === 'ltr' ? 'ltr' : 'auto'} className="mt-4 whitespace-pre-wrap text-sm leading-7"><FormulaText text={resourcePreview.contentText} /></div>}
          </div>
        </div>
      )}

      {glossaryTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setGlossaryTerm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-primary)] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-black">Eray farsamo</h3><button onClick={() => setGlossaryTerm(null)}><X size={18} /></button></div>
            <div className="mt-4 space-y-3 text-sm">
              <div><span className="text-xs text-[var(--color-text-tertiary)]">Soomaali</span><p className="font-bold">{glossaryTerm.termSo}</p></div>
              <div><span className="text-xs text-[var(--color-text-tertiary)]">English</span><p className="font-bold">{glossaryTerm.termEn}</p></div>
              <div dir="rtl"><span className="text-xs text-[var(--color-text-tertiary)]">العربية</span><p className="font-bold">{glossaryTerm.termAr}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
) && part.endsWith('export function GuuldoonCourseExperience() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('home');
  const [data, setData] = useState<Experience | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const [exam, setExam] = useState<LoadedExam | null>(null);
  const [practiceLabel, setPracticeLabel] = useState('');
  const [examLoading, setExamLoading] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [feedback, setFeedback] = useState<Record<string, any>>({});
  const [answering, setAnswering] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [mistakesLoading, setMistakesLoading] = useState(false);
  const [glossaryTerm, setGlossaryTerm] = useState<Experience['glossary'][number] | null>(null);
  const [resourcePreview, setResourcePreview] = useState<LessonItem | null>(null);

  const loadExperience = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/experience`, {
        params: { _state: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      });
      const payload = response.data as Experience;
      setData(payload);
      setOpenChapter(payload.chapters[0]?.id || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Guuldoon course-ka lama soo rari karin.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { void loadExperience(); }, [loadExperience]);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0 || !exam) return;
    const timer = window.setInterval(() => {
      setSecondsLeft(current => current === null ? null : Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft, exam]);

  const daysLeft = useMemo(() => {
    if (!data?.targetExamDate) return null;
    return Math.max(0, Math.ceil((new Date(data.targetExamDate).getTime() - Date.now()) / 86400000));
  }, [data?.targetExamDate]);

  const openExam = async (summary: ExamSummary) => {
    if (!courseId) return;
    setExamLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/exams/${summary.id}`);
      setExam(response.data);
      setPracticeLabel('');
      setQuestionIndex(0);
      setAnswers({});
      setFeedback({});
      setSecondsLeft(summary.durationMin * 60);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Imtixaanka lama furi karin.');
    } finally {
      setExamLoading(false);
    }
  };

  const openChapterPractice = async (chapter: Chapter) => {
    if (!courseId) return;
    setExamLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/chapters/${chapter.id}/questions`, { params: { limit: 20 } });
      const questions = response.data.questions || [];
      if (!questions.length) {
        setError('Cutubkan wali su’aalo imtixaan oo published ah laguma darin.');
        return;
      }
      setExam({
        exam: {
          id: `practice-${chapter.id}`,
          year: 0,
          durationMin: 15,
          totalMarks: questions.reduce((sum: number, question: ExamQuestion) => sum + Number(question.marks || 0), 0),
          answerKeyStatus: 'pending',
        },
        questions,
      });
      setPracticeLabel(`Tababar: ${chapter.title}`);
      setQuestionIndex(0);
      setAnswers({});
      setFeedback({});
      setSecondsLeft(15 * 60);
      setTab('exams');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Su’aalaha cutubka lama furi karin.');
    } finally {
      setExamLoading(false);
    }
  };

  const submitAnswer = async (question: ExamQuestion) => {
    if (answers[question._id] === undefined || answering) return;
    setAnswering(true);
    try {
      const { data: response } = await api.post(`/guuldoon/questions/${question._id}/answer`, {
        answer: answers[question._id],
      });
      setFeedback(current => ({ ...current, [question._id]: response.data }));
      await loadExperience();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Jawaabta lama gudbin karin.');
    } finally {
      setAnswering(false);
    }
  };

  const openLearningItem = (item: LessonItem, fallbackIndex = 0) => {
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.contentText || item.pageFrom || item.pageTo) {
      setResourcePreview(item);
      return;
    }
    navigate(`/student/courses/${courseId}/learn`, { state: { startItemIdx: fallbackIndex } });
  };

  const loadMistakes = useCallback(async () => {
    if (!courseId) return;
    setMistakesLoading(true);
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/mistakes`);
      setMistakes(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Qaladaadka lama soo rari karin.');
    } finally {
      setMistakesLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (tab === 'mistakes') void loadMistakes();
  }, [tab, loadMistakes]);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-500" /></div>;
  }

  if (error && !data) {
    return <div className="mx-auto max-w-xl p-6 text-center"><AlertCircle className="mx-auto text-red-500" size={38} /><p className="mt-3 font-semibold">{error}</p><button onClick={() => void loadExperience()} className="mt-4 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white">Mar kale isku day</button></div>;
  }

  if (!data) return null;

  const title = data.course.title?.so || data.course.title?.en || 'Guuldoon';
  const currentQuestion = exam?.questions[questionIndex];
  const answeredCount = Object.keys(feedback).length;
  const correctCount = Object.values(feedback).filter((item: any) => item?.marked && item?.correct).length;
  const markedQuestions = exam?.questions.filter(question => feedback[question._id]?.marked) || [];
  const earnedMarks = markedQuestions.reduce((sum, question) => sum + (feedback[question._id]?.correct ? Number(question.marks || 0) : 0), 0);
  const markedTotalMarks = markedQuestions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
  const questionGlossary = currentQuestion
    ? data.glossary.filter(term => {
        const haystack = `${currentQuestion.textSo} ${currentQuestion.textEn || ''}`.toLowerCase();
        return haystack.includes(term.termSo.toLowerCase()) || haystack.includes(term.termEn.toLowerCase());
      }).slice(0, 8)
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-28 sm:p-6 lg:p-8 lg:pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/student/global-courses')} className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)] hover:text-emerald-600">
            <ArrowLeft size={15} /> Guuldoon Courses
          </button>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-600">Guuldoon · Grade {data.course.grade}</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>
        </div>
        <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">
          Question-first learning
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

      <nav className="hidden grid-cols-4 gap-2 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-2 sm:grid">
        {([
          ['home', Home, 'Hoyga'],
          ['chapters', BookOpen, 'Cutubyada'],
          ['exams', GraduationCap, 'Imtixaan'],
          ['mistakes', RotateCcw, 'Qaladaad'],
        ] as const).map(([value, Icon, label]) => (
          <button key={value} onClick={() => setTab(value)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ${tab === value ? 'bg-emerald-700 text-white' : 'hover:bg-[var(--color-surface-tertiary)]'}`}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </nav>

      {tab === 'home' && (
        <div className="space-y-5">
          <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
            <div className="rounded-[28px] border border-emerald-500/20 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-6 text-white shadow-lg">
              <p className="text-sm text-emerald-200">Salaan{data.studentName ? `, ${data.studentName}` : ', arday'}</p>
              <h2 className="mt-2 text-2xl font-black">Diyaar-garowgaaga</h2>
              <div className="mt-6 flex items-center gap-6">
                <div className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(rgb(16 185 129) ${data.passMeter * 3.6}deg, rgba(255,255,255,.12) 0deg)` }}>
                  <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-slate-950">
                    <strong className="text-4xl">{data.passMeter}</strong>
                    <span className="text-xs text-slate-400">/100</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm leading-6 text-slate-300">Qiyaastan waxay ku salaysan tahay tababarkaaga iyo miisaanka su'aalihii hore.</p>
                  <p className="mt-3 text-sm font-bold text-amber-300">Bartilmaameed: {data.passTarget}/100</p>
                  {daysLeft !== null && <p className="mt-1 text-xs text-slate-400">{daysLeft} maalmood ayaa ka hadhay taariikhda la dejiyey.</p>}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-6">
              <div className="flex items-center gap-3"><Target className="text-emerald-500" /><h2 className="text-lg font-black">Tababarka maanta</h2></div>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">15 daqiiqo · xoogga saar cutubyada miisaanka sare leh ee aad ugu daciifsan tahay.</p>
              <div className="mt-4 space-y-3">
                {data.weakest.length ? data.weakest.map(chapter => (
                  <button key={chapter.id} onClick={() => { setOpenChapter(chapter.id); setTab('chapters'); }} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] p-4 text-left hover:border-emerald-500/40">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 font-black text-emerald-600">{chapter.mastery}%</span>
                    <div className="min-w-0 flex-1"><p className="truncate font-bold">{chapter.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{chapter.examWeight}% dhibcaha taariikhiga ah</p></div>
                    <ChevronRight size={18} />
                  </button>
                )) : <p className="text-sm text-[var(--color-text-tertiary)]">Su'aalo tagged ah wali lama gelin.</p>}
              </div>
              <button onClick={() => setTab('chapters')} className="mt-4 w-full rounded-2xl bg-emerald-700 px-5 py-3.5 text-sm font-black text-white">Bilow tababarka maanta</button>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <h3 className="font-black">Sii wad</h3>
              {data.continueItem ? (
                <div className="mt-4">
                  <p className="text-xs text-emerald-600">{data.continueItem.chapterTitle}</p>
                  <p className="mt-1 text-lg font-bold">{data.continueItem.title}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{data.continueItem.type} {data.continueItem.videoSeconds ? `· ${formatVideo(data.continueItem.videoSeconds)}` : ''}</p>
                  <button onClick={() => openLearningItem(data.continueItem!)} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-600"><PlayCircle size={18} /> Sii wad casharka</button>
                </div>
              ) : <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Cashar la sii wado wali ma jiro.</p>}
            </div>

            <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <h3 className="font-black">Buugga Qaladaadkayga</h3>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-red-500/10 p-3"><strong className="block text-xl text-red-500">{data.mistakeSummary.today}</strong><span className="text-[11px]">Maanta</span></div>
                <div className="rounded-xl bg-amber-500/10 p-3"><strong className="block text-xl text-amber-500">{data.mistakeSummary.tomorrow}</strong><span className="text-[11px]">Berri</span></div>
                <div className="rounded-xl bg-blue-500/10 p-3"><strong className="block text-xl text-blue-500">{data.mistakeSummary.thisWeek}</strong><span className="text-[11px]">Usbuucan</span></div>
              </div>
              <button onClick={() => setTab('mistakes')} className="mt-4 text-sm font-bold text-emerald-600">Bilow dib-u-eegista →</button>
            </div>
          </section>

          {data.glossary.length > 0 && (
            <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <h3 className="font-black">Erayo farsamo</h3>
              <div className="mt-3 flex flex-wrap gap-2">{data.glossary.slice(0, 12).map(term => <button key={term.termEn} onClick={() => setGlossaryTerm(term)} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">{term.termSo}</button>)}</div>
            </section>
          )}
        </div>
      )}

      {tab === 'chapters' && (
        <section className="space-y-3">
          <div className="mb-5"><h2 className="text-2xl font-black">Cutubyada</h2><p className="text-sm text-[var(--color-text-secondary)]">Hal cutub mar keliya ayuu furmaa. Miisaanka wuxuu ka yimaadaa su'aalaha imtixaannadii hore ee la tagged-gareeyey.</p></div>
          {data.chapters.map((chapter, index) => {
            const open = openChapter === chapter.id;
            return (
              <article key={chapter.id} className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
                <button onClick={() => setOpenChapter(open ? null : chapter.id)} className="flex w-full items-center gap-3 p-4 text-left sm:p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 font-black text-emerald-600">{index + 1}</span>
                  <div className="min-w-0 flex-1"><h3 className="truncate font-black">{chapter.title}</h3><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{chapter.items.length} cashar · {chapter.examWeight}% dhibcaha · {chapter.questionCount} su'aalood</p></div>
                  <div className="w-24 text-right"><p className={`font-black ${masteryColour(chapter.mastery)}`}>{chapter.mastery}%</p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full ${masteryBar(chapter.mastery)}`} style={{ width: `${chapter.mastery}%` }} /></div></div>
                  <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} size={20} />
                </button>
                {open && (
                  <div className="border-t border-[var(--color-border-subtle)] p-4 sm:p-5">
                    <div className="space-y-2">
                      {chapter.items.map((item, itemIndex) => (
                        <button key={item.id} onClick={() => openLearningItem(item, data.chapters.slice(0, index).reduce((sum, row) => sum + row.items.length, 0) + itemIndex)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[var(--color-surface-tertiary)]">
                          {itemIndex === 0 ? <PlayCircle className="text-emerald-500" size={20} /> : <Circle className="text-slate-400" size={18} />}
                          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{item.hasVideo ? `Muuqaal ${formatVideo(item.videoSeconds)}` : item.type} {item.duration ? `· ${item.duration} daqiiqo` : ''}</p></div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {chapter.items.some(item => item.notes.length) && <span className="rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-500">Notes PDF</span>}
                      <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-600">{chapter.questionCount} su'aalood imtixaan</span>
                    </div>
                    <button onClick={() => void openChapterPractice(chapter)} className="mt-4 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">Tababar cutubkan</button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {tab === 'exams' && (
        <section>
          {!exam ? (
            <>
              <div className="mb-5"><h2 className="text-2xl font-black">Safarka Wakhtiga</h2><p className="text-sm text-[var(--color-text-secondary)]">Imtixaannadii hore waa bog gaar ah. Sanad jawaabtiisa aan la hubin waxaa lagu calaamadeeyaa “Jawaab la xaqiijin doonaa”.</p></div>
              {examLoading ? <p>Imtixaanka waa la furayaa...</p> : data.exams.length === 0 ? <div className="rounded-2xl border p-8 text-center text-sm text-[var(--color-text-tertiary)]">Past exams wali lama publish-gareyn.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.exams.map(item => (
                <button key={item.id} onClick={() => void openExam(item)} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md">
                  <div className="flex items-center justify-between"><strong className="text-3xl">{item.year}</strong><GraduationCap className="text-emerald-500" /></div>
                  <p className="mt-3 text-sm">{item.durationMin} daqiiqo · {item.totalMarks} dhibcood</p>
                  <p className={`mt-2 text-xs font-bold ${item.answerKeyStatus === 'verified' ? 'text-emerald-500' : 'text-amber-500'}`}>{item.answerKeyStatus === 'verified' ? 'Answer key la xaqiijiyey' : 'Jawaab la xaqiijin doonaa'}</p>
                </button>
              ))}</div>}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4">
                <button onClick={() => { setExam(null); setSecondsLeft(null); if (practiceLabel) { setPracticeLabel(''); setTab('chapters'); } }} className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16} /> {practiceLabel ? 'Cutubyada' : 'Sanadaha'}</button>
                <div className="text-center"><p className="font-black">{practiceLabel || `Imtixaanka ${exam.exam.year}`}</p><p className="text-xs text-[var(--color-text-tertiary)]">{answeredCount}/{exam.questions.length} laga jawaabay</p></div>
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${secondsLeft === 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}><Clock3 size={15} /> {secondsLeft === null ? '--:--' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}</div>
              </div>

              {currentQuestion ? (
                <article className="rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-emerald-500/10 px-3 py-1 font-black text-emerald-600">Su'aal {currentQuestion.number}</span><span className="rounded-full bg-slate-500/10 px-3 py-1">{currentQuestion.marks} dhibcood</span>{currentQuestion.topicTags.slice(0, 3).map(tag => <span key={tag} className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-600">{tag}</span>)}</div>
                  <h3
                    dir={currentQuestion.direction === 'rtl' || currentQuestion.language === 'ar' ? 'rtl' : currentQuestion.direction === 'ltr' ? 'ltr' : 'auto'}
                    className="mt-5 text-lg font-black leading-8"
                  ><FormulaText text={currentQuestion.textSo} /></h3>
                  {(currentQuestion.figureFiles?.length ? currentQuestion.figureFiles : currentQuestion.figureUrl ? [currentQuestion.figureUrl] : []).map((figure, index) => <img key={figure + index} src={figure} alt="" className="mt-4 max-h-72 rounded-xl object-contain" />)}
                  {questionGlossary.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{questionGlossary.map(term => <button key={term.termEn} type="button" onClick={() => setGlossaryTerm(term)} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">{term.termSo} · {term.termEn}</button>)}</div>}
                  {currentQuestion.type === 'mcq' && currentQuestion.options ? (
                    <div className="mt-5 grid gap-3">{currentQuestion.options.map((option, index) => (
                      <button key={index} disabled={!!feedback[currentQuestion._id]} onClick={() => setAnswers(current => ({ ...current, [currentQuestion._id]: index }))} className={`rounded-2xl border p-4 text-left text-sm font-semibold transition ${answers[currentQuestion._id] === index ? 'border-emerald-500 bg-emerald-500/10' : 'border-[var(--color-border-subtle)] hover:border-emerald-500/40'}`}>{String.fromCharCode(65 + index)}. {option}</button>
                    ))}</div>
                  ) : (
                    <textarea disabled={!!feedback[currentQuestion._id]} value={String(answers[currentQuestion._id] ?? '')} onChange={event => setAnswers(current => ({ ...current, [currentQuestion._id]: event.target.value }))} rows={5} placeholder="Ku qor jawaabtaada..." className="mt-5 w-full rounded-2xl border border-[var(--color-border-default)] bg-transparent p-4 text-sm outline-none focus:border-emerald-500" />
                  )}

                  {!feedback[currentQuestion._id] ? (
                    <button disabled={answering || answers[currentQuestion._id] === undefined || secondsLeft === 0} onClick={() => void submitAnswer(currentQuestion)} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{answering ? 'Waa la hubinayaa...' : 'Gudbi jawaabta'}</button>
                  ) : (
                    <div className={`mt-5 rounded-2xl border p-4 ${feedback[currentQuestion._id].marked ? feedback[currentQuestion._id].correct ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                      <p className="font-black">{feedback[currentQuestion._id].marked ? feedback[currentQuestion._id].correct ? '✓ Sax' : '✕ Khalad' : feedback[currentQuestion._id].message || 'Jawaab la xaqiijin doonaa'}</p>
                      {feedback[currentQuestion._id].explanation && <p className="mt-2 text-sm leading-6">{feedback[currentQuestion._id].explanation}</p>}
                      {feedback[currentQuestion._id].explainerAudioUrl && <audio controls preload="none" className="mt-3 w-full" src={feedback[currentQuestion._id].explainerAudioUrl} />}
                      {feedback[currentQuestion._id].bookRef?.pageFrom && <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Buugga: bogga {feedback[currentQuestion._id].bookRef.pageFrom}{feedback[currentQuestion._id].bookRef.pageTo ? `–${feedback[currentQuestion._id].bookRef.pageTo}` : ''}</p>}
                      {feedback[currentQuestion._id].similar?.length > 0 && <div className="mt-4"><p className="text-xs font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">2 su'aalood oo la mid ah</p><div className="mt-2 space-y-2">{feedback[currentQuestion._id].similar.slice(0, 2).map((similar: any) => <div key={similar._id} className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3 text-sm font-semibold">{similar.textSo}</div>)}</div></div>}
                      {feedback[currentQuestion._id].marked === false && <p className="mt-2 text-xs text-amber-600">{feedback[currentQuestion._id].answerStatus === 'verified' ? 'Su’aashan auto-marking ma leh; qiimeynta macallinka ayaa loo baahan yahay.' : 'Natiijadan laguma darin Pass Meter-ka ilaa answer key-ga la xaqiijiyo.'}</p>}
                    </div>
                  )}

                  <div className="mt-6 flex items-center justify-between">
                    <button disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => Math.max(0, index - 1))} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">Hore</button>
                    <span className="text-xs text-[var(--color-text-tertiary)]">{questionIndex + 1} / {exam.questions.length}</span>
                    <button disabled={questionIndex >= exam.questions.length - 1} onClick={() => setQuestionIndex(index => Math.min(exam.questions.length - 1, index + 1))} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">Xiga</button>
                  </div>
                </article>
              ) : <div className="rounded-2xl border p-6">Su'aalo ma jiraan.</div>}

              {answeredCount > 0 && (
                <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 text-sm">
                  <strong>{answeredCount === exam.questions.length ? 'Natiijada:' : 'Natiijada hadda:'}</strong> {correctCount} sax · {answeredCount} laga jawaabay.
                  {markedTotalMarks > 0 && <span> · {earnedMarks}/{markedTotalMarks} dhibcood oo la xaqiijiyey</span>}
                  {exam.exam.answerKeyStatus === 'pending' && <span> · Qaar ka mid ah jawaabaha lama calaamadin ilaa macallin xaqiijiyo.</span>}
                  {answeredCount === exam.questions.length && <p className="mt-2 text-xs text-emerald-600">Jawaab kasta oo khaldan si toos ah ayay ugu gashay Buugga Qaladaadkayga.</p>}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'mistakes' && (
        <section>
          <div className="mb-5"><h2 className="text-2xl font-black">Buugga Qaladaadkayga</h2><p className="text-sm text-[var(--color-text-secondary)]">Leitner: 1, 2, 4, 7, 14 maalmood. Jawaab khalad ah waxay ku noqotaa sanduuqa 1aad.</p></div>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-red-500/10 p-4"><strong className="block text-2xl text-red-500">{data.mistakeSummary.today}</strong><span className="text-xs">Maanta</span></div>
            <div className="rounded-2xl bg-amber-500/10 p-4"><strong className="block text-2xl text-amber-500">{data.mistakeSummary.tomorrow}</strong><span className="text-xs">Berri</span></div>
            <div className="rounded-2xl bg-blue-500/10 p-4"><strong className="block text-2xl text-blue-500">{data.mistakeSummary.thisWeek}</strong><span className="text-xs">Usbuucan</span></div>
          </div>
          {mistakesLoading ? <p>Qaladaadka waa la soo rarayaa...</p> : mistakes.length === 0 ? <div className="rounded-2xl border p-8 text-center"><Trophy className="mx-auto text-emerald-500" size={36} /><p className="mt-3 font-black">Qalad dib-u-eegis sugaya ma jiro.</p></div> : <div className="space-y-3">{mistakes.map((mistake: any) => (
            <article key={mistake._id} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-black text-red-500">Sanduuq {mistake.box}</span><span className="text-xs text-[var(--color-text-tertiary)]">{new Date(mistake.dueAt).toLocaleDateString()}</span></div>
              <p className="mt-3 font-bold">{mistake.question?.textSo || 'Su’aal'}</p>
            </article>
          ))}</div>}
        </section>
      )}

      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 p-2 shadow-2xl backdrop-blur sm:hidden">
        {([
          ['home', Home, 'Hoyga'],
          ['chapters', BookOpen, 'Cutubyo'],
          ['exams', GraduationCap, 'Imtixaan'],
          ['mistakes', RotateCcw, 'Qaladaad'],
        ] as const).map(([value, Icon, label]) => (
          <button key={value} onClick={() => setTab(value)} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold ${tab === value ? 'bg-emerald-700 text-white' : 'text-[var(--color-text-secondary)]'}`}>
            <Icon size={19} /> {label}
          </button>
        ))}
      </nav>

      {resourcePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setResourcePreview(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-wide text-emerald-600">{resourcePreview.type}</p><h3 className="mt-1 text-xl font-black">{resourcePreview.title}</h3></div>
              <button onClick={() => setResourcePreview(null)} className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]"><X size={18} /></button>
            </div>
            {(resourcePreview.pageFrom || resourcePreview.pageTo) && <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Buugga: bogga {resourcePreview.pageFrom || '—'}{resourcePreview.pageTo ? `–${resourcePreview.pageTo}` : ''}</p>}
            {resourcePreview.contentText && <div dir={resourcePreview.direction === 'rtl' || resourcePreview.language === 'ar' ? 'rtl' : resourcePreview.direction === 'ltr' ? 'ltr' : 'auto'} className="mt-4 whitespace-pre-wrap text-sm leading-7"><FormulaText text={resourcePreview.contentText} /></div>}
          </div>
        </div>
      )}

      {glossaryTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setGlossaryTerm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-primary)] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-black">Eray farsamo</h3><button onClick={() => setGlossaryTerm(null)}><X size={18} /></button></div>
            <div className="mt-4 space-y-3 text-sm">
              <div><span className="text-xs text-[var(--color-text-tertiary)]">Soomaali</span><p className="font-bold">{glossaryTerm.termSo}</p></div>
              <div><span className="text-xs text-[var(--color-text-tertiary)]">English</span><p className="font-bold">{glossaryTerm.termEn}</p></div>
              <div dir="rtl"><span className="text-xs text-[var(--color-text-tertiary)]">العربية</span><p className="font-bold">{glossaryTerm.termAr}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
);
      return formula
        ? <span key={index} className="mx-0.5 rounded bg-slate-500/10 px-1.5 py-0.5 font-mono text-[.95em]" dir="ltr">{part}</span>
        : <span key={index}>{part}</span>;
    })}
  </>;
}

const relationMeta: Record<HighlightRelation, { label: string; className: string; reason: string }> = {
  direct: { label: 'Toos', className: 'bg-emerald-400/25 text-emerald-100 ring-1 ring-emerald-300/40', reason: 'Jawaabta si toos ah ayay ugu qoran tahay qaybtan buugga.' },
  indirect: { label: 'Dadban', className: 'bg-sky-400/25 text-sky-100 ring-1 ring-sky-300/40', reason: 'Su’aashu waxay u baahan tahay isku-dar ama fikir ka imanaya qaybtan.' },
  similar: { label: 'U eg', className: 'bg-amber-300/25 text-amber-100 ring-1 ring-amber-300/40', reason: 'Fikradda waa isku mid; tiro ama eray ayaa la beddelay.' },
  derived: { label: 'Laga dhaliyay', className: 'bg-rose-400/25 text-rose-100 ring-1 ring-rose-300/40', reason: 'Su’aashu waxay ka dhalatay formula ama qaanuun ku jira qaybtan.' },
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\function FormulaText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g).filter(Boolean);
  return <>
    {parts.map((part, index) => {
      const formula = part.startsWith('$') && part.endsWith('$');
      return formula
        ? <span key={index} className="mx-0.5 rounded bg-slate-500/10 px-1.5 py-0.5 font-mono text-[.95em]" dir="ltr">{part}</span>
        : <span key={index}>{part}</span>;
    })}
  </>;
}
');
}

function HighlightedLessonText({ text, highlights, visible, onHighlight }: {
  text: string;
  highlights: LessonHighlight[];
  visible: boolean;
  onHighlight: (highlight: LessonHighlight) => void;
}) {
  if (!visible || !highlights.length) return <FormulaText text={text} />;
  const ranges: { start: number; end: number; highlight: LessonHighlight }[] = [];
  for (const highlight of highlights) {
    const words = highlight.anchorText.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const regex = new RegExp(words.map(escapeRegExp).join('\\s+'), 'i');
    const match = regex.exec(text);
    if (!match) continue;
    ranges.push({ start: match.index, end: match.index + match[0].length, highlight });
  }
  ranges.sort((a, b) => a.start - b.start);
  const accepted = ranges.filter((range, index, list) => !list.slice(0, index).some(prev => range.start < prev.end));
  if (!accepted.length) return <FormulaText text={text} />;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  accepted.forEach((range, index) => {
    if (range.start > cursor) nodes.push(<FormulaText key={`plain-${index}`} text={text.slice(cursor, range.start)} />);
    nodes.push(
      <button
        key={`highlight-${index}`}
        type="button"
        onClick={() => onHighlight(range.highlight)}
        className={`mx-0.5 inline rounded px-1 py-0.5 text-left font-semibold underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${relationMeta[range.highlight.relation].className}`}
        aria-label={`${relationMeta[range.highlight.relation].label}: ${range.highlight.anchorText}`}
      >
        <FormulaText text={text.slice(range.start, range.end)} />
      </button>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(<FormulaText key="plain-tail" text={text.slice(cursor)} />);
  return <>{nodes}</>;
}
export function GuuldoonCourseExperience() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('home');
  const [data, setData] = useState<Experience | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const [exam, setExam] = useState<LoadedExam | null>(null);
  const [practiceLabel, setPracticeLabel] = useState('');
  const [examLoading, setExamLoading] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [feedback, setFeedback] = useState<Record<string, any>>({});
  const [answering, setAnswering] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [mistakesLoading, setMistakesLoading] = useState(false);
  const [glossaryTerm, setGlossaryTerm] = useState<Experience['glossary'][number] | null>(null);
  const [resourcePreview, setResourcePreview] = useState<LessonItem | null>(null);

  const loadExperience = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/experience`, {
        params: { _state: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      });
      const payload = response.data as Experience;
      setData(payload);
      setOpenChapter(payload.chapters[0]?.id || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Guuldoon course-ka lama soo rari karin.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { void loadExperience(); }, [loadExperience]);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0 || !exam) return;
    const timer = window.setInterval(() => {
      setSecondsLeft(current => current === null ? null : Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft, exam]);

  const daysLeft = useMemo(() => {
    if (!data?.targetExamDate) return null;
    return Math.max(0, Math.ceil((new Date(data.targetExamDate).getTime() - Date.now()) / 86400000));
  }, [data?.targetExamDate]);

  const openExam = async (summary: ExamSummary) => {
    if (!courseId) return;
    setExamLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/exams/${summary.id}`);
      setExam(response.data);
      setPracticeLabel('');
      setQuestionIndex(0);
      setAnswers({});
      setFeedback({});
      setSecondsLeft(summary.durationMin * 60);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Imtixaanka lama furi karin.');
    } finally {
      setExamLoading(false);
    }
  };

  const openChapterPractice = async (chapter: Chapter) => {
    if (!courseId) return;
    setExamLoading(true);
    setError('');
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/chapters/${chapter.id}/questions`, { params: { limit: 20 } });
      const questions = response.data.questions || [];
      if (!questions.length) {
        setError('Cutubkan wali su’aalo imtixaan oo published ah laguma darin.');
        return;
      }
      setExam({
        exam: {
          id: `practice-${chapter.id}`,
          year: 0,
          durationMin: 15,
          totalMarks: questions.reduce((sum: number, question: ExamQuestion) => sum + Number(question.marks || 0), 0),
          answerKeyStatus: 'pending',
        },
        questions,
      });
      setPracticeLabel(`Tababar: ${chapter.title}`);
      setQuestionIndex(0);
      setAnswers({});
      setFeedback({});
      setSecondsLeft(15 * 60);
      setTab('exams');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Su’aalaha cutubka lama furi karin.');
    } finally {
      setExamLoading(false);
    }
  };

  const submitAnswer = async (question: ExamQuestion) => {
    if (answers[question._id] === undefined || answering) return;
    setAnswering(true);
    try {
      const { data: response } = await api.post(`/guuldoon/questions/${question._id}/answer`, {
        answer: answers[question._id],
      });
      setFeedback(current => ({ ...current, [question._id]: response.data }));
      await loadExperience();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Jawaabta lama gudbin karin.');
    } finally {
      setAnswering(false);
    }
  };

  const openLearningItem = (item: LessonItem, fallbackIndex = 0) => {
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.contentText || item.pageFrom || item.pageTo) {
      setResourcePreview(item);
      return;
    }
    navigate(`/student/courses/${courseId}/learn`, { state: { startItemIdx: fallbackIndex } });
  };

  const loadMistakes = useCallback(async () => {
    if (!courseId) return;
    setMistakesLoading(true);
    try {
      const { data: response } = await api.get(`/guuldoon/courses/${courseId}/mistakes`);
      setMistakes(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Qaladaadka lama soo rari karin.');
    } finally {
      setMistakesLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (tab === 'mistakes') void loadMistakes();
  }, [tab, loadMistakes]);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-500" /></div>;
  }

  if (error && !data) {
    return <div className="mx-auto max-w-xl p-6 text-center"><AlertCircle className="mx-auto text-red-500" size={38} /><p className="mt-3 font-semibold">{error}</p><button onClick={() => void loadExperience()} className="mt-4 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white">Mar kale isku day</button></div>;
  }

  if (!data) return null;

  const title = data.course.title?.so || data.course.title?.en || 'Guuldoon';
  const currentQuestion = exam?.questions[questionIndex];
  const answeredCount = Object.keys(feedback).length;
  const correctCount = Object.values(feedback).filter((item: any) => item?.marked && item?.correct).length;
  const markedQuestions = exam?.questions.filter(question => feedback[question._id]?.marked) || [];
  const earnedMarks = markedQuestions.reduce((sum, question) => sum + (feedback[question._id]?.correct ? Number(question.marks || 0) : 0), 0);
  const markedTotalMarks = markedQuestions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
  const questionGlossary = currentQuestion
    ? data.glossary.filter(term => {
        const haystack = `${currentQuestion.textSo} ${currentQuestion.textEn || ''}`.toLowerCase();
        return haystack.includes(term.termSo.toLowerCase()) || haystack.includes(term.termEn.toLowerCase());
      }).slice(0, 8)
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-28 sm:p-6 lg:p-8 lg:pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/student/global-courses')} className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)] hover:text-emerald-600">
            <ArrowLeft size={15} /> Guuldoon Courses
          </button>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-600">Guuldoon · Grade {data.course.grade}</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>
        </div>
        <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">
          Question-first learning
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

      <nav className="hidden grid-cols-4 gap-2 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-2 sm:grid">
        {([
          ['home', Home, 'Hoyga'],
          ['chapters', BookOpen, 'Cutubyada'],
          ['exams', GraduationCap, 'Imtixaan'],
          ['mistakes', RotateCcw, 'Qaladaad'],
        ] as const).map(([value, Icon, label]) => (
          <button key={value} onClick={() => setTab(value)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ${tab === value ? 'bg-emerald-700 text-white' : 'hover:bg-[var(--color-surface-tertiary)]'}`}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </nav>

      {tab === 'home' && (
        <div className="space-y-5">
          <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
            <div className="rounded-[28px] border border-emerald-500/20 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-6 text-white shadow-lg">
              <p className="text-sm text-emerald-200">Salaan{data.studentName ? `, ${data.studentName}` : ', arday'}</p>
              <h2 className="mt-2 text-2xl font-black">Diyaar-garowgaaga</h2>
              <div className="mt-6 flex items-center gap-6">
                <div className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(rgb(16 185 129) ${data.passMeter * 3.6}deg, rgba(255,255,255,.12) 0deg)` }}>
                  <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-slate-950">
                    <strong className="text-4xl">{data.passMeter}</strong>
                    <span className="text-xs text-slate-400">/100</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm leading-6 text-slate-300">Qiyaastan waxay ku salaysan tahay tababarkaaga iyo miisaanka su'aalihii hore.</p>
                  <p className="mt-3 text-sm font-bold text-amber-300">Bartilmaameed: {data.passTarget}/100</p>
                  {daysLeft !== null && <p className="mt-1 text-xs text-slate-400">{daysLeft} maalmood ayaa ka hadhay taariikhda la dejiyey.</p>}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-6">
              <div className="flex items-center gap-3"><Target className="text-emerald-500" /><h2 className="text-lg font-black">Tababarka maanta</h2></div>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">15 daqiiqo · xoogga saar cutubyada miisaanka sare leh ee aad ugu daciifsan tahay.</p>
              <div className="mt-4 space-y-3">
                {data.weakest.length ? data.weakest.map(chapter => (
                  <button key={chapter.id} onClick={() => { setOpenChapter(chapter.id); setTab('chapters'); }} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] p-4 text-left hover:border-emerald-500/40">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 font-black text-emerald-600">{chapter.mastery}%</span>
                    <div className="min-w-0 flex-1"><p className="truncate font-bold">{chapter.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{chapter.examWeight}% dhibcaha taariikhiga ah</p></div>
                    <ChevronRight size={18} />
                  </button>
                )) : <p className="text-sm text-[var(--color-text-tertiary)]">Su'aalo tagged ah wali lama gelin.</p>}
              </div>
              <button onClick={() => setTab('chapters')} className="mt-4 w-full rounded-2xl bg-emerald-700 px-5 py-3.5 text-sm font-black text-white">Bilow tababarka maanta</button>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <h3 className="font-black">Sii wad</h3>
              {data.continueItem ? (
                <div className="mt-4">
                  <p className="text-xs text-emerald-600">{data.continueItem.chapterTitle}</p>
                  <p className="mt-1 text-lg font-bold">{data.continueItem.title}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{data.continueItem.type} {data.continueItem.videoSeconds ? `· ${formatVideo(data.continueItem.videoSeconds)}` : ''}</p>
                  <button onClick={() => openLearningItem(data.continueItem!)} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-600"><PlayCircle size={18} /> Sii wad casharka</button>
                </div>
              ) : <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Cashar la sii wado wali ma jiro.</p>}
            </div>

            <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <h3 className="font-black">Buugga Qaladaadkayga</h3>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-red-500/10 p-3"><strong className="block text-xl text-red-500">{data.mistakeSummary.today}</strong><span className="text-[11px]">Maanta</span></div>
                <div className="rounded-xl bg-amber-500/10 p-3"><strong className="block text-xl text-amber-500">{data.mistakeSummary.tomorrow}</strong><span className="text-[11px]">Berri</span></div>
                <div className="rounded-xl bg-blue-500/10 p-3"><strong className="block text-xl text-blue-500">{data.mistakeSummary.thisWeek}</strong><span className="text-[11px]">Usbuucan</span></div>
              </div>
              <button onClick={() => setTab('mistakes')} className="mt-4 text-sm font-bold text-emerald-600">Bilow dib-u-eegista →</button>
            </div>
          </section>

          {data.glossary.length > 0 && (
            <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <h3 className="font-black">Erayo farsamo</h3>
              <div className="mt-3 flex flex-wrap gap-2">{data.glossary.slice(0, 12).map(term => <button key={term.termEn} onClick={() => setGlossaryTerm(term)} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">{term.termSo}</button>)}</div>
            </section>
          )}
        </div>
      )}

      {tab === 'chapters' && (
        <section className="space-y-3">
          <div className="mb-5"><h2 className="text-2xl font-black">Cutubyada</h2><p className="text-sm text-[var(--color-text-secondary)]">Hal cutub mar keliya ayuu furmaa. Miisaanka wuxuu ka yimaadaa su'aalaha imtixaannadii hore ee la tagged-gareeyey.</p></div>
          {data.chapters.map((chapter, index) => {
            const open = openChapter === chapter.id;
            return (
              <article key={chapter.id} className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
                <button onClick={() => setOpenChapter(open ? null : chapter.id)} className="flex w-full items-center gap-3 p-4 text-left sm:p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 font-black text-emerald-600">{index + 1}</span>
                  <div className="min-w-0 flex-1"><h3 className="truncate font-black">{chapter.title}</h3><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{chapter.items.length} cashar · {chapter.examWeight}% dhibcaha · {chapter.questionCount} su'aalood</p></div>
                  <div className="w-24 text-right"><p className={`font-black ${masteryColour(chapter.mastery)}`}>{chapter.mastery}%</p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full ${masteryBar(chapter.mastery)}`} style={{ width: `${chapter.mastery}%` }} /></div></div>
                  <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} size={20} />
                </button>
                {open && (
                  <div className="border-t border-[var(--color-border-subtle)] p-4 sm:p-5">
                    <div className="space-y-2">
                      {chapter.items.map((item, itemIndex) => (
                        <button key={item.id} onClick={() => openLearningItem(item, data.chapters.slice(0, index).reduce((sum, row) => sum + row.items.length, 0) + itemIndex)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[var(--color-surface-tertiary)]">
                          {itemIndex === 0 ? <PlayCircle className="text-emerald-500" size={20} /> : <Circle className="text-slate-400" size={18} />}
                          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{item.hasVideo ? `Muuqaal ${formatVideo(item.videoSeconds)}` : item.type} {item.duration ? `· ${item.duration} daqiiqo` : ''}</p></div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {chapter.items.some(item => item.notes.length) && <span className="rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-500">Notes PDF</span>}
                      <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-600">{chapter.questionCount} su'aalood imtixaan</span>
                    </div>
                    <button onClick={() => void openChapterPractice(chapter)} className="mt-4 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">Tababar cutubkan</button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {tab === 'exams' && (
        <section>
          {!exam ? (
            <>
              <div className="mb-5"><h2 className="text-2xl font-black">Safarka Wakhtiga</h2><p className="text-sm text-[var(--color-text-secondary)]">Imtixaannadii hore waa bog gaar ah. Sanad jawaabtiisa aan la hubin waxaa lagu calaamadeeyaa “Jawaab la xaqiijin doonaa”.</p></div>
              {examLoading ? <p>Imtixaanka waa la furayaa...</p> : data.exams.length === 0 ? <div className="rounded-2xl border p-8 text-center text-sm text-[var(--color-text-tertiary)]">Past exams wali lama publish-gareyn.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.exams.map(item => (
                <button key={item.id} onClick={() => void openExam(item)} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md">
                  <div className="flex items-center justify-between"><strong className="text-3xl">{item.year}</strong><GraduationCap className="text-emerald-500" /></div>
                  <p className="mt-3 text-sm">{item.durationMin} daqiiqo · {item.totalMarks} dhibcood</p>
                  <p className={`mt-2 text-xs font-bold ${item.answerKeyStatus === 'verified' ? 'text-emerald-500' : 'text-amber-500'}`}>{item.answerKeyStatus === 'verified' ? 'Answer key la xaqiijiyey' : 'Jawaab la xaqiijin doonaa'}</p>
                </button>
              ))}</div>}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4">
                <button onClick={() => { setExam(null); setSecondsLeft(null); if (practiceLabel) { setPracticeLabel(''); setTab('chapters'); } }} className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16} /> {practiceLabel ? 'Cutubyada' : 'Sanadaha'}</button>
                <div className="text-center"><p className="font-black">{practiceLabel || `Imtixaanka ${exam.exam.year}`}</p><p className="text-xs text-[var(--color-text-tertiary)]">{answeredCount}/{exam.questions.length} laga jawaabay</p></div>
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${secondsLeft === 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}><Clock3 size={15} /> {secondsLeft === null ? '--:--' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}</div>
              </div>

              {currentQuestion ? (
                <article className="rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-emerald-500/10 px-3 py-1 font-black text-emerald-600">Su'aal {currentQuestion.number}</span><span className="rounded-full bg-slate-500/10 px-3 py-1">{currentQuestion.marks} dhibcood</span>{currentQuestion.topicTags.slice(0, 3).map(tag => <span key={tag} className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-600">{tag}</span>)}</div>
                  <h3
                    dir={currentQuestion.direction === 'rtl' || currentQuestion.language === 'ar' ? 'rtl' : currentQuestion.direction === 'ltr' ? 'ltr' : 'auto'}
                    className="mt-5 text-lg font-black leading-8"
                  ><FormulaText text={currentQuestion.textSo} /></h3>
                  {(currentQuestion.figureFiles?.length ? currentQuestion.figureFiles : currentQuestion.figureUrl ? [currentQuestion.figureUrl] : []).map((figure, index) => <img key={figure + index} src={figure} alt="" className="mt-4 max-h-72 rounded-xl object-contain" />)}
                  {questionGlossary.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{questionGlossary.map(term => <button key={term.termEn} type="button" onClick={() => setGlossaryTerm(term)} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">{term.termSo} · {term.termEn}</button>)}</div>}
                  {currentQuestion.type === 'mcq' && currentQuestion.options ? (
                    <div className="mt-5 grid gap-3">{currentQuestion.options.map((option, index) => (
                      <button key={index} disabled={!!feedback[currentQuestion._id]} onClick={() => setAnswers(current => ({ ...current, [currentQuestion._id]: index }))} className={`rounded-2xl border p-4 text-left text-sm font-semibold transition ${answers[currentQuestion._id] === index ? 'border-emerald-500 bg-emerald-500/10' : 'border-[var(--color-border-subtle)] hover:border-emerald-500/40'}`}>{String.fromCharCode(65 + index)}. {option}</button>
                    ))}</div>
                  ) : (
                    <textarea disabled={!!feedback[currentQuestion._id]} value={String(answers[currentQuestion._id] ?? '')} onChange={event => setAnswers(current => ({ ...current, [currentQuestion._id]: event.target.value }))} rows={5} placeholder="Ku qor jawaabtaada..." className="mt-5 w-full rounded-2xl border border-[var(--color-border-default)] bg-transparent p-4 text-sm outline-none focus:border-emerald-500" />
                  )}

                  {!feedback[currentQuestion._id] ? (
                    <button disabled={answering || answers[currentQuestion._id] === undefined || secondsLeft === 0} onClick={() => void submitAnswer(currentQuestion)} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{answering ? 'Waa la hubinayaa...' : 'Gudbi jawaabta'}</button>
                  ) : (
                    <div className={`mt-5 rounded-2xl border p-4 ${feedback[currentQuestion._id].marked ? feedback[currentQuestion._id].correct ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                      <p className="font-black">{feedback[currentQuestion._id].marked ? feedback[currentQuestion._id].correct ? '✓ Sax' : '✕ Khalad' : feedback[currentQuestion._id].message || 'Jawaab la xaqiijin doonaa'}</p>
                      {feedback[currentQuestion._id].explanation && <p className="mt-2 text-sm leading-6">{feedback[currentQuestion._id].explanation}</p>}
                      {feedback[currentQuestion._id].explainerAudioUrl && <audio controls preload="none" className="mt-3 w-full" src={feedback[currentQuestion._id].explainerAudioUrl} />}
                      {feedback[currentQuestion._id].bookRef?.pageFrom && <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Buugga: bogga {feedback[currentQuestion._id].bookRef.pageFrom}{feedback[currentQuestion._id].bookRef.pageTo ? `–${feedback[currentQuestion._id].bookRef.pageTo}` : ''}</p>}
                      {feedback[currentQuestion._id].similar?.length > 0 && <div className="mt-4"><p className="text-xs font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">2 su'aalood oo la mid ah</p><div className="mt-2 space-y-2">{feedback[currentQuestion._id].similar.slice(0, 2).map((similar: any) => <div key={similar._id} className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3 text-sm font-semibold">{similar.textSo}</div>)}</div></div>}
                      {feedback[currentQuestion._id].marked === false && <p className="mt-2 text-xs text-amber-600">{feedback[currentQuestion._id].answerStatus === 'verified' ? 'Su’aashan auto-marking ma leh; qiimeynta macallinka ayaa loo baahan yahay.' : 'Natiijadan laguma darin Pass Meter-ka ilaa answer key-ga la xaqiijiyo.'}</p>}
                    </div>
                  )}

                  <div className="mt-6 flex items-center justify-between">
                    <button disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => Math.max(0, index - 1))} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">Hore</button>
                    <span className="text-xs text-[var(--color-text-tertiary)]">{questionIndex + 1} / {exam.questions.length}</span>
                    <button disabled={questionIndex >= exam.questions.length - 1} onClick={() => setQuestionIndex(index => Math.min(exam.questions.length - 1, index + 1))} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">Xiga</button>
                  </div>
                </article>
              ) : <div className="rounded-2xl border p-6">Su'aalo ma jiraan.</div>}

              {answeredCount > 0 && (
                <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 text-sm">
                  <strong>{answeredCount === exam.questions.length ? 'Natiijada:' : 'Natiijada hadda:'}</strong> {correctCount} sax · {answeredCount} laga jawaabay.
                  {markedTotalMarks > 0 && <span> · {earnedMarks}/{markedTotalMarks} dhibcood oo la xaqiijiyey</span>}
                  {exam.exam.answerKeyStatus === 'pending' && <span> · Qaar ka mid ah jawaabaha lama calaamadin ilaa macallin xaqiijiyo.</span>}
                  {answeredCount === exam.questions.length && <p className="mt-2 text-xs text-emerald-600">Jawaab kasta oo khaldan si toos ah ayay ugu gashay Buugga Qaladaadkayga.</p>}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'mistakes' && (
        <section>
          <div className="mb-5"><h2 className="text-2xl font-black">Buugga Qaladaadkayga</h2><p className="text-sm text-[var(--color-text-secondary)]">Leitner: 1, 2, 4, 7, 14 maalmood. Jawaab khalad ah waxay ku noqotaa sanduuqa 1aad.</p></div>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-red-500/10 p-4"><strong className="block text-2xl text-red-500">{data.mistakeSummary.today}</strong><span className="text-xs">Maanta</span></div>
            <div className="rounded-2xl bg-amber-500/10 p-4"><strong className="block text-2xl text-amber-500">{data.mistakeSummary.tomorrow}</strong><span className="text-xs">Berri</span></div>
            <div className="rounded-2xl bg-blue-500/10 p-4"><strong className="block text-2xl text-blue-500">{data.mistakeSummary.thisWeek}</strong><span className="text-xs">Usbuucan</span></div>
          </div>
          {mistakesLoading ? <p>Qaladaadka waa la soo rarayaa...</p> : mistakes.length === 0 ? <div className="rounded-2xl border p-8 text-center"><Trophy className="mx-auto text-emerald-500" size={36} /><p className="mt-3 font-black">Qalad dib-u-eegis sugaya ma jiro.</p></div> : <div className="space-y-3">{mistakes.map((mistake: any) => (
            <article key={mistake._id} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-black text-red-500">Sanduuq {mistake.box}</span><span className="text-xs text-[var(--color-text-tertiary)]">{new Date(mistake.dueAt).toLocaleDateString()}</span></div>
              <p className="mt-3 font-bold">{mistake.question?.textSo || 'Su’aal'}</p>
            </article>
          ))}</div>}
        </section>
      )}

      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 p-2 shadow-2xl backdrop-blur sm:hidden">
        {([
          ['home', Home, 'Hoyga'],
          ['chapters', BookOpen, 'Cutubyo'],
          ['exams', GraduationCap, 'Imtixaan'],
          ['mistakes', RotateCcw, 'Qaladaad'],
        ] as const).map(([value, Icon, label]) => (
          <button key={value} onClick={() => setTab(value)} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold ${tab === value ? 'bg-emerald-700 text-white' : 'text-[var(--color-text-secondary)]'}`}>
            <Icon size={19} /> {label}
          </button>
        ))}
      </nav>

      {resourcePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setResourcePreview(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-wide text-emerald-600">{resourcePreview.type}</p><h3 className="mt-1 text-xl font-black">{resourcePreview.title}</h3></div>
              <button onClick={() => setResourcePreview(null)} className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]"><X size={18} /></button>
            </div>
            {(resourcePreview.pageFrom || resourcePreview.pageTo) && <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Buugga: bogga {resourcePreview.pageFrom || '—'}{resourcePreview.pageTo ? `–${resourcePreview.pageTo}` : ''}</p>}
            {resourcePreview.contentText && <div dir={resourcePreview.direction === 'rtl' || resourcePreview.language === 'ar' ? 'rtl' : resourcePreview.direction === 'ltr' ? 'ltr' : 'auto'} className="mt-4 whitespace-pre-wrap text-sm leading-7"><FormulaText text={resourcePreview.contentText} /></div>}
          </div>
        </div>
      )}

      {glossaryTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setGlossaryTerm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-primary)] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-black">Eray farsamo</h3><button onClick={() => setGlossaryTerm(null)}><X size={18} /></button></div>
            <div className="mt-4 space-y-3 text-sm">
              <div><span className="text-xs text-[var(--color-text-tertiary)]">Soomaali</span><p className="font-bold">{glossaryTerm.termSo}</p></div>
              <div><span className="text-xs text-[var(--color-text-tertiary)]">English</span><p className="font-bold">{glossaryTerm.termEn}</p></div>
              <div dir="rtl"><span className="text-xs text-[var(--color-text-tertiary)]">العربية</span><p className="font-bold">{glossaryTerm.termAr}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
