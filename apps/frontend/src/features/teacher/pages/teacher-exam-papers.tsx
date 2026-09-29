import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileText,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';
import { TeacherExamWorkflowNav } from '../components/teacher-exam-workflow-nav';

interface Exam {
  _id: string;
  title: string;
  examDate?: string;
  paperStatus?: 'draft' | 'submitted' | 'approved' | 'rejected' | null;
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
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${c[status] || c['not started']}`}>{status}</span>;
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
  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => {
    const value = (status: string) => exams.filter(e => (e.paperStatus || 'not started') === status).length;
    return {
      action: exams.filter(e => !e.paperStatus || e.paperStatus === 'draft' || e.paperStatus === 'rejected').length,
      submitted: value('submitted'),
      approved: value('approved'),
      rejected: value('rejected'),
    };
  }, [exams]);

  const visible = useMemo(() => exams.filter((e) => {
    const text = `${e.title} ${e.course?.title?.en || ''} ${e.course?.class?.title || ''}`.toLowerCase();
    return (filter === 'all' || (e.paperStatus || 'not started') === filter) && text.includes(query.trim().toLowerCase());
  }), [exams, filter, query]);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-16 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Teacher Exam Operations</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">My Exam Papers</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-tertiary)]">Prepare the paper for each assigned exam, save drafts, submit for review, and respond to admin feedback.</p>
          </div>
          <button onClick={()=>void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>

        <TeacherExamWorkflowNav />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Need Action', counts.action, FileText, 'text-amber-600 bg-amber-50 dark:bg-amber-950/20'],
            ['Under Review', counts.submitted, FileCheck2, 'text-blue-600 bg-blue-50 dark:bg-blue-950/20'],
            ['Approved', counts.approved, CheckCircle2, 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20'],
            ['Rejected', counts.rejected, TriangleAlert, 'text-red-600 bg-red-50 dark:bg-red-950/20'],
          ].map(([label,value,Icon,tone]:any)=><div key={label} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div><div className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5"/></div></div></div>)}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exam, course or class..." className="min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {['all', 'not started', 'draft', 'submitted', 'approved', 'rejected'].map((s) => <button key={s} onClick={() => setFilter(s)} className={`min-h-11 whitespace-nowrap rounded-xl px-3.5 text-xs font-bold capitalize ${filter === s ? 'bg-emerald-600 text-white' : 'border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}>{s}</button>)}
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600 dark:border-red-900/50 dark:bg-red-950/30">{error}</div>}

        {loading ? <div className="flex min-h-[300px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600" /></div> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((exam) => {
              const status=exam.paperStatus||'not started';
              const cta=status==='approved'?'View Approved Paper':status==='submitted'?'View Submission':status==='rejected'?'Fix & Resubmit':status==='draft'?'Continue Draft':'Create Paper';
              return <Link key={exam._id} to={`/teacher/exams/${exam._id}/paper`} className="group overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/40"><FileText className="h-6 w-6" /></div>
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words font-black">{exam.title}</h2>
                      <p className="mt-1 truncate text-sm text-[var(--color-text-tertiary)]">{exam.course?.title?.en || 'Course'}</p>
                      <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{exam.course?.class?.title || 'Class'}{exam.course?.class?.section ? ` · ${exam.course.class.section}` : ''}{exam.examDate ? ` · ${new Date(exam.examDate).toLocaleDateString(undefined,{day:'numeric',month:'short'})}` : ''}</p>
                    </div>
                    <PaperStatus value={exam.paperStatus} />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]/50 px-4 py-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 sm:px-5">
                  <span>{cta}</span><ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5"/>
                </div>
              </Link>;
            })}
            {visible.length === 0 && <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">No exam papers match this filter.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherExamPapers;
