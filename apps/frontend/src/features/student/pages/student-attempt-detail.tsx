import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  History,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import api from '../../../lib/axios';

type ActivityType = 'interactive_lesson' | 'quiz';
type LocalizedTitle = { en?: string; so?: string; ar?: string } | string;

interface QuestionAttempt {
  attemptNumber: number;
  selectedAnswer: unknown;
  selectedAnswerDisplay: unknown;
  correct: boolean;
  attemptedAt?: string;
  timeSpentSeconds?: number;
}

interface ReviewQuestion {
  key: string;
  number: number;
  questionId?: string;
  type: string;
  question: string;
  blockTitle?: string;
  selectedAnswer: unknown;
  selectedAnswerDisplay: unknown;
  correctAnswer: unknown;
  correctAnswerDisplay: unknown;
  correct: boolean;
  earnedPoints: number;
  possiblePoints: number;
  explanation?: string;
  attempts?: QuestionAttempt[];
}

interface AttemptHistoryRow {
  id: string;
  attemptNumber: number;
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  durationSeconds: number;
  isFirstAttempt: boolean;
  date: string;
}

interface AttemptDetailResponse {
  type: ActivityType;
  course: { id: string; title: LocalizedTitle };
  chapterTitle: string;
  activity: { id: string; title: string; status: string; date: string };
  summary: {
    score: number;
    totalPoints: number;
    percentage: number;
    passed: boolean;
    attemptNumber: number;
    totalAttempts: number;
    durationSeconds: number;
  };
  questions: ReviewQuestion[];
  attemptHistory: AttemptHistoryRow[];
}

function titleOf(value: LocalizedTitle): string {
  if (typeof value === 'string') return value;
  return value?.en || value?.so || value?.ar || 'Course';
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function questionTypeLabel(type: string) {
  return type.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function answerText(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'No answer';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string' || typeof value === 'number') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.map((entry) => {
      if (entry && typeof entry === 'object') {
        const item = entry as Record<string, unknown>;
        if ('left' in item && 'right' in item) return `${answerText(item.left)} → ${answerText(item.right)}`;
        if ('text' in item && 'side' in item) return `${answerText(item.text)} → ${answerText(item.side)}`;
        if ('label' in item && item.label) return answerText(item.label);
        return Object.values(item).map(answerText).filter(Boolean).join(' → ');
      }
      return answerText(entry);
    }).join(' • ');
  }

  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    if (item.label) return answerText(item.label);
    if (item.text && item.side) return `${answerText(item.text)} → ${answerText(item.side)}`;
    return Object.values(item).map(answerText).filter(Boolean).join(' • ');
  }

  return String(value);
}

function SummaryCard({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</p>
          <p className="mt-1 break-words text-xl font-black text-[var(--color-text-primary)]">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--color-text-tertiary)]">{helper}</p>
    </div>
  );
}

export function StudentAttemptDetail({ courseId, activityType, activityId, periodId }: {
  courseId: string;
  activityType: ActivityType;
  activityId: string;
  periodId?: string;
}) {
  const [data, setData] = useState<AttemptDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAttempt = useCallback(async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const { data: response } = await api.get(`/students/my/performance/attempt/${encodeURIComponent(activityType)}/${encodeURIComponent(activityId)}`);
      const next = response.data as AttemptDetailResponse;
      if (String(next?.course?.id || '') !== String(courseId)) {
        setError('This activity does not belong to the selected course.');
        return;
      }
      setData(next);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load attempt details. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [activityId, activityType, courseId]);

  useEffect(() => { void loadAttempt(); }, [loadAttempt]);

  const totalCorrect = useMemo(() => data?.questions.filter((question) => question.correct).length || 0, [data]);
  const periodQuery = periodId ? `periodId=${encodeURIComponent(periodId)}&` : '';
  const backToPeriod = periodId ? `/student/analytics?periodId=${encodeURIComponent(periodId)}` : '/student/analytics';
  const backToCourse = `/student/analytics?${periodQuery}courseId=${encodeURIComponent(courseId)}`;

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-[var(--color-surface-primary)]" aria-live="polite">
        <div className="flex flex-col items-center gap-3"><div className="h-11 w-11 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-500" /><p className="text-sm text-[var(--color-text-tertiary)]">Loading attempt details...</p></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-primary)] px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-500/25 bg-[var(--color-surface-secondary)] p-6 text-center shadow-sm sm:p-8">
          <XCircle className="mx-auto h-9 w-9 text-red-400" />
          <h1 className="mt-3 text-xl font-black text-[var(--color-text-primary)]">Attempt details unavailable</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--color-text-tertiary)]">{error || 'This attempt could not be found.'}</p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <button type="button" onClick={() => void loadAttempt()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"><RefreshCw className="h-4 w-4" /> Try again</button>
            <Link to={backToCourse} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-bold text-[var(--color-text-primary)] hover:border-emerald-500/50"><ArrowLeft className="h-4 w-4" /> Back to Lesson Activity</Link>
          </div>
        </div>
      </div>
    );
  }

  const courseTitle = titleOf(data.course.title);
  const isQuiz = data.type === 'quiz';

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)]">
      <div className="mx-auto max-w-[1100px] space-y-5 px-3 pb-12 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <header>
          <Link to={backToCourse} className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] hover:text-emerald-500"><ArrowLeft className="h-4 w-4" /> Back to Lesson Activity</Link>
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isQuiz ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{isQuiz ? <CircleHelp className="h-6 w-6" /> : <BookOpen className="h-6 w-6" />}</span>
            <div className="min-w-0"><h1 className="break-words text-xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">{data.activity.title}</h1><p className="mt-1 text-sm leading-5 text-[var(--color-text-tertiary)]">{courseTitle} • {data.chapterTitle || 'General'} • {isQuiz ? 'Quiz Attempt' : 'Interactive Lesson'}</p></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] sm:gap-2">
            <Link to={backToPeriod} className="hover:text-emerald-500">Performance by Course</Link><ChevronRight className="h-3 w-3" /><Link to={backToCourse} className="max-w-[180px] truncate hover:text-emerald-500 sm:max-w-none">{courseTitle}</Link><ChevronRight className="h-3 w-3" /><span className="font-semibold text-[var(--color-text-secondary)]">Attempt Details</span>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Score" value={`${data.summary.score} / ${data.summary.totalPoints}`} helper={`${totalCorrect} of ${data.questions.length} first answers correct`} icon={<Award className="h-5 w-5" />} />
          <SummaryCard label="Percentage" value={`${data.summary.percentage}%`} helper={data.summary.passed ? 'Completed / passed' : 'Needs more practice'} icon={data.summary.passed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />} />
          <SummaryCard label={isQuiz ? 'Attempt' : 'Answers Recorded'} value={isQuiz ? `${data.summary.attemptNumber} / ${data.summary.totalAttempts}` : String(data.summary.totalAttempts)} helper={isQuiz ? 'This quiz attempt in your history' : 'Includes retries after first answers'} icon={<History className="h-5 w-5" />} />
          <SummaryCard label="Time" value={formatDuration(data.summary.durationSeconds)} helper={formatDate(data.activity.date)} icon={<Clock3 className="h-5 w-5" />} />
        </section>

        {isQuiz && data.attemptHistory.length > 1 && (
          <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400"><RotateCcw className="h-4 w-4" /></span><div><h2 className="font-black text-[var(--color-text-primary)]">Attempt History</h2><p className="text-xs text-[var(--color-text-tertiary)]">Every submitted attempt for this quiz</p></div></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.attemptHistory.map((attempt) => {
                const current = attempt.id === data.activity.id;
                return (
                  <Link key={attempt.id} to={`/student/analytics?${periodQuery}courseId=${encodeURIComponent(courseId)}&activityType=quiz&activityId=${encodeURIComponent(attempt.id)}`} className={`rounded-xl border p-3 transition focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${current ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] hover:border-emerald-500/40'}`}>
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-[var(--color-text-primary)]">Attempt {attempt.attemptNumber}</span><span className={`text-xs font-black ${attempt.passed ? 'text-emerald-400' : 'text-amber-400'}`}>{attempt.percentage}%</span></div>
                    <p className="mt-1 text-[11px] leading-4 text-[var(--color-text-tertiary)]">{formatDate(attempt.date)}</p><p className="mt-2 text-xs font-semibold text-[var(--color-text-secondary)]">{attempt.score}/{attempt.totalPoints} points • {formatDuration(attempt.durationSeconds)}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div><h2 className="text-lg font-black text-[var(--color-text-primary)]">Question Review</h2><p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">{isQuiz ? 'Review your submitted answer, correct answer, and points for each question.' : 'Interactive lesson performance uses your first answer for each Stop & Check question.'}</p></div>
          {data.questions.map((question) => (
            <article key={question.key} className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
              <div className="border-b border-[var(--color-border-default)] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${question.correct ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{question.number}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--color-surface-tertiary)] px-2.5 py-1 text-[10px] font-bold text-[var(--color-text-secondary)]">{questionTypeLabel(question.type)}</span>{question.blockTitle && <span className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">{question.blockTitle}</span>}</div>
                    <h3 className="mt-2 break-words text-sm font-black leading-6 text-[var(--color-text-primary)]">{question.question}</h3>
                    <span className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black sm:hidden ${question.correct ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{question.correct ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{question.correct ? 'Correct' : 'Incorrect'}</span>
                  </div>
                  <span className={`hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black sm:inline-flex ${question.correct ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{question.correct ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{question.correct ? 'Correct' : 'Incorrect'}</span>
                </div>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                <div className={`rounded-xl border p-4 ${question.correct ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/25 bg-red-500/5'}`}><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{isQuiz ? 'Your answer' : 'Your first answer'}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm font-bold leading-6 text-[var(--color-text-primary)]">{answerText(question.selectedAnswerDisplay ?? question.selectedAnswer)}</p></div>
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Correct answer</p><p className="mt-2 whitespace-pre-wrap break-words text-sm font-bold leading-6 text-[var(--color-text-primary)]">{answerText(question.correctAnswerDisplay ?? question.correctAnswer)}</p></div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-[var(--color-border-default)] px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5"><span className="font-semibold text-[var(--color-text-secondary)]">Points: <strong className="text-[var(--color-text-primary)]">{question.earnedPoints} / {question.possiblePoints}</strong></span>{question.attempts && question.attempts.length > 1 && <span className="font-semibold text-[var(--color-text-tertiary)]">{question.attempts.length} attempts on this check</span>}</div>
              {question.explanation && !question.correct && <div className="border-t border-[var(--color-border-default)] bg-amber-500/5 px-4 py-3 text-xs leading-5 text-[var(--color-text-secondary)] sm:px-5"><span className="font-black text-amber-400">Explanation: </span>{question.explanation}</div>}
              {question.attempts && question.attempts.length > 1 && (
                <details className="border-t border-[var(--color-border-default)] px-4 py-3 sm:px-5">
                  <summary className="cursor-pointer text-xs font-black text-emerald-500">Show retry history</summary>
                  <div className="mt-3 space-y-2">{question.attempts.map((attempt) => <div key={attempt.attemptNumber} className="flex flex-col gap-1 rounded-lg bg-[var(--color-surface-primary)] px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3"><span className="break-words font-bold text-[var(--color-text-secondary)]">Attempt {attempt.attemptNumber}: {answerText(attempt.selectedAnswerDisplay ?? attempt.selectedAnswer)}</span><span className={attempt.correct ? 'shrink-0 font-black text-emerald-400' : 'shrink-0 font-black text-red-400'}>{attempt.correct ? 'Correct' : 'Incorrect'}{attempt.timeSpentSeconds ? ` • ${formatDuration(attempt.timeSpentSeconds)}` : ''}</span></div>)}</div>
                </details>
              )}
            </article>
          ))}

          {data.questions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-5 py-12 text-center"><CircleHelp className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" /><p className="mt-3 text-sm font-black text-[var(--color-text-secondary)]">No answered questions found</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--color-text-tertiary)]">This activity has no recorded question answers yet. Return to Lesson Activity and open another result.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}

export default StudentAttemptDetail;
