import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/axios';

interface WhatsAppMessage { _id: string; recipient: string; kind: 'text' | 'template' | 'media' | 'event'; direction?: 'inbound' | 'outbound'; templateName?: string; body?: string; status: 'queued' | 'sent' | 'failed' | 'received'; error?: string; createdAt: string; parent?: { parentId?: string; phone?: string }; }
interface WhatsAppStatus { configured: boolean; provider?: string; account?: { status?: string; phoneNumber?: string | null; hasQr?: boolean; pairingCode?: string | null; lastError?: string | null }; automation?: { attendanceAlertsEnabled: boolean; attendanceTemplate: string | null; languageCode: string } }

const statusStyle: Record<string, string> = {
  sent: 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300',
  received: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300',
  queued: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
};

export function WhatsAppManage() {
  const [status, setStatus] = useState<WhatsAppStatus>({ configured: false });
  const [qr, setQr] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [text, setText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [languageCode, setLanguageCode] = useState('en_US');
  const [variables, setVariables] = useState(['', '', '', '', '']);
  const [mode, setMode] = useState<'text' | 'template'>('text');
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [items, setItems] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [statusRes, historyRes] = await Promise.all([
        api.get('/whatsapp/status'),
        api.get('/whatsapp/history', { params: { limit: 50 } }),
      ]);
      setStatus(statusRes.data?.data || { configured: false });
      setItems(historyRes.data?.data || []);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load WhatsApp status'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadQr = useCallback(async () => {
    try {
      const response = await api.get('/whatsapp/baileys/qr');
      setQr(response.data?.data?.qrDataUrl || null);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load WhatsApp QR'); }
  }, []);

  useEffect(() => {
    if (status.provider === 'Baileys' && ['qr_required', 'pairing_required', 'connecting'].includes(status.account?.status || '')) {
      loadQr();
      const timer = window.setInterval(() => { load(); loadQr(); }, 4000);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [status.provider, status.account?.status, load, loadQr]);

  const connect = async () => {
    setConnecting(true); setError(''); setSuccess('');
    try {
      await api.post('/whatsapp/baileys/connect');
      await load(); await loadQr();
      setSuccess('WhatsApp connection started. Scan the QR code with Linked Devices.');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to start WhatsApp connection'); }
    finally { setConnecting(false); }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect this organization WhatsApp account?')) return;
    try { await api.post('/whatsapp/baileys/disconnect'); setQr(null); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to disconnect WhatsApp'); }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setSending(true); setError(''); setSuccess('');
    try {
      const payload = mode === 'text'
        ? { to: recipient, text }
        : { to: recipient, templateName, languageCode, components: [{ type: 'body', parameters: variables.filter(Boolean).map((value) => ({ type: 'text', text: value })) }] };
      await api.post('/whatsapp/send', payload);
      setSuccess('Message sent successfully through WhatsApp.'); setText(''); setVariables(['', '', '', '', '']); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to send WhatsApp message'); }
    finally { setSending(false); }
  };

  const configured = status.configured;
  const isBaileys = status.provider === 'Baileys';
  const connected = status.account?.status === 'connected';
  const automated = Boolean(status.automation?.attendanceAlertsEnabled && status.automation?.attendanceTemplate);

  return (
    <div className="min-h-full p-4 pt-16 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Administration</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">WhatsApp Messaging</h1><p className="mt-1 max-w-2xl text-sm text-[var(--color-text-tertiary)]">Self-hosted WhatsApp communication with tenant-isolated Baileys sessions.</p></div>
          <button type="button" onClick={load} disabled={loading} className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-[var(--color-surface-secondary)] disabled:opacity-50 sm:w-auto">{loading ? 'Refreshing…' : 'Refresh'}</button>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className={`rounded-2xl border p-4 ${connected || (configured && !isBaileys) ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'}`}><div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${connected || (configured && !isBaileys) ? 'bg-green-500' : 'bg-amber-500'}`} /><div><p className="text-sm font-bold">{connected ? 'WhatsApp connected' : configured ? 'WhatsApp configured' : 'WhatsApp not configured'}</p><p className="text-xs opacity-75">Provider: {status.provider || '—'}{status.account?.phoneNumber ? ` • ${status.account.phoneNumber}` : ''}</p></div></div></div>
          <div className={`rounded-2xl border p-4 ${automated ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-70">Attendance automation</p><p className="mt-1 text-sm font-bold">{automated ? 'Enabled' : 'Not active'}</p><p className="mt-0.5 text-xs opacity-70">{status.automation?.attendanceTemplate || 'Configure attendance automation'}</p></div>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"><p className="text-xs font-semibold uppercase tracking-wide opacity-70">Message history</p><p className="mt-1 text-sm font-bold">{items.length} recent records</p><p className="mt-0.5 text-xs opacity-70">Inbound and outbound activity is audited.</p></div>
        </div>

        {isBaileys && configured && <section className="rounded-2xl border border-primary-200 bg-primary-50/60 p-4 dark:border-primary-900 dark:bg-primary-950/20 sm:p-5"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h2 className="text-lg font-bold">WhatsApp device connection</h2><p className="mt-1 text-sm opacity-75">Link this organization’s WhatsApp number using WhatsApp → Linked devices.</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-60">Status: {status.account?.status || 'disconnected'}</p>{status.account?.lastError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{status.account.lastError}</p>}</div><div className="flex gap-2"><button type="button" onClick={connect} disabled={connecting || connected} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{connecting ? 'Starting…' : connected ? 'Connected' : 'Connect WhatsApp'}</button>{connected && <button type="button" onClick={disconnect} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 dark:border-red-900 dark:text-red-300">Disconnect</button>}</div></div>{qr && !connected && <div className="mt-5 flex flex-col items-center rounded-2xl border border-[var(--color-border-default)] bg-white p-4 dark:bg-black/20"><img src={qr} alt="WhatsApp connection QR code" className="h-64 w-64" /><p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Open WhatsApp on the phone → Settings → Linked devices → Link a device.</p></div>}</section>}

        {!configured && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"><p className="font-bold">Finish WhatsApp setup</p><p className="mt-1">For Baileys, set <code>WHATSAPP_PROVIDER=baileys</code>, the Baileys service URL/token, and persistent session storage. Meta Cloud API remains available as the fallback provider.</p></div>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <form onSubmit={send} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card sm:p-5">
            <div className="mb-5"><h2 className="text-lg font-bold">Send a message</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Text messages use Baileys directly; templates remain available when using Meta.</p></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1.5 block text-xs font-semibold">Recipient phone number</span><input value={recipient} onChange={e => setRecipient(e.target.value)} inputMode="tel" placeholder="2526XXXXXXXX" className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500" required /></label>
              {!isBaileys && <div className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--color-border-default)] p-1"><button type="button" onClick={() => setMode('template')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'template' ? 'bg-primary-600 text-white' : ''}`}>Template</button><button type="button" onClick={() => setMode('text')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'text' ? 'bg-primary-600 text-white' : ''}`}>Text</button></div>}
              {mode === 'text' || isBaileys ? <label className="block"><span className="mb-1.5 block text-xs font-semibold">Message</span><textarea value={text} onChange={e => setText(e.target.value)} rows={6} className="w-full resize-y rounded-xl border border-[var(--color-border-default)] bg-transparent px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Write your message…" required /></label> : <div className="space-y-3"><label className="block"><span className="mb-1.5 block text-xs font-semibold">Approved template name</span><input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder={status.automation?.attendanceTemplate || 'attendance_notice'} className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500" required /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold">Language</span><input value={languageCode} onChange={e => setLanguageCode(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500" /></label><div><p className="mb-2 text-xs font-semibold">Template variables</p><div className="grid gap-2 sm:grid-cols-2">{variables.map((value, index) => <input key={index} value={value} onChange={e => setVariables(v => v.map((x, i) => i === index ? e.target.value : x))} placeholder={`Variable ${index + 1}`} className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500" />)}</div></div></div>}
              {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
              {success && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/20 dark:text-green-300">{success}</div>}
              <button disabled={sending || !configured || (isBaileys && !connected)} className="w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">{sending ? 'Sending…' : 'Send via WhatsApp'}</button>
            </div>
          </form>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card"><div className="border-b border-[var(--color-border-default)] p-4 sm:p-5"><h2 className="text-lg font-bold">Message history</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Latest inbound/outbound records.</p></div>{loading ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading history…</div> : items.length === 0 ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No WhatsApp messages yet.</div> : <div className="max-h-[620px] overflow-auto divide-y divide-[var(--color-border-default)]">{items.map(item => <article key={item._id} className="p-4 transition hover:bg-[var(--color-surface-secondary)]"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.direction === 'inbound' ? `From ${item.recipient}` : item.recipient}</p><p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{new Date(item.createdAt).toLocaleString()}</p></div><span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusStyle[item.status] || ''}`}>{item.direction || 'outbound'} · {item.status}</span></div>{(item.body || item.error) && <div className="mt-3 rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs">{item.body && <p className="break-words opacity-80">{item.body}</p>}{item.error && <p className="mt-1 break-words text-red-600 dark:text-red-400">{item.error}</p>}</div>}</article>)}</div>}</section>
        </div>
      </div>
    </div>
  );
}

export default WhatsAppManage;
