/**
 * Academic Appeals — Student self-service
 * Submit a grade review, dispute a violation, or report an exam issue, and
 * track the status of past appeals.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface ExamBrief { _id: string; title: string; examDate: string; course?: { title: { en: string } }; }
interface Appeal {
  _id: string;
  exam: { title: string; course?: { title: { en: string } } };
  type: 'grade_review' | 'violation_dispute' | 'other';
  description: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  adminResponse?: string;
  createdAt: string;
}

function StatusPill({ status }: { status: string }) {
  const c: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    under_review: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${c[status] || c.pending}`}>{status.replace('_', ' ')}</span>;
}

export function StudentExamAppeals() {
  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [examId, setExamId] = useState('');
  const [type, setType] = useState<'grade_review' | 'violation_dispute' | 'other'>('grade_review');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [examsRes, appealsRes] = await Promise.all([
        api.get('/exams/my'),
        api.get('/exams/my/appeals'),
      ]);
      setExams(examsRes.data.data || []);
      setAppeals(appealsRes.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load appeals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examId || !description.trim()) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await api.post(`/exams/${examId}/appeals`, { type, description });
      setMessage('✅ Appeal submitted — you\'ll be notified once it\'s reviewed.');
      setDescription('');
      setExamId('');
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit appeal');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">⚖️ Academic Appeals</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Submit a grade review, dispute a violation, or report an exam issue</p>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card space-y-3">
          <h2 className="font-bold">Submit a New Appeal</h2>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Exam *</label>
            <select value={examId} onChange={(e) => setExamId(e.target.value)} required className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm">
              <option value="">Select exam...</option>
              {exams.map((e) => <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Type *</label>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm">
              <option value="grade_review">Grade Review</option>
              <option value="violation_dispute">Violation Dispute</option>
              <option value="other">Other Issue</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="Explain your appeal in detail..." />
          </div>
          <button type="submit" disabled={submitting} className="rounded-xl bg-primary-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">
            {submitting ? 'Submitting...' : 'Submit Appeal'}
          </button>
        </form>

        <div>
          <h2 className="font-bold mb-3">Your Appeals</h2>
          {appeals.length === 0 ? (
            <div className="text-center py-10 text-[var(--color-text-tertiary)]"><p>No appeals submitted yet</p></div>
          ) : (
            <div className="space-y-3">
              {appeals.map((a) => (
                <div key={a._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{a.exam?.title} <span className="text-xs font-normal text-[var(--color-text-tertiary)]">— {a.exam?.course?.title?.en}</span></p>
                      <p className="text-xs text-[var(--color-text-tertiary)] capitalize mt-0.5">{a.type.replace('_', ' ')} · {new Date(a.createdAt).toLocaleDateString()}</p>
                    </div>
                    <StatusPill status={a.status} />
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)]">{a.description}</p>
                  {a.adminResponse && (
                    <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">Response</p>
                      <p className="text-sm">{a.adminResponse}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentExamAppeals;
