/**
 * Lesson Editor — Inline form for editing a lesson's metadata.
 */

import { useState } from 'react';
import type { LessonItem, Attachment } from '../course-builder.types';
import { RichTextEditor } from './rich-text-editor';
import { AiLessonGeneratorModal } from './ai-lesson-generator-modal';

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
    duration: lesson.duration || 0,
    featuredImage: lesson.featuredImage || '',
  });
  const [attachments, setAttachments] = useState<Attachment[]>(lesson.attachments || []);
  const [newAttUrl, setNewAttUrl] = useState('');
  const [newAttName, setNewAttName] = useState('');
  const [aiModalOpen, setAiModalOpen] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...lesson,
      title: form.title,
      content: form.content,
      videoUrl: form.videoUrl,
      duration: Number(form.duration),
      featuredImage: form.featuredImage,
      attachments,
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

      {/* Content (Visual rich-text editor / raw HTML code, bi-directionally synced) */}
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
      </div>

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