/**
 * AI Lesson Generator Modal — three ways to draft a lesson body with DeepSeek:
 * from the lesson's title, from pasted notes, or from an uploaded document
 * (PDF / Word / PowerPoint / Excel). Calls the backend, which extracts text
 * server-side and returns clean semantic HTML.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../../../../lib/axios';

interface AiLessonGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessonTitle: string;
  onGenerated: (html: string) => void;
}

const ACCEPTED_EXTENSIONS = ['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.pdf'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AiLessonGeneratorModal({ isOpen, onClose, lessonTitle, onGenerated }: AiLessonGeneratorModalProps) {
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset transient state whenever the modal opens fresh.
  useEffect(() => {
    if (isOpen) {
      setNotes('');
      setFile(null);
      setError('');
      setGenerating(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generating) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, generating, onClose]);

  if (!isOpen) return null;

  const runGeneration = async (statusText: string, request: () => Promise<{ data: { data: { html: string } } }>) => {
    setError('');
    setStatusMessage(statusText);
    setGenerating(true);
    try {
      const { data } = await request();
      onGenerated(data.data.html);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate the lesson. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const generateFromTitle = () =>
    runGeneration('✨ DeepSeek is structuring your lesson from the title...', () =>
      api.post('/ai/generate-lesson', { mode: 'title', title: lessonTitle }),
    );

  const generateFromNotes = () =>
    runGeneration('✨ DeepSeek is structuring your lesson from your notes...', () =>
      api.post('/ai/generate-lesson', { mode: 'notes', notes }),
    );

  const generateFromDocument = () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    return runGeneration(`📄 Reading "${file.name}" and asking DeepSeek to structure a lesson from it...`, () =>
      api.post('/ai/generate-lesson/document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  };

  const closeUnlessBusy = () => {
    if (!generating) onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={closeUnlessBusy}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-5 py-4">
            <h3 className="flex items-center gap-2 text-base font-bold text-[var(--color-text-primary)]">
              <span className="text-xl">✨</span> AI Lesson Generator
            </h3>
            <button
              type="button"
              onClick={closeUnlessBusy}
              disabled={generating}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ✕
            </button>
          </div>

          <div className="p-5">
            {generating ? (
              // -------------------------------------------------------------
              // Loading state — replaces the option grid while a request runs
              // -------------------------------------------------------------
              <div className="flex flex-col items-center justify-center gap-4 py-14 text-center">
                <div className="relative h-14 w-14">
                  <div className="absolute inset-0 rounded-full border-4 border-violet-100 dark:border-violet-900/40" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-600 animate-spin" />
                </div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] max-w-sm">{statusMessage}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">This can take up to a minute for longer documents.</p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Option 1 — From Title */}
                  <div className="flex flex-col rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-sm font-bold">1</span>
                      <h4 className="text-sm font-bold text-[var(--color-text-primary)]">From Lesson Title</h4>
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] flex-1 mb-3">
                      Automatically uses the text currently typed into the Title field.
                    </p>
                    <div className="rounded-lg bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] px-3 py-2 mb-3 text-xs text-[var(--color-text-secondary)] truncate">
                      {lessonTitle?.trim() ? `“${lessonTitle}”` : 'No title set yet'}
                    </div>
                    <button
                      type="button"
                      onClick={generateFromTitle}
                      disabled={!lessonTitle?.trim()}
                      className="mt-auto rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Generate from Title
                    </button>
                  </div>

                  {/* Option 2 — Paste Notes */}
                  <div className="flex flex-col rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-sm font-bold">2</span>
                      <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Paste Custom Data</h4>
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
                      Paste raw notes, a transcript, or unformatted text.
                    </p>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Paste notes here..."
                      rows={5}
                      className="flex-1 mb-3 w-full resize-none rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                    <button
                      type="button"
                      onClick={generateFromNotes}
                      disabled={!notes.trim()}
                      className="mt-auto rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Generate from Copied Data
                    </button>
                  </div>

                  {/* Option 3 — Document Upload */}
                  <div className="flex flex-col rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-sm font-bold">3</span>
                      <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Document Upload</h4>
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] mb-3">Word, PowerPoint, Excel, or PDF.</p>

                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex-1 mb-3 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-4 text-center cursor-pointer transition-colors ${
                        dragActive
                          ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20'
                          : 'border-[var(--color-border-default)] hover:border-violet-300'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_EXTENSIONS.join(',')}
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                      {file ? (
                        <>
                          <span className="text-2xl">📄</span>
                          <p className="text-xs font-medium text-[var(--color-text-primary)] truncate max-w-full px-2">{file.name}</p>
                          <p className="text-[10px] text-[var(--color-text-tertiary)]">{formatFileSize(file.size)}</p>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFile(null); }}
                            className="text-[10px] text-red-500 hover:text-red-600 mt-1"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl opacity-60">📁</span>
                          <p className="text-xs text-[var(--color-text-tertiary)]">Drag & drop, or click to browse</p>
                          <p className="text-[10px] text-[var(--color-text-tertiary)]">.doc .docx .ppt .pptx .xls .xlsx .pdf</p>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={generateFromDocument}
                      disabled={!file}
                      className="mt-auto rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Extract & Generate from Document
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default AiLessonGeneratorModal;
