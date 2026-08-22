import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ClipboardCheck, FileText, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';
import { toTitleCase } from '../../../lib/format';

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

function effectiveStatus(exam: Exam) {
  if (exam.status === 'cancelled' || exam.status === 'completed') return exam.status;
  if (!exam.examDate || !exam.startTime || !exam.endTime) return exam.status;
  const day = new Date(exam.examDate).toISOString().slice(0, 10);
  const start = new Date(`${day}T${exam.startTime}`);
  const end = new Date(`${day}T${exam.endTime}`);
  const now = new Date();
  if (now >= start && now <= end) return 'ongoing';
  if (now > end) return 'completed';
  return 'scheduled';
}

function Status({ value }: { value: string }) {
  const classes: Record<string, string> = {
    scheduled: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    ongoing: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    completed: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${classes[value] || classes.scheduled}`}>{value}</span>;
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
      setExams(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load exam schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => exams.filter((exam) => {
    const status = effectiveStatus(exam);
    const text = `${exam.title} ${exam.course?.title?.en || ''} ${exam.room || ''}`.toLowerCase();
    return (filter === 'all' || status === filter) && text.includes(query.toLowerCase());
  }), [exams, filter, query]);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Teacher Portal</p>
            <h1 className="mt-1 text-3xl font-bold text-[var(--color-text-primary)]">Exam Schedule</h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Exams scheduled for your assigned courses.</p>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-tertiary)] disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exam, course, room..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {['all', 'scheduled', 'ongoing', 'completed'].map((item) => (
              <button key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold capitalize ${filter === item ? 'bg-emerald-600 text-white' : 'border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)]'}`}>{item}</button>
            ))}
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30">{error}</div>}

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600" /></div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-12 text-center text-[var(--color-text-tertiary)]"><CalendarDays className="mx-auto mb-3 h-10 w-10" /><p className="font-semibold">No exams found</p><p className="mt-1 text-sm">Your assigned exam schedule will appear here.</p></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visible.map((exam) => {
              const status = effectiveStatus(exam);
              return (
                <article key={exam._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{exam.course?.title?.en || 'Course'}</p>
                      <h2 className="mt-1 truncate text-lg font-bold text-[var(--color-text-primary)]">{toTitleCase(exam.title)}</h2>
                      <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{exam.course?.class?.title}{exam.course?.class?.section ? ` (${exam.course.class.section})` : ''}</p>
                    </div>
                    <Status value={status} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-[var(--color-text-tertiary)]">Date</p><p className="font-semibold">{exam.examDate ? new Date(exam.examDate).toLocaleDateString() : '—'}</p></div>
                    <div><p className="text-xs text-[var(--color-text-tertiary)]">Time</p><p className="font-semibold">{exam.startTime || '—'}{exam.endTime ? `–${exam.endTime}` : ''}</p></div>
                    <div><p className="text-xs text-[var(--color-text-tertiary)]">Marks</p><p className="font-semibold">{exam.totalMarks}</p></div>
                    <div><p className="text-xs text-[var(--color-text-tertiary)]">Room</p><p className="font-semibold truncate">{exam.room || '—'}</p></div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--color-border-subtle)] pt-4">
                    <Link to={`/teacher/exams/${exam._id}/attendance`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><ClipboardCheck className="h-4 w-4" /> Attendance</Link>
                    <Link to={`/teacher/exams/${exam._id}/paper`} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold"><FileText className="h-4 w-4" /> Paper</Link>
                    <Link to={`/teacher/exam-incidents?exam=${exam._id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold"><TriangleAlert className="h-4 w-4" /> Incidents</Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherExams;
