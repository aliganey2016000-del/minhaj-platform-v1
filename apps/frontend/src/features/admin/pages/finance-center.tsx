import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, WalletCards, Landmark, TrendingUp, ReceiptText, Scale, Search } from 'lucide-react';
import api from '../../../lib/axios';

const money = (value?: number) => `$${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

type ReportTab = 'overview' | 'pnl' | 'balance' | 'ar' | 'reconciliation';
interface AccountRow { accountId: string; code: string; name: string; amount: number; type?: string; }
interface ReconciliationAccount { _id: string; code: string; name: string; }
interface ReconciliationRecord { _id: string; account: ReconciliationAccount; asOf: string; statementBalance: number; ledgerBalance: number; difference: number; status: 'open' | 'reconciled'; }

export function FinanceCenter() {
  const [tab, setTab] = useState<ReportTab>('overview');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pnl, setPnl] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [ar, setAr] = useState<any>(null);
  const [cash, setCash] = useState<any>(null);
  const [reconAccounts, setReconAccounts] = useState<ReconciliationAccount[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationRecord[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [statementBalance, setStatementBalance] = useState('');
  const [reconPreview, setReconPreview] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [savingRecon, setSavingRecon] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pnlRes, balanceRes, arRes, cashRes] = await Promise.all([
        api.get('/accounting/reports/profit-loss', { params: { dateFrom: from, dateTo: to } }),
        api.get('/accounting/reports/balance-sheet', { params: { asOf } }),
        api.get('/accounting/reports/ar-aging', { params: { asOf } }),
        api.get('/accounting/reports/cash-position', { params: { asOf } }),
      ]);
      setPnl(pnlRes.data?.data); setBalance(balanceRes.data?.data); setAr(arRes.data?.data); setCash(cashRes.data?.data);
    } catch (err: any) { setError(err?.response?.data?.message || 'Unable to load accounting reports.'); }
    finally { setLoading(false); }
  }, [from, to, asOf]);

  const loadReconciliations = useCallback(async () => {
    try {
      const [accountsRes, listRes] = await Promise.all([api.get('/finance/reconciliations/accounts'), api.get('/finance/reconciliations')]);
      const accounts = accountsRes.data?.data || [];
      setReconAccounts(accounts); setReconciliations(listRes.data?.data?.items || listRes.data?.data || []);
      if (!selectedAccount && accounts[0]?._id) setSelectedAccount(accounts[0]._id);
    } catch (err: any) { setError(err?.response?.data?.message || 'Unable to load reconciliations.'); }
  }, [selectedAccount]);

  useEffect(() => { loadReports(); }, [loadReports]);
  useEffect(() => { loadReconciliations(); }, [loadReconciliations]);
  const refresh = async () => { await loadReports(); await loadReconciliations(); };

  const previewReconciliation = async () => {
    if (!selectedAccount) return;
    try { const res = await api.get(`/finance/reconciliations/preview/${selectedAccount}`, { params: { asOf } }); setReconPreview(res.data?.data); }
    catch (err: any) { setError(err?.response?.data?.message || 'Unable to preview reconciliation.'); }
  };
  const createReconciliation = async () => {
    if (!selectedAccount || statementBalance === '') return;
    setSavingRecon(true); setError('');
    try { await api.post('/finance/reconciliations', { accountId: selectedAccount, asOf, statementBalance: Number(statementBalance), notes: notes || undefined }); setStatementBalance(''); setNotes(''); setReconPreview(null); await loadReconciliations(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Unable to save reconciliation.'); }
    finally { setSavingRecon(false); }
  };
  const completeReconciliation = async (id: string) => {
    try { await api.post(`/finance/reconciliations/${id}/reconcile`); await loadReconciliations(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Reconciliation cannot be completed.'); }
  };

  const totalAr = Number(ar?.totalOutstanding) || 0;
  const cashTotal = Number(cash?.totalCashAndEquivalents) || 0;
  const tabs: { id: ReportTab; label: string }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'pnl', label: 'P&L' }, { id: 'balance', label: 'Balance Sheet' }, { id: 'ar', label: 'AR Aging' }, { id: 'reconciliation', label: 'Reconciliation' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10"><div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-primary-600">Finance control center</p><h1 className="mt-2 text-3xl font-bold text-[var(--color-text-primary)]">Accounting & Reconciliation</h1><p className="mt-2 max-w-2xl text-sm text-[var(--color-text-tertiary)]">Live ledger-backed financial reports and cash reconciliation for your organization.</p></div><button onClick={refresh} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh</button></header>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === item.id ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>{item.label}</button>)}</div>
      {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={TrendingUp} label="Net income" value={money(pnl?.netIncome)} /><Metric icon={Scale} label="Total assets" value={money(balance?.totalAssets)} /><Metric icon={ReceiptText} label="AR outstanding" value={money(totalAr)} /><Metric icon={WalletCards} label="Cash & equivalents" value={money(cashTotal)} /></div>

      {(tab === 'overview' || tab === 'pnl') && <ReportCard title="Profit & Loss" icon={TrendingUp} actions={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}><SummaryRow label="Total revenue" value={money(pnl?.totalRevenue)} positive /><SummaryRow label="Total expenses" value={money(pnl?.totalExpenses)} /><SummaryRow label="Net income" value={money(pnl?.netIncome)} strong /><AccountTable rows={[...(pnl?.revenue || []), ...(pnl?.expenses || [])]} /></ReportCard>}
      {(tab === 'overview' || tab === 'balance') && <ReportCard title="Balance Sheet" icon={Scale} actions={<DateInput label="As of" value={asOf} onChange={setAsOf} />}><div className="grid gap-6 lg:grid-cols-2"><AccountSection title="Assets" rows={balance?.assets || []} /><AccountSection title="Liabilities" rows={balance?.liabilities || []} /><AccountSection title="Equity" rows={balance?.equity || []} /><div className="rounded-xl bg-[var(--color-surface-secondary)] p-4"><p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">Balance check</p><p className={`mt-2 text-lg font-bold ${balance?.balanced ? 'text-emerald-600' : 'text-red-600'}`}>{balance?.balanced ? 'Balanced' : 'Out of balance'}</p><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Assets {money(balance?.totalAssets)} · L+E {money(balance?.liabilitiesAndEquity)}</p></div></div></ReportCard>}
      {(tab === 'overview' || tab === 'ar') && <ReportCard title="Accounts Receivable Aging" icon={ReceiptText} actions={<DateInput label="As of" value={asOf} onChange={setAsOf} />}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(ar?.buckets || {}).map(([key, value]) => <div key={key} className="rounded-xl bg-[var(--color-surface-secondary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">{bucketLabel(key)}</p><p className="mt-1 text-lg font-bold">{money(Number(value))}</p></div>)}</div><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--color-border-default)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><th className="px-3 py-3">Invoice</th><th>Due</th><th>Age</th><th className="text-right">Balance</th></tr></thead><tbody>{(ar?.items || []).slice(0, 50).map((item: any) => <tr key={item.invoiceId} className="border-b border-[var(--color-border-subtle)]"><td className="px-3 py-3 font-medium">{item.title || item.invoiceId}</td><td>{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '—'}</td><td>{item.ageDays}d</td><td className="text-right font-semibold">{money(item.balance)}</td></tr>)}</tbody></table></div></ReportCard>}
      {(tab === 'overview' || tab === 'reconciliation') && <ReportCard title="Cash & Bank Reconciliation" icon={Landmark} actions={<DateInput label="As of" value={asOf} onChange={setAsOf} />}><div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]"><label className="text-xs font-semibold text-[var(--color-text-tertiary)]">Account<select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm">{reconAccounts.map((a) => <option key={a._id} value={a._id}>{a.code} — {a.name}</option>)}</select></label><label className="text-xs font-semibold text-[var(--color-text-tertiary)]">Statement balance<input value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} type="number" step="0.01" className="mt-1 block w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /></label><button onClick={previewReconciliation} className="self-end rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-tertiary)]"><Search className="mr-2 inline h-4 w-4" />Preview</button></div>{reconPreview && <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-4"><div className="grid gap-3 sm:grid-cols-3"><SummaryRow label="Ledger balance" value={money(reconPreview.ledgerBalance)} /><SummaryRow label="Statement" value={money(Number(statementBalance))} /><SummaryRow label="Difference" value={money(Number(statementBalance) - Number(reconPreview.ledgerBalance))} strong /></div></div>}<div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /><button disabled={savingRecon || statementBalance === '' || !selectedAccount} onClick={createReconciliation} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingRecon ? 'Saving…' : 'Save reconciliation'}</button></div><div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--color-border-default)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><th className="py-3">Account</th><th>As of</th><th>Difference</th><th>Status</th><th></th></tr></thead><tbody>{reconciliations.map((r) => <tr key={r._id} className="border-b border-[var(--color-border-subtle)]"><td className="py-3 font-medium">{r.account?.code} — {r.account?.name}</td><td>{new Date(r.asOf).toLocaleDateString()}</td><td className={Math.abs(r.difference) < 0.01 ? 'font-semibold text-emerald-600' : 'font-semibold text-amber-600'}>{money(r.difference)}</td><td><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${r.status === 'reconciled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.status === 'reconciled' && <CheckCircle2 className="h-3 w-3" />}{r.status}</span></td><td className="text-right">{r.status === 'open' && Math.abs(Number(r.difference)) < 0.01 && <button onClick={() => completeReconciliation(r._id)} className="text-xs font-semibold text-primary-600 hover:underline">Mark reconciled</button>}</td></tr>)}</tbody></table></div></ReportCard>}
    </div></div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) { return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><Icon className="h-5 w-5 text-primary-600" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</p><p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">{value}</p></div>; }
function ReportCard({ title, icon: Icon, actions, children }: { title: string; icon: any; actions?: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-6"><div className="mb-5 flex flex-col gap-3 border-b border-[var(--color-border-subtle)] pb-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary-600" /><h2 className="text-lg font-bold">{title}</h2></div>{actions}</div>{children}</section>; }
function SummaryRow({ label, value, strong, positive }: { label: string; value: string; strong?: boolean; positive?: boolean }) { return <div className={`flex justify-between border-b border-[var(--color-border-subtle)] py-3 ${strong ? 'text-base font-bold' : 'text-sm'}`}><span className="text-[var(--color-text-secondary)]">{label}</span><span className={positive ? 'text-emerald-600' : ''}>{value}</span></div>; }
function AccountTable({ rows }: { rows: AccountRow[] }) { return <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--color-border-default)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><th className="py-3">Code</th><th>Account</th><th>Type</th><th className="text-right">Amount</th></tr></thead><tbody>{rows.map((r) => <tr key={`${r.accountId}-${r.code}`} className="border-b border-[var(--color-border-subtle)]"><td className="py-3 font-mono text-xs">{r.code}</td><td>{r.name}</td><td className="capitalize">{r.type || '—'}</td><td className="text-right font-semibold">{money(r.amount)}</td></tr>)}</tbody></table></div>; }
function AccountSection({ title, rows }: { title: string; rows: AccountRow[] }) { return <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{title}</p><div className="divide-y divide-[var(--color-border-subtle)]">{rows.map((r) => <div key={r.accountId} className="flex justify-between py-2 text-sm"><span>{r.code} · {r.name}</span><span className="font-semibold">{money(r.amount)}</span></div>)}{!rows.length && <p className="py-3 text-sm text-[var(--color-text-tertiary)]">No posted balances.</p>}</div></div>; }
function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) { return <label className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}<input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="ml-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1.5 text-xs font-medium text-[var(--color-text-primary)]" /></label>; }
function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) { return <div className="flex flex-wrap items-center gap-2"><DateInput label="From" value={from} onChange={setFrom} /><DateInput label="To" value={to} onChange={setTo} /></div>; }
function bucketLabel(key: string) { return ({ current: 'Current', days1To30: '1–30 days', days31To60: '31–60 days', days61To90: '61–90 days', over90: '90+ days' } as Record<string, string>)[key] || key; }

export default FinanceCenter;
