/**
 * Papers & Approval — Admin/Teacher
 * Instructor paper submission (question authoring) with admin proofreading,
 * moderation, and approval workflow.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface ExamBrief { _id: string; title: string; examDate: string; course?: { _id: string; title: { en: string } }; }

type QType = 'mcq' | 'true_false' | 'short_answer';

interface PaperQuestion {
  _id?: string;
  type: QType;
  question: string;
  points: number;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: boolean;
  correctText?: string;
}

interface Paper {
  _id: string;
  title: string;
  instructions: string;
  questions: PaperQuestion[];
  totalPoints: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submittedBy?: { email: string };
  reviewedBy?: { email: string };
  reviewNotes?: string;
}

const emptyQuestion = (): PaperQuestion => ({ type: 'mcq', question: '', points: 1, options: ['', ''], correctIndex: 0 });

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${c[status] || c.draft}`}>{status}</span>;
}

export function ExamPapersManage() {
  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [paper, setPaper] = useState<Paper | null>(null);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [questions, setQuestions] = useState<PaperQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [paperLoading, setPaperLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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

  const loadPaper = async (examId: string) => {
    setSelectedExam(examId);
    setPaper(null);
    setMessage('');
    if (!examId) return;
    setPaperLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/exams/${examId}/paper`);
      const p: Paper | null = data.data;
      setPaper(p);
      setTitle(p?.title || '');
      setInstructions(p?.instructions || '');
      setQuestions(p?.questions?.length ? p.questions : [emptyQuestion()]);
      setReviewNotes('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load paper');
    } finally {
      setPaperLoading(false);
    }
  };

  const isLocked = paper && !['draft', 'rejected'].includes(paper.status);

  const updateQuestion = (idx: number, patch: Partial<PaperQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const options = [...(q.options || [])];
      options[optIdx] = value;
      return { ...q, options };
    }));
  };

  const addOption = (qIdx: number) => {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, options: [...(q.options || []), ''] } : q)));
  };

  const removeOption = (qIdx: number, optIdx: number) => {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const options = (q.options || []).filter((_, oi) => oi !== optIdx);
      const correctIndex = q.correctIndex && q.correctIndex >= options.length ? 0 : q.correctIndex;
      return { ...q, options, correctIndex };
    }));
  };

  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()]);
  const removeQuestion = (idx: number) => setQuestions((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!selectedExam) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.put(`/exams/${selectedExam}/paper`, { title, instructions, questions });
      setPaper(data.data);
      setMessage('✅ Paper saved as draft');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save paper');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedExam) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.put(`/exams/${selectedExam}/paper`, { title, instructions, questions });
      const { data } = await api.post(`/exams/${selectedExam}/paper/submit`);
      setPaper(data.data);
      setMessage('✅ Submitted for admin review');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit paper');
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (approved: boolean) => {
    if (!selectedExam) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.patch(`/exams/${selectedExam}/paper/review`, { approved, notes: reviewNotes });
      setPaper(data.data);
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
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Instructor paper submission with admin proofreading and approval</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Select Exam</label>
          <select value={selectedExam} onChange={(e) => loadPaper(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">Choose an exam...</option>
            {exams.map((e) => (
              <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en} ({new Date(e.examDate).toLocaleDateString()})</option>
            ))}
          </select>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {paperLoading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!paperLoading && selectedExam && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              {paper ? <StatusBadge status={paper.status} /> : <span className="text-xs text-[var(--color-text-tertiary)]">No paper yet — create one below</span>}
              {paper && <span className="text-xs text-[var(--color-text-tertiary)]">Total: {paper.totalPoints} pts</span>}
            </div>

            {paper?.status === 'rejected' && paper.reviewNotes && (
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700">
                <strong>Rejection notes:</strong> {paper.reviewNotes}
              </div>
            )}

            {isLocked && paper?.status === 'submitted' && (
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

            <fieldset disabled={!!isLocked} className="space-y-4 disabled:opacity-60">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Paper Title *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="e.g. Midterm Exam Paper" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Instructions</label>
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="Instructions shown to the student before they start" />
              </div>

              <div className="space-y-3">
                {questions.map((q, qIdx) => (
                  <div key={qIdx} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 space-y-3 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">Question {qIdx + 1}</span>
                      <div className="flex items-center gap-2">
                        <select value={q.type} onChange={(e) => updateQuestion(qIdx, { type: e.target.value as QType, options: e.target.value === 'mcq' ? ['', ''] : undefined })} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs">
                          <option value="mcq">Multiple Choice</option>
                          <option value="true_false">True / False</option>
                          <option value="short_answer">Short Answer</option>
                        </select>
                        <input type="number" min={0} value={q.points} onChange={(e) => updateQuestion(qIdx, { points: Number(e.target.value) })} className="w-16 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs text-center" title="Points" />
                        <button type="button" onClick={() => removeQuestion(qIdx)} className="text-red-500 hover:text-red-700 text-xs">🗑️</button>
                      </div>
                    </div>

                    <input value={q.question} onChange={(e) => updateQuestion(qIdx, { question: e.target.value })} placeholder="Question text" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" />

                    {q.type === 'mcq' && (
                      <div className="space-y-1.5">
                        {(q.options || []).map((opt, oIdx) => (
                          <div key={oIdx} className="flex items-center gap-2">
                            <input type="radio" checked={q.correctIndex === oIdx} onChange={() => updateQuestion(qIdx, { correctIndex: oIdx })} title="Correct answer" />
                            <input value={opt} onChange={(e) => updateOption(qIdx, oIdx, e.target.value)} placeholder={`Option ${oIdx + 1}`} className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-sm" />
                            {(q.options?.length || 0) > 2 && <button type="button" onClick={() => removeOption(qIdx, oIdx)} className="text-red-500 text-xs">✕</button>}
                          </div>
                        ))}
                        <button type="button" onClick={() => addOption(qIdx)} className="text-xs text-primary-600 hover:underline">+ Add option</button>
                      </div>
                    )}

                    {q.type === 'true_false' && (
                      <div className="flex gap-4 text-sm">
                        <label className="flex items-center gap-1.5"><input type="radio" checked={q.correctAnswer === true} onChange={() => updateQuestion(qIdx, { correctAnswer: true })} /> True</label>
                        <label className="flex items-center gap-1.5"><input type="radio" checked={q.correctAnswer === false} onChange={() => updateQuestion(qIdx, { correctAnswer: false })} /> False</label>
                      </div>
                    )}

                    {q.type === 'short_answer' && (
                      <input value={q.correctText || ''} onChange={(e) => updateQuestion(qIdx, { correctText: e.target.value })} placeholder="Reference answer (for manual grading)" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" />
                    )}
                  </div>
                ))}
              </div>

              <button type="button" onClick={addQuestion} className="rounded-xl border border-dashed border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors w-full">
                + Add Question
              </button>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl border border-[var(--color-border-default)] px-5 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-tertiary)] disabled:opacity-60 transition-colors">
                  💾 Save Draft
                </button>
                <button type="button" onClick={handleSubmit} disabled={saving} className="rounded-xl bg-primary-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">
                  📤 Submit for Review
                </button>
              </div>
            </fieldset>
          </div>
        )}

        {!selectedExam && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">👆 Select an exam above to write or review its paper</p></div>
        )}
      </div>
    </div>
  );
}

export default ExamPapersManage;
