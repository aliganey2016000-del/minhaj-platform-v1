/**
 * Lesson Editor — Inline form for editing a lesson's metadata.
 */

import { useState } from 'react';
import { Wand2, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import type { LessonItem, Attachment, ContentBlock, LessonDeliveryMode, VideoCheckpoint } from '../course-builder.types';
import { generateTempId } from '../course-builder.api';
import { RichTextEditor } from './rich-text-editor';
import { AiLessonGeneratorModal } from './ai-lesson-generator-modal';
import { ContentBlockEditor } from './content-block-editor';
import { VideoCheckpointEditor } from './video-checkpoint-editor';
import api from '../../../../lib/axios';

// ---------------------------------------------------------------------------
// Traditional → Interactive Gate conversion helpers
// ---------------------------------------------------------------------------

/** Strips empty paragraph/whitespace-only tags left behind after splitting. */
function stripEmptyTags(html: string): string {
  return html
    .replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '')
    .trim();
}

function plainTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

/**
 * Splits Traditional-mode HTML on a "---" divider into Content Blocks.
 * Tiptap's StarterKit auto-converts a "---" typed on its own line into an
 * <hr>, so normalize that back to the literal marker before splitting —
 * covers both "the editor converted it" and "it's still literal text".
 */
function splitContentByDivider(html: string, defaultMinReadSeconds: number): ContentBlock[] {
  const normalized = html.replace(/<hr\s*\/?>/gi, '---');
  const rawChunks = normalized.split('---').map(stripEmptyTags).filter((c) => plainTextLength(c) > 0);

  return rawChunks.map((content, i) => ({
    _id: generateTempId(),
    order: i,
    content,
    minReadSeconds: defaultMinReadSeconds,
  }));
}

interface LessonEditorProps {
  lesson: LessonItem;
  onSave: (updated: LessonItem) => void;
  onCancel: () => void;
  /** HTML id to put on the <form>, so an external button (e.g. a page header) can submit it via `form={formId}`. */
  formId?: string;
  /** Hide the built-in Cancel/Save Lesson footer — use when a parent page renders those actions itself. */
  hideActions?: boolean;
}

export function LessonEditor({ lesson, onSave, onCancel, formId, hideActions }: LessonEditorProps) {
  const [form, setForm] = useState({
    title: lesson.title || '',
    content: lesson.content || '',
    videoUrl: lesson.videoUrl || '',
    videoDuration: lesson.videoDuration || 0,
    duration: lesson.duration || 0,
    featuredImage: lesson.featuredImage || '',
    defaultMinReadSeconds: lesson.defaultMinReadSeconds || 30,
  });
  const [attachments, setAttachments] = useState<Attachment[]>(lesson.attachments || []);
  const [newAttUrl, setNewAttUrl] = useState('');
  const [newAttName, setNewAttName] = useState('');
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<LessonDeliveryMode>(lesson.deliveryMode || 'traditional');
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>(lesson.contentBlocks || []);
  const [aiSplitting, setAiSplitting] = useState(false);
  const [splitError, setSplitError] = useState('');
  const [blockForwardSeeking, setBlockForwardSeeking] = useState(lesson.blockForwardSeeking || false);
  const [videoCheckpoints, setVideoCheckpoints] = useState<VideoCheckpoint[]>(lesson.videoCheckpoints || []);

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const addAttachment = () => {
    if (!newAttUrl.trim() || !newAttName.trim()) return;
    setAttachments((prev) => [
      ...prev,
      {
        name: newAttName.trim(),
        url: newAttUrl.trim(),
        type: newAttName.split('.').pop() || 'file',
      },
    ]);
    setNewAttUrl('');
    setNewAttName('');
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Convert Traditional content → Interactive Gate content blocks ──
  const finishConversion = (newBlocks: ContentBlock[]) => {
    setContentBlocks((prev) => [...prev, ...newBlocks.map((b, i) => ({ ...b, order: prev.length + i }))]);
    setDeliveryMode('interactive_gate');
    // Clear the Traditional body so the two modes can't both hold content
    // and disagree about which one actually gets saved/shown.
    update('content', '');
  };

  const handleSplitByDivider = () => {
    setSplitError('');
    const blocks = splitContentByDivider(form.content, Number(form.defaultMinReadSeconds) || 30);
    if (blocks.length === 0) {
      setSplitError('No "---" dividers found (or the content is empty after splitting). Add "---" on its own line between sections first.');
      return;
    }
    finishConversion(blocks);
  };

  const handleSplitWithAi = async () => {
    setSplitError('');
    setAiSplitting(true);
    try {
      const { data } = await api.post('/ai/split-lesson', { html: form.content });
      const aiBlocks: { title: string; content: string }[] = data.data.blocks || [];
      const blocks: ContentBlock[] = aiBlocks.map((b, i) => ({
        _id: generateTempId(),
        order: i,
        title: b.title || undefined,
        content: b.content,
        minReadSeconds: Number(form.defaultMinReadSeconds) || 30,
      }));
      if (blocks.length === 0) {
        setSplitError('AI could not find any sections to split. Try the divider method instead.');
        return;
      }
      finishConversion(blocks);
    } catch (err: any) {
      setSplitError(err.response?.data?.message || 'Failed to split content with AI. Please try again.');
    } finally {
      setAiSplitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...lesson,
      title: form.title,
      content: form.content,
      videoUrl: form.videoUrl,
      videoDuration: Number(form.videoDuration),
      duration: Number(form.duration),
      featuredImage: form.featuredImage,
      attachments,
      deliveryMode,
      contentBlocks,
      defaultMinReadSeconds: Number(form.defaultMinReadSeconds),
      blockForwardSeeking,
      videoCheckpoints,
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4 p-4 border border-[var(--color-border-default)] rounded-xl bg-[var(--color-surface-secondary)]">
      <h4 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
        <span>📝</span> Edit Lesson
      </h4>

      {/* Title */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Title *</label>
        <input
          className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          required
        />
      </div>

      {/* Duration */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Duration (minutes)</label>
        <input
          type="number"
          min={0}
          className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
          value={form.duration}
          onChange={(e) => update('duration', Number(e.target.value))}
        />
      </div>

      {/* Video URL */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Video URL</label>
        <input
          className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
          placeholder="https://youtube.com/watch?v=..."
          value={form.videoUrl}
          onChange={(e) => update('videoUrl', e.target.value)}
        />
      </div>

      {/* Video Checkpoints — percentage-based gating on this lesson's own video */}
      {form.videoUrl.trim() && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Video Duration (seconds)</label>
          </div>
          <input
            type="number"
            min={0}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm mb-3"
            placeholder="e.g. 480 for an 8-minute video"
            value={form.videoDuration}
            onChange={(e) => update('videoDuration', Number(e.target.value))}
          />
          <p className="text-[11px] text-[var(--color-text-tertiary)] mb-2">
            Required for checkpoint percentages to map to real timestamps.
          </p>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Video Checkpoints (optional)</label>
          <VideoCheckpointEditor
            checkpoints={videoCheckpoints}
            onChange={setVideoCheckpoints}
            blockForwardSeeking={blockForwardSeeking}
            onChangeBlockForwardSeeking={setBlockForwardSeeking}
          />
        </div>
      )}

      {/* Featured Image */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Featured Image URL</label>
        <input
          className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
          placeholder="https://example.com/image.jpg"
          value={form.featuredImage}
          onChange={(e) => update('featuredImage', e.target.value)}
        />
      </div>

      {/* Lesson Delivery Mode */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Lesson Delivery Mode</label>
        <div className="flex gap-2 rounded-xl border border-[var(--color-border-default)] p-1">
          <button
            type="button"
            onClick={() => setDeliveryMode('traditional')}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              deliveryMode === 'traditional' ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
            }`}
          >
            📄 Traditional
          </button>
          <button
            type="button"
            onClick={() => setDeliveryMode('interactive_gate')}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              deliveryMode === 'interactive_gate' ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
            }`}
          >
            🔒 Interactive Gate
          </button>
        </div>
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
          {deliveryMode === 'traditional'
            ? 'The full lesson content shows at once, exactly as today.'
            : 'The lesson is split into content blocks. Students read each block, wait out a minimum time, and answer a Stop & Check question before the next block unlocks.'}
        </p>
      </div>

      {deliveryMode === 'traditional' ? (
        /* Content (Visual rich-text editor / raw HTML code, bi-directionally synced) */
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Content / Description</label>
            <button
              type="button"
              onClick={() => setAiModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-violet-700 hover:to-indigo-700 transition-all"
            >
              <span>✨</span> AI Lesson Generator
            </button>
          </div>
          <RichTextEditor
            value={form.content}
            onChange={(html) => update('content', html)}
            placeholder="Enter lesson content..."
          />
          <AiLessonGeneratorModal
            isOpen={aiModalOpen}
            onClose={() => setAiModalOpen(false)}
            lessonTitle={form.title}
            onGenerated={(html) => update('content', html)}
          />

          {/* Convert this Traditional content into Interactive Gate blocks */}
          <div className="mt-3 rounded-xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text-secondary)]">Convert to Interactive Gate</p>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              Turn this content into gated Content Blocks — split it yourself with a divider, or let AI do it.
            </p>

            {aiSplitting ? (
              <div className="flex items-center gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 px-3 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-violet-600 dark:text-violet-400 shrink-0" />
                <p className="text-xs text-violet-700 dark:text-violet-300">AI is analyzing and organizing your lesson into interactive blocks...</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSplitByDivider}
                  disabled={!form.content.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Split by Divider (---)
                </button>
                <button
                  type="button"
                  onClick={handleSplitWithAi}
                  disabled={!form.content.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Split Content with AI
                </button>
              </div>
            )}

            {splitError && (
              <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {splitError}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Content Blocks</label>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
              Default min. read time:
              <input
                type="number"
                min={5}
                max={600}
                className="w-16 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs"
                value={form.defaultMinReadSeconds}
                onChange={(e) => update('defaultMinReadSeconds', Number(e.target.value))}
              />
              sec
            </div>
          </div>
          <ContentBlockEditor
            blocks={contentBlocks}
            onChange={setContentBlocks}
            defaultMinReadSeconds={Number(form.defaultMinReadSeconds) || 30}
          />
        </div>
      )}

      {/* Attachments */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Attachments</label>
        {attachments.length > 0 && (
          <div className="space-y-1 mb-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs bg-[var(--color-surface-primary)] rounded-lg px-3 py-1.5 border border-[var(--color-border-default)]">
                <span className="truncate flex-1">{att.name}</span>
                <button type="button" onClick={() => removeAttachment(idx)} className="text-red-500 hover:text-red-700 ml-2">✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs"
            placeholder="File name (e.g. notes.pdf)"
            value={newAttName}
            onChange={(e) => setNewAttName(e.target.value)}
          />
          <input
            className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs"
            placeholder="URL"
            value={newAttUrl}
            onChange={(e) => setNewAttUrl(e.target.value)}
          />
          <button type="button" onClick={addAttachment} className="rounded-lg bg-primary-600 text-white px-3 py-2 text-xs font-semibold hover:bg-primary-700 transition-colors">
            + Add
          </button>
        </div>
      </div>

      {/* Actions */}
      {!hideActions && (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">
            Cancel
          </button>
          <button type="submit" className="flex-1 rounded-lg bg-primary-600 text-white px-4 py-2 text-xs font-semibold hover:bg-primary-700 transition-colors">
            Save Lesson
          </button>
        </div>
      )}
    </form>
  );
}