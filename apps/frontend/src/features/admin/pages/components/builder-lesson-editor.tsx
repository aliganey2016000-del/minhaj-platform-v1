/**
 * Lesson Editor — Inline form for editing a lesson's metadata.
 */

import { useState } from 'react';
import type { LessonItem, Attachment } from '../course-builder.types';

interface LessonEditorProps {
  lesson: LessonItem;
  onSave: (updated: LessonItem) => void;
  onCancel: () => void;
}

export function LessonEditor({ lesson, onSave, onCancel }: LessonEditorProps) {
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
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-[var(--color-border-default)] rounded-xl bg-[var(--color-surface-secondary)]">
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

      {/* Content (rich text placeholder) */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Content / Description</label>
        <textarea
          rows={4}
          className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm resize-y"
          value={form.content}
          onChange={(e) => update('content', e.target.value)}
          placeholder="Enter lesson content, HTML supported..."
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
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">
          Cancel
        </button>
        <button type="submit" className="flex-1 rounded-lg bg-primary-600 text-white px-4 py-2 text-xs font-semibold hover:bg-primary-700 transition-colors">
          Save Lesson
        </button>
      </div>
    </form>
  );
}