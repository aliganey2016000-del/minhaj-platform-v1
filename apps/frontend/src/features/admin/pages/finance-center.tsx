import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Landmark, ReceiptText, RefreshCw, Scale, Search, TrendingUp, WalletCards } from 'lucide-react';
import api from '../../../lib/axios';

type Tab = 'overview' | 'pnl' | 'balance' | 'ar' | 'reconciliation';
type Account = { accountId?: string; _id?: string; code: string; name: string; amount: number };
type ReconAccount = { _id: string; code: string; name: string };
type Recon = { _id: string; account?: ReconAccount; asOf: string; statementBalance: number; ledgerBalance: number; difference: number; status: 'open' | 'reconciled' };

const money = (v: unknown) => `$${(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

export function FinanceCenter() {
  const [tab, setTab] = useState<Tab>('overview');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pnl, setPnl] = useState<any>();
  const [balance, setBalance] = useState<any>();
  const [ar, setAr] = useState<any>();
  const [cash, setCash] = useState<any>();
  const [accounts, setAccounts] = useState<ReconAccount[]>([]);
  const [recons, setRecons] = useState<Recon[]>([]);
  const [accountId, setAccountId] = useState('');
  const [statement, setStatement] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<any>();
  const [saving, setSaving] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true); setError('');
    const results = await Promise.allSettled([
      api.get('/accounting/reports/profit-and-loss', { params: { dateFrom: from, dateTo: to } }),
      api.get('/accounting/reports/balance-sheet', { params: { asOf } }),
      api.get('/accounting/reports/ar-aging', { params: { asOf } }),
      api.get('/accounting/reports/cash-position', { params: { asOf } }),
    ]);
    const labels = ['P&L', 'Balance Sheet', 'AR Aging', 'Cash Position'];
    results.forEach((r, i) => { if (r.status === 'rejected') return; const data = r.value.data?.data; if (i === 0) setPnl(data); if (i === 1) setBalance(data); if (i === 2) setAr(data); if (i === 3) setCash(data); });
    const failed = results.map((r, i) => r.status === 'rejected' ? labels[i] : '').filter(Boolean);
    if (failed.length) setError(`Unable to load: ${failed.join(', ')}.`);
    setLoading(false);
  }, [from, to, asOf]);

  const loadReconciliation = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([api.get('/finance/reconciliations/accounts'), api.get('/finance/reconciliations')]);
      const list = a.data?.data || [];
      setAccounts(list); setRecons(r.data?.data?.items || r.data?.data || []);
      if (!accountId && list[0]?._id) setAccountId(list[0]._id);
    } catch (e: any) { setError(e?.response?.data?.message || 'Unable to load reconciliation.'); }
  }, [accountId]);

  useEffect(() => { loadReports(); }, [loadReports]);
  useEffect(() => { loadReconciliation(); }, [loadReconciliation]);
  const refresh = async () => { await Promise.all([loadReports(), loadReconciliation()]); };
  const previewRecon = async () => { if (!accountId) return; try { const r = await api.get(`/finance/reconciliations/preview/${accountId}`, { params: { asOf } }); setPreview(r.data?.data); setError(''); } catch (e: any) { setError(e?.response?.data?.message || 'Unable to preview reconciliation.'); } };
  const saveRecon = async () => { if (!accountId || statement === '') return; setSaving(true); setError(''); try { await api.post('/finance/reconciliations', { accountId, asOf, statementBalance: Number(statement), notes: notes || undefined }); setStatement(''); setNotes(''); setPreview(undefined); await loadReconciliation(); } catch (e: any) { setError(e?.response?.data?.message || 'Unable to save reconciliation.'); } finally { setSaving(false); } };
  const reconcile = async (id: string) => { try { await api.post(`/finance/reconciliations/${id}/reconcile`); await loadReconciliation(); } catch (e: any) { setError(e?.response?.data?.message || 'Unable to complete reconciliation.'); } };

  const tabs: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'pnl', label: 'P&L' }, { id: 'balance', label: 'Balance Sheet' }, { id: 'ar', label: 'AR Aging' }, { id: 'reconciliation', label: 'Reconciliation' }];
  const arTotal = Number(ar?.totalOutstanding) || 0;
  const cashTotal = Number(cash?.totalCashAndEquivalents) || 0;

  return <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10"><div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-primary-600">Finance Control Center</p><h1 className="mt-2 text-3xl font-bold">Accounting & Reconciliation</h1><p className="mt-2 text-sm text-[var(--color-text-tertiary)]">School-wide view of revenue, expenses, student debt, cash and reconciliation.</p></div><button onClick={refresh} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh</button></header>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={TrendingUp} label="Net income" value={money(pnl?.netIncome)} /><Metric icon={Scale} label="Total assets" value={money(balance?.totalAssets)} /><Metric icon={ReceiptText} label="Fees outstanding" value={money(arTotal)} /><Metric icon={WalletCards} label="Cash & equivalents" value={money(cashTotal)} /></div>
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2">{tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === t.id ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>{t.label}</button>)}</nav>
    {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

    {(tab === 'overview' || tab === 'pnl') && <Card title="Profit & Loss" icon={TrendingUp} actions={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}><div className="grid gap-3 sm:grid-cols-3"><Summary label="Revenue" value={money(pnl?.totalRevenue)} /><Summary label="Expenses" value={money(pnl?.totalExpenses)} /><Summary label="Net income" value={money(pnl?.netIncome)} strong /></div><AccountTable rows={[...(pnl?.revenue || []), ...(pnl?.expenses || [])]} /></Card>}
    {(tab === 'overview' || tab === 'balance') && <Card title="Balance Sheet" icon={Scale} actions={<DateInput label="As of" value={asOf} onChange={setAsOf} />}><div className="grid gap-5 lg:grid-cols-3"><AccountSection title="Assets" rows={balance?.assets || []} /><AccountSection title="Liabilities" rows={balance?.liabilities || []} /><AccountSection title="Equity" rows={balance?.equity || []} /></div><div className={`mt-5 rounded-xl p-4 ${balance?.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}><p className="font-semibold">{balance?.balanced ? '✓ Books are balanced' : '⚠ Books are out of balance'}</p><p className="mt-1 text-sm">Assets {money(balance?.totalAssets)} · Liabilities + Equity {money(balance?.liabilitiesAndEquity)}</p></div></Card>}
    {(tab === 'overview' || tab === 'ar') && <Card title="Accounts Receivable Aging" icon={ReceiptText} actions={<DateInput label="As of" value={asOf} onChange={setAsOf} />}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(ar?.buckets || {}).map(([k, v]) => <Summary key={k} label={bucket(k)} value={money(v)} />)}</div><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-[var(--color-text-tertiary)]"><th className="px-2 py-3">Invoice</th><th>Due</th><th>Age</th><th className="text-right">Balance</th></tr></thead><tbody>{(ar?.items || []).slice(0, 100).map((x: any) => <tr key={String(x.invoiceId)} className="border-b border-[var(--color-border-subtle)]"><td className="px-2 py-3 font-medium">{x.title || String(x.invoiceId)}</td><td>{x.dueDate ? new Date(x.dueDate).toLocaleDateString() : '—'}</td><td>{x.ageDays}d</td><td className="text-right font-semibold">{money(x.balance)}</td></tr>)}</tbody></table></div></Card>}
    {(tab === 'overview' || tab === 'reconciliation') && <Card title="Cash & Bank Reconciliation" icon={Landmark} actions={<DateInput label="As of" value={asOf} onChange={setAsOf} />}><div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_auto]"><Field label="Account"><select value={accountId} onChange={e => setAccountId(e.target.value)} className="input">{accounts.map(a => <option key={a._id} value={a._id}>{a.code} — {a.name}</option>)}</select></Field><Field label="Statement balance"><input value={statement} onChange={e => setStatement(e.target.value)} type="number" step="0.01" className="input" placeholder="0.00" /></Field><button onClick={previewRecon} className="self-end rounded-xl border px-4 py-2.5 text-sm font-semibold"><Search className="mr-2 inline h-4 w-4" />Preview</button></div>{preview && <div className="mt-4 grid gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4 sm:grid-cols-3"><Summary label="Ledger balance" value={money(preview.ledgerBalance)} /><Summary label="Statement" value={money(statement)} /><Summary label="Difference" value={money(Number(statement) - Number(preview.ledgerBalance))} strong /></div>}<div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" className="input flex-1" /><button disabled={saving || !accountId || statement === ''} onClick={saveRecon} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save reconciliation'}</button></div><div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-[var(--color-text-tertiary)]"><th className="py-3">Account</th><th>As of</th><th>Difference</th><th>Status</th><th /></tr></thead><tbody>{recons.map(r => <tr key={r._id} className="border-b border-[var(--color-border-subtle)]"><td className="py-3 font-medium">{r.account?.code} — {r.account?.name}</td><td>{new Date(r.asOf).toLocaleDateString()}</td><td className={Math.abs(Number(r.difference)) < 0.01 ? 'font-semibold text-emerald-600' : 'font-semibold text-amber-600'}>{money(r.difference)}</td><td><span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-xs font-semibold">{r.status === 'reconciled' && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}{r.status}</span></td><td className="text-right">{r.status === 'open' && Math.abs(Number(r.difference)) < 0.01 && <button onClick={() => reconcile(r._id)} className="text-xs font-semibold text-primary-600">Mark reconciled</button>}</td></tr>)}</tbody></table></div></Card>}
  </div></div>;
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) { return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><Icon className="h-5 w-5 text-primary-600" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>; }
function Card({ title, icon: Icon, actions, children }: { title: string; icon: any; actions?: ReactNode; children: ReactNode }) { return <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-6"><div className="mb-5 flex flex-col gap-3 border-b border-[var(--color-border-subtle)] pb-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary-600" /><h2 className="text-lg font-bold">{title}</h2></div>{actions}</div>{children}</section>; }
function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="rounded-xl bg-[var(--color-surface-secondary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">{label}</p><p className={`${strong ? 'text-xl' : 'text-lg'} mt-1 font-bold`}>{value}</p></div>; }
function AccountSection({ title, rows }: { title: string; rows: Account[] }) { return <div><h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{title}</h3><AccountTable rows={rows} /></div>; }
function AccountTable({ rows }: { rows: Account[] }) { if (!rows.length) return <p className="rounded-xl bg-[var(--color-surface-secondary)] p-4 text-sm text-[var(--color-text-tertiary)]">No posted entries yet.</p>; return <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><tbody>{rows.map((r, i) => <tr key={`${r.accountId || r._id || r.code}-${i}`} className="border-b border-[var(--color-border-subtle)]"><td className="py-2.5 font-medium">{r.code}</td><td className="py-2.5">{r.name}</td><td className="py-2.5 text-right font-semibold">{money(r.amount)}</td></tr>)}</tbody></table></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}{children}</label>; }
function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) { return <Field label={label}><input type="date" value={value} onChange={e => onChange(e.target.value)} className="input mt-1" /></Field>; }
function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) { return <div className="flex flex-col gap-2 sm:flex-row"><DateInput label="From" value={from} onChange={setFrom} /><DateInput label="To" value={to} onChange={setTo} /></div>; }
function bucket(k: string) { return ({ current: 'Current', days1To30: '1–30 days', days31To60: '31–60 days', days61To90: '61–90 days', over90: '90+ days' } as Record<string, string>)[k] || k; }

export default FinanceCenter;
