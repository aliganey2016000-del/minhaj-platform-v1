/**
 * Exam Review — Student
 * Read-only per-question breakdown after an exam's window has closed: what
 * the student answered, what the correct answer was, and whether it was
 * right. A missed exam (no attempt at all) reviews as every question
 * unanswered/incorrect with an earned score of 0.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';
import { QUESTION_TYPE_META } from '../../admin/pages/quiz-question-meta';

type QType = 'mcq' | 'true_false' | 'matching' | 'ordering' | 'picture_choice' | 'swipe_sort' | 'listen_write' | 'fill_blank' | 'word_scramble' | 'sentence_build';

interface ReviewQuestion {
  _id: string;
  type: QType;
  question: string;
  points: number;
  earnedPoints: number;
  isCorrect: boolean;
  givenAnswer: unknown;
  correctAnswer: unknown;
}

interface ReviewData {
  examTitle: string;
  paperTitle: string;
  missed: boolean;
  startedAt: string | null;
  submittedAt: string | null;
  durationSeconds: number | null;
  earnedPoints: number;
  totalPoints: number;
  questions: ReviewQuestion[];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Renders any answer shape (mcq string, true_false boolean, matching pairs, ordering/sentence_build arrays, etc.) as a readable line. */
function formatAnswer(type: QType, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'mcq':
    case 'picture_choice':
    case 'word_scramble':
    case 'listen_write':
      return String(value);
    case 'true_false':
      return value === true ? 'True' : value === false ? 'False' : '—';
    case 'matching':
      return Array.isArray(value) ? (value as { left: string; right: string }[]).map((p) => `${p.left} → ${p.right}`).join(', ') : '—';
    case 'ordering':
    case 'sentence_build':
      return Array.isArray(value) ? (value as string[]).join(' → ') : '—';
    case 'fill_blank':
      return Array.isArray(value) ? (value as string[]).join(', ') : '—';
    case 'swipe_sort':
      return Array.isArray(value) ? (value as { text: string; side: string }[]).map((c) => `${c.text}: ${c.side}`).join(', ') : '—';
    default:
      return String(value);
  }
}

export function StudentExamReview() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data: res } = await api.get(`/exams/${examId}/review`);
        setData(res.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load review');
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-500">{error || 'Review not found'}</p>
          <button onClick={() => navigate('/student/exams')} className="rounded-xl border border-[var(--color-border-default)] px-5 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">
            ← Back to My Exam Schedule
          </button>
        </div>
      </div>
    );
  }

  const pct = data.totalPoints > 0 ? Math.round((data.earnedPoints / data.totalPoints) * 100) : 0;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <button onClick={() => navigate('/student/exams')} className="text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors">
          ← Back to My Exam Schedule
        </button>

        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">📋 {data.examTitle}</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{data.paperTitle}</p>
        </div>

        {data.missed ? (
          <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-5 text-center">
            <p className="text-3xl mb-1">⚠️</p>
            <p className="font-bold text-red-700 dark:text-red-400">You missed this exam</p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">Score: 0 / {data.totalPoints} (0%)</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 text-center shadow-card">
            <p className="text-3xl font-bold text-primary-600">{data.earnedPoints} / {data.totalPoints}</p>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{pct}% {data.submittedAt && `· Submitted ${new Date(data.submittedAt).toLocaleString()}`}{data.durationSeconds !== null && ` · Took ${formatDuration(data.durationSeconds)}`}</p>
          </div>
        )}

        <div className="space-y-4">
          {data.questions.map((q, idx) => {
            const meta = QUESTION_TYPE_META[q.type as keyof typeof QUESTION_TYPE_META];
            // Matching gets partial credit (some pairs right, some wrong) —
            // neither fully green nor fully red.
            const partial = !q.isCorrect && q.earnedPoints > 0;
            const cardCls = q.isCorrect
              ? 'border-green-300 dark:border-green-800 bg-green-50/40 dark:bg-green-950/10'
              : partial
              ? 'border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/10'
              : 'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/10';
            const scoreCls = q.isCorrect ? 'text-green-600' : partial ? 'text-amber-600' : 'text-red-600';
            const answerCls = q.isCorrect ? 'text-green-700 dark:text-green-400 font-medium' : partial ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-red-700 dark:text-red-400 font-medium';
            return (
              <div key={q._id} className={`rounded-2xl border-2 p-5 shadow-card ${cardCls}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="font-semibold flex-1">
                    <span className="text-[var(--color-text-tertiary)]">{idx + 1}.</span> {q.question}
                  </p>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {meta && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${meta.color}`}>
                        {meta.icon} {meta.label}
                      </span>
                    )}
                    <span className={`text-xs font-bold ${scoreCls}`}>
                      {q.isCorrect ? '✓' : partial ? '½' : '✗'} {q.earnedPoints}/{q.points} pt{q.points === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm">
                  <p>
                    <span className="text-[var(--color-text-tertiary)]">Your answer: </span>
                    <span className={answerCls}>{formatAnswer(q.type, q.givenAnswer)}</span>
                  </p>
                  {!q.isCorrect && (
                    <p>
                      <span className="text-[var(--color-text-tertiary)]">Correct answer: </span>
                      <span className="text-green-700 dark:text-green-400 font-medium">{formatAnswer(q.type, q.correctAnswer)}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default StudentExamReview;
