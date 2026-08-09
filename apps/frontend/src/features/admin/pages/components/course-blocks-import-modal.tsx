/**
 * Course Blocks Import Modal — bulk-creates Interactive Gate Content Blocks
 * (with their Stop & Check questions) across EVERY lesson in a course from
 * one multi-sheet spreadsheet, in a single import. The course-wide sibling
 * of ContentBlocksImportModal (which only ever touches one lesson, opened
 * from inside the Lesson Editor) — like CourseContentImportModal, this
 * writes straight to the database, so the caller must refetch course
 * content after a successful import.
 *
 * Upload-only — no "Manual Copy & Paste" mode, since the whole point is
 * multiple sheets (one per lesson), which a single clipboard paste can't
 * represent.
 */

import { useRef, useState } from 'react';
import api from '../../../../lib/axios';

interface CourseBlocksImportModalProps {
  courseId: string;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

export interface ImportResult {
  lessonsUpdated: number;
  blocksCreated: number;
  questionsCreated: number;
  errors: { row: number; message: string }[];
}

export function CourseBlocksImportModal({ courseId, onClose, onImported }: CourseBlocksImportModalProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/courses/${courseId}/content/blocks-import/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'content-blocks-bulk-template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download template');
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const submitFileImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const { data } = await api.post(`/courses/${courseId}/content/blocks-import`, formData);
      // Any lesson updated is a success — close and hand the summary up to
      // the page so it can toast it, instead of leaving this modal open
      // waiting for a manual "Close" click. Only a total failure (nothing
      // updated) keeps it open to show the errors.
      if (data.data?.lessonsUpdated > 0) {
        onImported(data.data);
        onClose();
      } else {
        setResult(data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="border-b border-[var(--color-border-subtle)] px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Import Interactive Blocks — All Lessons</h2>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Bulk-create Stop &amp; Check content blocks across every lesson in this course from one spreadsheet.</p>
            </div>
            <button type="button" onClick={onClose} disabled={importing} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          <button type="button" onClick={handleDownloadTemplate} className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📥</span>
                <div>
                  <p className="text-sm font-bold text-primary-700 dark:text-primary-300 group-hover:text-primary-800 dark:group-hover:text-primary-200">Download Excel Template</p>
                  <p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">One sheet per lesson in this course, Chapter/Lesson Title already filled in</p>
                </div>
              </div>
              <svg className="h-5 w-5 text-primary-500 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </div>
          </button>
          <p className="text-xs text-[var(--color-text-tertiary)] -mt-3">
            💡 Fill in the Block Title / Content / Question columns on each lesson's sheet, then upload the whole file — every lesson's blocks are created in one import. The download also includes 2 ready-to-copy AI prompts you can hand to ChatGPT/DeepSeek along with each lesson's text.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}
          >
            {selectedFile ? (
              <div className="space-y-3">
                <span className="text-3xl">✅</span>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedFile.name}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                <button type="button" onClick={() => setSelectedFile(null)} className="text-xs text-red-500 hover:underline">Remove file</button>
              </div>
            ) : (
              <div className="space-y-3">
                <span className="text-3xl">📂</span>
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">Drag and drop your Excel file here, or</p>
                <label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">
                  Browse Files
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }} className="hidden" />
                </label>
                <p className="text-xs text-[var(--color-text-tertiary)]">Supported formats: .xlsx, .xls, .csv (max 10 MB)</p>
              </div>
            )}
          </div>

          {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}
        </div>

        <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between">
          <button type="button" onClick={onClose} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Close</button>
          <button
            type="button"
            onClick={submitFileImport}
            disabled={importing || !selectedFile}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {importing ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importing...</> : 'Import Content Blocks'}
          </button>
        </div>

        {result && (
          <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 space-y-2">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {result.lessonsUpdated} lesson{result.lessonsUpdated === 1 ? '' : 's'} updated, {result.blocksCreated} block{result.blocksCreated === 1 ? '' : 's'}, {result.questionsCreated} question{result.questionsCreated === 1 ? '' : 's'}
              {result.errors.length > 0 && ` — ${result.errors.length} issue${result.errors.length === 1 ? '' : 's'}`}
            </p>
            {result.errors.length > 0 && (
              <div className="max-h-36 overflow-auto rounded-lg border border-red-200 dark:border-red-900/40">
                <table className="w-full text-xs">
                  <thead className="bg-red-50 dark:bg-red-950/30 text-left text-red-700 dark:text-red-300">
                    <tr><th className="px-3 py-1.5">Issue</th></tr>
                  </thead>
                  <tbody className="divide-y divide-red-100 dark:divide-red-900/30">
                    {result.errors.map((e, idx) => (
                      <tr key={idx}><td className="px-3 py-1.5 text-red-600 dark:text-red-400">{e.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CourseBlocksImportModal;
