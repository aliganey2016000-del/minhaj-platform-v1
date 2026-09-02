/**
 * Discounts & Scholarships — Admin/Org Admin
 *
 * Two independent tools live on this page:
 *  - One-Time Adjustment: a discount/waiver/scholarship applied once, right
 *    now, against one specific invoice (fixed $ or % of its gross amount).
 *  - Recurring Discount Grant: a policy tied to the STUDENT rather than one
 *    invoice, auto-applied by the backend every time a new invoice is
 *    generated for them, for as long as the grant is within its validity
 *    window — standing (until revoked, e.g. a staff-child discount),
 *    academic-year (tied to one year, needs re-granting next year, e.g. a
 *    merit scholarship), or a fixed period (e.g. one term of hardship
 *    relief, expires on its own).
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { BadgePercent, Search, X, ShieldCheck, CheckCircle2, Plus, Repeat, Ban } from 'lucide-react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudentBrief {
  _id: string;
  studentId: string;
  profile?: { firstName: string; lastName: string };
  user?: { phone?: string };
}

interface InvoiceBrief {
  _id: string;
  title: string;
  period: string;
  amount: number;
  discount: number;
  amountPaid: number;
  amountDue: number;
  status: string;
}

interface AdjustmentRow {
  _id: string;
  type: 'discount' | 'waiver' | 'scholarship';
  valueType: 'fixed' | 'percent';
  inputValue: number;
  amount: number;
  reason: string;
  createdAt: string;
  student?: { studentId: string; profile?: { firstName: string; lastName: string } };
  invoice?: { title: string; period: string; amount: number };
  grantedBy?: { email: string };
}

interface DiscountGrantRow {
  _id: string;
  label: string;
  type: 'discount' | 'waiver' | 'scholarship';
  durationType: 'standing' | 'academic_year' | 'fixed_period';
  valueType: 'fixed' | 'percent';
  inputValue: number;
  academicYear?: string;
  validFrom: string;
  validUntil: string | null;
  status: 'active' | 'revoked';
  effectiveStatus: 'active' | 'expired' | 'revoked';
  reason: string;
  createdAt: string;
  student?: { studentId: string; profile?: { firstName: string; lastName: string } };
  grantedBy?: { email: string };
}

const TYPE_LABELS: Record<string, string> = { discount: 'Discount', waiver: 'Fee Waiver', scholarship: 'Scholarship' };
const TYPE_BADGE: Record<string, string> = {
  discount: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  waiver: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  scholarship: 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400',
};

const DURATION_LABELS: Record<string, string> = { standing: 'Standing (until graduation)', academic_year: 'Academic Year', fixed_period: 'Fixed Period' };
const EFFECTIVE_STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  expired: 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]',
  revoked: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
};

function studentLabel(s: StudentBrief): string {
  return `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim() || s.studentId;
}

// ---------------------------------------------------------------------------
// Student Search Picker — same pattern as Record Payment's, kept local since
// neither page shares a component for it today.
// ---------------------------------------------------------------------------

function StudentSearchPicker({ value, onSelect }: { value: StudentBrief | null; onSelect: (s: StudentBrief | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentBrief[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/students', { params: { search: query.trim(), limit: '20', approvalStatus: 'approved' } });
        setResults(data.data || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{studentLabel(value)}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{value.studentId}{value.user?.phone ? ` · ${value.user.phone}` : ''}</p>
        </div>
        <button type="button" onClick={() => { onSelect(null); setQuery(''); }} className="flex-shrink-0 rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-red-600 transition-colors" title="Change student">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search by student ID or phone number..."
          className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] pl-9 pr-4 py-2.5 text-sm"
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
          {searching ? (
            <p className="px-4 py-3 text-xs text-[var(--color-text-tertiary)] text-center">Searching...</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[var(--color-text-tertiary)] text-center">No students found for "{query}".</p>
          ) : (
            results.map((s) => (
              <button
                key={s._id}
                type="button"
                onClick={() => { onSelect(s); setOpen(false); setQuery(''); }}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-surface-tertiary)] transition-colors border-b border-[var(--color-border-subtle)] last:border-0"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--color-text-primary)] truncate">{studentLabel(s)}</span>
                  <span className="block text-xs text-[var(--color-text-tertiary)] font-mono">{s.studentId}{s.user?.phone ? ` · ${s.user.phone}` : ''}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm Modal — the same review-before-submit pattern as Record Payment.
// ---------------------------------------------------------------------------

interface PendingGrant {
  student: StudentBrief;
  invoice: InvoiceBrief;
  type: string;
  valueType: string;
  value: number;
  reason: string;
  computedAmount: number;
}

function ConfirmGrantModal({ pending, submitting, onCancel, onConfirm }: { pending: PendingGrant; submitting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => !submitting && onCancel()}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Confirm {TYPE_LABELS[pending.type]}</h2>
        </div>
        <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4 space-y-2.5 text-sm mb-5">
          <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">Student</span><span className="font-semibold text-[var(--color-text-primary)] text-right">{studentLabel(pending.student)}<br /><span className="text-xs font-mono text-[var(--color-text-tertiary)]">{pending.student.studentId}</span></span></div>
          <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">Invoice</span><span className="font-medium text-[var(--color-text-primary)] text-right">{pending.invoice.title}<br /><span className="text-xs text-[var(--color-text-tertiary)]">{pending.invoice.period}</span></span></div>
          <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">Value</span><span className="font-medium text-[var(--color-text-primary)]">{pending.valueType === 'percent' ? `${pending.value}%` : `$${pending.value.toLocaleString()}`}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">Amount Applied</span><span className="font-bold text-primary-600">${pending.computedAmount.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">New Balance Due</span><span className="font-bold text-emerald-600">${Math.max(0, pending.invoice.amountDue - pending.computedAmount).toLocaleString()}</span></div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={submitting} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={submitting} className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors">{submitting ? 'Applying...' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recurring Discount Grants — a policy tied to the student, auto-applied by
// the backend at invoice-generation time. Separate state/API from the
// one-time adjustment above since it doesn't touch an existing invoice at
// all — creating one takes effect the next time a bill is generated.
// ---------------------------------------------------------------------------

function DiscountGrantsPanel() {
  const [selectedStudent, setSelectedStudent] = useState<StudentBrief | null>(null);
  const [grants, setGrants] = useState<DiscountGrantRow[]>([]);
  const [loadingGrants, setLoadingGrants] = useState(false);

  const [label, setLabel] = useState('');
  const [type, setType] = useState<'discount' | 'waiver' | 'scholarship'>('scholarship');
  const [durationType, setDurationType] = useState<'standing' | 'academic_year' | 'fixed_period'>('standing');
  const [valueType, setValueType] = useState<'fixed' | 'percent'>('percent');
  const [value, setValue] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState('');
  const [reason, setReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchGrants = useCallback(async (studentId?: string) => {
    setLoadingGrants(true);
    try {
      const { data } = await api.get('/discount-grants', { params: { limit: '20', ...(studentId ? { studentId } : {}) } });
      setGrants(data.data || []);
    } catch {
      setGrants([]);
    } finally {
      setLoadingGrants(false);
    }
  }, []);

  useEffect(() => {
    fetchGrants(selectedStudent?._id);
  }, [selectedStudent, fetchGrants]);

  const numValue = Number(value) || 0;
  const isValid = !!selectedStudent && !!label.trim() && numValue > 0 && !!reason.trim()
    && (valueType !== 'percent' || numValue <= 100)
    && (durationType === 'standing' || !!validUntil)
    && (durationType !== 'academic_year' || !!academicYear.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) { setError('Select a student first'); return; }
    if (!label.trim()) { setError('A label is required'); return; }
    if (!(numValue > 0)) { setError('Enter a value greater than zero'); return; }
    if (valueType === 'percent' && numValue > 100) { setError('Percentage cannot exceed 100'); return; }
    if (durationType !== 'standing' && !validUntil) { setError('Set an end date, or choose "Standing" for no expiry'); return; }
    if (durationType === 'academic_year' && !academicYear.trim()) { setError('Academic year is required for this duration type'); return; }
    if (!reason.trim()) { setError('A reason is required'); return; }
    setSubmitting(true); setError(''); setMessage('');
    try {
      await api.post('/discount-grants', {
        studentId: selectedStudent._id,
        label: label.trim(),
        type,
        durationType,
        valueType,
        value: numValue,
        academicYear: durationType === 'academic_year' ? academicYear.trim() : undefined,
        validFrom,
        validUntil: durationType === 'standing' ? undefined : validUntil,
        reason: reason.trim(),
      });
      setMessage(`${DURATION_LABELS[durationType]} grant "${label.trim()}" created for ${studentLabel(selectedStudent)}.`);
      setLabel(''); setValue(''); setAcademicYear(''); setValidUntil(''); setReason('');
      await fetchGrants(selectedStudent._id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create discount grant');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (grant: DiscountGrantRow) => {
    const revokeReason = window.prompt(`Revoke "${grant.label}"? Optionally give a reason:`);
    if (revokeReason === null) return;
    try {
      await api.patch(`/discount-grants/${grant._id}/revoke`, { reason: revokeReason });
      await fetchGrants(selectedStudent?._id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to revoke discount grant');
    }
  };

  const ic = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
        <div className="px-6 py-4 border-b border-[var(--color-border-default)]">
          <h2 className="font-semibold text-[var(--color-text-primary)]">Recurring Discount Grants{selectedStudent ? ` — ${studentLabel(selectedStudent)}` : ''}</h2>
        </div>
        {loadingGrants ? (
          <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>
        ) : grants.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-[var(--color-text-tertiary)]">No recurring discount grants yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Student</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Label</th>
                  <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">Duration</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Value</th>
                  <th className="text-left px-4 py-2.5 font-semibold hidden md:table-cell">Window</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {grants.map(g => (
                  <tr key={g._id} className="border-b border-[var(--color-border-subtle)] last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{g.student?.profile ? `${g.student.profile.firstName} ${g.student.profile.lastName}` : g.student?.studentId}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{g.student?.studentId}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{g.label}</p>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_BADGE[g.type]}`}>{TYPE_LABELS[g.type]}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell text-[var(--color-text-secondary)]">{DURATION_LABELS[g.durationType]}{g.academicYear ? ` (${g.academicYear})` : ''}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{g.valueType === 'percent' ? `${g.inputValue}%` : `$${g.inputValue.toLocaleString()}`}</td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-[var(--color-text-tertiary)] text-xs">
                      {new Date(g.validFrom).toLocaleDateString()} – {g.validUntil ? new Date(g.validUntil).toLocaleDateString() : 'graduation'}
                    </td>
                    <td className="px-4 py-2.5"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${EFFECTIVE_STATUS_BADGE[g.effectiveStatus]}`}>{g.effectiveStatus}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      {g.effectiveStatus === 'active' && (
                        <button type="button" onClick={() => handleRevoke(g)} title="Revoke" className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors">
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
        <div className="flex items-center gap-2 pb-4 mb-5 border-b border-[var(--color-border-default)]">
          <Repeat className="h-5 w-5 text-primary-600" strokeWidth={1.75} />
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Grant a Recurring Discount</h2>
        </div>

        {message && <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700"><CheckCircle2 className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />{message}</div>}
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Student *</label>
                <StudentSearchPicker value={selectedStudent} onSelect={setSelectedStudent} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Label *</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Staff Child Discount, Merit Scholarship 2026" className={ic} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Type</label>
                  <select value={type} onChange={e => setType(e.target.value as any)} className={ic}>
                    <option value="discount">Discount</option>
                    <option value="waiver">Fee Waiver</option>
                    <option value="scholarship">Scholarship</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Value Type</label>
                  <select value={valueType} onChange={e => setValueType(e.target.value as any)} className={ic}>
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">{valueType === 'percent' ? 'Percentage (%) *' : 'Amount ($) *'}</label>
                <input type="number" value={value} onChange={e => setValue(e.target.value)} min={0.01} max={valueType === 'percent' ? 100 : undefined} step="0.01" className={ic} placeholder={valueType === 'percent' ? '0 - 100' : '0.00'} required />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Duration</label>
                <select value={durationType} onChange={e => setDurationType(e.target.value as any)} className={ic}>
                  <option value="standing">Standing — until graduation/withdrawal</option>
                  <option value="academic_year">Academic Year — needs re-granting yearly</option>
                  <option value="fixed_period">Fixed Period — a specific month/term</option>
                </select>
              </div>
              {durationType === 'academic_year' && (
                <div>
                  <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Academic Year *</label>
                  <input type="text" value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="e.g. 2026-2027" className={ic} required />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Starts</label>
                  <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} className={ic} />
                </div>
                {durationType !== 'standing' && (
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Ends *</label>
                    <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={ic} required />
                  </div>
                )}
              </div>
              {durationType === 'standing' && (
                <p className="text-[11px] text-[var(--color-text-tertiary)] rounded-xl border border-dashed border-[var(--color-border-default)] px-4 py-3">No end date — applies to every future invoice until revoked or the student graduates/withdraws.</p>
              )}
            </div>

            <div className="flex flex-col justify-between space-y-4">
              <div>
                <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Reason *</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="e.g. Faculty child, merit scholarship for top GPA, temporary hardship relief..." className={ic} required />
              </div>
              <div className="pt-2">
                {/* Only `submitting` disables the button — staying clickable while the form is incomplete
                    lets handleSubmit's per-field error messages actually reach the user. */}
                <button type="submit" disabled={submitting}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm ${!isValid && !submitting ? 'opacity-60' : ''}`}>
                  <Repeat className="h-4 w-4" strokeWidth={1.75} />
                  {submitting ? 'Granting...' : 'Grant Recurring Discount'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PaymentsDiscounts() {
  const [selectedStudent, setSelectedStudent] = useState<StudentBrief | null>(null);
  const [invoices, setInvoices] = useState<InvoiceBrief[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [invoiceId, setInvoiceId] = useState('');
  const [type, setType] = useState<'discount' | 'waiver' | 'scholarship'>('discount');
  const [valueType, setValueType] = useState<'fixed' | 'percent'>('fixed');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  const [pending, setPending] = useState<PendingGrant | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [history, setHistory] = useState<AdjustmentRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [activeTab, setActiveTab] = useState<'one-time' | 'recurring'>('one-time');

  const fetchInvoices = useCallback(async (studentId: string) => {
    setLoadingInvoices(true);
    try {
      const { data } = await api.get(`/invoices/student/${studentId}`);
      const open = (data.data || []).filter((inv: InvoiceBrief) => inv.status !== 'paid' && (inv.amountDue ?? 0) > 0);
      setInvoices(open);
      setInvoiceId(open[0]?._id || '');
    } catch (err: any) {
      setInvoices([]);
      setError(err.response?.data?.message || 'Failed to load this student\'s invoices');
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  const fetchHistory = useCallback(async (studentId?: string) => {
    setLoadingHistory(true);
    try {
      const { data } = await api.get('/fee-adjustments', { params: { limit: '10', ...(studentId ? { studentId } : {}) } });
      setHistory(data.data || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStudent) {
      fetchInvoices(selectedStudent._id);
      fetchHistory(selectedStudent._id);
    } else {
      setInvoices([]);
      setInvoiceId('');
      fetchHistory();
    }
  }, [selectedStudent, fetchInvoices, fetchHistory]);

  const selectedInvoice = invoices.find(i => i._id === invoiceId) || null;
  const numValue = Number(value) || 0;
  const computedAmount = selectedInvoice
    ? Math.round((valueType === 'percent' ? (numValue / 100) * selectedInvoice.amount : numValue) * 100) / 100
    : 0;
  const isValid = !!selectedStudent && !!selectedInvoice && numValue > 0 && !!reason.trim() && (valueType !== 'percent' || numValue <= 100);

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) { setError('Select a student first'); return; }
    if (!selectedInvoice) { setError('Select an invoice to adjust — this student has no unpaid or partially-paid invoices if the list is empty'); return; }
    if (!(numValue > 0)) { setError('Enter a value greater than zero'); return; }
    if (valueType === 'percent' && numValue > 100) { setError('Percentage cannot exceed 100'); return; }
    if (!reason.trim()) { setError('A reason is required'); return; }
    setError('');
    setPending({ student: selectedStudent, invoice: selectedInvoice, type, valueType, value: numValue, reason: reason.trim(), computedAmount });
  };

  const handleConfirm = async () => {
    if (!pending) return;
    setSubmitting(true); setError(''); setMessage('');
    try {
      await api.post('/fee-adjustments', {
        invoiceId: pending.invoice._id,
        type: pending.type,
        valueType: pending.valueType,
        value: pending.value,
        reason: pending.reason,
      });
      setMessage(`${TYPE_LABELS[pending.type]} of $${pending.computedAmount.toLocaleString()} applied to ${pending.invoice.title}.`);
      setValue(''); setReason(''); setPending(null); setShowAdjustmentModal(false);
      if (selectedStudent) { await fetchInvoices(selectedStudent._id); await fetchHistory(selectedStudent._id); }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to apply adjustment');
      setPending(null);
    } finally {
      setSubmitting(false);
    }
  };

  const ic = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500';

  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  const handleGrantClick = () => {
    setError('');
    setShowAdjustmentModal(true);
  };

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-3xl font-bold text-[var(--color-text-primary)]"><BadgePercent className="h-7 w-7 text-primary-600" strokeWidth={1.75} /> Discounts &amp; Scholarships</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {activeTab === 'one-time'
                ? "Grant a one-time discount, fee waiver, or scholarship against a student's unpaid invoice. Applies immediately, once."
                : 'Grant a recurring discount policy tied to a student — standing, per academic year, or a fixed period — that auto-applies to every invoice generated for them while it\'s valid.'}
            </p>
          </div>
          <button type="button" onClick={handleGrantClick}
              className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Grant Discount
          </button>
        </div>

        {message && <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700"><CheckCircle2 className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        <>
        {/* Recent Adjustments — placed at the top so admins immediately see current discounts */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="px-6 py-4 border-b border-[var(--color-border-default)]">
            <h2 className="font-semibold text-[var(--color-text-primary)]">Recent Adjustments{selectedStudent ? ` — ${studentLabel(selectedStudent)}` : ''}</h2>
          </div>
          {loadingHistory ? (
            <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>
          ) : history.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-[var(--color-text-tertiary)]">No discounts, waivers, or scholarships granted yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">Student</th>
                    <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">Invoice</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
                    <th className="text-left px-4 py-2.5 font-semibold hidden md:table-cell">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => (
                    <tr key={row._id} className="border-b border-[var(--color-border-subtle)] last:border-0">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{row.student?.profile ? `${row.student.profile.firstName} ${row.student.profile.lastName}` : row.student?.studentId}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{row.student?.studentId}</p>
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-[var(--color-text-secondary)]">{row.invoice?.title} <span className="text-xs text-[var(--color-text-tertiary)]">({row.invoice?.period})</span></td>
                      <td className="px-4 py-2.5"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[row.type]}`}>{TYPE_LABELS[row.type]}</span></td>
                      <td className="px-4 py-2.5 text-right font-semibold">${row.amount.toLocaleString()}<span className="block text-[10px] text-[var(--color-text-tertiary)] font-normal">{row.valueType === 'percent' ? `${row.inputValue}%` : 'fixed'}</span></td>
                      <td className="px-4 py-2.5 hidden md:table-cell text-[var(--color-text-tertiary)] max-w-xs truncate" title={row.reason}>{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showAdjustmentModal && <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={() => setShowAdjustmentModal(false)}>
        <div className="my-8 max-h-[calc(100vh-4rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-2xl sm:p-7" onClick={e => e.stopPropagation()}>
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--color-border-default)] pb-4">
            <div className="flex items-center gap-2">
            <BadgePercent className="h-5 w-5 text-primary-600" strokeWidth={1.75} />
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Apply New Adjustment</h2>
            </div>
            <button type="button" onClick={() => setShowAdjustmentModal(false)} className="rounded-lg p-2 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]" title="Close"><X className="h-5 w-5" /></button>
          </div>

          <div className="mb-6 inline-flex w-full items-center gap-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-1 sm:w-auto">
            <button type="button" onClick={() => setActiveTab('one-time')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${activeTab === 'one-time' ? 'bg-[var(--color-surface-primary)] text-primary-600 shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}`}><BadgePercent className="h-4 w-4" strokeWidth={1.75} /> One-Time Adjustment</button>
            <button type="button" onClick={() => setActiveTab('recurring')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${activeTab === 'recurring' ? 'bg-[var(--color-surface-primary)] text-primary-600 shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}`}><Repeat className="h-4 w-4" strokeWidth={1.75} /> Recurring Grants</button>
          </div>

          {activeTab === 'recurring' && <DiscountGrantsPanel />}
          {activeTab === 'one-time' && (
          
          <form onSubmit={handleReview} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Left Column: Student Selection & Invoice Selection */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Student *</label>
                  <StudentSearchPicker value={selectedStudent} onSelect={setSelectedStudent} />
                </div>

                {selectedStudent && (
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Invoice *</label>
                    {loadingInvoices ? (
                      <p className="text-xs text-[var(--color-text-tertiary)] py-2">Loading invoices...</p>
                    ) : invoices.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-tertiary)] rounded-xl border border-dashed border-[var(--color-border-default)] px-4 py-3">This student has no unpaid or partially-paid invoices to adjust.</p>
                    ) : (
                      <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)} className={ic}>
                        {invoices.map(inv => (
                          <option key={inv._id} value={inv._id}>{inv.title} — {inv.period} (Due ${inv.amountDue.toLocaleString()})</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Middle Column: Type, Value Type & Amount */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Type</label>
                    <select value={type} onChange={e => setType(e.target.value as any)} className={ic}>
                      <option value="discount">Discount</option>
                      <option value="waiver">Fee Waiver</option>
                      <option value="scholarship">Scholarship</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Value Type</label>
                    <select value={valueType} onChange={e => setValueType(e.target.value as any)} className={ic}>
                      <option value="fixed">Fixed Amount ($)</option>
                      <option value="percent">Percentage (%)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">
                    {valueType === 'percent' ? 'Percentage (%) *' : 'Amount ($) *'}
                  </label>
                  <input type="number" value={value} onChange={e => setValue(e.target.value)}
                    min={0.01} max={valueType === 'percent' ? 100 : undefined} step="0.01"
                    className={ic} placeholder={valueType === 'percent' ? '0 - 100' : '0.00'} required />
                  {selectedInvoice && numValue > 0 && (
                    <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                      Applies ${computedAmount.toLocaleString()} against a due balance of ${selectedInvoice.amountDue.toLocaleString()}
                      {computedAmount > selectedInvoice.amountDue && <span className="text-red-600 dark:text-red-400"> — exceeds remaining balance</span>}
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: Reason and Submit Button */}
              <div className="flex flex-col justify-between space-y-4">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block text-[var(--color-text-secondary)]">Reason *</label>
                  <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                    placeholder="e.g. Sibling discount, hardship waiver, merit scholarship..." className={ic} required />
                </div>

                <div className="pt-2">
                  {/* Stays clickable even when incomplete — a disabled submit button can never fire handleReview's
                      "fill in every field" error, which just leaves the click looking like it did nothing. */}
                  <button type="submit"
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm ${!isValid ? 'opacity-60' : ''}`}>
                    <BadgePercent className="h-4 w-4" strokeWidth={1.75} />
                    Review {TYPE_LABELS[type]}
                  </button>
                </div>
              </div>
            </div>
          </form>
          )}
        </div>
        </div>}
        </>
      </div>

      {pending && (
        <ConfirmGrantModal
          pending={pending}
          submitting={submitting}
          onCancel={() => setPending(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

export default PaymentsDiscounts;
