import { useEffect, useMemo, useState } from 'react';
import { FileCheck2, FileText, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';

interface Exam {
  _id: string; title: string; examDate?: string; paperStatus?: 'draft' | 'submitted' | 'approved' | 'rejected' | null;
  course?: { _id: string; title?: { en?: string }; class?: { title?: string; section?: string } };
}

function PaperStatus({ value }: { value?: string | null }) {
  const status = value || 'not started';
  const c: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    submitted: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    rejected: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    'not started': 'bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400',
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${c[status] || c['not started']}`}>{status}</span>;
}

export function TeacherExamPapers() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/exams', { params: { limit: 200 } }); setExams(data.data || []); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to load exam papers'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => exams.filter((e) => {
    const text = `${e.title} ${e.course?.title?.en || ''}`.toLowerCase();
    return (filter === 'all' || (e.paperStatus || 'not started') === filter) && text.includes(query.toLowerCase());
  }), [exams, filter, query]);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Teacher Portal</p><h1 className="mt-1 text-3xl font-bold">My Exam Papers</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Create, save as draft, and submit papers for review.</p></div>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exam or course..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-4 text-sm" /></div>
          <div className="flex gap-2 overflow-x-auto">{['all', 'not started', 'draft', 'submitted', 'approved', 'rejected'].map((s) => <button key={s} onClick={() => setFilter(s)} className={`whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs font-semibold capitalize ${filter === s ? 'bg-emerald-600 text-white' : 'border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}>{s}</button>)}</div>
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
        {loading ? <div className="flex min-h-[300px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600" /></div> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visible.map((exam) => <article key={exam._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
              <div className="flex items-start gap-4"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/40"><FileText className="h-6 w-6" /></div><div className="min-w-0 flex-1"><h2 className="truncate font-bold">{exam.title}</h2><p className="mt-1 truncate text-sm text-[var(--color-text-tertiary)]">{exam.course?.title?.en || 'Course'}</p><p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{exam.course?.class?.title}{exam.course?.class?.section ? ` (${exam.course.class.section})` : ''}{exam.examDate ? ` · ${new Date(exam.examDate).toLocaleDateString()}` : ''}</p></div><PaperStatus value={exam.paperStatus} /></div>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-4"><span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]"><FileCheck2 className="h-4 w-4" /> Paper workspace</span><Link to={`/teacher/exams/${exam._id}/paper`} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white">Open Paper</Link></div>
            </article>)}
            {visible.length === 0 && <div className="lg:col-span-2 rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center text-sm text-[var(--color-text-tertiary)]">No exam papers match this filter.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherExamPapers;
