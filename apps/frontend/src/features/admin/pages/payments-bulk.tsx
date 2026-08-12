/**
 * Bulk Collect Payments — Admin/Org Admin
 * Collects payment against many EXISTING pending/partial invoices at once
 * (e.g. a class paid its March tuition in one visit to the office). Unlike
 * the old "Bulk Payment" page, this never fabricates a payment out of thin
 * air — it only ever pays down real invoices, so it can't diverge from the
 * single Invoice-based source of truth. To bill students for something new,
 * use "Generate Invoices" on the Invoices page first.
 */
import { useEffect, useState } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface SchoolBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; school?: string | { _id: string }; }
interface FeeStructureBrief { _id: string; title: string; feeType: string; amount: number; school?: string | { _id: string }; }

interface CollectBulkResult { collected: number; failed: number; totalAmount: number; }

export function PaymentsBulk() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructureBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CollectBulkResult | null>(null);
  const [error, setError] = useState('');

  const [bulkSchool, setBulkSchool] = useState('');
  const [bulkClass, setBulkClass] = useState('');
  const [bulkFeeStructure, setBulkFeeStructure] = useState('');
  const [bulkPeriod, setBulkPeriod] = useState('');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkMethod, setBulkMethod] = useState('cash');
  const [bulkNotes, setBulkNotes] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [sRes, cRes, fRes] = await Promise.all([
          api.get('/schools', { params: { limit: '100' } }),
          api.get('/classes', { params: { limit: '200' } }),
          api.get('/fee-structures', { params: { limit: '100' } }),
        ]);
        setSchools(sRes.data.data || []);
        setClasses(cRes.data.data || []);
        setFeeStructures(fRes.data.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleCollectBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSuperAdmin && !bulkSchool) { setError('Select an organization'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const { data } = await api.post('/invoices/collect-bulk', {
        amount: bulkAmount ? Number(bulkAmount) : undefined,
        method: bulkMethod, notes: bulkNotes || undefined,
        schoolId: bulkSchool || undefined, classId: bulkClass || undefined,
        feeStructureId: bulkFeeStructure || undefined, period: bulkPeriod.trim() || undefined,
      });
      setResult(data.data);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const filteredClasses = bulkSchool
    ? classes.filter(c => {
        const schoolId = typeof c.school === 'string' ? c.school : (c.school as any)?._id;
        return schoolId === bulkSchool;
      })
    : classes;

  const filteredFeeStructures = bulkSchool
    ? feeStructures.filter(f => {
        const schoolId = typeof f.school === 'string' ? f.school : (f.school as any)?._id;
        return schoolId === bulkSchool;
      })
    : feeStructures;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">💵 Bulk Collect Payments</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Collect payment against many existing pending/partial invoices at once. To bill for something new, use Generate Invoices on the Invoices page instead.</p>
        </div>

        {result && (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">
            ✅ Collected against {result.collected} invoice{result.collected !== 1 ? 's' : ''} (total ${result.totalAmount.toLocaleString()}){result.failed > 0 ? `, ${result.failed} skipped (no remaining balance or already void)` : ''}.
          </div>
        )}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card max-w-2xl">
          <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
            Matches every pending/partial invoice for the filters below and collects payment against each — leave Amount blank to fully settle each invoice's own remaining balance, or set a fixed amount to apply per invoice (capped at what's still owed).
          </p>
          <form onSubmit={handleCollectBulk} className="space-y-4">
            {isSuperAdmin && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Organization *</label>
                  <select value={bulkSchool} onChange={e => setBulkSchool(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" required>
                    <option value="">Select an organization...</option>
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
                <label className="text-xs font-semibold mb-1 block">Fee Structure (optional)</label>
                <select value={bulkFeeStructure} onChange={e => setBulkFeeStructure(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                  <option value="">All Fee Structures</option>
                  {filteredFeeStructures.map(f => <option key={f._id} value={f._id}>{f.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Period (optional)</label>
                <input type="text" value={bulkPeriod} onChange={e => setBulkPeriod(e.target.value)}
                  placeholder="e.g. March 2026" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Amount Per Invoice ($, optional)</label>
                <input type="number" value={bulkAmount} onChange={e => setBulkAmount(e.target.value)}
                  min={0.01} step="0.01" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="Leave blank for full balance" />
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
              className="w-full rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors">
              {loading ? 'Processing...' : '💵 Collect From Matching Invoices'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PaymentsBulk;
