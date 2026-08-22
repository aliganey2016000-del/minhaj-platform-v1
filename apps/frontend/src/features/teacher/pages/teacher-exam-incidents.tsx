import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../lib/axios';

const TYPES = ['cheating', 'disruption', 'technical_issue', 'accommodation', 'other'];
const SEVERITIES = ['low', 'medium', 'high'];
interface Exam { _id: string; title: string; course?: { title?: { en?: string } } }
interface Incident { _id: string; exam?: { _id?: string; title?: string; course?: { title?: { en?: string } } }; student?: { studentId?: string; profile?: { firstName?: string; lastName?: string } }; type: string; severity: string; description: string; status: 'open' | 'resolved' | 'dismissed'; createdAt: string }

function Badge({ value, tone }: { value: string; tone?: 'severity' | 'status' }) {
  const c: Record<string, string> = tone === 'severity' ? { low: 'bg-blue-50 text-blue-700', medium: 'bg-amber-50 text-amber-700', high: 'bg-red-50 text-red-700' } : { open: 'bg-amber-50 text-amber-700', resolved: 'bg-emerald-50 text-emerald-700', dismissed: 'bg-slate-100 text-slate-600' };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${c[value] || 'bg-slate-100 text-slate-600'}`}>{value.replace('_', ' ')}</span>;
}

export function TeacherExamIncidents() {
  const [params] = useSearchParams();
  const [exams, setExams] = useState<Exam[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [examId, setExamId] = useState(params.get('exam') || '');
  const [type, setType] = useState('cheating');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [filter, setFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { const [e, i] = await Promise.all([api.get('/exams', { params: { limit: 200 } }), api.get('/exam-incidents')]); setExams(e.data.data || []); setIncidents(i.data.data || []); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to load incidents'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examId || !description.trim()) return;
    setSaving(true); setError(''); setMessage('');
    try { const { data } = await api.post('/exam-incidents', { exam: examId, type, severity, description: description.trim() }); setIncidents((p) => [data.data, ...p]); setDescription(''); setMessage('Incident reported successfully.'); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to report incident'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: 'resolved' | 'dismissed') => {
    try { const { data } = await api.patch(`/exam-incidents/${id}`, { status }); setIncidents((p) => p.map((i) => i._id === id ? data.data : i)); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to update incident'); }
  };

  const visible = useMemo(() => incidents.filter((i) => (filter === 'all' || i.status === filter) && `${i.exam?.title || ''} ${i.description} ${i.student?.profile?.firstName || ''} ${i.student?.profile?.lastName || ''}`.toLowerCase().includes(query.toLowerCase())), [incidents, filter, query]);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Exam Operations</p><h1 className="mt-1 text-3xl font-bold">Exam Incidents</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Report cheating, disruptions, technical issues, and accommodations.</p></div><button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30">{message}</div>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
          <form onSubmit={submit} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-amber-50 p-3 text-amber-600 dark:bg-amber-950/40"><AlertTriangle className="h-5 w-5" /></div><div><h2 className="font-bold">Report Incident</h2><p className="text-xs text-[var(--color-text-tertiary)]">Teacher-scoped exam reporting</p></div></div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold">Exam<select value={examId} onChange={(e) => setExamId(e.target.value)} required className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"><option value="">Select exam...</option>{exams.map((e) => <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en || ''}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold">Type<select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm capitalize">{TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></label><label className="block text-xs font-semibold">Severity<select value={severity} onChange={(e) => setSeverity(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm capitalize">{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label></div>
              <label className="block text-xs font-semibold">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={5} placeholder="Describe what happened..." className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /></label>
              <button disabled={saving || !examId} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Reporting...' : 'Report Incident'}</button>
            </div>
          </form>

          <section className="min-w-0 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search incidents..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-4 text-sm" /></div><div className="flex gap-2 overflow-x-auto">{['open', 'resolved', 'dismissed', 'all'].map((s) => <button key={s} onClick={() => setFilter(s)} className={`whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold capitalize ${filter === s ? 'bg-emerald-600 text-white' : 'border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}>{s}</button>)}</div></div>
            {loading ? <div className="flex min-h-[250px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600" /></div> : visible.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center text-sm text-[var(--color-text-tertiary)]"><CheckCircle2 className="mx-auto mb-3 h-8 w-8" />No incidents in this view.</div> : visible.map((i) => <article key={i._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{i.exam?.title || 'Exam'}</h3><Badge value={i.severity} tone="severity" /><Badge value={i.status} tone="status" /></div><p className="mt-2 text-sm text-[var(--color-text-secondary)]">{i.description}</p><p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{i.student ? `${i.student.profile?.firstName || ''} ${i.student.profile?.lastName || ''} · ${i.student.studentId || ''}` : 'Exam-wide incident'} · {new Date(i.createdAt).toLocaleString()}</p>{i.status === 'open' && <div className="mt-3 flex gap-2"><button onClick={() => updateStatus(i._id, 'resolved')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Resolve</button><button onClick={() => updateStatus(i._id, 'dismissed')} className="rounded-lg border px-3 py-2 text-xs font-semibold">Dismiss</button></div>}</article>)}
          </section>
        </div>
      </div>
    </div>
  );
}

export default TeacherExamIncidents;
