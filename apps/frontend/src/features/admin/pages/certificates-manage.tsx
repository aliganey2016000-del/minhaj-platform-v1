/**
 * Certificates Management — Admin
 * Issue, view, manage student certificates
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface StudentBrief { _id: string; studentId: string; profile?: { firstName: string; lastName: string }; }

interface CourseBrief { _id: string; title: { en: string }; slug: string; category: string; }

interface Certificate {
  _id: string;
  title: string;
  certificateNumber: string;
  student: StudentBrief;
  course: CourseBrief;
  issueDate: string;
  expiryDate?: string;
  grade: string;
  status: 'issued' | 'revoked' | 'expired';
  notes: string;
  issuedBy?: { _id: string; email: string };
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    issued: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    revoked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    expired: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c[status] || 'bg-gray-100'}`}>{status}</span>;
}

// ---------------------------------------------------------------------------
// Issue Certificate Modal
// ---------------------------------------------------------------------------

function IssueModal({
  students,
  courses,
  onClose,
  onSaved,
}: {
  students: StudentBrief[];
  courses: CourseBrief[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: '', student: '', course: '', issueDate: new Date().toISOString().split('T')[0], expiryDate: '', grade: '', notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.student || !form.course) { setError('Title, student, and course are required'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/certificates', { ...form, expiryDate: form.expiryDate || undefined });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to issue certificate');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">🏆 Issue Certificate</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Title *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.title} onChange={e => handleChange('title', e.target.value)} placeholder="e.g. Certificate of Completion" required /></div>

          <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Student *</label>
            <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.student} onChange={e => handleChange('student', e.target.value)} required>
              <option value="">Select student</option>
              {students.map(s => <option key={s._id} value={s._id}>{s.profile?.firstName} {s.profile?.lastName} ({s.studentId})</option>)}
            </select>
          </div>

          <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Course *</label>
            <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.course} onChange={e => handleChange('course', e.target.value)} required>
              <option value="">Select course</option>
              {courses.map(c => <option key={c._id} value={c._id}>{c.title.en} ({c.category})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Issue Date</label><input type="date" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.issueDate} onChange={e => handleChange('issueDate', e.target.value)} /></div>
            <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Expiry Date</label><input type="date" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.expiryDate} onChange={e => handleChange('expiryDate', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Grade (optional)</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.grade} onChange={e => handleChange('grade', e.target.value)} placeholder="e.g. A+" /></div>
            <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Notes</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.notes} onChange={e => handleChange('notes', e.target.value)} placeholder="Optional" /></div>
          </div>

          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">{loading ? 'Issuing...' : 'Issue Certificate'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CertificatesManage() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [students, setStudents] = useState<StudentBrief[]>([]);
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showIssue, setShowIssue] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { page: String(page), limit: '20' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const [certsRes, studentsRes, coursesRes] = await Promise.all([
        api.get('/certificates', { params }),
        api.get('/students?limit=200'),
        api.get('/courses/admin'),
      ]);
      setCerts(certsRes.data.data || []);
      setTotal(certsRes.data.meta?.total || 0);
      setStudents(studentsRes.data.data || []);
      setCourses(coursesRes.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load certificates');
    } finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/certificates/${id}/status`, { status });
      setCerts(p => p.map(c => c._id === id ? { ...c, status: status as Certificate['status'] } : c));
    } catch (err: any) { alert(err.response?.data?.message || 'Failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this certificate?')) return;
    try { await api.delete(`/certificates/${id}`); setCerts(p => p.filter(c => c._id !== id)); } catch (err: any) { alert(err.response?.data?.message || 'Failed'); }
  };

  const issued = certs.filter(c => c.status === 'issued').length;
  const revoked = certs.filter(c => c.status === 'revoked').length;
  const expired = certs.filter(c => c.status === 'expired').length;
  const totalPages = Math.ceil(total / 20);

  if (loading && certs.length === 0) {
    return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🏆 Manage Certificates</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} total — {issued} issued, {revoked} revoked, {expired} expired</p>
          </div>
          <button onClick={() => setShowIssue(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">+ Issue Certificate</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center"><p className="text-2xl font-bold text-green-700 dark:text-green-300">{issued}</p><p className="text-xs text-green-600 dark:text-green-400">Issued</p></div>
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-2xl font-bold text-red-700 dark:text-red-300">{revoked}</p><p className="text-xs text-red-600 dark:text-red-400">Revoked</p></div>
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-center"><p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{expired}</p><p className="text-xs text-amber-600 dark:text-amber-400">Expired</p></div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="text" placeholder="Search by name, ID, cert number, or title..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">All Status</option><option value="issued">Issued</option><option value="revoked">Revoked</option><option value="expired">Expired</option>
          </select>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm mb-2">{error}</p><button onClick={fetchData} className="text-primary-600 font-medium text-sm hover:underline">Retry</button></div>}

        {/* Table */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Certificate</th>
                  <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Student</th>
                  <th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Course</th>
                  <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Grade</th>
                  <th className="text-center px-5 py-3 font-semibold">Status</th>
                  <th className="text-center px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {certs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">🏆 No certificates found</p><p className="text-sm">Click "+ Issue Certificate" to create one.</p></td></tr>
                ) : certs.map(c => (
                  <tr key={c._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold">{c.title}</p>
                      <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{c.certificateNumber}</code>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <p className="font-medium text-sm">{c.student?.profile?.firstName} {c.student?.profile?.lastName}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{c.student?.studentId}</p>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{c.course?.title?.en}</span>
                    </td>
                    <td className="px-5 py-4 text-center hidden sm:table-cell">
                      {c.grade ? <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">{c.grade}</span> : <span className="text-[var(--color-text-tertiary)] text-xs">—</span>}
                    </td>
                    <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}>
                      <select value={c.status} onChange={e => handleStatus(c._id, e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer">
                        <option value="issued">Issued</option><option value="revoked">Revoked</option><option value="expired">Expired</option>
                      </select>
                    </td>
                    <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleDelete(c._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]">
              <p className="text-xs text-[var(--color-text-tertiary)]">{total} certificates</p>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30">← Prev</button>
                <span className="text-xs text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30">Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showIssue && <IssueModal students={students} courses={courses} onClose={() => setShowIssue(false)} onSaved={() => { setShowIssue(false); fetchData(); }} />}
    </div>
  );
}

export default CertificatesManage;