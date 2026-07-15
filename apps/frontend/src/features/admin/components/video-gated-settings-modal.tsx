/**
 * Video-Gated Settings Modal
 * Admin interface to configure video-gated lesson restrictions for a course
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface CheckpointQuestion {
  _id: string;
  text: string;
  type: 'multiple_choice' | 'short_answer';
  options?: string[]; // multiple_choice only
  correctOptionIndex?: number; // multiple_choice only
}

// Keyed by checkpoint percentage (e.g. checkpointQuestions[33] = [...])
export type CheckpointQuestionsMap = Record<number, CheckpointQuestion[]>;

export interface VideoGatingSettings {
  _id?: string;
  courseId: string;
  enabled: boolean;
  blockForwardSeeking: boolean;
  checkpoints: number[]; // [33, 66, 95]
  minWatchPercentToUnlock: number; // 95
  showCheckpointAlerts: boolean;
  description?: string;
  checkpointQuestions?: CheckpointQuestionsMap;
}

function generateId(): string {
  return `cq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface VideoGatedSettingsModalProps {
  courseId: string;
  initialSettings?: VideoGatingSettings;
  onClose: () => void;
  onSave: (settings: VideoGatingSettings) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Checkpoint Questions Editor — questions asked when a student reaches a
// given viewing checkpoint (e.g. "quiz them at 66% watched").
// ---------------------------------------------------------------------------

function CheckpointQuestionsEditor({
  checkpoint,
  questions,
  onChange,
}: {
  checkpoint: number;
  questions: CheckpointQuestion[];
  onChange: (questions: CheckpointQuestion[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const addQuestion = () => {
    onChange([
      ...questions,
      { _id: generateId(), text: '', type: 'multiple_choice', options: ['', ''], correctOptionIndex: 0 },
    ]);
    setExpanded(true);
  };

  const updateQuestion = (id: string, patch: Partial<CheckpointQuestion>) => {
    onChange(questions.map((q) => (q._id === id ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (id: string) => {
    onChange(questions.filter((q) => q._id !== id));
  };

  return (
    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          ❓ Questions at {checkpoint}% {questions.length > 0 && <span className="text-primary-600 dark:text-primary-400">({questions.length})</span>}
        </span>
        <span className="text-xs text-[var(--color-text-tertiary)]">{expanded ? '▲ Hide' : '▼ Manage'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {questions.map((q, qIdx) => (
            <div key={q._id} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-[var(--color-text-tertiary)] mt-2">Q{qIdx + 1}</span>
                <input
                  type="text"
                  value={q.text}
                  onChange={(e) => updateQuestion(q._id, { text: e.target.value })}
                  placeholder="Enter the question..."
                  className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-sm"
                />
                <button type="button" onClick={() => removeQuestion(q._id)} className="text-red-500 hover:text-red-600 text-sm px-1">
                  ✕
                </button>
              </div>

              <div className="flex items-center gap-3 ps-6">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={q.type === 'multiple_choice'}
                    onChange={() => updateQuestion(q._id, { type: 'multiple_choice', options: q.options?.length ? q.options : ['', ''] })}
                  />
                  Multiple choice
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={q.type === 'short_answer'}
                    onChange={() => updateQuestion(q._id, { type: 'short_answer' })}
                  />
                  Short answer
                </label>
              </div>

              {q.type === 'multiple_choice' && (
                <div className="ps-6 space-y-1.5">
                  {(q.options || []).map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={q.correctOptionIndex === optIdx}
                        onChange={() => updateQuestion(q._id, { correctOptionIndex: optIdx })}
                        title="Mark as correct answer"
                      />
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const next = [...(q.options || [])];
                          next[optIdx] = e.target.value;
                          updateQuestion(q._id, { options: next });
                        }}
                        placeholder={`Option ${optIdx + 1}`}
                        className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2.5 py-1 text-xs"
                      />
                      {(q.options || []).length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = (q.options || []).filter((_, i) => i !== optIdx);
                            updateQuestion(q._id, {
                              options: next,
                              correctOptionIndex: q.correctOptionIndex === optIdx ? 0 : q.correctOptionIndex,
                            });
                          }}
                          className="text-red-500 hover:text-red-600 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateQuestion(q._id, { options: [...(q.options || []), ''] })}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    + Add option
                  </button>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addQuestion}
            className="w-full rounded-lg border border-dashed border-[var(--color-border-default)] py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
          >
            + Add Question at {checkpoint}%
          </button>
        </div>
      )}
    </div>
  );
}

export function VideoGatedSettingsModal({
  courseId,
  initialSettings,
  onClose,
  onSave,
}: VideoGatedSettingsModalProps) {
  const [settings, setSettings] = useState<VideoGatingSettings>(
    initialSettings || {
      courseId,
      enabled: false,
      blockForwardSeeking: true,
      checkpoints: [33, 66, 95],
      minWatchPercentToUnlock: 95,
      showCheckpointAlerts: true,
    }
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkpointInput, setCheckpointInput] = useState('33,66,95');

  useEffect(() => {
    setCheckpointInput(settings.checkpoints.join(','));
  }, [settings.checkpoints]);

  const handleCheckpointChange = (value: string) => {
    setCheckpointInput(value);
    const checkpoints = value
      .split(',')
      .map((v) => {
        const num = parseInt(v.trim(), 10);
        return isNaN(num) ? null : Math.min(100, Math.max(0, num));
      })
      .filter((v): v is number => v !== null);

    if (checkpoints.length > 0) {
      setSettings((prev) => ({
        ...prev,
        checkpoints: Array.from(new Set(checkpoints)).sort((a, b) => a - b),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (settings.checkpoints.length === 0) {
        throw new Error('Please add at least one checkpoint percentage');
      }

      if (settings.minWatchPercentToUnlock < 50 || settings.minWatchPercentToUnlock > 100) {
        throw new Error('Minimum watch percentage must be between 50 and 100');
      }

      await onSave(settings);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-4 text-[var(--color-text-primary)]">
          🎬 Video-Gated Lesson Settings
        </h2>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-4">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Enable Video Gating */}
          <div className="flex items-center gap-3 p-4 bg-[var(--color-surface-tertiary)] rounded-xl">
            <input
              type="checkbox"
              id="enabled"
              checked={settings.enabled}
              onChange={(e) => setSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="w-5 h-5 rounded border-[var(--color-border-default)] cursor-pointer"
            />
            <label htmlFor="enabled" className="flex-1 cursor-pointer">
              <span className="font-semibold text-[var(--color-text-primary)]">
                Enable Video Gating
              </span>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                Students must watch the video sequentially before proceeding
              </p>
            </label>
          </div>

          {settings.enabled && (
            <>
              {/* Block Forward Seeking */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-[var(--color-text-primary)]">
                  🔒 Seeking Restrictions
                </label>
                <div className="flex items-center gap-3 p-3 bg-[var(--color-surface-tertiary)] rounded-lg">
                  <input
                    type="checkbox"
                    id="blockForwardSeeking"
                    checked={settings.blockForwardSeeking}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        blockForwardSeeking: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 rounded border-[var(--color-border-default)] cursor-pointer"
                  />
                  <label htmlFor="blockForwardSeeking" className="text-sm cursor-pointer">
                    <span className="font-medium">Block Forward Seeking</span>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      Prevent students from skipping to unwatched portions
                    </p>
                  </label>
                </div>
              </div>

              {/* Show Checkpoint Alerts */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-[var(--color-text-primary)]">
                  🔔 Progress Notifications
                </label>
                <div className="flex items-center gap-3 p-3 bg-[var(--color-surface-tertiary)] rounded-lg">
                  <input
                    type="checkbox"
                    id="showAlerts"
                    checked={settings.showCheckpointAlerts}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        showCheckpointAlerts: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 rounded border-[var(--color-border-default)] cursor-pointer"
                  />
                  <label htmlFor="showAlerts" className="text-sm cursor-pointer">
                    <span className="font-medium">Show Checkpoint Alerts</span>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      Display notifications when students reach viewing milestones
                    </p>
                  </label>
                </div>
              </div>

              {/* Checkpoint Percentages */}
              <div className="space-y-3">
                <div>
                  <label htmlFor="checkpoints" className="text-sm font-semibold text-[var(--color-text-primary)] block mb-2">
                    📍 Viewing Checkpoints (%)
                  </label>
                  <input
                    id="checkpoints"
                    type="text"
                    value={checkpointInput}
                    onChange={(e) => handleCheckpointChange(e.target.value)}
                    placeholder="33,66,95"
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
                  />
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                    Enter comma-separated percentages (e.g., 33,50,75,95). These are milestones where students receive
                    notifications. Recommended: 33, 66, 95
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[var(--color-text-secondary)]">Active Checkpoints:</div>
                  <div className="flex flex-wrap gap-2">
                    {settings.checkpoints.map((checkpoint) => (
                      <span
                        key={checkpoint}
                        className="inline-flex items-center gap-1.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-3 py-1.5 rounded-full text-sm font-medium"
                      >
                        {checkpoint}%
                        <button
                          type="button"
                          onClick={() =>
                            setSettings((prev) => ({
                              ...prev,
                              checkpoints: prev.checkpoints.filter((c) => c !== checkpoint),
                            }))
                          }
                          className="hover:text-red-600 dark:hover:text-red-400"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Per-Checkpoint Questions */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Checkpoint Questions (optional — asks the student a question when they reach that checkpoint):
                  </div>
                  <div className="space-y-2">
                    {settings.checkpoints.map((checkpoint) => (
                      <CheckpointQuestionsEditor
                        key={checkpoint}
                        checkpoint={checkpoint}
                        questions={settings.checkpointQuestions?.[checkpoint] || []}
                        onChange={(questions) =>
                          setSettings((prev) => ({
                            ...prev,
                            checkpointQuestions: { ...prev.checkpointQuestions, [checkpoint]: questions },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Minimum Watch Percentage */}
              <div className="space-y-3">
                <label htmlFor="minWatch" className="text-sm font-semibold text-[var(--color-text-primary)] block">
                  🔓 Unlock Threshold (%)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    id="minWatch"
                    type="number"
                    min="50"
                    max="100"
                    step="5"
                    value={settings.minWatchPercentToUnlock}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        minWatchPercentToUnlock: Math.max(50, Math.min(100, parseInt(e.target.value, 10))),
                      }))
                    }
                    className="w-24 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-center"
                  />
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    Students must watch <strong>{settings.minWatchPercentToUnlock}%</strong> to unlock
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  The "Continue Lesson" button will remain disabled until this percentage is reached
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-semibold text-[var(--color-text-primary)] block">
                  📝 Optional Description
                </label>
                <textarea
                  id="description"
                  value={settings.description || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Explain why this lesson is video-gated..."
                  rows={3}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
                />
              </div>

              {/* Preview */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-200">👁️ Preview</h4>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  {settings.blockForwardSeeking && (
                    <>
                      ✓ Forward seeking is <strong>blocked</strong>
                      <br />
                    </>
                  )}
                  {settings.showCheckpointAlerts && (
                    <>
                      ✓ Students will see alerts at: <strong>{settings.checkpoints.join('%, ')}</strong>
                      <br />
                    </>
                  )}
                  ✓ "Continue Lesson" unlocks at <strong>{settings.minWatchPercentToUnlock}%</strong>
                </p>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-[var(--color-border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '⏳ Saving...' : '💾 Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
