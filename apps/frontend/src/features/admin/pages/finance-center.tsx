import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Landmark, ReceiptText, RefreshCw, Scale, Search, TrendingUp, WalletCards } from 'lucide-react';
import api from '../../../lib/axios';

const money = (value: unknown) => `$${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const today = () => dateOnly(new Date());
const monthStart = () => { const d = new Date(); return dateOnly(new Date(d.getFullYear(), d.getMonth(), 1)); };

type Tab = 'overview' | 'pnl' | 'balance' | 'ar' | 'reconciliation' | 'trial' | 'journals' | 'accounts';
type Account = { _id: string; code: string; name: string; type: string; active?: boolean; normalBalance?: string };
type ReconAccount = { _id: string; code: string; name: string };
type Recon = { _id: string; account?: ReconAccount; asOf: string; statementBalance: number; ledgerBalance: number; difference: number; status: 'open' | 'reconciled' };

export function FinanceCenter() {
  const [tab, setTab] = useState<Tab>('overview');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pnl, setPnl] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [ar, setAr] = useState<any>(null);
  const [cash, setCash] = useState<any>(null);
  const [trial, setTrial] = useState<any>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [journalTotal, setJournalTotal] = useState(0);
  const [reconAccounts, setReconAccounts] = useState<ReconAccount[]>([]);
  const [reconciliations, setReconciliations] = useState<Recon[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [statementBalance, setStatementBalance] = useState('');
  const [reconPreview, setReconPreview] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [savingRecon, setSavingRecon] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    const requests = await Promise.allSettled([
      api.get('/accounting/reports/profit-and-loss', { params: { dateFrom: from, dateTo: to } }),
      api.get('/accounting/reports/balance-sheet', { params: { asOf } }),
      api.get('/accounting/reports/ar-aging', { params: { asOf } }),
      api.get('/accounting/reports/cash-position', { params: { asOf } }),
      api.get('/accounting/trial-balance', { params: { dateFrom: from, dateTo: to } }),
      api.get('/accounting/accounts'),
      api.get('/accounting/journals', { params: { dateFrom: from, dateTo: to, page: 1, limit: 50 } }),
    ]);
    const [pnlRes, balanceRes, arRes, cashRes, trialRes, accountsRes, journalsRes] = requests;
    if (pnlRes.status === 'fulfilled') setPnl(pnlRes.value.data?.data ?? null);
    if (balanceRes.status === 'fulfilled') setBalance(balanceRes.value.data?.data ?? null);
    if (arRes.status === 'fulfilled') setAr(arRes.value.data?.data ?? null);
    if (cashRes.status === 'fulfilled') setCash(cashRes.value.data?.data ?? null);
    if (trialRes.status === 'fulfilled') setTrial(trialRes.value.data?.data ?? null);
    if (accountsRes.status === 'fulfilled') setAccounts(accountsRes.value.data?.data ?? []);
    if (journalsRes.status === 'fulfilled') {
      const data = journalsRes.value.data?.data ?? {};
      setJournals(data.items ?? []);
      setJournalTotal(Number(data.total) || 0);
    }
    const failed = requests.find((r) => r.status === 'rejected');
    if (failed) {
      const reason = failed.reason;
      setError(reason?.response?.data?.message || 'One or more finance reports could not be loaded.');
    }
    setLoading(false);
  }, [from, to, asOf]);

  const loadReconciliations = useCallback(async () => {
    try {
      const [accountsRes, listRes] = await Promise.all([
        api.get('/finance/reconciliations/accounts'),
        api.get('/finance/reconciliations'),
      ]);
      const list = listRes.data?.data;
      const nextAccounts = accountsRes.data?.data ?? [];
      setReconAccounts(nextAccounts);
      setReconciliations(list?.items ?? list ?? []);
      if (!selectedAccount && nextAccounts[0]?._id) setSelectedAccount(nextAccounts[0]._id);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to load reconciliation data.');
    }
  }, [selectedAccount]);

  useEffect(() => { void loadReports(); }, [loadReports]);
  useEffect(() => { void loadReconciliations(); }, [loadReconciliations]);

  const refresh = async () => { await Promise.all([loadReports(), loadReconciliations()]); };

  const previewReconciliation = async () => {
    if (!selectedAccount) return;
    setError('');
    try {
      const res = await api.get(`/finance/reconciliations/preview/${selectedAccount}`, { params: { asOf } });
      setReconPreview(res.data?.data ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to preview reconciliation.');
    }
  };

  const createReconciliation = async () => {
    if (!selectedAccount || statementBalance === '') return;
    setSavingRecon(true);
    setError('');
    try {
      await api.post('/finance/reconciliations', { accountId: selectedAccount, asOf, statementBalance: Number(statementBalance), notes: notes || undefined });
      setStatementBalance('');
      setNotes('');
      setReconPreview(null);
      await loadReconciliations();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to save reconciliation.');
    } finally {
      setSavingRecon(false);
    }
  };

  const completeReconciliation = async (id: string) => {
    setError('');
    try {
      await api.post(`/finance/reconciliations/${id}/reconcile`);
      await loadReconciliations();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Reconciliation cannot be completed.');
    }
  };

  const totalAr = Number(ar?.totalOutstanding) || 0;
  const cashTotal = Number(cash?.totalCashAndEquivalents) || 0;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'pnl', label: 'P&L' },
    { id: 'balance', label: 'Balance Sheet' },
    { id: 'ar', label: 'Student Debt' },
    { id: 'reconciliation', label: 'Reconciliation' },
    { id: 'trial', label: 'Trial Balance' },
    { id: 'journals', label: 'Journal' },
    { id: 'accounts', label: 'Accounts' },
  ];

  return (
    <main className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Finance control center</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">Accounting & Reconciliation</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-tertiary)]">A school finance workspace for revenue, expenses, student debt, cash control and the accounting ledger.</p>
            </div>
            <button onClick={refresh} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> {loading ? 'Refreshing…' : 'Refresh data'}
            </button>
          </div>
        </header>

        <nav className="overflow-x-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2">
          <div className="flex min-w-max gap-1">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item.id ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>{item.label}</button>)}</div>
        </nav>

        {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Finance data needs attention</p><p className="mt-1">{error}</p></div></div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={TrendingUp} label="Net income" value={money(pnl?.netIncome)} />
          <Metric icon={Scale} label="Total assets" value={money(balance?.totalAssets)} />
          <Metric icon={ReceiptText} label="Student debt" value={money(totalAr)} />
          <Metric icon={WalletCards} label="Cash & bank" value={money(cashTotal)} />
        </section>

        {(tab === 'overview' || tab === 'pnl') && <ReportCard title="Profit & Loss" icon={TrendingUp} subtitle="Income minus expenses for the selected period." actions={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}>
          <div className="grid gap-3 sm:grid-cols-3"><Summary label="Revenue" value={money(pnl?.totalRevenue)} /><Summary label="Expenses" value={money(pnl?.totalExpenses)} /><Summary label="Net income" value={money(pnl?.netIncome)} strong /></div>
          <AccountTable rows={[...(pnl?.revenue || []).map((r: any) => ({ ...r, type: 'Revenue' })), ...(pnl?.expenses || []).map((r: any) => ({ ...r, type: 'Expense' }))]} />
        </ReportCard>}

        {(tab === 'overview' || tab === 'balance') && <ReportCard title="Balance Sheet" icon={Scale} subtitle="What the school owns and owes as of the selected date." actions={<DateInput label="As of" value={asOf} onChange={setAsOf} />}>
          <div className="grid gap-5 lg:grid-cols-3"><AccountSection title="Assets" rows={balance?.assets || []} /><AccountSection title="Liabilities" rows={balance?.liabilities || []} /><AccountSection title="Equity" rows={balance?.equity || []} /></div>
          <div className="mt-5 rounded-2xl bg-[var(--color-surface-secondary)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Accounting equation</p><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Assets {money(balance?.totalAssets)} · Liabilities + Equity {money(balance?.liabilitiesAndEquity)}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${balance?.balanced ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{balance?.balanced ? 'Balanced' : 'Out of balance'}</span></div></div>
        </ReportCard>}

        {(tab === 'overview' || tab === 'ar') && <ReportCard title="Student Debt / AR Aging" icon={ReceiptText} subtitle="Outstanding invoice balances grouped by age." actions={<DateInput label="As of" value={asOf} onChange={setAsOf} />}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(ar?.buckets || {}).map(([key, value]) => <div key={key} className="rounded-2xl bg-[var(--color-surface-secondary)] p-4"><p className="text-xs font-semibold text-[var(--color-text-tertiary)]">{bucketLabel(key)}</p><p className="mt-1 text-xl font-bold">{money(value)}</p></div>)}</div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-[var(--color-border-default)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><th className="px-3 py-3">Invoice</th><th>Due</th><th>Age</th><th>Original</th><th className="text-right">Outstanding</th></tr></thead><tbody>{(ar?.items || []).slice(0, 100).map((item: any) => <tr key={String(item.invoiceId)} className="border-b border-[var(--color-border-subtle)]"><td className="px-3 py-3 font-medium">{item.title || item.invoiceId}</td><td>{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '—'}</td><td>{item.ageDays}d</td><td>{money(item.amount)}</td><td className="text-right font-semibold">{money(item.balance)}</td></tr>)}</tbody></table></div>
        </ReportCard>}

        {(tab === 'overview' || tab === 'reconciliation') && <ReportCard title="Cash & Bank Reconciliation" icon={Landmark} subtitle="Compare the external statement with the school ledger." actions={<DateInput label="As of" value={asOf} onChange={setAsOf} />}>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]"><Field label="Account"><select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className={inputClass}>{reconAccounts.map((a) => <option key={a._id} value={a._id}>{a.code} — {a.name}</option>)}</select></Field><Field label="Statement balance"><input value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} type="number" step="0.01" className={inputClass} placeholder="0.00" /></Field><button onClick={previewReconciliation} className="self-end rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-tertiary)]"><Search className="mr-2 inline h-4 w-4" />Preview</button></div>
          {reconPreview && <div className="mt-4 grid gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4 sm:grid-cols-3"><Summary label="Ledger" value={money(reconPreview.ledgerBalance)} /><Summary label="Statement" value={money(statementBalance)} /><Summary label="Difference" value={money(Number(statementBalance) - Number(reconPreview.ledgerBalance))} strong /></div>}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reconciliation notes (optional)" className={`${inputClass} flex-1`} /><button disabled={savingRecon || statementBalance === '' || !selectedAccount} onClick={createReconciliation} className="min-h-11 rounded-xl bg-primary-600 px-5 text-sm font-semibold text-white disabled:opacity-50">{savingRecon ? 'Saving…' : 'Save reconciliation'}</button></div>
          <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b border-[var(--color-border-default)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><th className="py-3">Account</th><th>As of</th><th>Difference</th><th>Status</th><th /></tr></thead><tbody>{reconciliations.map((r) => <tr key={r._id} className="border-b border-[var(--color-border-subtle)]"><td className="py-3 font-medium">{r.account?.code} — {r.account?.name}</td><td>{new Date(r.asOf).toLocaleDateString()}</td><td className={Math.abs(Number(r.difference)) < 0.01 ? 'font-semibold text-emerald-600' : 'font-semibold text-amber-600'}>{money(r.difference)}</td><td><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.status === 'reconciled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span></td><td className="text-right">{r.status === 'open' && Math.abs(Number(r.difference)) < 0.01 && <button onClick={() => completeReconciliation(r._id)} className="text-xs font-semibold text-primary-600 hover:underline">Mark reconciled</button>}</td></tr>)}</tbody></table></div>
        </ReportCard>}

        {tab === 'trial' && <ReportCard title="Trial Balance" icon={Scale} subtitle="Every ledger account's debit and credit totals." actions={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}><div className="mb-4 flex flex-wrap gap-3"><Summary label="Total debit" value={money(trial?.totalDebit)} /><Summary label="Total credit" value={money(trial?.totalCredit)} /><Summary label="Status" value={trial?.balanced ? 'Balanced' : 'Out of balance'} strong /></div><AccountTable rows={trial?.rows || []} showDebitCredit /></ReportCard>}

        {tab === 'journals' && <ReportCard title="Journal Entries" icon={ReceiptText} subtitle={`${journalTotal} ledger entries in the selected period.`} actions={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}><div className="space-y-3">{journals.map((entry: any) => <JournalEntry key={String(entry._id)} entry={entry} />)}{journals.length === 0 && <Empty text="No journal entries were found for this period." />}</div></ReportCard>}

        {tab === 'accounts' && <ReportCard title="Chart of Accounts" icon={Landmark} subtitle="The accounts used by the school's double-entry ledger."><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-[var(--color-border-default)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><th className="px-3 py-3">Code</th><th>Name</th><th>Type</th><th>Normal balance</th><th>Status</th></tr></thead><tbody>{accounts.map((account) => <tr key={account._id} className="border-b border-[var(--color-border-subtle)]"><td className="px-3 py-3 font-mono font-semibold">{account.code}</td><td className="font-medium">{account.name}</td><td className="capitalize">{account.type}</td><td className="capitalize">{account.normalBalance || '—'}</td><td>{account.active === false ? 'Inactive' : 'Active'}</td></tr>)}</tbody></table>{accounts.length === 0 && <Empty text="No chart-of-accounts records were returned." />}</div></ReportCard>}
      </div>
    </main>
  );
}

const inputClass = 'mt-1 block w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm outline-none focus:border-primary-500';

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) { return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card"><Icon className="h-5 w-5 text-primary-600" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</p><p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">{value}</p></div>; }
function ReportCard({ title, subtitle, icon: Icon, actions, children }: { title: string; subtitle: string; icon: any; actions?: ReactNode; children: ReactNode }) { return <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card sm:p-6"><div className="mb-5 flex flex-col gap-3 border-b border-[var(--color-border-subtle)] pb-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-2"><Icon className="h-5 w-5 text-primary-600" /></div><div><h2 className="text-lg font-bold text-[var(--color-text-primary)]">{title}</h2><p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{subtitle}</p></div></div>{actions}</div>{children}</section>; }
function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="rounded-2xl bg-[var(--color-surface-secondary)] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</p><p className={`mt-1 ${strong ? 'text-xl' : 'text-lg'} font-bold text-[var(--color-text-primary)]`}>{value}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}{children}</label>; }
function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label}><input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} /></Field>; }
function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) { return <div className="grid grid-cols-2 gap-2 sm:flex"><input aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass.replace('mt-1 ', '')} /><input aria-label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass.replace('mt-1 ', '')} /></div>; }
function AccountTable({ rows, showDebitCredit = false }: { rows: any[]; showDebitCredit?: boolean }) { return <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-[var(--color-border-default)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><th className="px-3 py-3">Account</th>{showDebitCredit ? <><th>Debit</th><th>Credit</th></> : <th>Type</th>}<th className="text-right">Amount</th></tr></thead><tbody>{rows.map((row: any, index) => <tr key={`${row.accountId || row.code || 'row'}-${index}`} className="border-b border-[var(--color-border-subtle)]"><td className="px-3 py-3 font-medium">{row.code} — {row.name}</td>{showDebitCredit ? <><td>{money(row.debit)}</td><td>{money(row.credit)}</td></> : <td className="capitalize">{row.type || '—'}</td>}<td className="text-right font-semibold">{money(showDebitCredit ? row.balance : row.amount)}</td></tr>)}</tbody></table>{rows.length === 0 && <Empty text="No accounting activity was found for this period." />}</div>; }
function AccountSection({ title, rows }: { title: string; rows: any[] }) { return <div className="rounded-2xl border border-[var(--color-border-subtle)] p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{title}</h3><span className="text-xs text-[var(--color-text-tertiary)]">{rows.length} accounts</span></div><div className="space-y-2">{rows.map((row: any) => <div key={row.accountId} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{row.code} — {row.name}</span><span className="font-semibold">{money(row.amount)}</span></div>)}{rows.length === 0 && <p className="text-sm text-[var(--color-text-tertiary)]">No balances.</p>}</div></div>; }
function JournalEntry({ entry }: { entry: any }) { const lines = entry.lines || []; return <article className="rounded-2xl border border-[var(--color-border-subtle)] p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{entry.entryNumber || 'Journal entry'}</p><p className="text-xs text-[var(--color-text-tertiary)]">{entry.description || 'No description'}</p></div><span className="text-xs text-[var(--color-text-tertiary)]">{entry.entryDate ? new Date(entry.entryDate).toLocaleDateString() : '—'}</span></div><div className="mt-3 space-y-1">{lines.map((line: any, index: number) => <div key={index} className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm"><span>{line.account?.code} — {line.account?.name}</span><span>{money(line.debit)}</span><span>{money(line.credit)}</span></div>)}</div></article>; }
function Empty({ text }: { text: string }) { return <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-text-tertiary)]"><CheckCircle2 className="h-4 w-4" />{text}</div>; }
function bucketLabel(key: string) { return ({ current: 'Current', days1To30: '1–30 days', days31To60: '31–60 days', days61To90: '61–90 days', over90: '90+ days' } as Record<string, string>)[key] || key; }
