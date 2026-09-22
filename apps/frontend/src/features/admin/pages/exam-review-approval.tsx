import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronUp, FileCheck2, Loader2, Send, Undo2 } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { BackButton } from '../../shared/components/back-button';

interface School { _id: string; name: string; status?: string; }
interface Exam {
  _id: string;
  title: string;
  examDate?: string;
  resultsPublished?: boolean;
  paperStatus?: 'draft' | 'submitted' | 'approved' | 'rejected' | null;
  course?: { title?: { en?: string }; enrolledStudents?: unknown[]; class?: { title?: string; section?: string } };
}
interface ResultRow {
  _id: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  status: string;
  attendanceStatus?: string;
  student?: { studentId?: string; profile?: { firstName?: string; lastName?: string } };
}

function studentName(row: ResultRow): string {
  const p = row.student?.profile;
  return [p?.firstName, p?.lastName].filter(Boolean).join(' ') || row.student?.studentId || 'Student';
}

function className(exam: Exam): string {
  const c = exam.course?.class;
  if (!c?.title) return '—';
  return c.section ? c.title + ' - ' + c.section : c.title;
}

export function ExamReviewApproval() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const [schools, setSchools] = useState<School[]>([]);
  const [school, setSchool] = useState('');
  const [exams, setExams] = useState<Exam[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState('');
  const [details, setDetails] = useState<Record<string, ResultRow[]>>({});
  const [loadingDetails, setLoadingDetails] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
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
      setCounts({});
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
      const countPairs = await Promise.all(rows.map(async (exam) => {
        try {
          const response = await api.get('/results', { params: { examId: exam._id, limit: 1 } });
          return [exam._id, Number(response.data?.meta?.total || 0)] as const;
        } catch {
          return [exam._id, 0] as const;
        }
      }));
      setCounts(Object.fromEntries(countPairs));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, school]);

  useEffect(() => { void load(); }, [load]);

  const toggleReview = async (examId: string) => {
    if (expanded === examId) {
      setExpanded('');
      return;
    }
    setExpanded(examId);
    if (details[examId]) return;
    setLoadingDetails(examId);
    try {
      const { data } = await api.get('/results', { params: { examId, limit: 200 } });
      setDetails((prev) => ({ ...prev, [examId]: data.data || [] }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load marks for review');
    } finally {
      setLoadingDetails('');
    }
  };

  const setPublished = async (exam: Exam, published: boolean) => {
    const entered = counts[exam._id] || 0;
    const expected = exam.course?.enrolledStudents?.length || 0;
    const complete = expected > 0 ? entered >= expected : entered > 0;
    if (published && !complete) {
      setError('Complete all expected marks before approving and publishing this exam.');
      return;
    }
    setBusy(exam._id);
    setError('');
    try {
      await api.patch('/exams/' + exam._id + '/publish-results', { published });
      setExams((prev) => prev.map((row) => row._id === exam._id ? { ...row, resultsPublished: published } : row));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update publication status');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="p-4 pt-20 sm:p-6 sm:pt-20 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-5">
        <div>
          <BackButton fallback="/admin/exams" />
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white"><FileCheck2 className="h-5 w-5" /></span>
            <div>
              <h1 className="text-2xl font-bold">Review & Approval</h1>
              <p className="text-sm text-[var(--color-text-tertiary)]">Review entered marks, correct them when needed, then publish approved results.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/admin/results/enter" className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold">Marks Entry</Link>
          <Link to="/admin/exams/papers" className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold">Paper Approval</Link>
          <Link to="/admin/results" className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold">View Results</Link>
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

        <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>
          ) : isSuperAdmin && !school ? (
            <div className="py-14 text-center text-sm text-[var(--color-text-tertiary)]">Choose an organization to review exam marks.</div>
          ) : exams.length === 0 ? (
            <div className="py-14 text-center text-sm text-[var(--color-text-tertiary)]">No examinations found.</div>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {exams.map((exam) => {
                const entered = counts[exam._id] || 0;
                const expected = exam.course?.enrolledStudents?.length || 0;
                const complete = expected > 0 ? entered >= expected : entered > 0;
                const open = expanded === exam._id;
                return <div key={exam._id}>
                  <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{exam.title}</p>
                        {exam.resultsPublished ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">Published</span> : complete ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Pending Review</span> : entered > 0 ? <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-700">Marks Incomplete</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">No Marks</span>}
                      </div>
                      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{className(exam)} · {exam.course?.title?.en || '—'}</p>
                    </div>
                    <div className="text-sm">
                      <p><span className="text-[var(--color-text-tertiary)]">Marks:</span> <strong>{entered}/{expected || '?'}</strong></p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">Paper: {exam.paperStatus || 'not submitted'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void toggleReview(exam._id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-bold">
                        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Review
                      </button>
                      {exam.resultsPublished ? (
                        <button type="button" disabled={busy === exam._id} onClick={() => void setPublished(exam, false)} className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700 disabled:opacity-50">
                          <Undo2 className="h-3.5 w-3.5" /> Unpublish
                        </button>
                      ) : (
                        <button type="button" disabled={busy === exam._id || !complete} onClick={() => void setPublished(exam, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                          {busy === exam._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Approve & Publish
                        </button>
                      )}
                    </div>
                  </div>

                  {open && (
                    <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4">
                      {loadingDetails === exam._id ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary-600" /></div>
                      ) : (details[exam._id] || []).length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 text-center text-sm text-[var(--color-text-tertiary)]">
                          No marks entered yet. <Link to="/admin/results/enter" className="font-bold text-primary-600">Enter marks</Link>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
                          <table className="w-full min-w-[700px] text-sm">
                            <thead className="bg-[var(--color-surface-secondary)] text-left text-[11px] uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-3 py-2.5">Student</th><th className="px-3 py-2.5">ID</th><th className="px-3 py-2.5">Attendance</th><th className="px-3 py-2.5">Marks</th><th className="px-3 py-2.5">%</th><th className="px-3 py-2.5">Grade</th><th className="px-3 py-2.5">Status</th></tr></thead>
                            <tbody className="divide-y divide-[var(--color-border-subtle)]">
                              {(details[exam._id] || []).map((row) => <tr key={row._id}><td className="px-3 py-2.5 font-semibold">{studentName(row)}</td><td className="px-3 py-2.5">{row.student?.studentId || '—'}</td><td className="px-3 py-2.5 capitalize">{row.attendanceStatus || '—'}</td><td className="px-3 py-2.5">{row.marksObtained}/{row.totalMarks}</td><td className="px-3 py-2.5">{row.percentage}%</td><td className="px-3 py-2.5 font-bold">{row.grade}</td><td className="px-3 py-2.5 capitalize">{row.status}</td></tr>)}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="mt-3 flex justify-end">
                        <Link to="/admin/results/enter" className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs font-bold"><CheckCircle2 className="h-3.5 w-3.5" /> Edit / Correct Marks</Link>
                      </div>
                    </div>
                  )}
                </div>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExamReviewApproval;
