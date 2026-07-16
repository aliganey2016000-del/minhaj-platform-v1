/**
 * Record Payment — Admin/Org Admin
 * Log a new payment transaction against a student's account.
 */

import { useEffect, useState } from 'react';
import api from '../../../lib/axios';

interface StudentBrief {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  totalFeesPaid?: number;
  totalFeesDue?: number;
}

export function PaymentsRecord() {
  const [students, setStudents] = useState<StudentBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [selectedStudent, setSelectedStudent] = useState('');
  const [amount, setAmount] = useState('');
  const [payType, setPayType] = useState('tuition');
  const [payMethod, setPayMethod] = useState('cash');
  const [payStatus, setPayStatus] = useState('completed');
  const [notes, setNotes] = useState('');

  useEffect(() => { fetchStudents(); }, []);

  const fetchStudents = async () => {
    try { const { data } = await api.get('/students?limit=200'); setStudents(data.data || []); } catch {}
  };

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
      fetchStudents();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to record payment');
    } finally { setLoading(false); }
  };

  const selectedStudentObj = students.find((s) => s._id === selectedStudent);

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">💳 Record Payment</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Log a new transaction against a student's account</p>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
          <form onSubmit={handleRecord} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Student *</label>
              <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" required>
                <option value="">Select a student...</option>
                {students.map((s) => (
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
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="0.00" required />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Status</label>
                <select value={payStatus} onChange={(e) => setPayStatus(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Type</label>
                <select value={payType} onChange={(e) => setPayType(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
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
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="online">Online</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
            </div>

            <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm">
              {loading ? 'Processing...' : '💰 Record Payment'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PaymentsRecord;
