import { FormEvent, useCallback, useEffect, useState } from 'react';
import api from '../../../lib/axios';

interface WhatsAppMessage {
  _id: string;
  recipient: string;
  sender?: string;
  direction: 'inbound' | 'outbound';
  kind: 'text' | 'template' | 'media' | 'event';
  body?: string;
  status: 'queued' | 'sent' | 'failed' | 'received';
  error?: string;
  createdAt: string;
}
interface Conversation {
  _id: string;
  phone: string;
  contactName?: string;
  status: 'open' | 'closed' | 'archived';
  unreadCount: number;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageDirection?: 'inbound' | 'outbound';
  parent?: { parentId?: string; phone?: string };
}
interface WhatsAppStatus {
  configured: boolean;
  provider?: string;
  account?: { status?: string; phoneNumber?: string | null; pairingCode?: string | null; lastError?: string | null };
  automation?: { attendanceAlertsEnabled: boolean; attendanceTemplate: string | null; languageCode: string };
}

const badge: Record<string, string> = {
  sent: 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300',
  received: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300',
  queued: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
};

export function WhatsAppManage() {
  const [status, setStatus] = useState<WhatsAppStatus>({ configured: false });
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState('');
  const [connectionMethod, setConnectionMethod] = useState<'qr' | 'pairing'>('qr');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [recipient, setRecipient] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pairingConnecting, setPairingConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, conversationsRes] = await Promise.all([
        api.get('/whatsapp/status'),
        api.get('/whatsapp/conversations', { params: { limit: 50, search: search || undefined } }),
      ]);
      const nextStatus = statusRes.data?.data || { configured: false };
      setStatus(nextStatus);
      setPairingCode(nextStatus.account?.pairingCode || null);
      setConversations(conversationsRes.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load WhatsApp inbox');
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openConversation = async (conversation: Conversation) => {
    setSelected(conversation);
    setError('');
    try {
      const response = await api.get(`/whatsapp/conversations/${conversation._id}/messages`, { params: { limit: 100 } });
      setMessages(response.data?.data || []);
      if (conversation.unreadCount) {
        await api.post(`/whatsapp/conversations/${conversation._id}/read`);
        setConversations(items => items.map(item => item._id === conversation._id ? { ...item, unreadCount: 0 } : item));
      }
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load conversation'); }
  };

  const loadQr = useCallback(async () => {
    try {
      const response = await api.get('/whatsapp/baileys/qr');
      setQr(response.data?.data?.qrDataUrl || null);
      setPairingCode(response.data?.data?.pairingCode || null);
    } catch { setQr(null); setPairingCode(null); }
  }, []);

  const connect = async () => {
    setConnecting(true); setError(''); setSuccess('');
    try {
      await api.post('/whatsapp/baileys/connect');
      await load();
      await loadQr();
      setConnectionMethod('qr');
      setSuccess('WhatsApp connection started. Scan the QR code from Linked Devices.');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to start WhatsApp connection'); }
    finally { setConnecting(false); }
  };

  const connectWithPairingCode = async (event: FormEvent) => {
    event.preventDefault();
    const phone = pairingPhone.replace(/\D/g, '');
    if (phone.length < 7 || phone.length > 15) {
      setError('Enter the full WhatsApp phone number with country code, digits only.');
      return;
    }
    setPairingConnecting(true); setError(''); setSuccess(''); setPairingCode(null); setQr(null);
    try {
      await api.post('/whatsapp/baileys/connect', { phoneNumber: phone });
      await load();
      await loadQr();
      setSuccess('Pairing code generated. Enter it in WhatsApp → Linked devices → Link with phone number instead.');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to generate WhatsApp pairing code'); }
    finally { setPairingConnecting(false); }
  };

  useEffect(() => {
    if (status.provider === 'Baileys' && ['qr_required', 'pairing_required', 'connecting'].includes(status.account?.status || '')) {
      loadQr();
      const timer = window.setInterval(() => { load(); loadQr(); }, 5000);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [status.provider, status.account?.status, load, loadQr]);

  const disconnect = async () => {
    if (!window.confirm('Disconnect this organization WhatsApp account?')) return;
    try { await api.post('/whatsapp/baileys/disconnect'); setQr(null); setPairingCode(null); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to disconnect WhatsApp'); }
  };

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setSending(true); setError('');
    try {
      await api.post('/whatsapp/send', { conversationId: selected._id, text: reply.trim() });
      setReply('');
      await openConversation(selected);
      await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to send reply'); }
    finally { setSending(false); }
  };

  const sendNew = async (event: FormEvent) => {
    event.preventDefault();
    if (!recipient.trim() || !newMessage.trim()) return;
    setSending(true); setError('');
    try {
      await api.post('/whatsapp/send', { to: recipient.trim(), text: newMessage.trim() });
      setRecipient(''); setNewMessage('');
      setSuccess('Message sent successfully.');
      await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to send message'); }
    finally { setSending(false); }
  };

  const updateStatus = async (next: 'open' | 'closed' | 'archived') => {
    if (!selected) return;
    try {
      await api.patch(`/whatsapp/conversations/${selected._id}`, { status: next });
      const updated = { ...selected, status: next };
      setSelected(updated);
      setConversations(items => items.map(item => item._id === selected._id ? updated : item));
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to update conversation'); }
  };

  const connected = status.account?.status === 'connected';
  const configured = status.configured;
  const baileysReady = status.provider === 'Baileys' && configured;
  const automated = Boolean(status.automation?.attendanceAlertsEnabled && status.automation?.attendanceTemplate);

  return (
    <div className="min-h-full p-4 pt-16 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Communication</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">WhatsApp Inbox</h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Two-way organization-isolated WhatsApp communication powered by Baileys.</p>
          </div>
          <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh'}</button>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className={`rounded-2xl border p-4 ${connected ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-65">Connection</p>
            <p className="mt-1 text-sm font-bold">{connected ? 'Connected' : configured ? status.account?.status || 'Not connected' : 'Not configured'}</p>
            <p className="mt-0.5 text-xs opacity-70">{status.account?.phoneNumber || status.provider || '—'}</p>
          </div>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-65">Inbox</p>
            <p className="mt-1 text-sm font-bold">{conversations.reduce((sum, item) => sum + item.unreadCount, 0)} unread</p>
            <p className="mt-0.5 text-xs opacity-70">{conversations.length} recent conversations</p>
          </div>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-65">Attendance automation</p>
            <p className="mt-1 text-sm font-bold">{automated ? 'Enabled' : 'Not active'}</p>
            <p className="mt-0.5 text-xs opacity-70">{status.automation?.attendanceTemplate || '—'}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-primary-200 bg-primary-50/60 p-4 dark:border-primary-900 dark:bg-primary-950/20">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-bold">Connect WhatsApp device</h2>
              <p className="text-xs opacity-70">
                {status.account?.lastError || (baileysReady ? 'Choose QR scan or phone-number pairing.' : 'Baileys connection is not configured yet. The options are ready; configure the backend service before starting a connection.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={connect} disabled={!baileysReady || connecting || pairingConnecting || connected} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${connectionMethod === 'qr' ? 'bg-primary-600 text-white' : 'border border-[var(--color-border-default)]'} disabled:cursor-not-allowed disabled:opacity-50`}>{connecting ? 'Starting…' : '1. QR code'}</button>
              {!connected && <button type="button" onClick={() => { setConnectionMethod('pairing'); setQr(null); setError(''); }} disabled={connecting || pairingConnecting} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${connectionMethod === 'pairing' ? 'bg-primary-600 text-white' : 'border border-[var(--color-border-default)]'} disabled:cursor-not-allowed disabled:opacity-50`}>2. Pairing code</button>}
              {connected && <button type="button" onClick={disconnect} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600">Disconnect</button>}
            </div>
          </div>

          {!baileysReady && !connected && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
            <p className="font-semibold">Connection options are visible but not active yet.</p>
            <p className="mt-1 text-xs opacity-80">Set the Baileys provider and service variables in Coolify, then refresh this page. QR code and pairing code will become active automatically.</p>
          </div>}

          {connectionMethod === 'qr' && !connected && <div className="mt-4 flex flex-col items-center rounded-xl bg-white p-4 dark:bg-[var(--color-surface-primary)]">
            {qr ? <img src={qr} alt="WhatsApp QR code" className="h-56 w-56" /> : <p className="py-10 text-center text-sm text-gray-500">{baileysReady ? 'Press “1. QR code” to start a QR connection.' : 'QR preview will appear here after Baileys is configured.'}</p>}
            <p className="mt-2 text-xs text-gray-500">WhatsApp → Settings → Linked devices → Link a device</p>
          </div>}

          {connectionMethod === 'pairing' && !connected && <div className="mt-4 rounded-xl bg-white p-4 dark:bg-[var(--color-surface-primary)]">
            <form onSubmit={connectWithPairingCode} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1"><span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">WhatsApp phone number</span><input value={pairingPhone} onChange={event => setPairingPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="2526XXXXXXXX" className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500" /></label>
              <button type="submit" disabled={!baileysReady || pairingConnecting || connecting || !pairingPhone.trim()} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{pairingConnecting ? 'Generating…' : 'Get pairing code'}</button>
            </form>
            {pairingCode && <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-5 text-center dark:border-primary-900 dark:bg-primary-950/20"><p className="text-xs font-semibold uppercase tracking-wide opacity-70">Your pairing code</p><p className="mt-2 select-all font-mono text-3xl font-black tracking-[0.3em]">{pairingCode}</p><p className="mt-3 text-sm opacity-75">On the WhatsApp phone: <strong>Settings → Linked devices → Link a device → Link with phone number instead</strong>, then enter this code.</p></div>}
            {!pairingCode && <p className="mt-3 text-xs text-gray-500">Use the full international number with country code. Do not include +, spaces, or dashes.</p>}
          </div>}
        </section>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
        {success && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/20 dark:text-green-300">{success}</div>}

        <section className="grid min-h-[600px] overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b border-[var(--color-border-default)] lg:border-b-0 lg:border-r">
            <div className="border-b border-[var(--color-border-default)] p-3">
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search phone or contact…" className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="max-h-[560px] overflow-auto">
              {conversations.length === 0 ? <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No conversations yet.</div> : conversations.map(conversation => <button key={conversation._id} type="button" onClick={() => openConversation(conversation)} className={`w-full border-b border-[var(--color-border-default)] p-3 text-left transition hover:bg-[var(--color-surface-secondary)] ${selected?._id === conversation._id ? 'bg-primary-50 dark:bg-primary-950/20' : ''}`}>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold">{conversation.contactName || conversation.phone}</p><p className="truncate text-xs opacity-60">{conversation.parent?.parentId ? `Parent ${conversation.parent.parentId}` : conversation.phone}</p></div>{conversation.unreadCount > 0 && <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold text-white">{conversation.unreadCount}</span>}</div>
                <p className="mt-2 truncate text-xs opacity-65">{conversation.lastMessagePreview || 'No message preview'}</p>
              </button>)}
            </div>
          </aside>

          <div className="flex min-h-[600px] flex-col">
            {!selected ? <div className="flex flex-1 items-center justify-center p-8 text-center"><div><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-2xl dark:bg-primary-950/30">💬</div><h2 className="mt-3 text-lg font-bold">Select a conversation</h2><p className="mt-1 max-w-sm text-sm text-[var(--color-text-tertiary)]">Incoming WhatsApp messages will appear here. Select a contact to reply and manage the conversation.</p></div></div> : <>
              <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-default)] p-4"><div className="min-w-0"><h2 className="truncate text-base font-bold">{selected.contactName || selected.phone}</h2><p className="text-xs opacity-60">{selected.phone}{selected.parent?.parentId ? ` • Parent ${selected.parent.parentId}` : ''}</p></div><select value={selected.status} onChange={event => updateStatus(event.target.value as 'open' | 'closed' | 'archived')} className="rounded-lg border border-[var(--color-border-default)] bg-transparent px-2 py-1.5 text-xs font-semibold"><option value="open">Open</option><option value="closed">Closed</option><option value="archived">Archived</option></select></div>
              <div className="flex-1 space-y-2 overflow-auto bg-[var(--color-surface-secondary)] p-4">
                {messages.length === 0 ? <p className="py-10 text-center text-sm opacity-60">No messages in this conversation.</p> : messages.map(message => <div key={message._id} className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-sm ${message.direction === 'outbound' ? 'rounded-br-md bg-primary-600 text-white' : 'rounded-bl-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}><p className="whitespace-pre-wrap break-words text-sm">{message.body || `[${message.kind}]`}</p><div className={`mt-1 flex items-center gap-2 text-[10px] ${message.direction === 'outbound' ? 'text-white/70' : 'opacity-50'}`}><span>{new Date(message.createdAt).toLocaleString()}</span><span>{message.status}</span></div></div></div>)}
              </div>
              <form onSubmit={sendReply} className="border-t border-[var(--color-border-default)] p-3"><div className="flex gap-2"><textarea value={reply} onChange={event => setReply(event.target.value)} rows={2} placeholder="Write a reply…" className="min-w-0 flex-1 resize-none rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500" /><button type="submit" disabled={sending || !connected || !reply.trim()} className="self-end rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{sending ? '…' : 'Send'}</button></div></form>
            </>}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
          <h2 className="text-base font-bold">Start a new conversation</h2>
          <p className="mt-1 text-xs opacity-65">Send a direct text message to a WhatsApp number.</p>
          <form onSubmit={sendNew} className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_auto]"><input value={recipient} onChange={event => setRecipient(event.target.value)} inputMode="tel" placeholder="2526XXXXXXXX" className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm outline-none" /><input value={newMessage} onChange={event => setNewMessage(event.target.value)} placeholder="Message…" className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm outline-none" /><button type="submit" disabled={sending || !connected} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">Send</button></form>
        </section>

        <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
          <h2 className="text-base font-bold">Delivery audit</h2>
          <p className="mt-1 text-xs opacity-65">Use the existing message history API for delivery-level auditing; the inbox above is conversation-oriented.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold"><span className={`rounded-full px-2.5 py-1 ${badge.sent}`}>Sent</span><span className={`rounded-full px-2.5 py-1 ${badge.received}`}>Received</span><span className={`rounded-full px-2.5 py-1 ${badge.queued}`}>Queued</span><span className={`rounded-full px-2.5 py-1 ${badge.failed}`}>Failed</span></div>
        </section>
      </div>
    </div>
  );
}
