/**
 * Payments Management — Admin
 * Record payments, view transaction history, payment stats
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface StudentBrief {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  totalFeesPaid?: number;
  totalFeesDue?: number;
}

interface PaymentRecord {
  _id: string;
  student: StudentBrief & { totalFeesPaid: number; totalFeesDue: number };
  amount: number;
  type: string;
  method: string;
  status: 'completed' | 'pending' | 'refunded';
  notes: string;
  recordedBy?: { _id: string; email: string };
  createdAt: string;
}

interface Stats {
  totalPaid: number;
  totalDue: number;
  totalStudents: number;
  studentsWithDebt: number;
  fullyPaid: number;
  collectionRate: number;
  totalTransactions: number;
  totalAmountProcessed: number;
}

// ---------------------------------------------------------------------------
// Status / Type / Method Badges
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c[status] || 'bg-gray-100'}`}>{status}</span>;
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    tuition: '📚 Tuition', registration: '📝 Registration', exam: '📋 Exam',
    material: '📖 Materials', donation: '🎁 Donation', other: '📌 Other',
  };
  return <span className="text-xs font-medium">{labels[type] || type}</span>;
}

function MethodBadge({ method }: { method: string }) {
  const labels: Record<string, string> = {
    cash: '💵 Cash', bank_transfer: '🏦 Bank', mobile_money: '📱 Mobile', online: '💻 Online',
  };
  return <span className="text-xs">{labels[method] || method}</span>;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PaymentsManage() {
  const [tab, setTab] = useState<'record' | 'history' | 'stats'>('history');
  const [stats, setStats] = useState<Stats | null>(null);
  const [students, setStudents] = useState<StudentBrief[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Record form
  const [selectedStudent, setSelectedStudent] = useState('');
  const [amount, setAmount] = useState('');
  const [payType, setPayType] = useState('tuition');
  const [payMethod, setPayMethod] = useState('cash');
  const [payStatus, setPayStatus] = useState('completed');
  const [notes, setNotes] = useState('');

  // History filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => { fetchStats(); fetchStudents(); }, []);

  useEffect(() => { if (tab === 'history') fetchPayments(); }, [tab, page, search, statusFilter, typeFilter]);

  const fetchStats = async () => {
    try { const { data } = await api.get('/payments/stats'); setStats(data.data); } catch {}
  };

  const fetchStudents = async () => {
    try { const { data } = await api.get('/students?limit=200'); setStudents(data.data || []); } catch {}
  };

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page: String(page), limit: '20' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      const { data } = await api.get('/payments', { params });
      setPayments(data.data || []);
      setTotal(data.meta?.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load payments');
    } finally { setLoading(false); }
  }, [page, search, statusFilter, typeFilter]);

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !amount || Number(amount) <= 0) {
      setError('Please select a student and enter a valid amount');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await api.post('/payments', {
        studentId: selectedStudent,
        amount: Number(amount),
        type: payType,
        method: payMethod,
        status: payStatus,
        notes,
      });
      setMessage(`✅ Payment of $${amount} recorded successfully!`);
      setAmount('');
      setNotes('');
      setSelectedStudent('');
      fetchStats();
      fetchStudents();
      fetchPayments();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to record payment');
    } finally { setLoading(false); }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/payments/${id}/status`, { status: newStatus });
      setPayments(prev => prev.map(p => p._id === id ? { ...p, status: newStatus as PaymentRecord['status'] } : p));
      fetchStats();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const selectedStudentObj = students.find(s => s._id === selectedStudent);
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">💰 Payments Management</h1>
            {stats && (
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
                ${stats.totalPaid.toLocaleString()} collected · {stats.collectionRate}% rate · {stats.totalTransactions} transactions
              </p>
            )}
          </div>
        </div>

        {/* Stats Mini Cards (always visible) */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">${stats.totalPaid.toLocaleString()}</p>
              <p className="text-xs text-green-600 dark:text-green-400">Collected</p>
            </div>
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">${stats.totalDue.toLocaleString()}</p>
              <p className="text-xs text-red-600 dark:text-red-400">Outstanding</p>
            </div>
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.collectionRate}%</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">Collection Rate</p>
            </div>
            <div className="rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.totalTransactions}</p>
              <p className="text-xs text-purple-600 dark:text-purple-400">Transactions</p>
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex gap-2 border-b border-[var(--color-border-subtle)] pb-0">
          {(['history', 'record', 'stats'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-t-xl px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${tab === t ? 'bg-[var(--color-surface-primary)] text-primary-600 border-primary-600' : 'text-[var(--color-text-tertiary)] border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]'}`}>
              {t === 'history' ? '📋 History' : t === 'record' ? '💳 Record Payment' : '📊 Stats'}
            </button>
          ))}
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {/* ── Record Payment ── */}
        {tab === 'record' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card max-w-2xl">
            <h2 className="text-lg font-bold mb-4">💳 Record New Payment</h2>
            <form onSubmit={handleRecord} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Student *</label>
                <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" required>
                  <option value="">Select a student...</option>
                  {students.map(s => (
                    <option key={s._id} value={s._id}>{s.profile?.firstName} {s.profile?.lastName} ({s.studentId}) — Due: ${s.totalFeesDue || 0} | Paid: ${s.totalFeesPaid || 0}</option>
                  ))}
                </select>
                {selectedStudentObj && (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    Current: Paid <strong>${selectedStudentObj.totalFeesPaid || 0}</strong> · Due <strong>${selectedStudentObj.totalFeesDue || 0}</strong>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Amount ($) *</label>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={1} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="0.00" required />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Status</label>
                  <select value={payStatus} onChange={e => setPayStatus(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Type</label>
                  <select value={payType} onChange={e => setPayType(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                    <option value="tuition">Tuition</option>
                    <option value="registration">Registration</option>
                    <option value="exam">Exam Fee</option>
                    <option value="material">Materials</option>
                    <option value="donation">Donation</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Method</label>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="online">Online</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Notes</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
              </div>

              <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm">
                {loading ? 'Processing...' : '💰 Record Payment'}
              </button>
            </form>
          </div>
        )}

        {/* ── Transaction History ── */}
        {tab === 'history' && (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="text" placeholder="Search by name, ID, or notes..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                <option value="">All Status</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
              </select>
              <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                <option value="">All Types</option>
                <option value="tuition">Tuition</option>
                <option value="registration">Registration</option>
                <option value="exam">Exam Fee</option>
                <option value="material">Materials</option>
                <option value="donation">Donation</option>
                <option value="other">Other</option>
              </select>
            </div>

            {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

            {/* Table */}
            {!loading && (
              <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                      <tr>
                        <th className="text-left px-5 py-3 font-semibold">Student</th>
                        <th className="text-center px-5 py-3 font-semibold">Amount</th>
                        <th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Type</th>
                        <th className="text-center px-5 py-3 font-semibold hidden lg:table-cell">Method</th>
                        <th className="text-center px-5 py-3 font-semibold">Status</th>
                        <th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">💰 No payments found</p><p className="text-sm">Switch to "Record Payment" to add one.</p></td></tr>
                      ) : payments.map(p => (
                        <tr key={p._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                          <td className="px-5 py-4">
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{p.student?.profile?.firstName} {p.student?.profile?.lastName}</p>
                              <p className="text-xs text-[var(--color-text-tertiary)]">{p.student?.studentId}</p>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="font-bold text-base text-green-600">${p.amount.toLocaleString()}</span>
                          </td>
                          <td className="px-5 py-4 text-center hidden md:table-cell"><TypeBadge type={p.type} /></td>
                          <td className="px-5 py-4 text-center hidden lg:table-cell"><MethodBadge method={p.method} /></td>
                          <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}>
                            <select value={p.status} onChange={e => handleStatusChange(p._id, e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer">
                              <option value="completed">Completed</option>
                              <option value="pending">Pending</option>
                              <option value="refunded">Refunded</option>
                            </select>
                          </td>
                          <td className="px-5 py-4 hidden lg:table-cell text-xs text-[var(--color-text-tertiary)]">
                            {new Date(p.createdAt).toLocaleDateString()}
                            <p className="text-[10px]">{new Date(p.createdAt).toLocaleTimeString()}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]">
                    <p className="text-xs text-[var(--color-text-tertiary)]">{total} payments</p>
                    <div className="flex items-center gap-2">
                      <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30">← Prev</button>
                      <span className="text-xs text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span>
                      <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30">Next →</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Stats Tab ── */}
        {tab === 'stats' && stats && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
              <h2 className="text-lg font-bold mb-6">📊 Payment Overview</h2>

              {/* Collection Rate Progress */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Collection Rate</span>
                  <span className="text-lg font-bold text-primary-600">{stats.collectionRate}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                  <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-primary-600 transition-all duration-700" style={{ width: `${stats.collectionRate}%` }} />
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Total Collected</p>
                  <p className="text-2xl font-bold text-green-600">${stats.totalPaid.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Total Outstanding</p>
                  <p className="text-2xl font-bold text-red-600">${stats.totalDue.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Students with Debt</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.studentsWithDebt} <span className="text-sm font-normal text-[var(--color-text-tertiary)]">of {stats.totalStudents}</span></p>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Fully Paid Students</p>
                  <p className="text-2xl font-bold text-green-600">{stats.fullyPaid} <span className="text-sm font-normal text-[var(--color-text-tertiary)]">of {stats.totalStudents}</span></p>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Total Transactions</p>
                  <p className="text-2xl font-bold text-primary-600">{stats.totalTransactions}</p>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Total Processed</p>
                  <p className="text-2xl font-bold text-purple-600">${stats.totalAmountProcessed.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentsManage;