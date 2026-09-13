/** Reusable spreadsheet import flow for admin management pages. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clipboard, Download, FileSpreadsheet, Loader2, Sparkles, UploadCloud, X } from 'lucide-react';
import api from '../../../../lib/axios';

interface ImportError { row?: number; message?: string; }
interface ImportResult { totalRows?: number; created?: number; updated?: number; failed?: number; errors?: ImportError[]; }

interface Props {
  title: string;
  description: string;
  templateUrl: string;
  importUrl: string;
  templateName: string;
  headers: string[];
  generateTemplateUrl?: string;
  generateTemplateName?: string;
  generateTemplateDescription?: string;
  onClose: () => void;
  onImported?: () => void | Promise<void>;
}

function splitClipboard(text: string): string[][] {
  const delimiter = text.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  const pushRow = () => { row.push(cell.trim()); if (row.some(value => value.length)) rows.push(row); row = []; cell = ''; };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && ch === delimiter) { row.push(cell.trim()); cell = ''; }
    else if (!quoted && (ch === '\n' || ch === '\r')) {
      pushRow(); if (ch === '\r' && text[i + 1] === '\n') i += 1;
    } else cell += ch;
  }
  pushRow();
  return rows;
}

function csvEscape(value: string) {
  const v = String(value ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function BulkEntityImportModal({ title, description, templateUrl, importUrl, templateName, headers, generateTemplateUrl, generateTemplateName, generateTemplateDescription, onClose, onImported }: Props) {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<string[][]>([]);
  const [effectiveHeaders, setEffectiveHeaders] = useState<string[]>(headers);
  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Course columns depend on institution type (school vs training center / higher ed).
  // Read them from the same backend source that creates the XLSX template so the
  // paste preview can never drift away from Template / Import / Export / Add/Edit.
  useEffect(() => {
    setEffectiveHeaders(headers);
    if (!templateUrl.startsWith('/courses/template')) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get('/courses/template-headers');
        const next = response?.data?.data?.headers;
        if (!cancelled && Array.isArray(next) && next.length) setEffectiveHeaders(next);
      } catch {
        // Keep the supplied headers as a safe fallback. The actual XLSX template
        // still comes from the backend and remains authoritative.
      }
    })();
    return () => { cancelled = true; };
  }, [headers, templateUrl]);

  const canImport = mode === 'upload' ? !!file : preview.length > 0;
  const normalizedHeaders = useMemo(() => effectiveHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()), [effectiveHeaders]);

  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    if (next.size > 10 * 1024 * 1024) { setError('File is larger than 10 MB.'); return; }
    setFile(next); setResult(null); setError('');
  };

  const parsePaste = (value: string) => {
    setPaste(value); setResult(null); setError('');
    const rows = splitClipboard(value);
    if (!rows.length) { setPreview([]); return; }
    const first = rows[0].map((v) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
    const headerMatches = normalizedHeaders.filter((h) => first.includes(h)).length;
    setPreview(headerMatches >= Math.min(2, effectiveHeaders.length)
      ? rows.slice(1).slice(0, 200).map(row => normalizedHeaders.map(h => row[first.indexOf(h)] || ''))
      : rows.slice(0, 200));
  };

  const buildPasteFile = () => {
    const rows = splitClipboard(paste);
    if (!rows.length) return null;
    const first = rows[0].map((v) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
    const headerMatches = normalizedHeaders.filter((h) => first.includes(h)).length;
    const body = headerMatches >= Math.min(2, effectiveHeaders.length) ? rows : [effectiveHeaders, ...rows];
    const csv = body.map((row) => row.map(csvEscape).join(',')).join('\n');
    return new File([csv], `${templateName.replace(/\.[^.]+$/, '')}-pasted.csv`, { type: 'text/csv' });
  };

  const downloadTemplate = async () => {
    setDownloading(true); setError('');
    try {
      const response = await api.get(templateUrl, { responseType: 'blob' });
      downloadBlob(response.data, templateName);
    } catch (e: any) { setError(e?.response?.data?.message || 'Could not download the template.'); }
    finally { setDownloading(false); }
  };

  const generateTemplate = async () => {
    if (!generateTemplateUrl) return;
    setDownloading(true); setError('');
    try {
      const response = await api.get(generateTemplateUrl, { responseType: 'blob' });
      downloadBlob(response.data, generateTemplateName || templateName);
    } catch (e: any) { setError(e?.response?.data?.message || 'Could not generate the school template.'); }
    finally { setDownloading(false); }
  };

  const submit = async () => {
    const selected = mode === 'upload' ? file : buildPasteFile();
    if (!selected) return;
    setImporting(true); setError(''); setResult(null);
    try {
      const fd = new FormData(); fd.append('file', selected);
      const response = await api.post(importUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = response?.data?.data ?? response?.data ?? {};
      setResult({
        totalRows: Number(data.totalRows ?? 0),
        created: Number(data.created ?? 0),
        updated: Number(data.updated ?? 0),
        failed: Number(data.failed ?? 0),
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
      await onImported?.();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Import failed.');
    } finally { setImporting(false); }
  };

  const resetInput = () => { setFile(null); setResult(null); setError(''); if (inputRef.current) inputRef.current.value = ''; };

  const startAnotherImport = () => {
    setFile(null);
    setPaste('');
    setPreview([]);
    setResult(null);
    setError('');
    setMode('upload');
    if (inputRef.current) inputRef.current.value = '';
  };

  const successful = (result?.created || 0) + (result?.updated || 0);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
        <div className="flex shrink-0 items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6 dark:border-slate-800">
          <div className="min-w-0"><div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary-600" /><h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">{title}</h2></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p></div>
          <button type="button" onClick={onClose} disabled={importing} className="ml-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18}/></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className={`grid gap-3 ${generateTemplateUrl ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            <button type="button" onClick={downloadTemplate} disabled={downloading} className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-left transition hover:bg-primary-100 disabled:opacity-60 dark:border-primary-900/60 dark:bg-primary-950/20 dark:hover:bg-primary-950/40">
              <div className="flex items-start gap-3"><Download className="mt-0.5 h-5 w-5 shrink-0 text-primary-600"/><div><p className="text-sm font-bold text-primary-800 dark:text-primary-300">1. Download Template</p><p className="mt-1 text-xs text-primary-700/70 dark:text-primary-300/70">Use the official columns and sample format.</p></div>{downloading && <Loader2 className="ml-auto h-4 w-4 animate-spin"/>}</div>
            </button>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50"><p className="text-sm font-bold text-slate-800 dark:text-slate-200">2. Choose a source</p><p className="mt-1 text-xs text-slate-500">Upload your completed spreadsheet or paste rows directly from Excel/Google Sheets.</p></div>
            {generateTemplateUrl && <button type="button" onClick={generateTemplate} disabled={downloading} className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-left transition hover:bg-violet-100 disabled:opacity-60 dark:border-violet-900/60 dark:bg-violet-950/20 dark:hover:bg-violet-950/40"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-600"/><div><p className="text-sm font-bold text-violet-800 dark:text-violet-300">3. Generate</p><p className="mt-1 text-xs text-violet-700/70 dark:text-violet-300/70">{generateTemplateDescription || "Create a template pre-filled with this school's classes."}</p></div>{downloading && <Loader2 className="ml-auto h-4 w-4 animate-spin"/>}</div></button>}
          </div>

          <div className="mt-4 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            <button type="button" onClick={() => setMode('upload')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'upload' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500'}`}><UploadCloud className="mr-1.5 inline h-4 w-4"/>Upload File</button>
            <button type="button" onClick={() => setMode('paste')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'paste' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500'}`}><Clipboard className="mr-1.5 inline h-4 w-4"/>Copy &amp; Paste</button>
          </div>

          {mode === 'upload' ? (
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); chooseFile(e.dataTransfer.files?.[0]); }} className={`mt-4 rounded-2xl border-2 border-dashed p-8 text-center transition ${dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'}`}>
              {file ? <div className="space-y-2"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500"/><p className="text-sm font-semibold text-slate-900 dark:text-white">{file.name}</p><p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p><button type="button" onClick={resetInput} className="text-xs font-semibold text-red-600 hover:underline">Choose another file</button></div> : <div className="space-y-3"><UploadCloud className="mx-auto h-8 w-8 text-slate-400"/><p className="text-sm text-slate-600 dark:text-slate-300">Drag &amp; drop your completed file here</p><button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700">Browse Files</button><input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])}/><p className="text-[11px] text-slate-400">Excel or CSV · maximum 10 MB</p></div>}
            </div>
          ) : (
            <div className="mt-4 space-y-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">Paste the spreadsheet rows below. Including the header row is supported; if you paste data rows only, the official template headers will be added automatically.</div><textarea value={paste} onChange={(e) => parsePaste(e.target.value)} placeholder={effectiveHeaders.join('\t')} className="min-h-40 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"/><div className="flex items-center justify-between text-xs text-slate-500"><span>{preview.length ? `${preview.length} row${preview.length === 1 ? '' : 's'} detected` : 'No rows detected yet'}</span><span>Preview is limited to 200 rows</span></div></div>
          )}

          {mode === 'paste' && preview.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"><div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">3. Preview before import</div><div className="max-h-64 overflow-auto"><table className="min-w-full text-left text-xs"><thead className="sticky top-0 bg-white dark:bg-slate-950"><tr>{effectiveHeaders.slice(0, Math.min(effectiveHeaders.length, 8)).map((h) => <th key={h} className="whitespace-nowrap border-b px-3 py-2 font-semibold text-slate-500">{h}</th>)}</tr></thead><tbody>{preview.slice(0, 20).map((row, i) => <tr key={i} className="border-b last:border-0 dark:border-slate-800">{effectiveHeaders.slice(0, Math.min(effectiveHeaders.length, 8)).map((_, j) => <td key={j} className="max-w-48 truncate px-3 py-2 text-slate-700 dark:text-slate-300">{/password/i.test(effectiveHeaders[j]) && row[j] ? '••••••••' : row[j] || '—'}</td>)}</tr>)}</tbody></table></div></div>}

          {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div>}

          {result && <div className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><p className="text-[11px] text-slate-500">Rows</p><p className="text-lg font-bold">{result.totalRows || successful + (result.failed || 0)}</p></div><div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/20"><p className="text-[11px] text-emerald-600">Created</p><p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{result.created || 0}</p></div><div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20"><p className="text-[11px] text-blue-600">Updated</p><p className="text-lg font-bold text-blue-700 dark:text-blue-300">{result.updated || 0}</p></div><div className="rounded-lg bg-red-50 p-3 dark:bg-red-950/20"><p className="text-[11px] text-red-600">Failed</p><p className="text-lg font-bold text-red-700 dark:text-red-300">{result.failed || 0}</p></div></div>{(result.errors?.length || 0) > 0 && <div className="overflow-x-auto rounded-lg border border-red-100 dark:border-red-900/40"><table className="min-w-full text-left text-xs"><thead className="bg-red-50 dark:bg-red-950/20"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Error</th></tr></thead><tbody>{result.errors!.map((e, i) => <tr key={`${e.row}-${i}`} className="border-t dark:border-red-900/30"><td className="px-3 py-2 font-semibold">{e.row || '—'}</td><td className="px-3 py-2 text-red-700 dark:text-red-300">{e.message || 'Import failed'}</td></tr>)}</tbody></table></div>}{successful > 0 && <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4"/>Import finished. The list has been refreshed.</p>}</div>}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-6"><button type="button" onClick={onClose} disabled={importing} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900">{result ? 'Done' : 'Cancel'}</button><button type="button" onClick={result ? startAnotherImport : submit} disabled={!canImport || importing} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{importing ? <><Loader2 className="h-4 w-4 animate-spin"/>Importing...</> : result ? 'Import Another File' : 'Import'}</button></div>
      </div>
    </div>
  );
}
