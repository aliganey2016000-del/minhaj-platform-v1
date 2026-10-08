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
  GraduationCap,
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
  questionCount: number;
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
  textSo: string;
  textEn?: string;
  options?: string[];
  marks: number;
  figureUrl?: string;
  chapterId: string;
  topicTags: string[];
  answerStatus: 'verified' | 'pending';
};

type LoadedExam = {
  exam: ExamSummary & { source?: string };
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
                  <button onClick={() => navigate(`/student/courses/${courseId}/learn`)} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-600"><PlayCircle size={18} /> Sii wad casharka</button>
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
                        <button key={item.id} onClick={() => navigate(`/student/courses/${courseId}/learn`, { state: { startItemIdx: data.chapters.slice(0, index).reduce((sum, row) => sum + row.items.length, 0) + itemIndex } })} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[var(--color-surface-tertiary)]">
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
                  <h3 className="mt-5 text-lg font-black leading-8">{currentQuestion.textSo}</h3>
                  {currentQuestion.figureUrl && <img src={currentQuestion.figureUrl} alt="" className="mt-4 max-h-72 rounded-xl object-contain" />}
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
                      <p className="font-black">{feedback[currentQuestion._id].marked ? feedback[currentQuestion._id].correct ? '✓ Sax' : '✕ Khalad' : 'Jawaab la xaqiijin doonaa'}</p>
                      {feedback[currentQuestion._id].explanation && <p className="mt-2 text-sm leading-6">{feedback[currentQuestion._id].explanation}</p>}
                      {feedback[currentQuestion._id].explainerAudioUrl && <audio controls preload="none" className="mt-3 w-full" src={feedback[currentQuestion._id].explainerAudioUrl} />}
                      {feedback[currentQuestion._id].bookRef?.pageFrom && <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Buugga: bogga {feedback[currentQuestion._id].bookRef.pageFrom}{feedback[currentQuestion._id].bookRef.pageTo ? `–${feedback[currentQuestion._id].bookRef.pageTo}` : ''}</p>}
                      {feedback[currentQuestion._id].similar?.length > 0 && <div className="mt-4"><p className="text-xs font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">2 su'aalood oo la mid ah</p><div className="mt-2 space-y-2">{feedback[currentQuestion._id].similar.slice(0, 2).map((similar: any) => <div key={similar._id} className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3 text-sm font-semibold">{similar.textSo}</div>)}</div></div>}
                      {feedback[currentQuestion._id].marked === false && <p className="mt-2 text-xs text-amber-600">Natiijadan laguma darin Pass Meter-ka ilaa answer key-ga la xaqiijiyo.</p>}
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
