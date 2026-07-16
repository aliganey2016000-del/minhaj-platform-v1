/**
 * Active Exams — Student self-service
 * Launch, take, and submit a timed computer-based exam once its paper has
 * been approved and the exam is live.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../../../lib/axios';

interface LaunchableExam {
  exam: { _id: string; title: string; examDate: string; duration: number; course?: { title: { en: string } } };
  paper: { title: string; totalPoints: number };
  attempt: { status: string; autoGradedScore?: number; maxScore?: number } | null;
}

interface AttemptQuestion {
  _id: string;
  type: 'mcq' | 'true_false' | 'short_answer';
  question: string;
  points: number;
  options?: string[];
}

interface AttemptSession {
  attemptId: string;
  deadline: string;
  answers: { questionId: string; value: unknown }[];
  paper: { title: string; instructions?: string; questions: AttemptQuestion[] };
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function StudentExamActive() {
  const [list, setList] = useState<LaunchableExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [session, setSession] = useState<AttemptSession | null>(null);
  const [activeExamId, setActiveExamId] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [remaining, setRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ autoGradedScore: number; maxScore: number; ungradedQuestionCount: number } | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/exams/my/active');
      setList(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load active exams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Countdown timer
  useEffect(() => {
    if (!session) return;
    const deadline = new Date(session.deadline).getTime();
    const tick = () => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0) handleSubmit(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Autosave every 10s while taking the exam
  useEffect(() => {
    if (!session) return;
    autosaveTimer.current = setInterval(() => { saveAnswers(); }, 10000);
    return () => { if (autosaveTimer.current) clearInterval(autosaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, answers]);

  const saveAnswers = async () => {
    if (!activeExamId) return;
    const payload = Object.entries(answers).map(([questionId, value]) => ({ questionId, value }));
    try {
      await api.patch(`/exams/${activeExamId}/attempt`, { answers: payload });
    } catch {
      // best-effort autosave — submit still sends the latest answers
    }
  };

  const handleLaunch = async (examId: string) => {
    setError('');
    try {
      const { data } = await api.post(`/exams/${examId}/attempt/start`);
      const s: AttemptSession = data.data;
      setSession(s);
      setActiveExamId(examId);
      const initial: Record<string, unknown> = {};
      s.answers.forEach((a) => { initial[a.questionId] = a.value; });
      setAnswers(initial);
      setResult(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to launch exam');
    }
  };

  const setAnswer = (questionId: string, value: unknown) => setAnswers((prev) => ({ ...prev, [questionId]: value }));

  const handleSubmit = async (auto = false) => {
    if (!activeExamId || submitting) return;
    if (!auto && !window.confirm('Submit this exam? You cannot change your answers after submitting.')) return;
    setSubmitting(true);
    try {
      const payload = Object.entries(answers).map(([questionId, value]) => ({ questionId, value }));
      const { data } = await api.post(`/exams/${activeExamId}/attempt/submit`, { answers: payload });
      setResult(data.data);
      setSession(null);
      fetchList();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit exam');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;

  // ── Taking an exam ──
  if (session) {
    return (
      <div className="p-6 lg:p-10 pt-20 lg:pt-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="sticky top-16 z-10 flex items-center justify-between rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-3 shadow-card">
            <h1 className="font-bold">{session.paper.title}</h1>
            <span className={`font-mono text-lg font-bold ${remaining < 60000 ? 'text-red-600' : 'text-primary-600'}`}>⏱️ {formatRemaining(remaining)}</span>
          </div>

          {session.paper.instructions && (
            <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4 text-sm text-[var(--color-text-secondary)]">{session.paper.instructions}</div>
          )}

          <div className="space-y-4">
            {session.paper.questions.map((q, idx) => (
              <div key={q._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                <p className="font-semibold mb-3">{idx + 1}. {q.question} <span className="text-xs font-normal text-[var(--color-text-tertiary)]">({q.points} pt{q.points === 1 ? '' : 's'})</span></p>

                {q.type === 'mcq' && (
                  <div className="space-y-2">
                    {(q.options || []).map((opt, oi) => (
                      <label key={oi} className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-tertiary)]">
                        <input type="radio" name={q._id} checked={answers[q._id] === oi} onChange={() => setAnswer(q._id, oi)} />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'true_false' && (
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-tertiary)]">
                      <input type="radio" name={q._id} checked={answers[q._id] === true} onChange={() => setAnswer(q._id, true)} /> True
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-tertiary)]">
                      <input type="radio" name={q._id} checked={answers[q._id] === false} onChange={() => setAnswer(q._id, false)} /> False
                    </label>
                  </div>
                )}

                {q.type === 'short_answer' && (
                  <textarea
                    value={(answers[q._id] as string) || ''}
                    onChange={(e) => setAnswer(q._id, e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
                    placeholder="Type your answer..."
                  />
                )}
              </div>
            ))}
          </div>

          <button onClick={() => handleSubmit(false)} disabled={submitting} className="w-full rounded-xl bg-primary-600 text-white px-6 py-3 text-sm font-bold hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm">
            {submitting ? 'Submitting...' : '✅ Submit Exam'}
          </button>
        </div>
      </div>
    );
  }

  // ── List / result view ──
  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">⏱️ Active Exams</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Timed computer-based exams currently open for you</p>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {result && (
          <div className="rounded-2xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-5 text-center">
            <p className="font-bold text-green-700 dark:text-green-300">✅ Exam submitted</p>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Auto-graded score: {result.autoGradedScore}/{result.maxScore}
              {result.ungradedQuestionCount > 0 && ` — ${result.ungradedQuestionCount} short-answer question(s) awaiting manual grading`}
            </p>
          </div>
        )}

        {list.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">⏱️</p>
            <p className="text-lg">No active exams right now</p>
            <p className="text-sm mt-1">An exam appears here once your teacher marks it "ongoing" and its paper is approved.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map(({ exam, paper, attempt }) => (
              <div key={exam._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                {exam.course && <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300">{exam.course.title?.en}</span>}
                <h3 className="font-bold mt-2">{exam.title}</h3>
                <p className="text-xs text-[var(--color-text-tertiary)]">{paper.title} · {paper.totalPoints} pts · {exam.duration} min</p>

                {!attempt || attempt.status === 'in_progress' ? (
                  <button onClick={() => handleLaunch(exam._id)} className="mt-4 w-full rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 transition-colors">
                    {attempt ? '▶️ Resume Exam' : '🚀 Launch Exam'}
                  </button>
                ) : (
                  <div className="mt-4 rounded-xl bg-[var(--color-surface-secondary)] p-3 text-center text-sm">
                    ✅ Submitted — {attempt.autoGradedScore}/{attempt.maxScore} pts (auto-graded)
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentExamActive;
