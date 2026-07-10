/**
 * Assignment Editor — Inline form for editing an assignment's metadata.
 */

import { useState } from 'react';
import type { AssignmentItem, Attachment } from '../course-builder.types';

interface AssignmentEditorProps {
  assignment: AssignmentItem;
  onSave: (updated: AssignmentItem) => void;
  onCancel: () => void;
}

export function AssignmentEditor({ assignment, onSave, onCancel }: AssignmentEditorProps) {
  const [form, setForm] = useState({
    title: assignment.title || '',
    description: assignment.description || '',
    instructions: assignment.instructions || '',
    dueDate: assignment.dueDate ? assignment.dueDate.slice(0, 10) : '',
    maxScore: assignment.maxScore ?? 100,
    duration: assignment.duration || 0,
  });
  const [allowedTypes, setAllowedTypes] = useState<string[]>(assignment.allowedFileTypes || []);
  const [newType, setNewType] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>(assignment.attachments || []);
  const [newAttUrl, setNewAttUrl] = useState('');
  const [newAttName, setNewAttName] = useState('');

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const addType = () => {
    if (!newType.trim()) return;
    setAllowedTypes((prev) => [...prev, newType.trim()]);
    setNewType('');
  };

  const removeType = (idx: number) => {
    setAllowedTypes((prev) => prev.filter((_, i) => i !== idx));
  };

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
      ...assignment,
      title: form.title,
      description: form.description,
      instructions: form.instructions,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      maxScore: Number(form.maxScore),
      duration: Number(form.duration),
      allowedFileTypes: allowedTypes,
      attachments,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-[var(--color-border-default)] rounded-xl bg-[var(--color-surface-secondary)]">
      <h4 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
        <span>📋</span> Edit Assignment
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

      {/* Row: Duration + Max Score */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Duration (min)</label>
          <input type="number" min={0} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.duration} onChange={(e) => update('duration', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Max Score</label>
          <input type="number" min={0} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.maxScore} onChange={(e) => update('maxScore', Number(e.target.value))} />
        </div>
      </div>

      {/* Due Date */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Due Date</label>
        <input type="date" className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.dueDate} onChange={(e) => update('dueDate', e.target.value)} />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Description</label>
        <textarea rows={2} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm resize-y" value={form.description} onChange={(e) => update('description', e.target.value)} />
      </div>

      {/* Instructions */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Instructions</label>
        <textarea rows={3} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm resize-y" value={form.instructions} onChange={(e) => update('instructions', e.target.value)} />
      </div>

      {/* Allowed File Types */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Allowed File Types</label>
        {allowedTypes.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {allowedTypes.map((t, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 text-xs bg-[var(--color-surface-primary)] rounded-lg px-2 py-1 border border-[var(--color-border-default)]">
                {t}
                <button type="button" onClick={() => removeType(idx)} className="text-red-400 hover:text-red-600">✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs"
            placeholder="e.g. .pdf, .docx"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addType(); } }}
          />
          <button type="button" onClick={addType} className="rounded-lg bg-primary-600 text-white px-3 py-2 text-xs font-semibold hover:bg-primary-700 transition-colors">
            + Add
          </button>
        </div>
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
            placeholder="File name (e.g. rubric.pdf)"
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
          Save Assignment
        </button>
      </div>
    </form>
  );
}