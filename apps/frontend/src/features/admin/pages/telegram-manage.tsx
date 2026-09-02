import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/axios';

interface TelegramMessageRow { _id: string; chatId: string; body: string; status: 'queued' | 'sent' | 'failed'; error?: string; createdAt: string; parent?: { parentId?: string; phone?: string }; }
interface TelegramStatus { configured: boolean; botUsername?: string | null; automation?: { attendanceAlertsEnabled: boolean } }

const statusStyle: Record<string, string> = { sent: 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300', failed: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300', queued: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' };

export function TelegramManage() {
  const [status, setStatus] = useState<TelegramStatus>({ configured: false });
  const [chatId, setChatId] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [items, setItems] = useState<TelegramMessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [statusRes, historyRes] = await Promise.all([api.get('/telegram/status'), api.get('/telegram/history', { params: { limit: 50 } })]);
      setStatus(statusRes.data?.data || { configured: false });
      setItems(historyRes.data?.data || []);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load Telegram status'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setSending(true); setError(''); setSuccess('');
    try {
      await api.post('/telegram/send', { chatId, text });
      setSuccess('Message sent successfully through Telegram.'); setText(''); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to send Telegram message'); }
    finally { setSending(false); }
  };

  const configured = status.configured;
  const automated = Boolean(status.automation?.attendanceAlertsEnabled);

  return (
    <div className="min-h-full p-4 pt-16 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Administration</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Telegram Messaging</h1><p className="mt-1 max-w-2xl text-sm text-[var(--color-text-tertiary)]">Free, unlimited school notifications for parents who link Telegram — no per-message cost, no approved templates required.</p></div>
          <button type="button" onClick={load} disabled={loading} className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-[var(--color-surface-secondary)] disabled:opacity-50 sm:w-auto">{loading ? 'Refreshing…' : 'Refresh'}</button>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className={`rounded-2xl border p-4 ${configured ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'}`}><div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${configured ? 'bg-green-500' : 'bg-amber-500'}`} /><div><p className="text-sm font-bold">{configured ? 'Telegram connected' : 'Telegram not configured'}</p><p className="text-xs opacity-75">{status.botUsername ? `@${status.botUsername}` : 'Telegram Bot API'}</p></div></div></div>
          <div className={`rounded-2xl border p-4 ${automated ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-70">Attendance automation</p><p className="mt-1 text-sm font-bold">{automated ? 'Enabled' : 'Not active'}</p><p className="mt-0.5 text-xs opacity-70">Set TELEGRAM_ATTENDANCE_ALERTS_ENABLED=true in Coolify</p></div>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><p className="text-xs font-semibold uppercase tracking-wide opacity-70">Delivery history</p><p className="mt-1 text-sm font-bold">{items.length} recent records</p><p className="mt-0.5 text-xs opacity-70">Successful and failed attempts are audited.</p></div>
        </div>

        {!configured && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"><p className="font-bold">Finish Telegram setup</p><p className="mt-1">Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="underline">@BotFather</a> (free, takes a minute), then add <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_BOT_USERNAME</code> as runtime environment variables in Coolify, redeploy, and register the webhook once. Parents then link their own chat from their dashboard — no per-message cost, ever.</p></div>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <form onSubmit={send} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card sm:p-5">
            <div className="mb-5"><h2 className="text-lg font-bold">Send a message</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Only parents who have linked Telegram from their dashboard can receive one — paste their chat id, or send from the parent's record instead.</p></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1.5 block text-xs font-semibold">Recipient chat id</span><input value={chatId} onChange={e => setChatId(e.target.value)} inputMode="numeric" placeholder="e.g. 123456789" className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500" required /><span className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">Shown against each linked parent in Message history / their record.</span></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold">Message</span><textarea value={text} onChange={e => setText(e.target.value)} rows={6} className="w-full resize-y rounded-xl border border-[var(--color-border-default)] bg-transparent px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Write your message…" required /></label>
              {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
              {success && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/20 dark:text-green-300">{success}</div>}
              <button disabled={sending || !configured} className="w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">{sending ? 'Sending…' : 'Send via Telegram'}</button>
            </div>
          </form>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
            <div className="border-b border-[var(--color-border-default)] p-4 sm:p-5"><h2 className="text-lg font-bold">Message history</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Latest 50 send attempts, including automated attendance alerts.</p></div>
            {loading ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading history…</div> : items.length === 0 ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No Telegram messages yet.</div> : <div className="max-h-[620px] overflow-auto divide-y divide-[var(--color-border-default)]">{items.map(item => <article key={item._id} className="p-4 transition hover:bg-[var(--color-surface-secondary)]"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.parent?.parentId || item.chatId}</p><p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{new Date(item.createdAt).toLocaleString()}</p></div><span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusStyle[item.status] || ''}`}>{item.status}</span></div><div className="mt-3 rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs"><p className="break-words opacity-75">{item.body}</p>{item.error && <p className="mt-1 break-words text-red-600 dark:text-red-400">{item.error}</p>}</div></article>)}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

export default TelegramManage;
