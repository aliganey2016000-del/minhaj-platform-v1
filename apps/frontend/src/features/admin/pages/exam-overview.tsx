import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, CalendarClock, CheckCircle2, FileCheck2, GraduationCap } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface School { _id: string; name: string; status?: string; }
interface Exam {
  _id: string;
  title: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  autoSchedule?: boolean;
  resultsPublished?: boolean;
  paperStatus?: 'draft' | 'submitted' | 'approved' | 'rejected' | null;
  course?: {
    title?: { en?: string };
    enrolledStudents?: unknown[];
    class?: { title?: string; section?: string };
  };
}

function effectiveStatus(exam: Exam): Exam['status'] {
  if (exam.status === 'cancelled' || exam.status === 'completed') return exam.status;
  if (exam.autoSchedule || !exam.examDate || !exam.startTime || !exam.endTime) return exam.status;
  const day = new Date(exam.examDate).toISOString().split('T')[0];
  const now = new Date();
  const start = new Date(day + 'T' + exam.startTime);
  const end = new Date(day + 'T' + exam.endTime);
  if (now >= start && now <= end) return 'ongoing';
  if (now > end) return 'completed';
  return 'scheduled';
}

function className(exam: Exam): string {
  const c = exam.course?.class;
  if (!c?.title) return '—';
  return c.section ? c.title + ' - ' + c.section : c.title;
}

function examDate(exam: Exam): string {
  if (exam.autoSchedule || !exam.examDate) return 'Automatic';
  return new Date(exam.examDate).toLocaleDateString();
}

function badge(text: string, tone: 'green' | 'amber' | 'red' | 'blue' | 'slate') {
  const tones = {
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
  return <span className={'inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ' + tones[tone]}>{text}</span>;
}

export function ExamOverview() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const [schools, setSchools] = useState<School[]>([]);
  const [school, setSchool] = useState('');
  const [exams, setExams] = useState<Exam[]>([]);
  const [resultCounts, setResultCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.get('/schools', { params: { limit: 100 } })
      .then(({ data }) => setSchools((data.data || []).filter((s: School) => s.status === 'active')))
      .catch(() => setSchools([]));
  }, [isSuperAdmin]);

  const load = useCallback(async () => {
    if (isSuperAdmin && !school) {
      setExams([]);
      setResultCounts({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = { limit: 200 };
      if (school) params.school = school;
      const { data } = await api.get('/exams', { params });
      const rows: Exam[] = data.data || [];
      setExams(rows);

      const pairs = await Promise.all(rows.map(async (exam) => {
        try {
          const response = await api.get('/results', { params: { examId: exam._id, limit: 1 } });
          return [exam._id, Number(response.data?.meta?.total || 0)] as const;
        } catch {
          return [exam._id, 0] as const;
        }
      }));
      setResultCounts(Object.fromEntries(pairs));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load examinations overview');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, school]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    let upcoming = 0;
    let completed = 0;
    let missing = 0;
    let awaiting = 0;
    let published = 0;
    for (const exam of exams) {
      const status = effectiveStatus(exam);
      const entered = resultCounts[exam._id] || 0;
      const expected = exam.course?.enrolledStudents?.length || 0;
      if (status === 'scheduled' || status === 'ongoing') upcoming += 1;
      if (status === 'completed') completed += 1;
      if (status === 'completed' && expected > 0 && entered < expected) missing += 1;
      if (status === 'completed' && entered > 0 && !exam.resultsPublished) awaiting += 1;
      if (exam.resultsPublished) published += 1;
    }
    return { upcoming, completed, missing, awaiting, published };
  }, [exams, resultCounts]);

  const cards = [
    { label: 'Upcoming Exams', value: summary.upcoming, icon: CalendarClock },
    { label: 'Completed', value: summary.completed, icon: CheckCircle2 },
    { label: 'Marks Missing', value: summary.missing, icon: AlertTriangle },
    { label: 'Awaiting Approval', value: summary.awaiting, icon: FileCheck2 },
    { label: 'Published', value: summary.published, icon: GraduationCap },
  ];

  return (
    <div className="p-4 pt-20 sm:p-6 sm:pt-20 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">Examinations</h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Schedule exams, enter marks, review them and publish results from one simple workflow.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/exams/schedule" className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">+ Schedule Exam</Link>
            <Link to="/admin/results/enter" className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold">Enter Marks</Link>
          </div>
        </div>

        {isSuperAdmin && (
          <div className="max-w-sm">
            <select value={school} onChange={(e) => setSchool(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm">
              <option value="">Choose an organization...</option>
              {schools.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {cards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
              <card.icon className="mb-3 h-5 w-5 text-primary-600" />
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">{card.value}</p>
              <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">{card.label}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <Link to="/admin/exams" className="rounded-xl border border-primary-300 bg-primary-50 px-3 py-3 text-center text-xs font-bold text-primary-700">1. Overview</Link>
          <Link to="/admin/exams/schedule" className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 text-center text-xs font-bold">2. Exam Schedule</Link>
          <Link to="/admin/results/enter" className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 text-center text-xs font-bold">3. Marks Entry</Link>
          <Link to="/admin/exams/review" className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 text-center text-xs font-bold">4. Review & Approval</Link>
          <Link to="/admin/results" className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 text-center text-xs font-bold">5. Results</Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
            <div>
              <h2 className="font-bold text-[var(--color-text-primary)]">Exam Status</h2>
              <p className="text-xs text-[var(--color-text-tertiary)]">One row per exam with marks and publication status.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-[var(--color-text-tertiary)]" />
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>
          ) : isSuperAdmin && !school ? (
            <div className="py-14 text-center text-sm text-[var(--color-text-tertiary)]">Choose an organization to view examinations.</div>
          ) : exams.length === 0 ? (
            <div className="py-14 text-center text-sm text-[var(--color-text-tertiary)]">No examinations found.</div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="bg-[var(--color-surface-secondary)] text-left text-[11px] uppercase text-[var(--color-text-tertiary)]">
                    <tr><th className="px-4 py-3">Exam</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Marks Status</th><th className="px-4 py-3">Approval</th><th className="px-4 py-3">Result Status</th><th className="px-4 py-3">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {exams.map((exam) => {
                      const entered = resultCounts[exam._id] || 0;
                      const expected = exam.course?.enrolledStudents?.length || 0;
                      const complete = expected > 0 ? entered >= expected : entered > 0;
                      return <tr key={exam._id}>
                        <td className="px-4 py-3 font-semibold">{exam.title}</td>
                        <td className="px-4 py-3">{className(exam)}</td>
                        <td className="px-4 py-3">{exam.course?.title?.en || '—'}</td>
                        <td className="px-4 py-3">{examDate(exam)}</td>
                        <td className="px-4 py-3">{complete ? badge('Complete', 'green') : entered > 0 ? badge(String(entered) + '/' + String(expected || '?') + ' Entered', 'amber') : badge('Missing', 'red')}</td>
                        <td className="px-4 py-3">{exam.resultsPublished ? badge('Approved', 'green') : entered > 0 ? badge('Pending Review', 'amber') : badge('Not Ready', 'slate')}</td>
                        <td className="px-4 py-3">{exam.resultsPublished ? badge('Published', 'blue') : badge('Not Published', 'slate')}</td>
                        <td className="px-4 py-3"><Link to="/admin/exams/review" className="font-bold text-primary-600">Manage</Link></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-[var(--color-border-subtle)] md:hidden">
                {exams.map((exam) => {
                  const entered = resultCounts[exam._id] || 0;
                  const expected = exam.course?.enrolledStudents?.length || 0;
                  return <div key={exam._id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-bold">{exam.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{className(exam)} · {exam.course?.title?.en || '—'}</p></div>
                      {exam.resultsPublished ? badge('Published', 'blue') : badge(effectiveStatus(exam), 'slate')}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><span className="text-[var(--color-text-tertiary)]">Date</span><p className="mt-1 font-semibold">{examDate(exam)}</p></div>
                      <div className="rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><span className="text-[var(--color-text-tertiary)]">Marks</span><p className="mt-1 font-semibold">{entered}/{expected || '?'}</p></div>
                    </div>
                    <Link to="/admin/exams/review" className="inline-flex rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white">Review</Link>
                  </div>;
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExamOverview;
