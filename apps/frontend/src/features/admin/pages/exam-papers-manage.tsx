/**
 * Papers & Approval — Admin/Teacher
 * Instructor paper submission (question authoring) with admin proofreading,
 * moderation, and approval workflow.
 *
 * Questions use the exact same 10-type engine as course quizzes — the same
 * QuestionEditor, the same "+ Add Question" type picker, the same
 * QuizQuestion shape (see course-builder.types.ts) and validation
 * (isQuestionValid, from builder-quiz-editor.tsx) as quiz authoring. One
 * codebase for "what a question looks like", not a smaller parallel one.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';
import type { QuizQuestion, QuestionType } from './course-builder.types';
import { normalizeQuestion } from './course-builder.types';
import { QUESTION_TYPE_META } from './quiz-question-meta';
import { QuestionEditor } from './components/quiz-question-editor';
import { QuestionTypeMenu } from './components/quiz-question-type-menu';
import { groupQuestionsByType, QuestionGroupHeader, createQuestion, isQuestionValid } from './components/builder-quiz-editor';

interface ExamBrief { _id: string; title: string; examDate: string; course?: { _id: string; title: { en: string } }; }

interface Paper {
  _id: string;
  title: string;
  instructions: string;
  questions: QuizQuestion[];
  totalPoints: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submittedBy?: { email: string };
  reviewedBy?: { email: string };
  reviewNotes?: string;
}

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
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const [validationError, setValidationError] = useState('');
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
    setValidationError('');
    setInvalidIds(new Set());
    if (!examId) return;
    setPaperLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/exams/${examId}/paper`);
      const p: Paper | null = data.data;
      setPaper(p);
      setTitle(p?.title || '');
      setInstructions(p?.instructions || '');
      setQuestions((p?.questions?.length ? p.questions : []).map(normalizeQuestion));
      setReviewNotes('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load paper');
    } finally {
      setPaperLoading(false);
    }
  };

  const isLocked = paper && !['draft', 'rejected'].includes(paper.status);

  const addQuestion = (type: QuestionType) => {
    setQuestions((prev) => [...prev, createQuestion(type)]);
    setTypeMenuOpen(false);
    setValidationError('');
    setInvalidIds(new Set());
  };

  const updateQuestion = (idx: number, updated: QuizQuestion) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? updated : q)));
    if (updated._id) {
      setInvalidIds((prev) => {
        if (!prev.has(updated._id!)) return prev;
        const next = new Set(prev);
        next.delete(updated._id!);
        return next;
      });
    }
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
    setValidationError('');
    setInvalidIds(new Set());
  };

  const groupedQuestions = groupQuestionsByType(questions);

  /** Returns true (and clears any prior error) only if every question is complete — same rule as quiz authoring. */
  const validate = (): boolean => {
    const invalid = questions.filter((q) => !isQuestionValid(q));
    if (invalid.length > 0) {
      setInvalidIds(new Set(invalid.map((q) => q._id).filter(Boolean) as string[]));
      const names = invalid
        .map((q) => {
          const flatIndex = questions.indexOf(q);
          const label = QUESTION_TYPE_META[q.type]?.label || q.type;
          return `Q${flatIndex + 1} (${label})`;
        })
        .join(', ');
      setValidationError(`Please finish these question${invalid.length === 1 ? '' : 's'} before saving — highlighted below: ${names}.`);
      const firstInvalidId = invalid[0]._id;
      if (firstInvalidId) {
        document.querySelector(`[data-question-id="${firstInvalidId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }
    setValidationError('');
    setInvalidIds(new Set());
    return true;
  };

  const handleSave = async () => {
    if (!selectedExam || !validate()) return;
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
    if (!selectedExam || !validate()) return;
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

              {/* Questions — identical engine to quiz authoring (grouped by type, same QuestionEditor, same type picker) */}
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Questions ({questions.length})</span>
                  <button
                    type="button"
                    onClick={() => setTypeMenuOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary-600 to-primary-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-primary-700 hover:to-primary-600 transition-all"
                  >
                    <span>🎮</span> Add Question
                  </button>
                </div>

                {validationError && (
                  <p className="mb-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                    <span>⚠</span> {validationError}
                  </p>
                )}

                {questions.length === 0 && (
                  <p className="text-xs text-[var(--color-text-tertiary)] py-4 text-center border border-dashed border-[var(--color-border-default)] rounded-lg">
                    No questions yet. Click "Add Question" to choose an interactive question type — the same types available for course quizzes.
                  </p>
                )}

                <div className="space-y-5">
                  {groupedQuestions.map((group) => (
                    <div key={group.type}>
                      <QuestionGroupHeader type={group.type} count={group.items.length} totalPoints={group.totalPoints} />
                      <div className="space-y-3">
                        {group.items.map(({ question, flatIndex }, localIdx) => (
                          <QuestionEditor
                            key={question._id || flatIndex}
                            question={question}
                            index={localIdx}
                            onChange={(updated) => updateQuestion(flatIndex, updated)}
                            onRemove={() => removeQuestion(flatIndex)}
                            isInvalid={!!question._id && invalidIds.has(question._id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <QuestionTypeMenu isOpen={typeMenuOpen} onClose={() => setTypeMenuOpen(false)} onSelect={addQuestion} />
              </div>

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
