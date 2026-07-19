/**
 * Student Quiz Taking Interface
 *
 * Route: /student/courses/:courseId/quiz/:lessonId/take
 *
 * Full interactive quiz experience with:
 *   - Timer countdown (if quiz has time limit)
 *   - Question-by-question navigation or all-at-once
 *   - Multiple question types: MCQ, True/False, Matching, Ordering, Fill Blank
 *   - Instant feedback after submission
 *   - XP rewards via gamification API
 *   - Confetti on perfect scores
 *   - Accessible keyboard navigation
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Clock, ArrowLeft, ArrowRight, Flag, Send, Trophy, Zap, Sparkles } from 'lucide-react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuestionType = 'mcq' | 'true_false' | 'matching' | 'ordering' | 'fill_blank' | 'word_scramble' | 'sentence_build' | 'picture_choice' | 'swipe_sort' | 'listen_write';

interface QuizQuestion {
  _id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  pairs?: { left: string; right: string }[];
  items?: string[];
  explanation?: string;
  points?: number;
  choices?: { image: string; label?: string }[];
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
  answers: { questionId: string; selectedAnswer: any; correct: boolean; points: number }[];
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

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StudentQuizTake() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language as 'en' | 'so' | 'ar';

  // State
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(new Set());

  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch quiz data
  useEffect(() => {
    (async () => {
      try {
        // Fetch course content, find the quiz by lessonId
        const { data: contentRes } = await api.get(`/courses/${courseId}/content`);
        const chapters = contentRes.data?.chapters || [];
        let foundQuiz: any = null;

        for (const ch of chapters) {
          for (const item of ch.items || []) {
            if (item.type === 'quiz' && item._id === lessonId) {
              foundQuiz = item;
              break;
            }
          }
          if (foundQuiz) break;
        }

        if (!foundQuiz) {
          setError(lang === 'so' ? 'Quiz lama helin' : lang === 'ar' ? 'لم يتم العثور على الاختبار' : 'Quiz not found');
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
      } catch (err: any) {
        setError(err.response?.data?.message || t('common.error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId, lessonId]);

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

  // Submit quiz
  const handleSubmit = async () => {
    if (submitted || !quiz) return;
    setSubmitting(true);

    try {
      // Calculate local score first for instant feedback
      let correctCount = 0;
      const gradedAnswers: AttemptResult['answers'] = [];

      quiz.questions.forEach((q, idx) => {
        const answer = answers[idx];
        let isCorrect = false;

        switch (q.type) {
          case 'mcq':
          case 'picture_choice':
            isCorrect = typeof answer === 'number' && answer === (q as any).correctIndex;
            break;
          case 'true_false':
            isCorrect = answer === (q as any).correctAnswer;
            break;
          case 'matching': {
            if (Array.isArray(answer) && q.pairs) {
              isCorrect = answer.every((pair: any, pi: number) =>
                pair.left === q.pairs![pi].left && pair.right === q.pairs![pi].right
              );
            }
            break;
          }
          case 'ordering': {
            if (Array.isArray(answer) && q.items) {
              isCorrect = answer.every((item: string, i: number) => item === q.items![i]);
            }
            break;
          }
          case 'fill_blank': {
            // case-insensitive comparison for fill-blank
            const correctAns = (q as any).correctAnswer || '';
            isCorrect = typeof answer === 'string' && answer.trim().toLowerCase() === correctAns.trim().toLowerCase();
            break;
          }
          case 'word_scramble':
          case 'sentence_build': {
            const correctAns = (q as any).correctAnswer || '';
            isCorrect = typeof answer === 'string' && answer.trim().toLowerCase() === correctAns.trim().toLowerCase();
            break;
          }
        }

        if (isCorrect) correctCount++;

        gradedAnswers.push({
          questionId: q._id,
          selectedAnswer: answer,
          correct: isCorrect,
          points: isCorrect ? (q.points || 1) : 0,
        });
      });

      const totalPoints = quiz.questions.reduce((sum, q) => sum + (q.points || 1), 0);
      const earnedPoints = gradedAnswers.reduce((sum, a) => sum + a.points, 0);
      const percentage = Math.round((earnedPoints / totalPoints) * 100);
      const passed = percentage >= (quiz.passingScore || 60);

      const attemptResult: AttemptResult = {
        correct: passed,
        score: earnedPoints,
        totalPoints,
        percentage,
        passed,
        answers: gradedAnswers,
      };

      // Post to gamification API for XP rewards
      try {
        const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
        const { data: gamRes } = await api.post('/gamification/complete-quiz', {
          score: earnedPoints,
          totalQuestions: quiz.questions.length,
          timeSpentSeconds: timeSpent,
        });
        attemptResult.xpEarned = gamRes.data?.xpEarned;
        attemptResult.newBadges = gamRes.data?.earnedBadges?.map((b: any) => b.badgeKey);
        attemptResult.levelUp = gamRes.data?.level ? gamRes.data.level > (gamRes.data?.level || 1) : false;
        attemptResult.newLevel = gamRes.data?.level;
      } catch {
        // Gamification is optional — don't block quiz submission
      }

      setResult(attemptResult);
      setSubmitted(true);

      if (passed && percentage === 100) {
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
  const flaggedCount = flagged.size;
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
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
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
            {(q.type === 'mcq' || q.type === 'picture_choice') && (
              <MCQOptions
                options={q.options || []}
                choices={q.choices}
                selected={answers[currentQuestion]}
                onSelect={(idx) => setAnswer(currentQuestion, idx)}
                lang={lang}
              />
            )}

            {q.type === 'true_false' && (
              <TrueFalseOptions
                selected={answers[currentQuestion]}
                onSelect={(val) => setAnswer(currentQuestion, val)}
                lang={lang}
              />
            )}

            {q.type === 'matching' && q.pairs && (
              <MatchingPairs
                pairs={q.pairs}
                selected={answers[currentQuestion] || []}
                onUpdate={(pairs) => setAnswer(currentQuestion, pairs)}
                lang={lang}
              />
            )}

            {q.type === 'ordering' && q.items && (
              <OrderingList
                items={shuffleArray(q.items)}
                selected={answers[currentQuestion] || []}
                onUpdate={(items) => setAnswer(currentQuestion, items)}
                lang={lang}
              />
            )}

            {(q.type === 'fill_blank' || q.type === 'word_scramble' || q.type === 'sentence_build') && (
              <TextInput
                value={answers[currentQuestion] || ''}
                onChange={(val) => setAnswer(currentQuestion, val)}
                lang={lang}
                placeholder={q.type === 'fill_blank' ? (lang === 'so' ? 'Buuxi bannaanka...' : lang === 'ar' ? 'املأ الفراغ...' : 'Type your answer...') : (lang === 'so' ? 'Qor jawaabtaada...' : lang === 'ar' ? 'اكتب إجابتك...' : 'Type your answer...')}
              />
            )}
          </motion.div>
        </AnimatePresence>

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

// ───────────────────────────────────────────────────────────────────────────────
// Quiz Results Screen
// ───────────────────────────────────────────────────────────────────────────────

function QuizResults({
  result, quiz, lang, courseId, showConfetti, answers,
}: {
  result: AttemptResult; quiz: QuizData; lang: 'en' | 'so' | 'ar'; courseId: string;
  showConfetti: boolean; answers: Record<number, any>;
}) {
  const [showReview, setShowReview] = useState(false);

  // Simple confetti
  const confettiColors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)] relative overflow-hidden">
      {/* ── Confetti ── */}
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
        {/* Result Icon */}
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

        {/* Title */}
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

        {/* XP earned */}
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

        {/* Level up */}
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

        {/* Score bar */}
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

        {/* Review toggle */}
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

        {/* Review answers */}
        {showReview && (
          <div className="space-y-4 text-left max-h-[400px] overflow-y-auto pr-2 mb-8">
            {quiz.questions.map((q, idx) => {
              const a = result.answers[idx];
              const userAnswer = answers[idx];
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
                      {q.explanation && (
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-1 italic">{q.explanation}</p>
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

        {/* Actions */}
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

// ───────────────────────────────────────────────────────────────────────────────
// Sub-components for answer types
// ───────────────────────────────────────────────────────────────────────────────

function MCQOptions({
  options, choices, selected, onSelect, lang,
}: {
  options: string[]; choices?: { image: string; label?: string }[];
  selected: number | undefined; onSelect: (idx: number) => void; lang: 'en' | 'so' | 'ar';
}) {
  return (
    <div className="space-y-3">
      {options.map((opt, idx) => (
        <motion.button
          key={idx}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(idx)}
          className={`w-full text-left rounded-2xl border-2 px-5 py-4 transition-all duration-200 ${
            selected === idx
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 shadow-md shadow-emerald-500/10'
              : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-[var(--color-surface-tertiary)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              selected === idx
                ? 'bg-emerald-600 text-white'
                : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]'
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

function TrueFalseOptions({
  selected, onSelect, lang,
}: {
  selected: boolean | undefined; onSelect: (val: boolean) => void; lang: 'en' | 'so' | 'ar';
}) {
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
            selected === val
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 shadow-md'
              : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] hover:border-emerald-300'
          }`}
        >
          {val ? '✅' : '❌'} {val ? trueLabel : falseLabel}
        </motion.button>
      ))}
    </div>
  );
}

function TextInput({
  value, onChange, lang, placeholder,
}: {
  value: string; onChange: (val: string) => void; lang: 'en' | 'so' | 'ar';
  placeholder: string;
}) {
  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-5 py-4 text-sm font-medium text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors"
        autoFocus
      />
      <p className="text-xs text-[var(--color-text-tertiary)] mt-2 text-center">
        {lang === 'so' ? 'Tabo Enter si aad u xaqiijisid' : lang === 'ar' ? 'اضغط Enter للتأكيد' : 'Press Enter to confirm'}
      </p>
    </div>
  );
}

function MatchingPairs({
  pairs, selected, onUpdate, lang,
}: {
  pairs: { left: string; right: string }[];
  selected: { left: string; right: string }[];
  onUpdate: (pairs: { left: string; right: string }[]) => void;
  lang: 'en' | 'so' | 'ar';
}) {
  // Show left items in fixed positions, right items as draggable/sortable
  const rightItems = pairs.map(p => p.right);
  const [availableRight, setAvailableRight] = useState<string[]>(
    (() => {
      const used = (selected || []).map((s: any) => s.right);
      return shuffleArray(rightItems).filter(r => !used.includes(r));
    })()
  );

  const assign = (leftItem: string, rightItem: string) => {
    const current = [...(selected || [])].filter((s: any) => s.left !== leftItem);
    // If rightItem was previously assigned to another left, remove it
    const cleaned = current.filter((s: any) => s.right !== rightItem);
    const newSel = [...cleaned, { left: leftItem, right: rightItem }];
    onUpdate(newSel);
    setAvailableRight(prev => {
      const next = prev.filter(r => r !== rightItem);
      // Return the right item that was unassigned (if any)
      const prevForThisLeft = (selected || []).find((s: any) => s.left === leftItem);
      if (prevForThisLeft && !newSel.some((s: any) => s.right === prevForThisLeft.right)) {
        next.push(prevForThisLeft.right);
      }
      return next;
    });
  };

  const unassign = (leftItem: string) => {
    const current = [...(selected || [])];
    const removed = current.find((s: any) => s.left === leftItem);
    const newSel = current.filter((s: any) => s.left !== leftItem);
    onUpdate(newSel);
    if (removed) {
      setAvailableRight(prev => [...prev, removed.right]);
    }
  };

  const getAssigned = (leftItem: string) => {
    return (selected || []).find((s: any) => s.left === leftItem)?.right || null;
  };

  return (
    <div className="space-y-4">
      {pairs.map((pair, idx) => {
        const assigned = getAssigned(pair.left);
        return (
          <div key={idx} className="flex items-center gap-4">
            <div className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">
              {pair.left}
            </div>
            <ArrowRight className="h-4 w-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
            <div className="flex-1">
              {assigned ? (
                <button
                  onClick={() => unassign(pair.left)}
                  className="w-full rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
                >
                  {assigned} ✕
                </button>
              ) : (
                <select
                  value=""
                  onChange={e => {
                    if (e.target.value) assign(pair.left, e.target.value);
                  }}
                  className="w-full rounded-xl border-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] focus:border-emerald-500 focus:outline-none cursor-pointer"
                >
                  <option value="">{lang === 'so' ? 'Dooro...' : lang === 'ar' ? 'اختر...' : 'Select...'}</option>
                  {availableRight.map((r, ri) => (
                    <option key={ri} value={r}>{r}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderingList({
  items, selected, onUpdate, lang,
}: {
  items: string[];
  selected: string[];
  onUpdate: (items: string[]) => void;
  lang: 'en' | 'so' | 'ar';
}) {
  const currentOrder = selected.length > 0 ? selected : items;

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
        <div key={idx} className="flex items-center gap-3">
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

export default StudentQuizTake;