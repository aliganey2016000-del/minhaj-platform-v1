/**
 * Quiz Editor — Inline form for building a quiz with questions.
 */

import { useState } from 'react';
import type { QuizItem, QuizQuestion } from '../course-builder.types';

interface QuizEditorProps {
  quiz: QuizItem;
  onSave: (updated: QuizItem) => void;
  onCancel: () => void;
}

export function QuizEditor({ quiz, onSave, onCancel }: QuizEditorProps) {
  const [form, setForm] = useState({
    title: quiz.title || '',
    description: quiz.description || '',
    passingScore: quiz.passingScore ?? 60,
    timeLimit: quiz.timeLimit ?? 0,
    duration: quiz.duration || 0,
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    (quiz.questions || []).map((q) => ({
      ...q,
      _id: q._id || '',
      options: q.options.length >= 2 ? q.options : ['', ''],
    })),
  );

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Question helpers
  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      { _id: '', question: '', options: ['', ''], correctIndex: 0, explanation: '' },
    ]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, field: keyof QuizQuestion, value: any) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)),
    );
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const newOpts = [...q.options];
        newOpts[optIdx] = value;
        return { ...q, options: newOpts };
      }),
    );
  };

  const addOption = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        return { ...q, options: [...q.options, ''] };
      }),
    );
  };

  const removeOption = (qIdx: number, optIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const newOpts = q.options.filter((_, oi) => oi !== optIdx);
        // Adjust correctIndex
        let newCorrect = q.correctIndex;
        if (optIdx < q.correctIndex) newCorrect--;
        else if (optIdx === q.correctIndex) newCorrect = 0;
        return { ...q, options: newOpts, correctIndex: Math.max(0, Math.min(newCorrect, newOpts.length - 1)) };
      }),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate questions
    const valid = questions.every(
      (q) => q.question.trim() && q.options.length >= 2 && q.options.every((o) => o.trim()),
    );
    if (!valid) {
      alert('Please fill in all questions and at least 2 options per question.');
      return;
    }
    onSave({
      ...quiz,
      title: form.title,
      description: form.description,
      passingScore: Number(form.passingScore),
      timeLimit: Number(form.timeLimit),
      duration: Number(form.duration),
      questions: questions.map((q) => ({
        question: q.question.trim(),
        options: q.options.map((o) => o.trim()),
        correctIndex: q.correctIndex,
        explanation: q.explanation?.trim() || '',
      })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-4 border border-[var(--color-border-default)] rounded-xl bg-[var(--color-surface-secondary)]">
      <h4 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
        <span>❓</span> Edit Quiz
      </h4>

      {/* Quiz metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Title *</label>
          <input className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.title} onChange={(e) => update('title', e.target.value)} required />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Duration (min)</label>
          <input type="number" min={0} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.duration} onChange={(e) => update('duration', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Passing Score (%)</label>
          <input type="number" min={0} max={100} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.passingScore} onChange={(e) => update('passingScore', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Time Limit (min, 0=unlimited)</label>
          <input type="number" min={0} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.timeLimit} onChange={(e) => update('timeLimit', Number(e.target.value))} />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Description</label>
        <textarea rows={2} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm resize-y" value={form.description} onChange={(e) => update('description', e.target.value)} />
      </div>

      {/* Questions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Questions ({questions.length})</span>
          <button type="button" onClick={addQuestion} className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors">
            + Add Question
          </button>
        </div>

        {questions.length === 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)] py-4 text-center border border-dashed border-[var(--color-border-default)] rounded-lg">
            No questions yet. Click "Add Question" to start.
          </p>
        )}

        <div className="space-y-4">
          {questions.map((q, qIdx) => (
            <div key={qIdx} className="p-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-[var(--color-text-primary)]">Q{qIdx + 1}.</span>
                <button type="button" onClick={() => removeQuestion(qIdx)} className="text-xs text-red-500 hover:text-red-700">✕</button>
              </div>
              <input
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm mb-2"
                placeholder="Enter question..."
                value={q.question}
                onChange={(e) => updateQuestion(qIdx, 'question', e.target.value)}
              />
              {/* Options */}
              <div className="space-y-1.5 mb-2">
                {q.options.map((opt, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${qIdx}`}
                      checked={q.correctIndex === oIdx}
                      onChange={() => updateQuestion(qIdx, 'correctIndex', oIdx)}
                      className="accent-primary-600"
                    />
                    <input
                      className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-1.5 text-xs"
                      placeholder={`Option ${oIdx + 1}`}
                      value={opt}
                      onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                    />
                    {q.options.length > 2 && (
                      <button type="button" onClick={() => removeOption(qIdx, oIdx)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => addOption(qIdx)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                  + Add Option
                </button>
              </div>
              {/* Explanation */}
              <input
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs mt-2"
                placeholder="Explanation (optional)"
                value={q.explanation || ''}
                onChange={(e) => updateQuestion(qIdx, 'explanation', e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">
          Cancel
        </button>
        <button type="submit" className="flex-1 rounded-lg bg-primary-600 text-white px-4 py-2 text-xs font-semibold hover:bg-primary-700 transition-colors">
          Save Quiz
        </button>
      </div>
    </form>
  );
}