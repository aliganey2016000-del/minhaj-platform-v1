/**
 * Papers & Approval — Admin/Teacher
 * Admin proofreading/moderation/approval for exam papers. The actual
 * question-authoring UI is shared with the Course Content Builder (both
 * embed ExamPaperEditor) — a teacher normally writes the paper right there
 * in the builder and never needs this page until it's time to review it.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';
import { ExamPaperEditor, type ExamPaper } from '../components/exam-paper-editor';

interface ExamBrief { _id: string; title: string; examDate: string; course?: { _id: string; title: { en: string } }; }

export function ExamPapersManage() {
  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/exams');
      setExams(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const selectExam = (examId: string) => {
    setSelectedExam(examId);
    setPaper(null);
    setMessage('');
    setReviewNotes('');
  };

  const handleReview = async (approved: boolean) => {
    if (!selectedExam) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.patch(`/exams/${selectedExam}/paper/review`, { approved, notes: reviewNotes });
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
    return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📄 Papers & Approval</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Review exam papers submitted by instructors and approve or reject them</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Select Exam</label>
          <select value={selectedExam} onChange={(e) => selectExam(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">Choose an exam...</option>
            {exams.map((e) => (
              <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en} ({new Date(e.examDate).toLocaleDateString()})</option>
            ))}
          </select>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {selectedExam && (
          <div className="space-y-4">
            {paper?.status === 'submitted' && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-3">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">🔍 Admin Review</p>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Optional notes (required detail if rejecting)"
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button onClick={() => handleReview(true)} disabled={saving} className="rounded-xl bg-green-600 text-white px-5 py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors">✅ Approve</button>
                  <button onClick={() => handleReview(false)} disabled={saving} className="rounded-xl bg-red-600 text-white px-5 py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-60 transition-colors">❌ Reject</button>
                </div>
              </div>
            )}

            <ExamPaperEditor key={editorKey} examId={selectedExam} onChange={setPaper} />
          </div>
        )}

        {!selectedExam && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">👆 Select an exam above to review its paper</p></div>
        )}
      </div>
    </div>
  );
}

export default ExamPapersManage;
