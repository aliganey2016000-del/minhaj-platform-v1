import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';
import { cacheTeacherExamPeriods, getCachedTeacherExamPeriods } from '../../../lib/teacher-offline-exams';
import { TeacherExamOfflineStatus } from '../components/teacher-exam-offline-status';

interface ExamPeriod {
  _id: string;
  name: string;
  academicYear: string;
  term?: string;
  startDate?: string;
  endDate?: string;
  status: 'draft' | 'published' | 'closed';
}

interface TeacherExam {
  _id: string;
  period?: string | { _id?: string };
}

const periodIdOf = (exam: TeacherExam) =>
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
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return 'Dates not set';
};

export function TeacherExams() {
  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [exams, setExams] = useState<TeacherExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usingOfflineData, setUsingOfflineData] = useState(false);

  const load = async () => {
    setError('');
    // Show the saved snapshot immediately and refresh it in the background,
    // so opening this page never waits on a slow connection.
    const cached = await getCachedTeacherExamPeriods<{ periods?: ExamPeriod[]; exams?: TeacherExam[]; cachedAt?: number }>().catch(() => undefined);
    if (cached) {
      setPeriods((cached.periods || []).filter((period) => period.status === 'published'));
      setExams(cached.exams || []);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const [periodResponse, examResponse] = await Promise.all([
        api.get('/exams/periods'),
        api.get('/exams', { params: { limit: 200 } }),
      ]);
      const publishedPeriods = (periodResponse.data?.data || []).filter((period: ExamPeriod) => period.status === 'published');
      const nextExams = examResponse.data?.data || [];
      setPeriods(publishedPeriods);
      setExams(nextExams);
      setUsingOfflineData(false);
      await cacheTeacherExamPeriods({ periods: publishedPeriods, exams: nextExams, cachedAt: Date.now() }).catch(() => undefined);
    } catch (err: any) {
      if (cached) {
        setUsingOfflineData(true);
        setError('');
      } else {
        setError(err?.response?.data?.message || 'No saved exam periods are available. Connect once and open this page to prepare the exam portal for offline use.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const paperCountByPeriod = useMemo(() => {
    const counts = new Map<string, number>();
    exams.forEach((exam) => {
      const periodId = periodIdOf(exam);
      if (periodId) counts.set(periodId, (counts.get(periodId) || 0) + 1);
    });
    return counts;
  }, [exams]);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-3 sm:p-6 sm:pt-6 lg:p-8">
      <main className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <header>
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600">
            <ShieldCheck className="h-4 w-4" />
            Teacher Exam Operations
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Exam Periods</h1>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        <TeacherExamOfflineStatus />
        {usingOfflineData && (
          <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Offline mode: showing published exam periods and assignments saved on this device. Open each period while online and use “Prepare for offline” to cache its full workspace.
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
          <div className="border-b border-[var(--color-border-subtle)] p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Published Exams</h2>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Only exam periods published by administration are visible here.</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-emerald-600" />
            </div>
          ) : periods.length === 0 ? (
            <div className="p-10 text-center">
              <CalendarClock className="mx-auto h-10 w-10 text-[var(--color-text-tertiary)]" />
              <h3 className="mt-3 font-bold text-[var(--color-text-primary)]">No published exam periods</h3>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">When administration publishes an exam period, it will appear here automatically.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {periods.map((period) => {
                const paperCount = paperCountByPeriod.get(period._id) || 0;
                return (
                  <Link
                    key={period._id}
                    to={`/teacher/exams/periods/${period._id}`}
                    className="group flex items-center gap-3 p-3 transition-colors hover:bg-[var(--color-surface-secondary)] sm:gap-4 sm:p-4"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
                      <CalendarClock className="h-6 w-6" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-bold text-[var(--color-text-primary)]">{period.name}</span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Published</span>
                      </span>
                      <span className="mt-1 block text-xs text-[var(--color-text-tertiary)]">
                        {period.academicYear}{period.term ? ` · ${period.term}` : ''} · {formatRange(period)}
                      </span>
                      <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                        <BookOpenCheck className="h-3.5 w-3.5" />
                        {paperCount} course exam{paperCount === 1 ? '' : 's'} assigned to you
                      </span>
                    </span>

                    <span className="hidden shrink-0 items-center gap-1 text-xs font-bold text-primary-700 sm:flex dark:text-primary-300">
                      Open
                      <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[var(--color-text-tertiary)] sm:hidden" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default TeacherExams;
