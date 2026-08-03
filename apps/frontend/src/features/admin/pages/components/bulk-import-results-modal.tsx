/**
 * Bulk Import Results Modal — lets an admin/teacher who already prepared
 * scores offline (e.g. in their own spreadsheet) upload them in one shot
 * instead of typing every student into Enter Results by hand. Downloads a
 * template pre-filled with the course's current roster + already-entered
 * scores (so re-uploading unchanged is a no-op), then parses the uploaded
 * file server-side (/gradebook/:courseId/manual-entry-roster/import) and
 * reports how many scores were saved and which student codes didn't match.
 */
import { useRef, useState } from 'react';
import { X, Download, UploadCloud, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../../../../lib/axios';

interface BulkImportResultsModalProps {
  courseId: string;
  onClose: () => void;
  onImported: () => void;
}

export function BulkImportResultsModal({ courseId, onClose, onImported }: BulkImportResultsModalProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ saved: number; notFound: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    setError('');
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/gradebook/${courseId}/manual-entry-roster/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'enter-results-template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download the template.');
    } finally {
      setDownloading(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) { setSelectedFile(file); setResult(null); setError(''); }
  };

  const submitImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const { data } = await api.post(`/gradebook/${courseId}/manual-entry-roster/import`, formData);
      setResult(data.data);
      onImported();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="border-b border-[var(--color-border-subtle)] px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Bulk Import Results</h2>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Upload an Excel/CSV file to fill in every student's scores at once.</p>
          </div>
          <button type="button" onClick={onClose} disabled={importing} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={downloading}
            className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group disabled:opacity-60"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-primary-600 dark:text-primary-400 flex-shrink-0" strokeWidth={2} />
                <div>
                  <p className="text-sm font-bold text-primary-700 dark:text-primary-300">Download this course's template</p>
                  <p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">Pre-filled with the current roster and any scores already entered</p>
                </div>
              </div>
              {downloading && <Loader2 className="h-4 w-4 animate-spin text-primary-500" />}
            </div>
          </button>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}
          >
            {selectedFile ? (
              <div className="space-y-2.5">
                <CheckCircle2 className="h-7 w-7 mx-auto text-emerald-500" strokeWidth={2} />
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedFile.name}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                <button type="button" onClick={() => { setSelectedFile(null); setResult(null); }} className="text-xs text-red-500 hover:underline">Remove file</button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <UploadCloud className="h-7 w-7 mx-auto text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">Drag and drop the filled-in file here, or</p>
                <label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">
                  Browse Files
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelectedFile(f); setResult(null); setError(''); } }}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-[var(--color-text-tertiary)]">Supported formats: .xlsx, .xls, .csv (max 10 MB)</p>
              </div>
            )}
          </div>

          {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}

          {result && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 space-y-1.5">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" strokeWidth={2} /> Imported {result.saved} score{result.saved === 1 ? '' : 's'}.
              </p>
              {result.notFound.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" strokeWidth={2} />
                  {result.notFound.length} student code{result.notFound.length === 1 ? '' : 's'} didn't match this course's roster: {result.notFound.slice(0, 8).join(', ')}{result.notFound.length > 8 ? '…' : ''}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between">
          <button type="button" onClick={onClose} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">
            {result ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={submitImport}
            disabled={importing || !selectedFile}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {importing ? <><Loader2 className="h-4 w-4 animate-spin" />Importing...</> : 'Import Scores'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkImportResultsModal;
