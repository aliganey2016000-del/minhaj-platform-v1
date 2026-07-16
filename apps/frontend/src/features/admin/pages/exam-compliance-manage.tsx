/**
 * Compliances & Issues — Admin/Teacher
 * Log exam violations, cheating, disruptions, technical issues, or special
 * accommodations, and review student-submitted academic appeals.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface ExamBrief { _id: string; title: string; examDate: string; course?: { _id: string; title: { en: string } }; }
interface StudentBrief { _id: string; studentId: string; profile?: { firstName: string; lastName: string }; }

interface Incident {
  _id: string;
  exam: { title: string; course?: { title: { en: string } } };
  student?: StudentBrief;
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolutionNotes?: string;
  reportedBy?: { email: string };
  createdAt: string;
}

interface Appeal {
  _id: string;
  exam: { title: string; course?: { title: { en: string } } };
  student?: StudentBrief;
  type: string;
  description: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  adminResponse?: string;
  createdAt: string;
}

const INCIDENT_TYPES = ['cheating', 'disruption', 'technical_issue', 'accommodation', 'other'];

function SeverityBadge({ severity }: { severity: string }) {
  const c: Record<string, string> = {
    low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${c[severity] || c.medium}`}>{severity}</span>;
}

function StatusPill({ status }: { status: string }) {
  const c: Record<string, string> = {
    open: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    dismissed: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    under_review: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${c[status] || c.open}`}>{status.replace('_', ' ')}</span>;
}

function NewIncidentModal({ exams, onClose, onSaved }: { exams: ExamBrief[]; onClose: () => void; onSaved: () => void }) {
  const [examId, setExamId] = useState('');
  const [type, setType] = useState('cheating');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/exam-incidents', { exam: examId, type, severity, description });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to log incident');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">⚠️ Log Incident</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Exam *</label>
            <select value={examId} onChange={(e) => setExamId(e.target.value)} required className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm">
              <option value="">Select exam...</option>
              {exams.map((e) => <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Type *</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm capitalize">
                {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm capitalize">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={3} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="What happened?" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">{loading ? 'Saving...' : 'Log Incident'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ExamComplianceManage() {
  const [tab, setTab] = useState<'incidents' | 'appeals'>('incidents');
  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [examsRes, incidentsRes, appealsRes] = await Promise.all([
        api.get('/exams'),
        api.get('/exam-incidents'),
        api.get('/exam-appeals'),
      ]);
      setExams(examsRes.data.data || []);
      setIncidents(incidentsRes.data.data || []);
      setAppeals(appealsRes.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const resolveIncident = async (id: string, status: string) => {
    try {
      const { data } = await api.patch(`/exam-incidents/${id}`, { status });
      setIncidents((prev) => prev.map((i) => (i._id === id ? data.data : i)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update incident');
    }
  };

  const resolveAppeal = async (id: string, status: string, adminResponse: string) => {
    try {
      const { data } = await api.patch(`/exam-appeals/${id}`, { status, adminResponse });
      setAppeals((prev) => prev.map((a) => (a._id === id ? data.data : a)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update appeal');
    }
  };

  const openIncidents = incidents.filter((i) => i.status === 'open').length;
  const pendingAppeals = appeals.filter((a) => a.status === 'pending' || a.status === 'under_review').length;

  if (loading) {
    return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">⚠️ Compliances & Issues</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{openIncidents} open incident{openIncidents === 1 ? '' : 's'} · {pendingAppeals} pending appeal{pendingAppeals === 1 ? '' : 's'}</p>
          </div>
          {tab === 'incidents' && (
            <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">+ Log Incident</button>
          )}
        </div>

        <div className="flex gap-2 border-b border-[var(--color-border-subtle)] pb-0">
          {(['incidents', 'appeals'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-t-xl px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${tab === t ? 'bg-[var(--color-surface-primary)] text-primary-600 border-primary-600' : 'text-[var(--color-text-tertiary)] border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]'}`}>
              {t === 'incidents' ? '⚠️ Violations & Issues' : '⚖️ Academic Appeals'}
            </button>
          ))}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {tab === 'incidents' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Exam</th>
                    <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Type</th>
                    <th className="text-center px-5 py-3 font-semibold">Severity</th>
                    <th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Description</th>
                    <th className="text-center px-5 py-3 font-semibold">Status</th>
                    <th className="text-center px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">⚠️ No incidents logged</p></td></tr>
                  ) : incidents.map((i) => (
                    <tr key={i._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-semibold">{i.exam?.title}</p>
                        {i.student && <p className="text-xs text-[var(--color-text-tertiary)]">{i.student.profile?.firstName} {i.student.profile?.lastName} · {i.student.studentId}</p>}
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell capitalize">{i.type.replace('_', ' ')}</td>
                      <td className="px-5 py-4 text-center"><SeverityBadge severity={i.severity} /></td>
                      <td className="px-5 py-4 hidden lg:table-cell text-xs text-[var(--color-text-tertiary)] max-w-xs truncate">{i.description}</td>
                      <td className="px-5 py-4 text-center"><StatusPill status={i.status} /></td>
                      <td className="px-5 py-4 text-center">
                        {i.status === 'open' ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => resolveIncident(i._id, 'resolved')} className="rounded-lg px-2.5 py-1 text-xs font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30">Resolve</button>
                            <button onClick={() => resolveIncident(i._id, 'dismissed')} className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">Dismiss</button>
                          </div>
                        ) : <span className="text-xs text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'appeals' && (
          <div className="space-y-3">
            {appeals.length === 0 ? (
              <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">⚖️ No appeals submitted</p></div>
            ) : appeals.map((a) => (
              <AppealRow key={a._id} appeal={a} onResolve={resolveAppeal} />
            ))}
          </div>
        )}
      </div>

      {showCreate && <NewIncidentModal exams={exams} onClose={() => setShowCreate(false)} onSaved={fetchAll} />}
    </div>
  );
}

function AppealRow({ appeal, onResolve }: { appeal: Appeal; onResolve: (id: string, status: string, response: string) => void }) {
  const [response, setResponse] = useState(appeal.adminResponse || '');
  const editable = appeal.status === 'pending' || appeal.status === 'under_review';

  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{appeal.exam?.title} <span className="text-xs font-normal text-[var(--color-text-tertiary)]">— {appeal.exam?.course?.title?.en}</span></p>
          {appeal.student && <p className="text-xs text-[var(--color-text-tertiary)]">{appeal.student.profile?.firstName} {appeal.student.profile?.lastName} · {appeal.student.studentId}</p>}
          <p className="text-xs text-[var(--color-text-tertiary)] capitalize mt-1">{appeal.type.replace('_', ' ')}</p>
        </div>
        <StatusPill status={appeal.status} />
      </div>
      <p className="text-sm text-[var(--color-text-secondary)]">{appeal.description}</p>

      {editable ? (
        <div className="space-y-2">
          <textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Your response to the student..." rows={2} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => onResolve(appeal._id, 'under_review', response)} className="rounded-lg px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200">Mark Under Review</button>
            <button onClick={() => onResolve(appeal._id, 'approved', response)} className="rounded-lg px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200">Approve</button>
            <button onClick={() => onResolve(appeal._id, 'rejected', response)} className="rounded-lg px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200">Reject</button>
          </div>
        </div>
      ) : appeal.adminResponse && (
        <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">Response</p>
          <p className="text-sm">{appeal.adminResponse}</p>
        </div>
      )}
    </div>
  );
}

export default ExamComplianceManage;
