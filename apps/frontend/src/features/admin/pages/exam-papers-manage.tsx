/**
 * Papers & Approval — Admin/Teacher
 * Admin proofreading/moderation/approval for exam papers. The actual
 * question-authoring UI is shared with the Course Content Builder (both
 * embed ExamPaperEditor) — a teacher normally writes the paper right there
 * in the builder and never needs this page until it's time to review it.
 *
 * Super admin (role 'admin') scopes down to one Organization first, then
 * sees that org's exams as a tabbed list (All/Pending/Approved/Rejected) —
 * same "pick an org, then work within it" pattern as users-manage.tsx.
 * Org admin is auto-scoped to their own organization, no picker shown.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { ExamPaperEditor, type ExamPaper } from '../components/exam-paper-editor';

interface School { _id: string; name: string; status?: string; }
interface ExamBrief {
  _id: string;
  title: string;
  examDate: string;
  status: string;
  course?: { _id: string; title: { en: string } };
  paperStatus: 'draft' | 'submitted' | 'approved' | 'rejected' | null;
}

type TabKey = 'all' | 'pending' | 'approved' | 'rejected';
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '📄' },
  { key: 'pending', label: 'Pending', icon: '⏳' },
  { key: 'approved', label: 'Approved', icon: '✅' },
  { key: 'rejected', label: 'Rejected', icon: '❌' },
];

function PaperStatusBadge({ status }: { status: ExamBrief['paperStatus'] }) {
  const c: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  const label = status === 'submitted' ? 'pending' : status || 'no paper';
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize flex-shrink-0 ${c[status || ''] || 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>{label}</span>;
}

export function ExamPapersManage() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'admin';
  const isOrgAdmin = currentUser?.role === 'org_admin';

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [myOrgName, setMyOrgName] = useState('');

  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>('all');

  const [selectedExam, setSelectedExam] = useState('');
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');

  // Load the organization list (super admin) or the org_admin's own org.
  useEffect(() => {
    if (isSuperAdmin) {
      (async () => {
        try {
          const { data } = await api.get('/schools', { params: { limit: '100' } });
          setSchools((data.data || []).filter((s: School) => s.status === 'active'));
        } catch { /* non-fatal */ }
      })();
      return;
    }
    if (isOrgAdmin && currentUser?.organizationId) {
      setSelectedOrg(currentUser.organizationId);
      (async () => {
        try {
          const { data } = await api.get(`/schools/${currentUser.organizationId}`);
          if (data.data?.name) setMyOrgName(data.data.name);
        } catch { /* non-fatal */ }
      })();
    }
  }, [isSuperAdmin, isOrgAdmin, currentUser?.organizationId]);

  const fetchExams = useCallback(async () => {
    if (!selectedOrg) { setExams([]); return; }
    setExamsLoading(true);
    setError('');
    try {
      const { data } = await api.get('/exams', { params: { school: selectedOrg, limit: 200 } });
      setExams(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load exams');
    } finally {
      setExamsLoading(false);
    }
  }, [selectedOrg]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const counts = {
    all: exams.length,
    pending: exams.filter((e) => e.paperStatus === 'submitted').length,
    approved: exams.filter((e) => e.paperStatus === 'approved').length,
    rejected: exams.filter((e) => e.paperStatus === 'rejected').length,
  };
  const visibleExams = exams.filter((e) => {
    if (tab === 'all') return true;
    if (tab === 'pending') return e.paperStatus === 'submitted';
    return e.paperStatus === tab;
  });

  const selectExam = (examId: string) => {
    setSelectedExam(examId);
    setPaper(null);
    setMessage('');
    setReviewNotes('');
  };

  const handleReview = async (approved: boolean) => {
    if (!selectedExam) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.patch(`/exams/${selectedExam}/paper/review`, { approved, notes: reviewNotes });
      setPaper(data.data);
      setEditorKey((k) => k + 1); // remount ExamPaperEditor so it re-fetches the now-reviewed paper
      setMessage(approved ? '✅ Paper approved' : 'Paper rejected — sent back to the instructor');
      fetchExams(); // refresh the list's paperStatus badges/counts
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to review paper');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📄 Papers & Approval</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Review exam papers submitted by instructors and approve or reject them</p>
        </div>

        {/* Organization scope */}
        {isSuperAdmin ? (
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Select Organization</label>
            <select
              value={selectedOrg}
              onChange={(e) => { setSelectedOrg(e.target.value); setSelectedExam(''); setPaper(null); setTab('all'); }}
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            >
              <option value="">Choose an organization...</option>
              {schools.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
        ) : isOrgAdmin && myOrgName ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2 text-sm">
            <span className="text-[var(--color-text-tertiary)]">Organization:</span>
            <span className="font-semibold text-[var(--color-text-primary)]">{myOrgName}</span>
          </div>
        ) : null}

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {!selectedOrg && isSuperAdmin && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">👆 Select an organization above to see its exam papers</p></div>
        )}

        {selectedOrg && (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    tab === t.key
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
                  }`}
                >
                  <span>{t.icon}</span> {t.label}
                  <span className={`rounded-full px-1.5 text-[11px] ${tab === t.key ? 'bg-white/20' : 'bg-[var(--color-surface-tertiary)]'}`}>{counts[t.key]}</span>
                </button>
              ))}
            </div>

            {/* Exam list */}
            {examsLoading ? (
              <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>
            ) : visibleExams.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-text-tertiary)] border border-dashed border-[var(--color-border-default)] rounded-xl">
                <p>No exams in this category.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleExams.map((e) => (
                  <button
                    key={e._id}
                    onClick={() => selectExam(e._id)}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors ${
                      selectedExam === e._id
                        ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-950/20'
                        : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-tertiary)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{e.title}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{e.course?.title?.en} · {new Date(e.examDate).toLocaleDateString()}</p>
                    </div>
                    <PaperStatusBadge status={e.paperStatus} />
                  </button>
                ))}
              </div>
            )}

            {/* Selected exam's paper */}
            {selectedExam && (
              <div className="space-y-4 pt-2">
                {paper?.status === 'submitted' && (
                  <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-3">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">🔍 Admin Review</p>
                    <textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Optional notes (required detail if rejecting)"
                      className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleReview(true)} disabled={saving} className="rounded-xl bg-green-600 text-white px-5 py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors">✅ Approve</button>
                      <button onClick={() => handleReview(false)} disabled={saving} className="rounded-xl bg-red-600 text-white px-5 py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-60 transition-colors">❌ Reject</button>
                    </div>
                  </div>
                )}

                <ExamPaperEditor key={editorKey} examId={selectedExam} onChange={setPaper} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExamPapersManage;
