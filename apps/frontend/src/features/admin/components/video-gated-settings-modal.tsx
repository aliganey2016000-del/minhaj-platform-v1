/**
 * Video-Gated Settings Modal
 * Admin interface to configure video-gated lesson restrictions for a course
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface VideoGatingSettings {
  _id?: string;
  courseId: string;
  enabled: boolean;
  blockForwardSeeking: boolean;
  checkpoints: number[]; // [33, 66, 95]
  minWatchPercentToUnlock: number; // 95
  showCheckpointAlerts: boolean;
  description?: string;
}

interface VideoGatedSettingsModalProps {
  courseId: string;
  initialSettings?: VideoGatingSettings;
  onClose: () => void;
  onSave: (settings: VideoGatingSettings) => Promise<void>;
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
