import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ClipboardEdit,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';

interface ExamPeriod {
  _id: string;
  name: string;
  academicYear: string;
  term?: string;
  startDate?: string;
  endDate?: string;
  status: 'draft' | 'published' | 'closed';
}

interface ExamBrief {
  _id: string;
  period?: string | { _id?: string };
}

const periodIdOf = (exam: ExamBrief) =>
  typeof exam.period === 'string' ? exam.period : String(exam.period?._id || '');

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatRange = (period: ExamPeriod) => {
  const start = formatDate(period.startDate);
  const end = formatDate(period.endDate);
  if (start && end) return `${start} – ${end}`;
  return start || end || 'Dates not set';
};

const statusTone: Record<ExamPeriod['status'], string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  closed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function MarksEntryPeriods() {
  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | ExamPeriod['status']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [periodResponse, examResponse] = await Promise.all([
        api.get('/exams/periods'),
        api.get('/exams', { params: { limit: 200 } }),
      ]);
      setPeriods(periodResponse.data?.data || []);
      setExams(examResponse.data?.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load exam periods for marks entry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const paperCountByPeriod = useMemo(() => {
    const counts = new Map<string, number>();
    exams.forEach((exam) => {
      const id = periodIdOf(exam);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    return counts;
  }, [exams]);

  const years = useMemo(
    () => Array.from(new Set(periods.map((period) => period.academicYear).filter(Boolean))),
    [periods],
  );

  const [academicYear, setAcademicYear] = useState('all');

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return periods.filter((period) => {
      if (status !== 'all' && period.status !== status) return false;
      if (academicYear !== 'all' && period.academicYear !== academicYear) return false;
      if (!text) return true;
      return [period.name, period.academicYear, period.term]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    });
  }, [periods, query, status, academicYear]);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-16 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <main className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-600">
              <ClipboardEdit className="h-4 w-4" />
              Exam Management
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Marks Entry</h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--color-text-tertiary)]">
              Select an exam period first. Then enter marks course by course with exam attendance visible beside the students.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2 text-sm font-bold text-[var(--color-text-secondary)] shadow-sm transition hover:bg-[var(--color-surface-tertiary)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm sm:p-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search exams..."
                className="min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] pl-10 pr-3 text-sm outline-none transition focus:border-emerald-500"
              />
            </label>
            <select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              className="min-h-11 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-sm font-semibold text-[var(--color-text-secondary)] outline-none"
            >
              <option value="all">All academic years</option>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className="min-h-11 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 text-sm font-semibold text-[var(--color-text-secondary)] outline-none"
            >
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-emerald-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-[var(--color-text-tertiary)]" />
            <h2 className="mt-3 font-black text-[var(--color-text-primary)]">No exam periods found</h2>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Create an exam period in Exam Operations, then it will appear here.</p>
          </div>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((period, index) => {
              const paperCount = paperCountByPeriod.get(period._id) || 0;
              const tone = index % 3 === 0
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                : index % 3 === 1
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                  : 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300';
              return (
                <Link
                  key={period._id}
                  to={`/admin/results/enter/${period._id}`}
                  className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
                      <CalendarDays className="h-5 w-5" />
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black capitalize ${statusTone[period.status]}`}>
                      {period.status}
                    </span>
                  </div>
                  <h2 className="mt-4 truncate text-lg font-black text-[var(--color-text-primary)]">{period.name}</h2>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                    {period.academicYear}{period.term ? ` · ${period.term}` : ''} · {formatRange(period)}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-text-secondary)]">
                      <BookOpenCheck className="h-4 w-4" />
                      {paperCount} course exam{paperCount === 1 ? '' : 's'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-600">
                      Open marks
                      <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}

export default MarksEntryPeriods;
