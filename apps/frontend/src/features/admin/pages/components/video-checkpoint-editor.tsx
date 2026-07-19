/**
 * Video Checkpoint Editor — authors percentage-based checkpoints on a
 * lesson's own video. At playback, each checkpoint pauses the video and
 * requires its mapped question to be answered correctly before resuming.
 * Independent of the paragraph-gating Content Blocks.
 */

import { ArrowUp, ArrowDown, Trash2, Lock } from 'lucide-react';
import type { VideoCheckpoint } from '../course-builder.types';
import { ManualQuestionForm, emptyManualQuestion } from './content-block-editor';

interface VideoCheckpointEditorProps {
  checkpoints: VideoCheckpoint[];
  onChange: (checkpoints: VideoCheckpoint[]) => void;
  blockForwardSeeking: boolean;
  onChangeBlockForwardSeeking: (value: boolean) => void;
}

function emptyCheckpoint(): VideoCheckpoint {
  return { percentage: 50, question: emptyManualQuestion() };
}

export function VideoCheckpointEditor({
  checkpoints, onChange, blockForwardSeeking, onChangeBlockForwardSeeking,
}: VideoCheckpointEditorProps) {
  const addCheckpoint = () => onChange([...checkpoints, emptyCheckpoint()]);

  const updateCheckpoint = (idx: number, patch: Partial<VideoCheckpoint>) => {
    onChange(checkpoints.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const removeCheckpoint = (idx: number) => onChange(checkpoints.filter((_, i) => i !== idx));

  const moveCheckpoint = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= checkpoints.length) return;
    const next = [...checkpoints];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={blockForwardSeeking}
          onChange={(e) => onChangeBlockForwardSeeking(e.target.checked)}
        />
        <Lock className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">Block forward seeking</span>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">— students can't scrub ahead of what they've watched</span>
      </label>

      {checkpoints.map((checkpoint, idx) => (
        <div key={idx} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-text-primary)]">Checkpoint {idx + 1}</span>
              <input
                type="number"
                min={1}
                max={99}
                className="w-16 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs"
                value={checkpoint.percentage}
                onChange={(e) => updateCheckpoint(idx, { percentage: Math.min(99, Math.max(1, Number(e.target.value))) })}
              />
              <span className="text-xs text-[var(--color-text-tertiary)]">% into the video</span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" disabled={idx === 0} onClick={() => moveCheckpoint(idx, -1)} className="rounded p-1 disabled:opacity-30 hover:bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]" title="Move up">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled={idx === checkpoints.length - 1} onClick={() => moveCheckpoint(idx, 1)} className="rounded p-1 disabled:opacity-30 hover:bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]" title="Move down">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => removeCheckpoint(idx)} className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Remove checkpoint">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <ManualQuestionForm
            question={checkpoint.question}
            onChange={(question) => updateCheckpoint(idx, { question })}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addCheckpoint}
        className="w-full rounded-lg border border-dashed border-[var(--color-border-default)] px-4 py-2.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
      >
        + Add Video Checkpoint
      </button>

      {checkpoints.length === 0 && (
        <p className="text-xs text-[var(--color-text-tertiary)] text-center py-2">
          No checkpoints yet — add one to pause the video and ask a question at a specific point.
        </p>
      )}
    </div>
  );
}
