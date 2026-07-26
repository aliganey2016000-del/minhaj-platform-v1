/**
 * Exam Paper Editor — the actual question-authoring UI for one exam's
 * paper (title, instructions, questions). Used both embedded directly in
 * the Course Content Builder (via ExamPaperEditorModal, so a teacher never
 * has to leave the builder to write an exam's questions) and inside
 * Papers & Approval (exam-papers-manage.tsx), which wraps this same
 * component and adds the admin-only approve/reject panel around it.
 *
 * Questions use the exact same engine as course quizzes — same
 * QuestionEditor, same "+ Add Question" type picker, same QuizQuestion
 * shape/validation (builder-quiz-editor.tsx) — one codebase for both.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';
import type { Chapter, QuizQuestion, QuestionType } from '../pages/course-builder.types';
import { normalizeQuestion } from '../pages/course-builder.types';
import { QUESTION_TYPE_META } from '../pages/quiz-question-meta';
import { QuestionEditor } from '../pages/components/quiz-question-editor';
import { QuestionTypeMenu } from '../pages/components/quiz-question-type-menu';
import { AiQuizGeneratorModal } from '../pages/components/ai-quiz-generator-modal';
import { groupQuestionsByType, QuestionGroupHeader, createQuestion, isQuestionValid } from '../pages/components/builder-quiz-editor';

export interface ExamPaper {
  _id: string;
  title: string;
  instructions: string;
  questions: QuizQuestion[];
  totalPoints: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submittedBy?: { email: string };
  reviewedBy?: { email: string };
  reviewNotes?: string;
  reviewedAt?: string;
}

export function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${c[status] || c.draft}`}>{status}</span>;
}

interface ExamPaperEditorProps {
  examId: string;
  /** Fires whenever the paper is loaded or changes (saved/submitted), so a parent (Papers & Approval) can render admin-only review actions from the same data without a second fetch. */
  onChange?: (paper: ExamPaper | null) => void;
  /** The course's chapters, so the AI Exam Generator's "from course content" option can offer a lesson picker — same as the AI Quiz Generator. Omit when not available (e.g. Papers & Approval doesn't load course content); the generator still works from a custom topic. */
  chapters?: Chapter[];
}

export function ExamPaperEditor({ examId, onChange, chapters = [] }: ExamPaperEditorProps) {
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const [validationError, setValidationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/exams/${examId}/paper`);
      const p: ExamPaper | null = data.data;
      setPaper(p);
      onChange?.(p);
      setTitle(p?.title || '');
      setInstructions(p?.instructions || '');
      setQuestions((p?.questions?.length ? p.questions : []).map(normalizeQuestion));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load paper');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  useEffect(() => { load(); }, [load]);

  const isLocked = paper && !['draft', 'rejected'].includes(paper.status);

  const addQuestion = (type: QuestionType) => {
    setQuestions((prev) => [...prev, createQuestion(type)]);
    setTypeMenuOpen(false);
    setValidationError('');
    setInvalidIds(new Set());
  };

  const addGeneratedQuestions = (generated: QuizQuestion[]) => {
    setQuestions((prev) => [...prev, ...generated]);
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
    if (!validate()) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.put(`/exams/${examId}/paper`, { title, instructions, questions });
      setPaper(data.data);
      onChange?.(data.data);
      setMessage('✅ Paper saved as draft');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save paper');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.put(`/exams/${examId}/paper`, { title, instructions, questions });
      const { data } = await api.post(`/exams/${examId}/paper/submit`);
      setPaper(data.data);
      onChange?.(data.data);
      setMessage('✅ Submitted for admin review');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit paper');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {paper ? <StatusBadge status={paper.status} /> : <span className="text-xs text-[var(--color-text-tertiary)]">No paper yet — create one below</span>}
        {paper && <span className="text-xs text-[var(--color-text-tertiary)]">Total: {paper.totalPoints} pts</span>}
      </div>

      {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

      {paper?.status === 'rejected' && paper.reviewNotes && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 space-y-1">
          <p><strong>Rejection notes:</strong> {paper.reviewNotes}</p>
          {(paper.reviewedBy?.email || paper.reviewedAt) && (
            <p className="text-xs text-red-600/80">
              — {paper.reviewedBy?.email || 'admin'}{paper.reviewedAt ? `, ${new Date(paper.reviewedAt).toLocaleString()}` : ''}
            </p>
          )}
        </div>
      )}

      {paper?.status === 'submitted' && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-700 dark:text-amber-300">
          🔍 Submitted — awaiting admin review in Papers &amp; Approval.
        </div>
      )}

      {paper?.status === 'approved' && (
        <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700 dark:text-green-300 space-y-1">
          <p>✅ Approved — this paper is live for "Active Exams".</p>
          {(paper.reviewedBy?.email || paper.reviewedAt) && (
            <p className="text-xs text-green-600/80">
              — {paper.reviewedBy?.email || 'admin'}{paper.reviewedAt ? `, ${new Date(paper.reviewedAt).toLocaleString()}` : ''}
            </p>
          )}
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

        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Questions ({questions.length})</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAiModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-violet-700 hover:to-indigo-700 transition-all"
              >
                <span>✨</span> AI Exam Generator
              </button>
              <button
                type="button"
                onClick={() => setTypeMenuOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary-600 to-primary-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-primary-700 hover:to-primary-600 transition-all"
              >
                <span>🎮</span> Add Question
              </button>
            </div>
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
          <AiQuizGeneratorModal
            isOpen={aiModalOpen}
            onClose={() => setAiModalOpen(false)}
            chapters={chapters}
            onGenerated={addGeneratedQuestions}
          />
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
  );
}

export default ExamPaperEditor;
