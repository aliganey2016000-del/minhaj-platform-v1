/**
 * Outstanding Dues — Admin/Org Admin
 * Students who currently owe money, sorted by balance — a quick worklist
 * for follow-up collection.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';

interface StudentDue {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  school?: { name: string };
  class?: { title: string; section: string };
  totalFeesPaid: number;
  totalFeesDue: number;
}

export function PaymentsOutstanding() {
  const [students, setStudents] = useState<StudentDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/payments/outstanding');
        setStudents(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load outstanding dues');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = students.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.toLowerCase();
    return name.includes(q) || s.studentId.toLowerCase().includes(q);
  });

  const totalDue = filtered.reduce((sum, s) => sum + (s.totalFeesDue || 0), 0);

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">⚠️ Outstanding Dues</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{filtered.length} student{filtered.length === 1 ? '' : 's'} owing ${totalDue.toLocaleString()} total</p>
        </div>

        <input type="text" placeholder="Search by name or student ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">✅</p>
            <p className="text-lg">No outstanding dues</p>
            <p className="text-sm mt-1">Every student's balance is fully collected.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Student</th>
                    <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Class</th>
                    <th className="text-center px-5 py-3 font-semibold">Paid</th>
                    <th className="text-center px-5 py-3 font-semibold">Due</th>
                    <th className="text-center px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-semibold">{s.profile?.firstName} {s.profile?.lastName}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">{s.studentId}{s.school?.name ? ` · ${s.school.name}` : ''}</p>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell text-xs text-[var(--color-text-tertiary)]">
                        {s.class ? `${s.class.title} (${s.class.section})` : '—'}
                      </td>
                      <td className="px-5 py-4 text-center text-green-600 font-medium">${s.totalFeesPaid.toLocaleString()}</td>
                      <td className="px-5 py-4 text-center text-red-600 font-bold">${s.totalFeesDue.toLocaleString()}</td>
                      <td className="px-5 py-4 text-center">
                        <Link to="/admin/payments/record" className="rounded-lg bg-primary-50 dark:bg-primary-950/30 px-3 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-100 transition-colors">
                          💳 Collect
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentsOutstanding;
