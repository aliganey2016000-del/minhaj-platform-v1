import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';

type Submission = {
  id: string;
  student?: { id?: string; name?: string; email?: string };
  status?: string;
  submittedAt?: string;
  grade?: number | null;
  feedback?: string | null;
  content?: string | null;
};

export function TeacherAssignmentReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<any>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [grade, setGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`/assignments/${id}`);
        const payload = data?.data ?? data;
        setAssignment(payload?.assignment ?? payload);
        const list = payload?.submissions ?? payload?.data?.submissions ?? [];
        setSubmissions(Array.isArray(list) ? list : []);
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Unable to load submissions.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const openReview = (submission: Submission) => {
    setSelected(submission);
    setGrade(submission.grade == null ? '' : String(submission.grade));
    setFeedback(submission.feedback || '');
  };

  const saveGrade = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      // Keep the UI ready for the grading endpoint without inventing a backend
      // contract. If the API exposes grading on the submission resource, use it.
      await api.patch(`/assignment-submissions/${selected.id}/grade`, {
        grade: grade === '' ? null : Number(grade),
        feedback,
      });
      setSubmissions((items) => items.map((s) => s.id === selected.id
        ? { ...s, grade: grade === '' ? null : Number(grade), feedback, status: 'graded' }
        : s));
      setSelected((s) => s ? { ...s, grade: grade === '' ? null : Number(grade), feedback, status: 'graded' } : s);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Grading could not be saved yet.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-secondary)]">Loading submissions…</div>;

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] px-3 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <button onClick={() => navigate('/teacher/assignments')} className="mb-4 text-sm font-semibold text-emerald-600">← Assignments</button>
        <div className="mb-5 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Submissions</p>
          <h1 className="mt-1 text-xl font-bold text-[var(--color-text-primary)] sm:text-2xl">{assignment?.title || 'Assignment'}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{submissions.length} submission{submissions.length === 1 ? '' : 's'}</p>
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {submissions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-secondary)]">No submissions yet.</div>
        ) : (
          <div className="space-y-3">
            {submissions.map((submission, index) => (
              <button key={submission.id} onClick={() => openReview(submission)} className="w-full rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 text-left shadow-sm transition hover:border-emerald-300">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 font-bold text-emerald-700">{(submission.student?.name || '?').charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-[var(--color-text-primary)]">{submission.student?.name || `Student ${index + 1}`}</p>
                    <p className="break-words text-xs text-[var(--color-text-tertiary)]">{submission.student?.email || 'Submission'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2.5 py-1 text-xs font-semibold">{submission.status || 'submitted'}</span>
                    {submission.grade != null && <p className="mt-1 text-sm font-bold text-emerald-600">{submission.grade}</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
            <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--color-surface-primary)] p-5 sm:max-w-xl sm:rounded-3xl sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Review</p><h2 className="mt-1 text-lg font-bold">{selected.student?.name || 'Student'}</h2></div>
                <button onClick={() => setSelected(null)} className="rounded-xl px-3 py-2 text-sm font-semibold">Close</button>
              </div>
              {selected.content && <div className="mb-4 whitespace-pre-wrap rounded-xl bg-[var(--color-surface-secondary)] p-4 text-sm">{selected.content}</div>}
              <label className="mb-2 block text-sm font-semibold">Grade</label>
              <input value={grade} onChange={(e) => setGrade(e.target.value)} type="number" min="0" max={assignment?.totalMarks ?? undefined} className="mb-4 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-4 py-3 outline-none focus:border-emerald-500" placeholder="Enter mark" />
              <label className="mb-2 block text-sm font-semibold">Feedback</label>
              <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={5} className="w-full resize-none rounded-xl border border-[var(--color-border-default)] bg-transparent px-4 py-3 outline-none focus:border-emerald-500" placeholder="Write feedback for the student…" />
              <button disabled={saving} onClick={saveGrade} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save Grade & Feedback'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherAssignmentReview;
