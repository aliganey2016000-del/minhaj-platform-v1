/**
 * Bulk Payment — Admin/Org Admin
 * Record that a fixed amount was collected from many students at once
 * (retroactive — a payment record is created per student, already marked
 * paid). For billing students who owe something new, use Generate Invoices
 * on the Invoices page instead — this page is for logging money already in
 * hand across a group.
 */
import { useEffect, useState } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface SchoolBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; school?: string | { _id: string }; }

export function PaymentsBulk() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [bulkSchool, setBulkSchool] = useState('');
  const [bulkClass, setBulkClass] = useState('');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkDiscount, setBulkDiscount] = useState('0');
  const [bulkType, setBulkType] = useState('tuition');
  const [bulkMethod, setBulkMethod] = useState('cash');
  const [bulkNotes, setBulkNotes] = useState('');

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

  const handleBulkCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkAmount || Number(bulkAmount) <= 0) { setError('Enter a valid amount'); return; }
    if (isSuperAdmin && !bulkSchool) { setError('Select an organization for bulk charge'); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/payments/bulk-charge', {
        amount: Number(bulkAmount), discount: Number(bulkDiscount),
        type: bulkType, method: bulkMethod, notes: bulkNotes,
        schoolId: bulkSchool || undefined, classId: bulkClass || undefined,
      });
      const r = data.data;
      setMessage(`⚡ Bulk charge applied to ${r.studentsCharged} students! Total: $${r.totalCharged}. Collection Rate: ${r.collectionRate}%`);
      setBulkAmount(''); setBulkDiscount(''); setBulkNotes('');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const filteredClasses = bulkSchool
    ? classes.filter(c => {
        const schoolId = typeof c.school === 'string' ? c.school : (c.school as any)?._id;
        return schoolId === bulkSchool;
      })
    : classes;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">⚡ Bulk Payment</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Log a payment already collected from a group of students at once — a payment record is created for each.</p>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card max-w-2xl">
          <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
            Charge a fixed amount to ALL active students. Optionally filter by organization and/or class. A payment record is created for each student.
          </p>
          <form onSubmit={handleBulkCharge} className="space-y-4">
            {isSuperAdmin && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Organization</label>
                  <select value={bulkSchool} onChange={e => setBulkSchool(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                    <option value="">All Organizations</option>
                    {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Class (optional)</label>
                  <select value={bulkClass} onChange={e => setBulkClass(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                    <option value="">All Classes</option>
                    {filteredClasses.map(c => <option key={c._id} value={c._id}>{c.title} — {c.section}</option>)}
                  </select>
                </div>
              </div>
            )}
            {!isSuperAdmin && (
              <div>
                <label className="text-xs font-semibold mb-1 block">Class (optional)</label>
                <select value={bulkClass} onChange={e => setBulkClass(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                  <option value="">All Classes</option>
                  {filteredClasses.map(c => <option key={c._id} value={c._id}>{c.title} — {c.section}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Amount Per Student ($) *</label>
                <input type="number" value={bulkAmount} onChange={e => setBulkAmount(e.target.value)}
                  min={1} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="0.00" required />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Discount Per Student ($)</label>
                <input type="number" value={bulkDiscount} onChange={e => setBulkDiscount(e.target.value)}
                  min={0} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Type</label>
                <select value={bulkType} onChange={e => setBulkType(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                  <option value="tuition">Tuition</option><option value="registration">Registration</option>
                  <option value="exam">Exam Fee</option><option value="material">Materials</option>
                  <option value="donation">Donation</option><option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Method</label>
                <select value={bulkMethod} onChange={e => setBulkMethod(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                  <option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option>
                  <option value="mobile_money">Mobile Money</option><option value="online">Online</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Notes</label>
              <input type="text" value={bulkNotes} onChange={e => setBulkNotes(e.target.value)}
                placeholder="e.g. Monthly tuition — March 2026" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors">
              {loading ? 'Processing...' : '⚡ Apply Bulk Payment to All Students'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PaymentsBulk;
