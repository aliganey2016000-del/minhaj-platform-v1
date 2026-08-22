import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ClipboardCheck, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';

interface Exam {
  _id: string;
  title: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  status: string;
  course?: { title?: { en?: string }; class?: { title?: string; section?: string } };
}

export function TeacherExamAttendance() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/exams', { params: { limit: 200 } });
      setExams(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load exams');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => exams.filter((e) => `${e.title} ${e.course?.title?.en || ''}`.toLowerCase().includes(query.toLowerCase())), [exams, query]);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Exam Operations</p>
            <h1 className="mt-1 text-3xl font-bold">Exam Attendance</h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Choose an exam to open its full participant roster.</p>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exam or course..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-4 text-sm" />
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
        {loading ? <div className="flex min-h-[300px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600" /></div> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((exam) => (
              <Link key={exam._id} to={`/teacher/exams/${exam._id}/attendance`} className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/40"><ClipboardCheck className="h-6 w-6" /></div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-bold">{exam.title}</h2>
                    <p className="mt-1 truncate text-sm text-[var(--color-text-tertiary)]">{exam.course?.title?.en || 'Course'}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--color-text-tertiary)]"><span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{exam.examDate ? new Date(exam.examDate).toLocaleDateString() : 'No date'}</span><span>{exam.startTime || '—'}{exam.endTime ? `–${exam.endTime}` : ''}</span></div>
                  </div>
                  <span className="text-lg text-[var(--color-text-tertiary)] group-hover:text-emerald-600">→</span>
                </div>
              </Link>
            ))}
            {visible.length === 0 && <div className="sm:col-span-2 rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center text-sm text-[var(--color-text-tertiary)]">No exams found.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherExamAttendance;
