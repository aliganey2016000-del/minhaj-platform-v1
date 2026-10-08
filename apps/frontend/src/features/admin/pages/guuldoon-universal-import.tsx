import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileArchive,
  FileSpreadsheet,
  History,
  Loader2,
  UploadCloud,
} from 'lucide-react';
import api from '../../../lib/axios';

type Issue = {
  sheet: string;
  row: number;
  id?: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
};

type Validation = {
  batchId: string;
  valid: boolean;
  canImportValidRows: boolean;
  summary: Record<string, { total: number; valid: number; errors: number; warnings: number }>;
  preview: any;
  errors: Issue[];
  warnings: Issue[];
  errorCount: number;
  warningCount: number;
  expiresAt: string;
};

type ImportResult = {
  batchId: string;
  created: Record<string, number>;
  updated: Record<string, number>;
  skipped: number;
  imagesUploaded: number;
  errors: Issue[];
  warnings: Issue[];
};

export function GuuldoonUniversalImport() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [excel, setExcel] = useState<File | null>(null);
  const [figures, setFigures] = useState<File | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [filter, setFilter] = useState('All');
  const [busy, setBusy] = useState<'validate' | 'commit' | 'download' | ''>('');
  const [error, setError] = useState('');

  const makeForm = (batchId?: string) => {
    const form = new FormData();
    if (excel) form.append('excel', excel);
    if (figures) form.append('figures', figures);
    if (batchId) form.append('batchId', batchId);
    return form;
  };

  const loadHistory = useCallback(async () => {
    if (!courseId) return;
    try {
      const { data } = await api.get(`/guuldoon/admin/import/courses/${courseId}/history`);
      setHistory(data.data || []);
    } catch {
      setHistory([]);
    }
  }, [courseId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = async () => {
    setBusy('download');
    setError('');
    try {
      const response = await api.get('/guuldoon/admin/import/template', { responseType: 'blob' });
      downloadBlob(response.data, 'Guuldoon_Universal_Import_Template.xlsx');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Template-ka lama soo dejin karin.');
    } finally {
      setBusy('');
    }
  };

  const validate = async () => {
    if (!courseId || !excel) {
      setError('Dooro Guuldoon_Universal_Import_Template.xlsx marka hore.');
      return;
    }
    setBusy('validate');
    setError('');
    setValidation(null);
    setResult(null);
    try {
      const { data } = await api.post(
        `/guuldoon/admin/import/courses/${courseId}/validate`,
        makeForm(),
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setValidation(data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Validation-ka import-ka wuu fashilmay.');
    } finally {
      setBusy('');
    }
  };

  const commit = async () => {
    if (!courseId || !validation || !excel) return;
    setBusy('commit');
    setError('');
    try {
      const { data } = await api.post(
        `/guuldoon/admin/import/courses/${courseId}/commit`,
        makeForm(validation.batchId),
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setResult(data.data);
      await loadHistory();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import-ka lama commit-gareyn karin.');
    } finally {
      setBusy('');
    }
  };

  const downloadErrors = async (batchId: string) => {
    setBusy('download');
    try {
      const response = await api.get(`/guuldoon/admin/import/batches/${batchId}/errors`, { responseType: 'blob' });
      downloadBlob(response.data, `Guuldoon_Import_Errors_${batchId}.xlsx`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error report-ka lama soo dejin karin.');
    } finally {
      setBusy('');
    }
  };

  const issues = useMemo(() => {
    const all = [...(validation?.errors || []), ...(validation?.warnings || [])];
    if (filter === 'All') return all;
    if (filter === 'Errors') return all.filter(item => item.severity === 'error');
    if (filter === 'Warnings') return all.filter(item => item.severity === 'warning');
    return all.filter(item => item.sheet === filter);
  }, [validation, filter]);

  const steps = [
    ['1', 'Upload', !!excel],
    ['2', 'Validate', !!validation],
    ['3', 'Review', !!validation],
    ['4', 'Import', !!result],
    ['5', 'Complete', !!result],
  ] as const;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate(`/admin/global-courses/${courseId}/guuldoon-builder`)} className="mb-2 inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-tertiary)]">
            <ArrowLeft size={15} /> Guuldoon Builder
          </button>
          <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-600">Guuldoon only</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">Universal Course Import</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
            Hal Excel ayaa ku soo gelinaya Subject, Chapters, Exams, Resources, Questions iyo Glossary. Import-ku waa upsert-only; xog aan Excel-ka ku jirin lama tirtiro, Course Builder-ka caadiga ahna lama taabto.
          </p>
        </div>
        <button onClick={() => void downloadTemplate()} disabled={busy === 'download'} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-black text-emerald-700 disabled:opacity-50">
          <Download size={17} /> Download Universal Template
        </button>
      </header>

      <div className="grid grid-cols-5 gap-2 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3">
        {steps.map(([number, label, done]) => (
          <div key={number} className="text-center">
            <div className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${done ? 'bg-emerald-600 text-white' : 'bg-[var(--color-surface-tertiary)]'}`}>
              {done ? <CheckCircle2 size={16} /> : number}
            </div>
            <p className="mt-1 text-[10px] font-bold sm:text-xs">{label}</p>
          </div>
        ))}
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500"><AlertCircle className="mr-2 inline" size={17} />{error}</div>}

      <section className="grid gap-4 lg:grid-cols-2">
        <label className="cursor-pointer rounded-2xl border border-dashed border-emerald-500/40 bg-[var(--color-surface-primary)] p-5 transition hover:bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-emerald-500/10 p-3 text-emerald-600"><FileSpreadsheet size={24} /></span>
            <div className="min-w-0">
              <p className="font-black">Course Excel</p>
              <p className="truncate text-xs text-[var(--color-text-tertiary)]">{excel?.name || 'Guuldoon_Universal_Import_Template.xlsx'}</p>
            </div>
          </div>
          <input type="file" accept=".xlsx" className="sr-only" onChange={event => { setExcel(event.target.files?.[0] || null); setValidation(null); setResult(null); }} />
        </label>

        <label className="cursor-pointer rounded-2xl border border-dashed border-blue-500/30 bg-[var(--color-surface-primary)] p-5 transition hover:bg-blue-500/5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-blue-500/10 p-3 text-blue-500"><FileArchive size={24} /></span>
            <div className="min-w-0">
              <p className="font-black">Figures ZIP <span className="text-xs font-normal text-[var(--color-text-tertiary)]">(optional)</span></p>
              <p className="truncate text-xs text-[var(--color-text-tertiary)]">{figures?.name || 'Sawirrada figure_files'}</p>
            </div>
          </div>
          <input type="file" accept=".zip" className="sr-only" onChange={event => { setFigures(event.target.files?.[0] || null); setValidation(null); setResult(null); }} />
        </label>
      </section>

      {!validation && (
        <button onClick={() => void validate()} disabled={!excel || busy === 'validate'} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3.5 text-sm font-black text-white disabled:opacity-50 sm:w-auto">
          {busy === 'validate' ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
          {busy === 'validate' ? 'Waa la hubinayaa...' : 'Validate Workbook'}
        </button>
      )}

      {validation && !result && (
        <>
          <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">Validation Summary</h2>
                <p className="text-xs text-[var(--color-text-secondary)]">{validation.errorCount} errors · {validation.warningCount} warnings. Safafka saxda ah waa la import-gareyn karaa xitaa haddii safaf kale khaldan yihiin.</p>
              </div>
              {(validation.errorCount > 0 || validation.warningCount > 0) && <button onClick={() => void downloadErrors(validation.batchId)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><Download size={15} /> Error Report</button>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(validation.summary).map(([sheet, value]) => (
                <div key={sheet} className="rounded-xl border border-[var(--color-border-subtle)] p-4">
                  <p className="font-black">{sheet}</p>
                  <div className="mt-2 flex gap-4 text-xs"><span className="text-emerald-600">Valid {value.valid}</span><span className="text-red-500">Errors {value.errors}</span><span className="text-amber-500">Warnings {value.warnings}</span></div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
            <h2 className="text-lg font-black">Preview</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-emerald-500/10 p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Subject</p><p className="font-black">{validation.preview?.subject?.name || '—'} · Grade {validation.preview?.subject?.grade || '—'}</p></div>
              <div className="rounded-xl bg-blue-500/10 p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Chapters</p><p className="text-2xl font-black">{validation.preview?.chapters || 0}</p></div>
              <div className="rounded-xl bg-violet-500/10 p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Questions</p><p className="text-2xl font-black">{validation.preview?.questions || 0}</p></div>
              <div className="rounded-xl bg-amber-500/10 p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Figures matched</p><p className="text-2xl font-black">{validation.preview?.figuresMatched || 0}/{validation.preview?.figuresReferenced || 0}</p></div>
            </div>
            <div className="mt-3 text-xs text-[var(--color-text-secondary)]">Exams: {(validation.preview?.exams || []).join(', ') || '—'} · Resources: {validation.preview?.resources || 0} · Glossary: {validation.preview?.glossary || 0} · Verified: {validation.preview?.verifiedAnswers || 0} · Pending: {validation.preview?.pendingAnswers || 0}</div>
          </section>

          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
              <div className="flex flex-wrap gap-2">
                {['All','Errors','Warnings','Subjects','Chapters','Exams','Resources','Questions','Glossary'].map(item => <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === item ? 'bg-emerald-700 text-white' : 'border border-[var(--color-border-default)]'}`}>{item}</button>)}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead><tr className="border-b"><th className="p-2">Type</th><th className="p-2">Sheet</th><th className="p-2">Row</th><th className="p-2">ID</th><th className="p-2">Field</th><th className="p-2">Reason</th></tr></thead>
                  <tbody>{issues.slice(0, 250).map((item, index) => <tr key={`${item.sheet}-${item.row}-${index}`} className="border-b border-[var(--color-border-subtle)]"><td className={`p-2 font-black ${item.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}>{item.severity}</td><td className="p-2">{item.sheet}</td><td className="p-2">{item.row}</td><td className="p-2">{item.id || '—'}</td><td className="p-2">{item.field || '—'}</td><td className="p-2">{item.message}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}

          <div className="flex flex-wrap gap-3">
            <button onClick={() => void commit()} disabled={!validation.canImportValidRows || busy === 'commit'} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
              {busy === 'commit' ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
              {busy === 'commit' ? 'Importing...' : 'Import Valid Rows'}
            </button>
            <button onClick={() => { setValidation(null); setResult(null); }} className="rounded-2xl border px-5 py-3 text-sm font-bold">Choose Different Files</button>
          </div>
        </>
      )}

      {result && (
        <section className="rounded-[28px] border border-emerald-500/30 bg-emerald-500/10 p-6">
          <div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-600" size={30} /><div><h2 className="text-xl font-black">Import Completed</h2><p className="text-sm text-[var(--color-text-secondary)]">Batch {result.batchId}</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-[var(--color-surface-primary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Created</p><p className="text-2xl font-black">{Object.values(result.created || {}).reduce((a: number, b) => a + Number(b), 0)}</p></div>
            <div className="rounded-xl bg-[var(--color-surface-primary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Updated</p><p className="text-2xl font-black">{Object.values(result.updated || {}).reduce((a: number, b) => a + Number(b), 0)}</p></div>
            <div className="rounded-xl bg-[var(--color-surface-primary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Skipped</p><p className="text-2xl font-black">{result.skipped || 0}</p></div>
          </div>
          <p className="mt-4 text-sm">Images uploaded: <strong>{result.imagesUploaded || 0}</strong></p>
          <div className="mt-5 flex flex-wrap gap-3"><button onClick={() => navigate('/admin/global-courses')} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white">View Courses</button><button onClick={() => void downloadErrors(result.batchId)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">Download Error Report</button></div>
        </section>
      )}

      {history.length > 0 && (
        <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
          <div className="flex items-center gap-2"><History size={19} className="text-emerald-600" /><h2 className="font-black">Import History</h2></div>
          <div className="mt-3 space-y-2">{history.slice(0, 8).map(item => <div key={item._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border-subtle)] p-3 text-xs"><div><p className="font-bold">{item.filename}</p><p className="text-[var(--color-text-tertiary)]">{new Date(item.createdAt).toLocaleString()}</p></div><span className={`rounded-full px-2.5 py-1 font-bold ${item.status === 'committed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>{item.status}</span></div>)}</div>
        </section>
      )}
    </div>
  );
}
