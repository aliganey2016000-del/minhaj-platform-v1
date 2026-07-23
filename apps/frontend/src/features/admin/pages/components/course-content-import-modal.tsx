/**
 * Course Content Import Modal — bulk-creates Chapters (Units) + Lessons from
 * an uploaded Excel file or pasted spreadsheet rows. One row per lesson;
 * rows sharing a Chapter Title group into one chapter (matched against any
 * chapter that already exists, case-insensitively, otherwise created new).
 *
 * Unlike the rest of the Course Content Builder (which holds the whole
 * chapters array in local state and only persists on Save/autosave), this
 * writes directly to the database — the caller must refetch content after
 * a successful import so local state picks up the new chapters/lessons
 * before any further autosave can overwrite them.
 */

import { useRef, useState } from 'react';
import api from '../../../../lib/axios';

// Tab-separated parser that respects quoted fields — Excel/Sheets wraps any
// copied cell containing a newline, tab, or quote in double quotes (quotes
// doubled to escape) when it puts data on the clipboard as plain text. A
// naive `split('\n')` would shred a multi-line Content cell into several
// "rows", misreading the tail of that cell's text as a brand-new Chapter
// Title with the next columns over as its Lesson Title.
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => { row.push(field.trim()); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += char; i++; continue;
    }
    if (char === '"' && field === '') { inQuotes = true; i++; continue; }
    if (char === '\t') { pushField(); i++; continue; }
    if (char === '\r') { i++; continue; }
    if (char === '\n') { pushRow(); i++; continue; }
    field += char; i++;
  }
  if (field !== '' || row.length > 0) pushRow();

  return rows.filter((r) => r.length > 0 && r.some((cell) => cell !== ''));
}

interface CourseContentImportModalProps {
  courseId: string;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

export interface ImportResult {
  totalRows: number;
  chaptersCreated: number;
  chaptersUpdated: number;
  lessonsCreated: number;
  errors: { row: number; message: string }[];
}

export function CourseContentImportModal({ courseId, onClose, onImported }: CourseContentImportModalProps) {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/courses/${courseId}/content/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'course-content-template.xlsx';
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
      const { data } = await api.post(`/courses/${courseId}/content/import`, formData);
      // Any lessons created/attached is a success — close and hand the
      // summary up to the page so it can toast it, instead of leaving this
      // modal sitting open waiting for a manual "Close" click. Only a total
      // failure (nothing created/updated) keeps it open to show the errors.
      if (data.data?.chaptersCreated > 0 || data.data?.chaptersUpdated > 0) {
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

  const parsePastedRows = (): string[][] => parseTsv(pasteText);

  const submitPasteImport = async () => {
    const rows = parsePastedRows();
    if (rows.length === 0) {
      setPasteError('Please paste at least one row of data before submitting.');
      return;
    }
    if (rows[0].length < 2) {
      setPasteError(`Expected at least 2 columns (Chapter Title, Lesson Title). Found ${rows[0].length}.`);
      return;
    }
    const csvContent = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], 'pasted-content.csv', { type: 'text/csv' });
    setImporting(true);
    setError('');
    setResult(null);
    setPasteError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/courses/${courseId}/content/import`, formData);
      if (data.data?.chaptersCreated > 0 || data.data?.chaptersUpdated > 0) {
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

  const parsedRows = parsePastedRows();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="border-b border-[var(--color-border-subtle)] px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Import Course Content</h2>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Bulk-create Units (Chapters) and Lessons from a spreadsheet.</p>
            </div>
            <button onClick={onClose} disabled={importing} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          <button onClick={handleDownloadTemplate} className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📥</span>
                <div>
                  <p className="text-sm font-bold text-primary-700 dark:text-primary-300 group-hover:text-primary-800 dark:group-hover:text-primary-200">Download Excel Template</p>
                  <p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">Pre-formatted .xlsx file with the correct column structure</p>
                </div>
              </div>
              <svg className="h-5 w-5 text-primary-500 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setMode('upload'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${mode === 'upload' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}>
              <span className="text-2xl block mb-1">📁</span>
              <p className={`text-sm font-bold ${mode === 'upload' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Upload Excel File</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Drag and drop your .xlsx file</p>
            </button>
            <button onClick={() => { setMode('paste'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${mode === 'paste' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}>
              <span className="text-2xl block mb-1">📋</span>
              <p className={`text-sm font-bold ${mode === 'paste' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Manual Copy & Paste</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Paste tabular data from your clipboard</p>
            </button>
          </div>

          {mode === 'upload' && (
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
                  <button onClick={() => setSelectedFile(null)} className="text-xs text-red-500 hover:underline">Remove file</button>
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
          )}

          {mode === 'paste' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Paste your spreadsheet data below (tab-separated columns, one row per line):</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mb-3 font-mono">
                  Chapter Title &nbsp; Lesson Title &nbsp; Duration (minutes) &nbsp; Content &nbsp; Video URL &nbsp; Featured Image URL <span className="italic">(Content, Video URL, and Featured Image URL are all optional — Content accepts plain text or Markdown, converted automatically)</span>
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => { setPasteText(e.target.value); setPasteError(''); }}
                  rows={8}
                  placeholder={"Paste data from Excel here...\n\nExample:\nUnit 1: Greetings\tWhat's your name?\t30\tSay hello and make introductions.\thttps://youtube.com/watch?v=...\t\nUnit 1: Greetings\tNice to meet you\t30\t\t\t\nUnit 2: Family\tThis is my family\t30\t\t\t"}
                  className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y"
                />
              </div>
              {pasteError && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{pasteError}</div>}
              {parsedRows.length > 0 && (
                <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
                  <div className="bg-[var(--color-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-tertiary)]">Preview — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed</div>
                  <div className="max-h-40 overflow-auto">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-[var(--color-border-subtle)]">
                        {parsedRows.slice(0, 20).map((row, ri) => (
                          <tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--color-surface-primary)]' : 'bg-[var(--color-surface-secondary)]'}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-1.5 text-[var(--color-text-secondary)] whitespace-nowrap border-r border-[var(--color-border-subtle)] last:border-r-0">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}
        </div>

        <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between">
          <button onClick={onClose} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Close</button>
          <button
            onClick={mode === 'upload' ? submitFileImport : submitPasteImport}
            disabled={importing || (mode === 'upload' && !selectedFile) || (mode === 'paste' && !pasteText.trim())}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {importing ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importing...</> : 'Import Content'}
          </button>
        </div>

        {result && (
          <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 space-y-2">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {result.chaptersCreated} unit{result.chaptersCreated === 1 ? '' : 's'} created, {result.chaptersUpdated} updated, {result.lessonsCreated} lesson{result.lessonsCreated === 1 ? '' : 's'} added
              {result.errors.length > 0 && ` — ${result.errors.length} row${result.errors.length === 1 ? '' : 's'} skipped`}
            </p>
            {result.errors.length > 0 && (
              <div className="max-h-36 overflow-y-auto rounded-lg border border-red-200 dark:border-red-900/40">
                <table className="w-full text-xs">
                  <thead className="bg-red-50 dark:bg-red-950/30 text-left text-red-700 dark:text-red-300">
                    <tr><th className="px-3 py-1.5">Row</th><th className="px-3 py-1.5">Error</th></tr>
                  </thead>
                  <tbody className="divide-y divide-red-100 dark:divide-red-900/30">
                    {result.errors.map((e, idx) => (
                      <tr key={idx}><td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{e.row}</td><td className="px-3 py-1.5 text-red-600 dark:text-red-400">{e.message}</td></tr>
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

export default CourseContentImportModal;
