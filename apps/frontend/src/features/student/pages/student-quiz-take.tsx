/**
 * Student Quiz Taking Interface
 *
 * Route: /student/courses/:courseId/quiz/:quizId/take
 *
 * Fully interactive, secure quiz experience across all 10 question types
 * (MCQ, True/False, Matching, Ordering, Picture Choice, Swipe Sort,
 * Listen & Write, Fill in the Blank, Word Scramble, Sentence Builder).
 *
 * Security: the content payload never contains a correct answer — the
 * backend (course-content.controller.ts's stripQuizSecrets) strips or
 * replaces every answer-revealing field before this page ever sees it, and
 * shuffles every interactive choice server-side. Grading only happens via
 * POST /quizzes/submit-attempt, which is also the single place that
 * atomically records the attempt, progress, and XP/badges. Because the
 * client never holds the answer key, a submission made while offline can't
 * be graded locally — it's queued and graded once the connection returns.
 *
 * Offline: in-progress answers autosave to IndexedDB (offline-store.ts) on
 * every change, survive a reload, and are restored on mount. The quiz
 * itself loads from the downloaded-course copy when there's no connection.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Clock, ArrowLeft, ArrowRight, Flag, Send, Trophy, Zap, Sparkles, Play, Lightbulb, WifiOff } from 'lucide-react';
import api from '../../../lib/axios';
import {
  getDownloadedCourse,
  getQuizProgress,
  saveQuizProgress,
  clearQuizProgress,
  queueAction,
} from '../../../lib/offline-store';

// ---------------------------------------------------------------------------
// Types — the STUDENT-FACING (stripped) question shape, not the admin
// authoring shape in course-builder.types.ts. Fields here are exactly what
// stripQuizSecrets leaves in place; anything answer-revealing is absent.
// ---------------------------------------------------------------------------

type QuestionType = 'mcq' | 'true_false' | 'matching' | 'ordering' | 'fill_blank' | 'word_scramble' | 'sentence_build' | 'picture_choice' | 'swipe_sort' | 'listen_write';

interface QuizQuestion {
  _id: string;
  type: QuestionType;
  question: string;
  points?: number;
  // mcq
  options?: string[];
  // true_false — no fields beyond question/type
  // matching
  leftItems?: string[];
  rightItems?: string[];
  // ordering
  items?: string[];
  // picture_choice
  choices?: { image: string; label?: string }[];
  // swipe_sort
  leftLabel?: string;
  rightLabel?: string;
  cards?: { text: string }[];
  // listen_write
  audioUrl?: string;
  hint?: string;
  // fill_blank
  textTemplate?: string;
  wordBank?: string[]; // shared by fill_blank and sentence_build
  // word_scramble
  scrambledLetters?: string[];
}

interface QuizData {
  _id: string;
  title: string;
  description?: string;
  questions: QuizQuestion[];
  passingScore?: number;
  timeLimit?: number; // minutes, 0 = no limit
  shuffleQuestions?: boolean;
  showResults?: 'immediately' | 'after_deadline';
  maxAttempts?: number;
}

interface AttemptResult {
  correct: boolean;
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  answers: { questionId: string; selectedAnswer: any; correct: boolean; points: number; explanation?: string }[];
  xpEarned?: number;
  newBadges?: string[];
  levelUp?: boolean;
  newLevel?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const questionTypeLabels: Record<string, { en: string; so: string; ar: string }> = {
  mcq: { en: 'Multiple Choice', so: 'Doorasho Badan', ar: 'اختيار متعدد' },
  true_false: { en: 'True / False', so: 'Run / Been', ar: 'صح / خطأ' },
  matching: { en: 'Matching', so: 'Isku Aade', ar: 'مطابقة' },
  ordering: { en: 'Ordering', so: 'Habeyn', ar: 'ترتيب' },
  fill_blank: { en: 'Fill in the Blank', so: 'Buuxi Bannaanka', ar: 'املأ الفراغ' },
  word_scramble: { en: 'Word Scramble', so: 'Qas Erayga', ar: 'تكوين الكلمة' },
  sentence_build: { en: 'Sentence Builder', so: 'Dhis Wereda', ar: 'بناء الجملة' },
  picture_choice: { en: 'Picture Choice', so: 'Doorasho Sawir', ar: 'اختيار الصورة' },
  swipe_sort: { en: 'Swipe Sort', so: 'Kala Sooc', ar: 'فرز منزلق' },
  listen_write: { en: 'Listen & Write', so: 'Maqal oo Qor', ar: 'استمع واكتب' },
};

/** Fisher-Yates — used only for the offline fallback path (the primary
 * shuffle for every question type happens server-side in stripQuizSecrets,
 * which is the only place that can shuffle safely without ever revealing
 * which choice is correct). */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isAnswerComplete(q: QuizQuestion, answer: any): boolean {
  if (answer === undefined || answer === null) return false;
  switch (q.type) {
    case 'fill_blank': {
      const blankCount = (q.textTemplate?.match(/___/g) || []).length;
      return Array.isArray(answer) && answer.length === blankCount && answer.every((w) => !!w);
    }
    case 'sentence_build':
      return Array.isArray(answer) && answer.length === (q.wordBank ? countCorrectSlots(q) : 0) && answer.length > 0;
    case 'swipe_sort':
      return Array.isArray(answer) && answer.length === (q.cards?.length || 0);
    case 'matching':
      return Array.isArray(answer) && answer.length === (q.leftItems?.length || 0);
    case 'ordering':
      return Array.isArray(answer) && answer.length === (q.items?.length || 0);
    case 'word_scramble':
      return typeof answer === 'string' && answer.length === (q.scrambledLetters?.length || 0);
    default:
      return true; // mcq/true_false/picture_choice/fill_blank(single)/listen_write — any non-null value counts
  }
}

// sentence_build's target length isn't shipped directly (wordBank includes
// distractors) — but the number of *placed* words the student intends is
// simply "however many they've dragged in," so completeness there is really
// "at least one word placed"; treated leniently on purpose.
function countCorrectSlots(_q: QuizQuestion): number {
  return 1;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StudentQuizTake() {
  const { courseId, quizId } = useParams<{ courseId: string; quizId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language as 'en' | 'so' | 'ar';

  // State
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usingOfflineCopy, setUsingOfflineCopy] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [submitted, setSubmitted] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(new Set());

  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restoredRef = useRef(false);

  // Fetch quiz data — falls back to the downloaded-course copy when offline.
  useEffect(() => {
    (async () => {
      try {
        let chapters: any[] = [];

        if (!navigator.onLine && courseId) {
          const offlineCopy = await getDownloadedCourse(courseId);
          if (offlineCopy) {
            chapters = offlineCopy.content?.chapters || [];
            setUsingOfflineCopy(true);
          }
        } else {
          const { data: contentRes } = await api.get(`/courses/${courseId}/content`);
          chapters = contentRes.data?.chapters || [];
        }

        let foundQuiz: any = null;
        for (const ch of chapters) {
          for (const item of ch.items || []) {
            if (item.type === 'quiz' && item._id === quizId) {
              foundQuiz = item;
              break;
            }
          }
          if (foundQuiz) break;
        }

        if (!foundQuiz) {
          setError(
            !navigator.onLine
              ? (lang === 'so' ? 'Quiz-kan lama soo dejin oo aad offline tahay.' : lang === 'ar' ? 'هذا الاختبار غير محمّل وأنت غير متصل.' : "This quiz hasn't been downloaded and you're offline.")
              : (lang === 'so' ? 'Quiz lama helin' : lang === 'ar' ? 'لم يتم العثور على الاختبار' : 'Quiz not found')
          );
          setLoading(false);
          return;
        }

        const quizData: QuizData = {
          _id: foundQuiz._id,
          title: foundQuiz.title,
          description: foundQuiz.description,
          questions: foundQuiz.shuffleQuestions ? shuffleArray(foundQuiz.questions || []) : (foundQuiz.questions || []),
          passingScore: foundQuiz.passingScore || 60,
          timeLimit: foundQuiz.timeLimit || 0,
          shuffleQuestions: foundQuiz.shuffleQuestions,
          showResults: foundQuiz.showResults || 'immediately',
          maxAttempts: foundQuiz.maxAttempts,
        };

        setQuiz(quizData);

        if (quizData.timeLimit && quizData.timeLimit > 0) {
          setTimeLeft(quizData.timeLimit * 60);
        }

        // Restore any in-progress draft — done here, inside the same
        // load sequence that the loading spinner gates, so there's no
        // window where the student can navigate/answer before the
        // restored state lands (that race previously let a fast "Next"
        // click get silently overwritten by a slightly slower IndexedDB
        // read resolving afterward).
        restoredRef.current = true;
        const saved = await getQuizProgress(quizData._id);
        if (saved) {
          setAnswers(saved.answers || {});
          setCurrentQuestion(Math.min(saved.currentQuestion || 0, quizData.questions.length - 1));
          setFlagged(new Set(saved.flagged || []));
          setAnsweredQuestions(new Set(Object.keys(saved.answers || {}).map(Number)));
          startTimeRef.current = saved.startedAt || Date.now();
        }
      } catch (err: any) {
        setError(err.response?.data?.message || t('common.error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId, quizId, lang, t]);

  // Autosave the draft on every change (debounced).
  useEffect(() => {
    if (!quiz || submitted || !restoredRef.current) return;
    const timeout = setTimeout(() => {
      saveQuizProgress({
        quizId: quiz._id,
        courseId: courseId!,
        answers,
        currentQuestion,
        flagged: [...flagged],
        startedAt: startTimeRef.current,
        updatedAt: Date.now(),
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(timeout);
  }, [answers, currentQuestion, flagged, quiz, submitted, courseId]);

  // Timer
  useEffect(() => {
    if (quiz?.timeLimit && quiz.timeLimit > 0 && !submitted) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz?.timeLimit, submitted]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (submitted || !quiz) return;
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'f' && e.ctrlKey) {
        e.preventDefault();
        toggleFlag(currentQuestion);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, submitted, quiz]);

  // Answer handler
  const setAnswer = useCallback((questionIndex: number, answer: any) => {
    setAnswers(prev => ({ ...prev, [questionIndex]: answer }));
    setAnsweredQuestions(prev => {
      const next = new Set(prev);
      next.add(questionIndex);
      return next;
    });
  }, []);

  const toggleFlag = (idx: number) => {
    setFlagged(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const goToNext = () => {
    if (quiz && currentQuestion < quiz.questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const goToPrev = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const goToQuestion = (idx: number) => {
    setCurrentQuestion(idx);
  };

  // Submit quiz — grading is server-only (see file header), so an offline
  // submission can't produce a result immediately; it's queued and the
  // student sees a "graded once you're back online" state instead.
  const handleSubmit = async () => {
    if (submitted || !quiz) return;
    setSubmitting(true);

    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const payload = {
      courseId,
      quizId: quiz._id,
      answers: quiz.questions.map((q, idx) => ({
        questionId: q._id,
        answer: answers[idx] ?? null,
      })),
      durationSeconds,
    };

    if (!navigator.onLine) {
      try {
        await queueAction({ type: 'quiz-submit-attempt', url: '/quizzes/submit-attempt', body: payload });
        await clearQuizProgress(quiz._id);
        setPendingOffline(true);
        setSubmitted(true);
      } catch (err) {
        console.error('Failed to queue offline quiz submission:', err);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const { data } = await api.post('/quizzes/submit-attempt', payload);
      const response = data.data;
      const attemptResult: AttemptResult = {
        correct: response.correct,
        score: response.score,
        totalPoints: response.totalPoints,
        percentage: response.percentage,
        passed: response.passed,
        answers: response.answers,
        xpEarned: response.xpEarned,
        newBadges: response.newBadges,
        levelUp: response.levelUp,
        newLevel: response.newLevel,
      };

      await clearQuizProgress(quiz._id);
      setResult(attemptResult);
      setSubmitted(true);

      if (attemptResult.passed && attemptResult.percentage === 100) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('common.error_occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  // Format time
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Progress
  const progressPercent = quiz ? Math.round((answeredQuestions.size / quiz.questions.length) * 100) : 0;
  const allAnswered = quiz ? answeredQuestions.size === quiz.questions.length : false;

  // Loading
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-600" />
        <p className="text-sm text-[var(--color-text-tertiary)]">
          {lang === 'so' ? 'Diyaarinta Quiz-ka...' : lang === 'ar' ? 'تحضير الاختبار...' : 'Preparing quiz...'}
        </p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
      <div className="text-center max-w-md px-6">
        <p className="text-5xl mb-4">⚠️</p>
        <p className="text-red-500 mb-6">{error}</p>
        <Link to={`/student/courses/${courseId}/learn`} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {lang === 'so' ? 'Ku noqo koorsada' : lang === 'ar' ? 'العودة إلى الدورة' : 'Back to Course'}
        </Link>
      </div>
    </div>
  );

  if (!quiz) return null;

  // ── Offline submission pending (queued, not yet gradable locally) ──
  if (submitted && pendingOffline) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
        <div className="text-center max-w-md px-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-6">
            <WifiOff className="h-10 w-10 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
            {lang === 'so' ? 'Waa la gudbiyay — sug internet' : lang === 'ar' ? 'تم الإرسال — بانتظار الاتصال' : 'Submitted — awaiting connection'}
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mb-6">
            {lang === 'so'
              ? 'Jawaabahaaga waa la keydiyay. Natiijadaada waxay soo bixi doontaa marka internetku soo noqdo.'
              : lang === 'ar'
                ? 'تم حفظ إجاباتك. ستظهر نتيجتك بمجرد عودة الاتصال بالإنترنت.'
                : "Your answers are saved. Your result will be graded and appear automatically once you're back online."}
          </p>
          <Link to={`/student/courses/${courseId}/learn`} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {lang === 'so' ? 'Ku noqo koorsada' : lang === 'ar' ? 'العودة إلى الدورة' : 'Back to Course'}
          </Link>
        </div>
      </div>
    );
  }

  // ── Results Screen ──
  if (submitted && result) {
    return <QuizResults
      result={result}
      quiz={quiz}
      lang={lang}
      courseId={courseId!}
      showConfetti={showConfetti}
      answers={answers}
    />;
  }

  const q = quiz.questions[currentQuestion];
  const isFirst = currentQuestion === 0;
  const isLast = currentQuestion === quiz.questions.length - 1;

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)]">
      {usingOfflineCopy && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white">
          <WifiOff className="h-3.5 w-3.5" />
          {lang === 'so' ? 'Offline — jawaabaha waxaa la sync gareyn doonaa marka aad online noqoto' : lang === 'ar' ? 'غير متصل — ستتم مزامنة الإجابات عند الاتصال' : "Offline — answers will sync once you're back online"}
        </div>
      )}
      {/* ── Top Bar ── */}
      <div className="sticky top-0 z-30 border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                to={`/student/courses/${courseId}/learn`}
                className="flex-shrink-0 p-2 rounded-lg hover:bg-[var(--color-surface-tertiary)] transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-[var(--color-text-secondary)]" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{quiz.title}</h1>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {lang === 'so' ? `Su'aasha ${currentQuestion + 1}/${quiz.questions.length}` : lang === 'ar' ? `السؤال ${currentQuestion + 1}/${quiz.questions.length}` : `Question ${currentQuestion + 1} of ${quiz.questions.length}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {quiz.timeLimit && quiz.timeLimit > 0 && (
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-mono font-bold ${timeLeft < 60 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 animate-pulse' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]'}`}>
                  <Clock className="h-3.5 w-3.5" />
                  {formatTime(timeLeft)}
                </div>
              )}
              <div className="hidden sm:block text-xs text-[var(--color-text-tertiary)]">
                {answeredQuestions.size}/{quiz.questions.length} {lang === 'so' ? 'la jawaabay' : lang === 'ar' ? 'تمت الإجابة' : 'answered'}
              </div>
              <div className="w-24 sm:w-32 h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-emerald-500"
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ type: 'spring', stiffness: 100 }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Deliberately not wrapped in AnimatePresence: its exit/enter
            coordination (mode="wait") can stall on this content — the
            exiting child's animation occasionally never resolves, freezing
            the question body on the previous question while the rest of
            the UI (progress bar, "Question X of Y") correctly moves on.
            A plain keyed remount still gets the enter animation, just
            without a choreographed exit — correctness over polish here. */}
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Question Type Badge */}
            <div className="flex items-center gap-2 mb-4">
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                {questionTypeLabels[q.type]?.[lang] || q.type}
              </span>
              {q.points && (
                <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">
                  {q.points} {lang === 'so' ? 'dhibcood' : lang === 'ar' ? 'نقاط' : 'pts'}
                </span>
              )}
              {flagged.has(currentQuestion) && (
                <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  <Flag className="h-3 w-3 inline mr-1" />
                  {lang === 'so' ? 'Calaamadeysan' : lang === 'ar' ? 'مؤشر' : 'Flagged'}
                </span>
              )}
            </div>

            {/* Question Text */}
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-6">
              {q.question}
            </h2>

            {/* Answer Area - by type */}
            {q.type === 'mcq' && (
              <MCQOptions
                options={q.options || []}
                selected={answers[currentQuestion]}
                onSelect={(val) => setAnswer(currentQuestion, val)}
              />
            )}

            {q.type === 'picture_choice' && (
              <PictureChoiceOptions
                choices={q.choices || []}
                selected={answers[currentQuestion]}
                onSelect={(val) => setAnswer(currentQuestion, val)}
              />
            )}

            {q.type === 'true_false' && (
              <TrueFalseOptions
                selected={answers[currentQuestion]}
                onSelect={(val) => setAnswer(currentQuestion, val)}
                lang={lang}
              />
            )}

            {q.type === 'matching' && (
              <MatchingPairs
                leftItems={q.leftItems || []}
                rightItems={q.rightItems || []}
                selected={answers[currentQuestion] || []}
                onUpdate={(pairs) => setAnswer(currentQuestion, pairs)}
                lang={lang}
              />
            )}

            {q.type === 'ordering' && q.items && (
              <OrderingList
                items={q.items}
                selected={answers[currentQuestion] || []}
                onUpdate={(items) => setAnswer(currentQuestion, items)}
                lang={lang}
              />
            )}

            {q.type === 'fill_blank' && (
              <FillBlankBuilder
                textTemplate={q.textTemplate || ''}
                wordBank={q.wordBank || []}
                selected={answers[currentQuestion] || []}
                onUpdate={(blanks) => setAnswer(currentQuestion, blanks)}
              />
            )}

            {q.type === 'word_scramble' && (
              <WordScrambleBuilder
                scrambledLetters={q.scrambledLetters || []}
                hint={q.hint}
                selected={answers[currentQuestion] || ''}
                onUpdate={(word) => setAnswer(currentQuestion, word)}
                lang={lang}
              />
            )}

            {q.type === 'sentence_build' && (
              <SentenceBuilder
                wordBank={q.wordBank || []}
                selected={answers[currentQuestion] || []}
                onUpdate={(words) => setAnswer(currentQuestion, words)}
              />
            )}

            {q.type === 'swipe_sort' && (
              <SwipeSortBoard
                cards={q.cards || []}
                leftLabel={q.leftLabel || 'Left'}
                rightLabel={q.rightLabel || 'Right'}
                selected={answers[currentQuestion] || []}
                onUpdate={(sorted) => setAnswer(currentQuestion, sorted)}
              />
            )}

            {q.type === 'listen_write' && (
              <ListenWriteAnswer
                audioUrl={q.audioUrl || ''}
                hint={q.hint}
                value={answers[currentQuestion] || ''}
                onChange={(val) => setAnswer(currentQuestion, val)}
                lang={lang}
              />
            )}
          </motion.div>

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrev}
              disabled={isFirst}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{lang === 'so' ? 'Hore' : lang === 'ar' ? 'السابق' : 'Prev'}</span>
            </button>
            <button
              onClick={() => toggleFlag(currentQuestion)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                flagged.has(currentQuestion)
                  ? 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-700 dark:text-amber-300'
                  : 'border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]'
              }`}
            >
              <Flag className="h-4 w-4" />
              <span className="hidden sm:inline">{lang === 'so' ? 'Calaamadee' : lang === 'ar' ? 'علِّم' : 'Flag'}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {isLast ? (
              <button
                onClick={handleSubmit}
                disabled={submitting || !allAnswered}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                {submitting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {lang === 'so' ? 'Gudbi' : lang === 'ar' ? 'إرسال' : 'Submit'}
              </button>
            ) : (
              <button
                onClick={goToNext}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 transition-all active:scale-95"
              >
                <span>{lang === 'so' ? 'Xiga' : lang === 'ar' ? 'التالي' : 'Next'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Question Navigator (dots/bubbles) ── */}
        <div className="mt-6">
          <div className="flex flex-wrap gap-2 justify-center">
            {quiz.questions.map((qitem, idx) => {
              const isCurrent = idx === currentQuestion;
              const isAnswered = answeredQuestions.has(idx);
              const isFlagged = flagged.has(idx);

              return (
                <button
                  key={idx}
                  onClick={() => goToQuestion(idx)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center ${
                    isCurrent
                      ? 'bg-emerald-600 text-white shadow-md scale-110'
                      : isAnswered
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-border-default)] border border-[var(--color-border-subtle)]'
                  } ${isFlagged ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-[var(--color-surface-primary)]' : ''}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <p className="text-center text-xs text-[var(--color-text-tertiary)] mt-3">
            {lang === 'so'
              ? `Ctrl+F si aad calaamadeysid | ←→ si aad u dhaqaaqdid`
              : lang === 'ar'
                ? `Ctrl+F للتعليم | ←→ للتنقل`
                : `Ctrl+F to flag | ←→ to navigate`}
          </p>
        </div>
      </div>

      {/* ── Submit Confirmation Modal ── */}
      {!submitted && isLast && (
        <div className="fixed bottom-6 right-6 z-40">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-xl hover:bg-emerald-700 disabled:opacity-50 transition-all"
          >
            {submitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {lang === 'so' ? 'Gudbi Quiz-ka' : lang === 'ar' ? 'إرسال الاختبار' : 'Submit Quiz'}
          </motion.button>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Quiz Results Screen
// ===========================================================================

function QuizResults({
  result, quiz, lang, courseId, showConfetti, answers,
}: {
  result: AttemptResult; quiz: QuizData; lang: 'en' | 'so' | 'ar'; courseId: string;
  showConfetti: boolean; answers: Record<number, any>;
}) {
  const [showReview, setShowReview] = useState(false);
  const confettiColors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)] relative overflow-hidden">
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {Array.from({ length: 50 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-3 h-3 rounded-full"
              style={{
                backgroundColor: confettiColors[i % confettiColors.length],
                left: `${Math.random() * 100}%`,
                top: -20,
              }}
              animate={{
                y: [0, window.innerHeight + 50],
                x: [0, (Math.random() - 0.5) * 300],
                rotate: [0, Math.random() * 720 - 360],
              }}
              transition={{ duration: 2 + Math.random() * 3, ease: 'easeIn' }}
            />
          ))}
        </div>
      )}

      <div className="mx-auto max-w-2xl px-6 py-16 text-center relative z-20">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="mb-6"
        >
          {result.passed ? (
            result.percentage === 100 ? (
              <div className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 shadow-xl shadow-amber-500/30">
                <Trophy className="h-14 w-14 text-white" />
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 shadow-xl shadow-emerald-500/30">
                <CheckCircle className="h-14 w-14 text-white" />
              </div>
            )
          ) : (
            <div className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-red-400 to-rose-600 shadow-xl shadow-red-500/30">
              <XCircle className="h-14 w-14 text-white" />
            </div>
          )}
        </motion.div>

        <h1 className="text-3xl font-extrabold text-[var(--color-text-primary)] mb-2">
          {result.passed
            ? (lang === 'so' ? 'Waad Gudubtay! 🎉' : lang === 'ar' ? 'لقد نجحت! 🎉' : 'You Passed! 🎉')
            : (lang === 'so' ? 'Kuma gudbin ✋' : lang === 'ar' ? 'لم تنجح ✋' : 'Not Passed ✋')}
        </h1>
        <p className="text-[var(--color-text-tertiary)] mb-8">
          {lang === 'so'
            ? `Waxaad ka heshay ${result.percentage}% (${result.score}/${result.totalPoints} dhibcood) • Gudub: ${quiz.passingScore || 60}%`
            : lang === 'ar'
              ? `حصلت على ${result.percentage}٪ (${result.score}/${result.totalPoints}) • النجاح: ${quiz.passingScore || 60}٪`
              : `You scored ${result.percentage}% (${result.score}/${result.totalPoints} pts) • Passing: ${quiz.passingScore || 60}%`}
        </p>

        {result.xpEarned && result.xpEarned > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-950/40 dark:to-yellow-950/40 border border-amber-200 dark:border-amber-800 px-5 py-2.5 mb-6"
          >
            <Zap className="h-5 w-5 text-amber-500" fill="currentColor" />
            <span className="font-bold text-amber-700 dark:text-amber-300">+{result.xpEarned} XP</span>
          </motion.div>
        )}

        {result.levelUp && result.newLevel && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-100 to-violet-100 dark:from-purple-950/40 dark:to-violet-950/40 border border-purple-200 dark:border-purple-800 px-5 py-2.5 mb-6"
          >
            <Sparkles className="h-5 w-5 text-purple-500" />
            <span className="font-bold text-purple-700 dark:text-purple-300">
              {lang === 'so' ? `Heerka ${result.newLevel} ayaad gaartay!` : lang === 'ar' ? `وصلت إلى المستوى ${result.newLevel}!` : `Level ${result.newLevel} Reached!`}
            </span>
          </motion.div>
        )}

        <div className="mb-8">
          <div className="w-full h-4 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${result.passed ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}
              initial={{ width: 0 }}
              animate={{ width: `${result.percentage}%` }}
              transition={{ duration: 1, delay: 0.2, type: 'spring' }}
            />
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-2">{result.percentage}%</p>
        </div>

        <div className="mb-6">
          <button
            onClick={() => setShowReview(!showReview)}
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 transition-colors"
          >
            {showReview
              ? (lang === 'so' ? 'Qari faahfaahinta' : lang === 'ar' ? 'إخفاء التفاصيل' : 'Hide Details')
              : (lang === 'so' ? 'Eeg faahfaahinta' : lang === 'ar' ? 'عرض التفاصيل' : 'View Details')}
          </button>
        </div>

        {showReview && (
          <div className="space-y-4 text-left max-h-[400px] overflow-y-auto pr-2 mb-8">
            {quiz.questions.map((q, idx) => {
              const a = result.answers[idx];
              return (
                <div key={idx} className={`rounded-xl border p-4 ${a?.correct ? 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800' : 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800'}`}>
                  <div className="flex items-start gap-2 mb-2">
                    {a?.correct ? (
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{q.question}</p>
                      {a?.explanation && (
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-1 italic">{a.explanation}</p>
                      )}
                      <p className="text-xs mt-1 text-[var(--color-text-tertiary)]">
                        {a?.correct
                          ? (lang === 'so' ? `+${a.points} dhibcood` : lang === 'ar' ? `+${a.points} نقطة` : `+${a.points} pts`)
                          : (lang === 'so' ? '0 dhibcood' : lang === 'ar' ? '0 نقطة' : '0 pts')}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to={`/student/courses/${courseId}/learn`}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-surface-tertiary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-border-default)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {lang === 'so' ? 'Ku noqo koorsada' : lang === 'ar' ? 'العودة إلى الدورة' : 'Back to Course'}
          </Link>
          {!result.passed && (
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              {lang === 'so' ? 'Isku day mar kale' : lang === 'ar' ? 'حاول مرة أخرى' : 'Try Again'}
            </button>
          )}
          <Link
            to="/student/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
          >
            {lang === 'so' ? 'Dashboard' : lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Answer type renderers
// ===========================================================================

// ── 1. Multiple Choice — graded by option TEXT, not index, so the
// server-shuffled order is always safe. ──
function MCQOptions({ options, selected, onSelect }: { options: string[]; selected: string | undefined; onSelect: (val: string) => void }) {
  return (
    <div className="space-y-3">
      {options.map((opt, idx) => (
        <motion.button
          key={idx}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(opt)}
          className={`w-full text-left rounded-2xl border-2 px-5 py-4 transition-all duration-200 ${
            selected === opt
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 shadow-md shadow-emerald-500/10'
              : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-[var(--color-surface-tertiary)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              selected === opt ? 'bg-emerald-600 text-white' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]'
            }`}>
              {String.fromCharCode(65 + idx)}
            </span>
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{opt}</span>
          </div>
        </motion.button>
      ))}
    </div>
  );
}

// ── 2. Picture Choice — graded by image URL. ──
function PictureChoiceOptions({ choices, selected, onSelect }: { choices: { image: string; label?: string }[]; selected: string | undefined; onSelect: (image: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {choices.map((c, idx) => (
        <motion.button
          key={idx}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect(c.image)}
          className={`rounded-2xl border-2 overflow-hidden transition-all duration-200 ${
            selected === c.image ? 'border-emerald-500 shadow-md shadow-emerald-500/20' : 'border-[var(--color-border-default)] hover:border-emerald-300'
          }`}
        >
          <img src={c.image} alt={c.label || `Option ${idx + 1}`} className="w-full h-32 object-cover" />
          {c.label && <p className="text-xs font-medium text-[var(--color-text-primary)] py-2 px-2 bg-[var(--color-surface-secondary)]">{c.label}</p>}
        </motion.button>
      ))}
    </div>
  );
}

// ── 3. True / False ──
function TrueFalseOptions({ selected, onSelect, lang }: { selected: boolean | undefined; onSelect: (val: boolean) => void; lang: 'en' | 'so' | 'ar' }) {
  const trueLabel = lang === 'so' ? 'Run' : lang === 'ar' ? 'صح' : 'True';
  const falseLabel = lang === 'so' ? 'Been' : lang === 'ar' ? 'خطأ' : 'False';

  return (
    <div className="grid grid-cols-2 gap-4">
      {([true, false] as const).map(val => (
        <motion.button
          key={String(val)}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSelect(val)}
          className={`rounded-2xl border-2 px-6 py-6 text-center text-lg font-bold transition-all duration-200 ${
            selected === val ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 shadow-md' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] hover:border-emerald-300'
          }`}
        >
          {val ? '✅' : '❌'} {val ? trueLabel : falseLabel}
        </motion.button>
      ))}
    </div>
  );
}

// ── 4. Matching Pairs — left column fixed, right column (already
// server-shuffled) assigned via dropdown; never pre-solved. ──
function MatchingPairs({
  leftItems, rightItems, selected, onUpdate, lang,
}: {
  leftItems: string[]; rightItems: string[];
  selected: { left: string; right: string }[];
  onUpdate: (pairs: { left: string; right: string }[]) => void;
  lang: 'en' | 'so' | 'ar';
}) {
  const availableRight = rightItems.filter((right) => !selected.some((s) => s.right === right));

  const assign = (leftItem: string, rightItem: string) => {
    const current = selected.filter((s) => s.left !== leftItem && s.right !== rightItem);
    onUpdate([...current, { left: leftItem, right: rightItem }]);
  };
  const unassign = (leftItem: string) => onUpdate(selected.filter((s) => s.left !== leftItem));
  const getAssigned = (leftItem: string) => selected.find((s) => s.left === leftItem)?.right || null;

  return (
    <div className="space-y-4">
      {leftItems.map((left, idx) => {
        const assigned = getAssigned(left);
        return (
          <div key={idx} className="flex items-center gap-4">
            <div className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">
              {left}
            </div>
            <ArrowRight className="h-4 w-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
            <div className="flex-1">
              {assigned ? (
                <button
                  onClick={() => unassign(left)}
                  className="w-full rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
                >
                  {assigned} ✕
                </button>
              ) : (
                <select
                  value=""
                  onChange={e => { if (e.target.value) assign(left, e.target.value); }}
                  className="w-full rounded-xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] focus:border-emerald-500 focus:outline-none cursor-pointer"
                >
                  <option value="">{lang === 'so' ? 'Dooro...' : lang === 'ar' ? 'اختر...' : 'Select...'}</option>
                  {availableRight.map((r, ri) => <option key={ri} value={r}>{r}</option>)}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 5. Ordering — items arrive already shuffled from the server ONCE per
// fetch; never re-shuffled on re-render (that was the bug: shuffling
// inline in JSX scrambled the list on every keystroke/interaction). ──
function OrderingList({
  items, selected, onUpdate, lang,
}: {
  items: string[]; selected: string[]; onUpdate: (items: string[]) => void; lang: 'en' | 'so' | 'ar';
}) {
  const currentOrder = selected.length > 0 ? selected : items;

  // The displayed (possibly already-correct) order only becomes the actual
  // submitted answer once the student touches an up/down button — if the
  // shuffle happens to land on the right order and they never click
  // anything, the answer stays unset and grades as wrong despite looking
  // correct on screen. Report the initial order once so it always counts.
  useEffect(() => {
    if (selected.length === 0) onUpdate(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const newOrder = [...currentOrder];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    onUpdate(newOrder);
  };
  const moveDown = (idx: number) => {
    if (idx === currentOrder.length - 1) return;
    const newOrder = [...currentOrder];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    onUpdate(newOrder);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-text-tertiary)] mb-3 text-center">
        {lang === 'so' ? 'Habee si sax ah adoo riixaya badhamada kor/hoos' : lang === 'ar' ? 'رتب بشكل صحيح باستخدام أزرار الأعلى/الأسفل' : 'Arrange in correct order using up/down buttons'}
      </p>
      {currentOrder.map((item, idx) => (
        <div key={item} className="flex items-center gap-3">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-sm font-bold">
            {idx + 1}
          </span>
          <div className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">
            {item}
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={() => moveUp(idx)} disabled={idx === 0} className="w-7 h-7 rounded-lg bg-[var(--color-surface-tertiary)] hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-[var(--color-text-secondary)] flex items-center justify-center text-xs disabled:opacity-30 transition-colors">▲</button>
            <button onClick={() => moveDown(idx)} disabled={idx === currentOrder.length - 1} className="w-7 h-7 rounded-lg bg-[var(--color-surface-tertiary)] hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-[var(--color-text-secondary)] flex items-center justify-center text-xs disabled:opacity-30 transition-colors">▼</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 6. Fill in the Blank — click a word-bank chip to fill the next empty
// blank in the sentence; click a filled blank to clear it back to the bank. ──
function FillBlankBuilder({
  textTemplate, wordBank, selected, onUpdate,
}: {
  textTemplate: string; wordBank: string[]; selected: string[]; onUpdate: (blanks: string[]) => void;
}) {
  const segments = textTemplate.split('___');
  const blankCount = segments.length - 1;
  const filled = useMemo(() => {
    const arr = [...selected];
    while (arr.length < blankCount) arr.push('');
    return arr.slice(0, blankCount);
  }, [selected, blankCount]);

  const usedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of filled) if (w) counts[w] = (counts[w] || 0) + 1;
    return counts;
  }, [filled]);

  const fillNext = (word: string) => {
    const idx = filled.findIndex((w) => !w);
    if (idx === -1) return;
    const next = [...filled];
    next[idx] = word;
    onUpdate(next);
  };
  const clearBlank = (idx: number) => {
    const next = [...filled];
    next[idx] = '';
    onUpdate(next);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-5 py-4 text-sm leading-loose text-[var(--color-text-primary)]">
        {segments.map((seg, i) => (
          <span key={i}>
            {seg}
            {i < blankCount && (
              <button
                onClick={() => clearBlank(i)}
                disabled={!filled[i]}
                className={`inline-flex items-center justify-center min-w-[70px] mx-1 px-2 py-0.5 rounded-lg border-b-2 font-semibold text-sm align-baseline ${
                  filled[i]
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 cursor-pointer'
                    : 'border-dashed border-[var(--color-text-tertiary)] text-[var(--color-text-tertiary)]'
                }`}
              >
                {filled[i] || '_____'}
              </button>
            )}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {wordBank.map((word, idx) => {
          const usedSoFar = wordBank.slice(0, idx).filter((w) => w === word).length;
          const isUsed = usedSoFar < (usedCounts[word] || 0);
          return (
            <button
              key={idx}
              disabled={isUsed}
              onClick={() => fillNext(word)}
              className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all ${
                isUsed
                  ? 'opacity-30 cursor-not-allowed border-[var(--color-border-subtle)] text-[var(--color-text-tertiary)]'
                  : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
              }`}
            >
              {word}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 7. Word Scramble — click scrambled letter tiles in order; click a
// placed letter to send it back. ──
function WordScrambleBuilder({
  scrambledLetters, hint, selected, onUpdate, lang,
}: {
  scrambledLetters: string[]; hint?: string; selected: string; onUpdate: (word: string) => void; lang: 'en' | 'so' | 'ar';
}) {
  const [usedIndices, setUsedIndices] = useState<number[]>([]);
  const [showHint, setShowHint] = useState(false);
  const hydratedRef = useRef(false);

  // Re-sync local tile-selection state if the answer was restored from an
  // autosaved draft (selected non-empty but usedIndices still fresh).
  useEffect(() => {
    if (selected && usedIndices.length === 0 && selected.length <= scrambledLetters.length) {
      // Best-effort greedy re-match of the restored string back onto tiles.
      const remaining = [...scrambledLetters];
      const indices: number[] = [];
      for (const ch of selected) {
        const idx = remaining.findIndex((c, i) => c === ch && !indices.includes(scrambledLetters.indexOf(c, i)));
        // Fallback: find first unused matching letter.
        const candidateIdx = scrambledLetters.findIndex((c, i) => c === ch && !indices.includes(i));
        if (candidateIdx !== -1) indices.push(candidateIdx);
      }
      if (indices.length === selected.length) setUsedIndices(indices);
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify the parent from an effect (reacting to the settled state) rather
  // than computing the "next" array in the click handler off a closure —
  // functional setState + an effect means back-to-back clicks (e.g. two
  // taps in the same event-loop tick) always compound correctly instead of
  // the second call overwriting the first with stale data.
  useEffect(() => {
    if (!hydratedRef.current) return;
    onUpdate(usedIndices.map((i) => scrambledLetters[i]).join(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedIndices]);

  const pickLetter = (idx: number) => {
    setUsedIndices((prev) => (prev.includes(idx) ? prev : [...prev, idx]));
  };
  const removeLast = (position: number) => {
    setUsedIndices((prev) => prev.filter((_, i) => i !== position));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-1.5 min-h-[3rem] flex-wrap">
        {usedIndices.length === 0 && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {lang === 'so' ? 'Riix xarfaha hoose si aad u dhisto erayga' : lang === 'ar' ? 'اضغط الحروف أدناه لبناء الكلمة' : 'Tap the letters below to build the word'}
          </span>
        )}
        {usedIndices.map((letterIdx, pos) => (
          <button
            key={pos}
            onClick={() => removeLast(pos)}
            className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-400 text-emerald-700 dark:text-emerald-300 font-bold text-lg flex items-center justify-center"
          >
            {scrambledLetters[letterIdx]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {scrambledLetters.map((letter, idx) => (
          <button
            key={idx}
            disabled={usedIndices.includes(idx)}
            onClick={() => pickLetter(idx)}
            className={`w-10 h-10 rounded-lg border-2 font-bold text-lg flex items-center justify-center transition-all ${
              usedIndices.includes(idx)
                ? 'opacity-20 cursor-not-allowed border-[var(--color-border-subtle)]'
                : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      {hint && (
        <div className="text-center">
          <button onClick={() => setShowHint((s) => !s)} className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline">
            <Lightbulb className="h-3.5 w-3.5" />
            {showHint ? hint : (lang === 'so' ? 'Tus talo' : lang === 'ar' ? 'إظهار تلميح' : 'Show hint')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── 8. Sentence Builder — click word-bank chips (correct words + decoys,
// shuffled) to append to the sentence; click a placed word to remove it. ──
function SentenceBuilder({
  wordBank, selected, onUpdate,
}: {
  wordBank: string[]; selected: string[]; onUpdate: (words: string[]) => void;
}) {
  const [usedIndices, setUsedIndices] = useState<number[]>([]);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (selected.length > 0 && usedIndices.length === 0) {
      const indices: number[] = [];
      for (const word of selected) {
        const idx = wordBank.findIndex((w, i) => w === word && !indices.includes(i));
        if (idx !== -1) indices.push(idx);
      }
      if (indices.length === selected.length) setUsedIndices(indices);
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    onUpdate(usedIndices.map((i) => wordBank[i]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedIndices]);

  const addWord = (idx: number) => {
    setUsedIndices((prev) => (prev.includes(idx) ? prev : [...prev, idx]));
  };
  const removeAt = (position: number) => {
    setUsedIndices((prev) => prev.filter((_, i) => i !== position));
  };

  return (
    <div className="space-y-6">
      <div className="min-h-[4rem] rounded-2xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 flex flex-wrap gap-2 items-center">
        {usedIndices.length === 0 && <span className="text-xs text-[var(--color-text-tertiary)]">Tap words below to build the sentence…</span>}
        {usedIndices.map((wordIdx, pos) => (
          <button
            key={pos}
            onClick={() => removeAt(pos)}
            className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-400 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
          >
            {wordBank[wordIdx]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {wordBank.map((word, idx) => (
          <button
            key={idx}
            disabled={usedIndices.includes(idx)}
            onClick={() => addWord(idx)}
            className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all ${
              usedIndices.includes(idx)
                ? 'opacity-30 cursor-not-allowed border-[var(--color-border-subtle)] text-[var(--color-text-tertiary)]'
                : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
            }`}
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 9. Swipe Sort — sort each card into one of two buckets. ──
function SwipeSortBoard({
  cards, leftLabel, rightLabel, selected, onUpdate,
}: {
  cards: { text: string }[]; leftLabel: string; rightLabel: string;
  selected: { text: string; side: 'left' | 'right' }[]; onUpdate: (sorted: { text: string; side: 'left' | 'right' }[]) => void;
}) {
  // Local state (functional updates) + an effect to call onUpdate, rather
  // than computing "next" off the `selected` prop directly in the click
  // handler — the prop only refreshes on the next render, so several
  // assignments made in the same event-loop tick would each overwrite the
  // previous one instead of accumulating (confirmed: 4 rapid assignments
  // collapsed down to just the last one actually reaching the server).
  const [local, setLocal] = useState<{ text: string; side: 'left' | 'right' }[]>(selected);
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    onUpdate(local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  const getSide = (text: string) => local.find((s) => s.text === text)?.side;

  const assign = (text: string, side: 'left' | 'right') => {
    setLocal((prev) => [...prev.filter((s) => s.text !== text), { text, side }]);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 mb-2 text-center">
        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">⬅ {leftLabel}</div>
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">{rightLabel} ➡</div>
      </div>
      {cards.map((card, idx) => {
        const side = getSide(card.text);
        return (
          <div key={idx} className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-2">
            <button
              onClick={() => assign(card.text, 'left')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${side === 'left' ? 'bg-rose-500 text-white' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)] hover:bg-rose-100 dark:hover:bg-rose-950/30'}`}
            >
              ⬅
            </button>
            <div className="flex-1 text-sm font-medium text-[var(--color-text-primary)] text-center">{card.text}</div>
            <button
              onClick={() => assign(card.text, 'right')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${side === 'right' ? 'bg-blue-500 text-white' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)] hover:bg-blue-100 dark:hover:bg-blue-950/30'}`}
            >
              ➡
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── 10. Listen & Write — real audio playback (audioUrl), type what's heard. ──
function ListenWriteAnswer({
  audioUrl, hint, value, onChange, lang,
}: {
  audioUrl: string; hint?: string; value: string; onChange: (val: string) => void; lang: 'en' | 'so' | 'ar';
}) {
  const [showHint, setShowHint] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-5 flex flex-col items-center gap-3">
        {audioUrl ? (
          <>
            <button
              onClick={() => audioRef.current?.play()}
              className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/25"
              aria-label="Play audio"
            >
              <Play className="h-7 w-7 ml-1" fill="currentColor" />
            </button>
            <audio ref={audioRef} src={audioUrl} controls className="w-full h-9" />
          </>
        ) : (
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {lang === 'so' ? 'Codka lama helin.' : lang === 'ar' ? 'الصوت غير متاح.' : 'Audio unavailable.'}
          </p>
        )}
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={lang === 'so' ? 'Qor waxaad maqashay...' : lang === 'ar' ? 'اكتب ما سمعته...' : 'Type what you heard...'}
        className="w-full rounded-2xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-5 py-4 text-sm font-medium text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors"
      />

      {hint && (
        <div className="text-center">
          <button onClick={() => setShowHint((s) => !s)} className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline">
            <Lightbulb className="h-3.5 w-3.5" />
            {showHint ? hint : (lang === 'so' ? 'Tus talo' : lang === 'ar' ? 'إظهار تلميح' : 'Show hint')}
          </button>
        </div>
      )}
    </div>
  );
}

export default StudentQuizTake;
