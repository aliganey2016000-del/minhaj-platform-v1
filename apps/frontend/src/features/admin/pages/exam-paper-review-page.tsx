/**
 * Exam Paper Review Page — Dedicated full-page view for reviewing one
 * exam's paper from Papers & Approval, same pattern as ExamPaperEditPage /
 * QuizEditPage: navigating here takes over the entire workspace instead of
 * expanding inline under the list.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';
import { ExamPaperEditor, type ExamPaper } from '../components/exam-paper-editor';

interface ExamBrief { _id: string; title: string; examDate: string; course?: { title: { en: string } }; }

export function ExamPaperReviewPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const backToList = () => navigate('/admin/exams/papers');

  const [exam, setExam] = useState<ExamBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data } = await api.get(`/exams/${examId}`);
        setExam(data.data);
      } catch (err: any) {
        setLoadError(err.response?.data?.message || 'Failed to load exam');
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  const handleReview = async (approved: boolean) => {
    if (!examId) return;
    if (!approved && !reviewNotes.trim()) {
      setError('Please explain what needs to change before rejecting this paper.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.patch(`/exams/${examId}/paper/review`, { approved, notes: reviewNotes });
      setPaper(data.data);
      setEditorKey((k) => k + 1); // remount ExamPaperEditor so it re-fetches the now-reviewed paper
      setMessage(approved ? '✅ Paper approved' : 'Paper rejected — sent back to the instructor');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to review paper');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  if (loadError || !exam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="text-center space-y-4">
          <p className="text-red-500">{loadError || 'Exam not found'}</p>
          <button onClick={backToList} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">
            ← Back to Papers & Approval
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      <div className="sticky top-0 z-20 border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <button onClick={backToList} className="text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-1">
            ← Back to Papers & Approval
          </button>
          <h1 className="text-sm lg:text-base font-bold text-[var(--color-text-primary)] truncate flex items-center gap-1.5 mt-0.5">
            <span>📄</span> {exam.course?.title?.en} · {exam.title} — Exam Paper
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {paper?.status === 'submitted' && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-3">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">🔍 Admin Review</p>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Notes shown to the instructor — required if you reject (e.g. what to fix before resubmitting)"
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
              rows={2}
            />
            <div className="flex gap-2">
              <button onClick={() => handleReview(true)} disabled={saving} className="rounded-xl bg-green-600 text-white px-5 py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors">✅ Approve</button>
              <button
                onClick={() => handleReview(false)}
                disabled={saving || !reviewNotes.trim()}
                title={!reviewNotes.trim() ? 'Add feedback above before rejecting' : undefined}
                className="rounded-xl bg-red-600 text-white px-5 py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                ❌ Reject
              </button>
            </div>
          </div>
        )}

        <ExamPaperEditor key={editorKey} examId={examId!} onChange={setPaper} />
      </div>
    </div>
  );
}

export default ExamPaperReviewPage;
