import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileText,
  ListChecks,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';
import { toTitleCase } from '../../../lib/format';
import { TeacherExamWorkflowNav } from '../components/teacher-exam-workflow-nav';

interface Exam {
  _id: string;
  title: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  room?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  paperStatus?: 'draft' | 'submitted' | 'approved' | 'rejected' | null;
  course?: { _id: string; title?: { en?: string }; class?: { title?: string; section?: string } };
}


const dayKey = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
};

function effectiveStatus(exam: Exam) {
  if (exam.status === 'cancelled') return 'cancelled';
  if (!exam.examDate || !exam.startTime || !exam.endTime) return exam.status;
  const day = dayKey(exam.examDate);
  const start = new Date(`${day}T${exam.startTime}:00`);
  const end = new Date(`${day}T${exam.endTime}:00`);
  const now = new Date();
  if (now >= start && now <= end) return 'ongoing';
  if (now > end) return 'completed';
  return 'scheduled';
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function Status({ value }: { value: string }) {
  const classes: Record<string, string> = {
    scheduled: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    ongoing: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    completed: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${classes[value] || classes.scheduled}`}>{value}</span>;
}

function PaperStatus({ value }: { value?: Exam['paperStatus'] }) {
  const status = value || 'not started';
  const classes: Record<string, string> = {
    'not started': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    submitted: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    rejected: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  };
  return <span className={`rounded-full px-2 py-1 text-[10px] font-bold capitalize ${classes[status]}`}>Paper: {status}</span>;
}

export function TeacherExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/exams', { params: { limit: 200 } });
      setExams(data?.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load your exam workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => exams.filter((exam) => {
    const status = effectiveStatus(exam);
    const text = `${exam.title} ${exam.course?.title?.en || ''} ${exam.course?.class?.title || ''} ${exam.room || ''}`.toLowerCase();
    return (filter === 'all' || status === filter) && text.includes(query.trim().toLowerCase());
  }).sort((a, b) => {
    const da = new Date(a.examDate || 0).getTime();
    const db = new Date(b.examDate || 0).getTime();
    return da - db || String(a.startTime || '').localeCompare(String(b.startTime || ''));
  }), [exams, filter, query]);

  const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm';

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-16 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Teacher Exam Operations
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Exam Workspace</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-tertiary)]">
              One place for your exam schedule, paper preparation, invigilation, attendance, incidents, and results.
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-tertiary)] disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <TeacherExamWorkflowNav />

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600 dark:border-red-900/50 dark:bg-red-950/30">{error}</div>}

        <section className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="text-lg font-bold">My Exam Schedule</h2><p className="text-xs text-[var(--color-text-tertiary)]">Only exams linked to your assigned courses appear here.</p></div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exam, course, class..." className="min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {['all', 'scheduled', 'ongoing', 'completed'].map((item) => (
                  <button key={item} onClick={() => setFilter(item)} className={`min-h-11 whitespace-nowrap rounded-xl px-3.5 text-xs font-bold capitalize ${filter === item ? 'bg-emerald-600 text-white' : 'border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)]'}`}>{item}</button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600" /></div>
          ) : visible.length === 0 ? (
            <div className={card + ' p-10 text-center text-[var(--color-text-tertiary)]'}><CalendarDays className="mx-auto mb-3 h-9 w-9" /><p className="font-bold text-[var(--color-text-primary)]">No exams found</p><p className="mt-1 text-sm">Your assigned exam schedule will appear here.</p></div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visible.map((exam) => {
                const status = effectiveStatus(exam);
                return (
                  <article key={exam._id} className={card + ' overflow-hidden'}>
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold uppercase tracking-wide text-emerald-600">{exam.course?.title?.en || 'Course'}</p>
                          <h3 className="mt-1 break-words text-lg font-black">{toTitleCase(exam.title)}</h3>
                          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{exam.course?.class?.title || 'Class'}{exam.course?.class?.section ? ` · ${exam.course.class.section}` : ''}</p>
                        </div>
                        <Status value={status} />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Date</p><p className="mt-1 text-sm font-bold">{formatDate(exam.examDate)}</p></div>
                        <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Time</p><p className="mt-1 text-sm font-bold">{exam.startTime || '—'}{exam.endTime ? `–${exam.endTime}` : ''}</p></div>
                        <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Marks</p><p className="mt-1 text-sm font-bold">{exam.totalMarks || '—'}</p></div>
                        <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Room</p><p className="mt-1 truncate text-sm font-bold">{exam.room || 'By allocation'}</p></div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <PaperStatus value={exam.paperStatus} />
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]"><Users className="h-3.5 w-3.5" /> {exam.course?.class?.title || 'Assigned class'}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]/40 p-3 sm:px-5">
                      <Link to={`/teacher/exams/${exam._id}/paper`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><FileText className="h-4 w-4" /> Paper</Link>
                      <Link to={`/teacher/exams/${exam._id}/attendance`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs font-bold"><ClipboardCheck className="h-4 w-4" /> Course Roster</Link>
                      <Link to={`/teacher/exam-incidents?exam=${exam._id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs font-bold"><TriangleAlert className="h-4 w-4" /> Incident</Link>
                      <Link to="/teacher/results/enter" className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs font-bold"><ListChecks className="h-4 w-4" /> Results</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 text-xs text-[var(--color-text-tertiary)]">
          <Building2 className="h-4 w-4 text-emerald-600" />
          <span>Invigilation room assignments are controlled by Exam Operations. You only see rooms specifically assigned to you.</span>
        </div>
      </div>
    </div>
  );
}

export default TeacherExams;
