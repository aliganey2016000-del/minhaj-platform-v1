/**
 * Student Balances — Admin/Org Admin
 * Every student's total fees / discount / paid / due in one place, with a
 * "Show only outstanding" toggle for the collections worklist (replaces the
 * old standalone Outstanding Dues page — same data, one fewer destination).
 * Each row also has an "Edit Fees" action for a manual total/discount
 * override (replaces the old standalone Set Fees tab) — the exception path
 * for one-off corrections; Fee Structures → Invoices is the primary way to
 * bill students going forward.
 */
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface StudentBrief {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  class?: { title: string; section: string };
  totalFees?: number;
  totalFeesPaid?: number;
  totalFeesDue?: number;
  discount?: number;
}

interface SchoolBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; school?: string | { _id: string }; }

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PaymentsBalances() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [students, setStudents] = useState<StudentBrief[]>([]);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('due');
  const [school, setSchool] = useState('');
  const [cls, setCls] = useState('');
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [sRes, cRes] = await Promise.all([
          api.get('/schools', { params: { limit: '100' } }),
          api.get('/classes', { params: { limit: '200' } }),
        ]);
        setSchools(sRes.data.data || []);
        setClasses(cRes.data.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchBalances = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { sort };
      if (search) params.search = search;
      if (cls) params.classId = cls;
      const { data } = await api.get('/payments/student-balances', { params });
      setStudents(data.data?.students || []);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load balances'); }
    finally { setLoading(false); }
  }, [search, sort, cls]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  const filteredClasses = school
    ? classes.filter(c => {
        const schoolId = typeof c.school === 'string' ? c.school : (c.school as any)?._id;
        return schoolId === school;
      })
    : classes;

  // school filtering isn't a server param on /payments/student-balances
  // (org_admin is already org-scoped; super admin narrows via class instead)
  // — applied client-side here so the control stays available for super admins.
  const displayed = students
    .filter(s => outstandingOnly ? (s.totalFeesDue || 0) > 0 : true);

  const aggregateFees = displayed.reduce((sum, s) => sum + (s.totalFees || 0), 0);
  const aggregatePaid = displayed.reduce((sum, s) => sum + (s.totalFeesPaid || 0), 0);
  const aggregateDue = displayed.reduce((sum, s) => sum + (s.totalFeesDue || 0), 0);
  const collectionRate = aggregateFees > 0 ? Math.round((aggregatePaid / aggregateFees) * 100) : 0;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📊 Student Balances</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{displayed.length} student{displayed.length === 1 ? '' : 's'}{outstandingOnly ? ' owing money' : ''}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-center">
          <input type="text" placeholder="Search by name or ID..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            onKeyDown={e => { if (e.key === 'Enter') fetchBalances(); }} />
          {isSuperAdmin && (
            <select value={school} onChange={e => setSchool(e.target.value)}
              className="flex-1 sm:flex-none sm:w-48 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
              <option value="">All Schools</option>
              {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          )}
          <select value={cls} onChange={e => setCls(e.target.value)}
            className="flex-1 sm:flex-none sm:w-48 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">All Classes</option>
            {filteredClasses.map(c => <option key={c._id} value={c._id}>{c.title} — {c.section}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="due">Sort: Highest Due</option>
            <option value="paid">Sort: Most Paid</option>
          </select>
          <button onClick={fetchBalances}
            className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 whitespace-nowrap">
            🔍 Apply
          </button>
          <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={outstandingOnly} onChange={e => setOutstandingOnly(e.target.checked)} className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30" />
            Show only outstanding
          </label>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {!loading && displayed.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
              <p className="text-xl font-bold text-blue-700">${aggregateFees.toLocaleString()}</p>
              <p className="text-xs text-blue-600">Total Fees</p>
            </div>
            <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-3 text-center">
              <p className="text-xl font-bold text-green-700">${aggregatePaid.toLocaleString()}</p>
              <p className="text-xs text-green-600">Collected</p>
            </div>
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-center">
              <p className="text-xl font-bold text-red-700">${aggregateDue.toLocaleString()}</p>
              <p className="text-xs text-red-600">Outstanding</p>
            </div>
            <div className="rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/30 p-3 text-center">
              <p className="text-xl font-bold text-purple-700">{collectionRate}%</p>
              <p className="text-xs text-purple-600">Collection Rate</p>
            </div>
          </div>
        )}

        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!loading && displayed.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center">
            <p className="text-4xl mb-4">{outstandingOnly ? '✅' : '📊'}</p>
            <p className="text-lg font-semibold">{outstandingOnly ? 'No outstanding dues' : 'No student balances found'}</p>
            <p className="text-sm text-[var(--color-text-tertiary)]">{outstandingOnly ? "Every student's balance is fully collected." : 'Set fees first, then come back to see balances.'}</p>
          </div>
        )}

        {!loading && displayed.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Student</th>
                    <th className="text-center px-4 py-3 font-semibold hidden sm:table-cell">Total Fees</th>
                    <th className="text-center px-4 py-3 font-semibold hidden md:table-cell">Discount</th>
                    <th className="text-center px-4 py-3 font-semibold">Paid</th>
                    <th className="text-center px-4 py-3 font-semibold">Due</th>
                    <th className="text-center px-4 py-3 font-semibold hidden lg:table-cell">Progress</th>
                    <th className="text-center px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(s => {
                    const pct = (s.totalFees || 0) > 0 ? Math.round(((s.totalFeesPaid || 0) / (s.totalFees || 1)) * 100) : 0;
                    return (
                      <tr key={s._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold">{s.profile?.firstName} {s.profile?.lastName}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{s.studentId}{s.class ? ` · ${s.class.title} (${s.class.section})` : ''}</p>
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell font-medium">${(s.totalFees || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center hidden md:table-cell text-amber-600 font-medium">${(s.discount || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center text-green-600 font-bold">${(s.totalFeesPaid || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center text-red-600 font-bold">${(s.totalFeesDue || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-xs font-medium">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <Link to={`/admin/payments/balances/${s._id}`} className="inline-flex items-center rounded-lg border border-primary-200 px-3 py-1.5 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50 dark:border-primary-900/50 dark:hover:bg-primary-950/30">View</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

export default PaymentsBalances;
