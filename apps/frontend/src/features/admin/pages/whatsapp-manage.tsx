import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/axios';

interface WhatsAppMessage {
  _id: string;
  recipient: string;
  kind: 'text' | 'template';
  templateName?: string;
  body?: string;
  status: 'queued' | 'sent' | 'failed';
  error?: string;
  createdAt: string;
  parent?: { parentId?: string; phone?: string };
}

export function WhatsAppManage() {
  const [configured, setConfigured] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [text, setText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [languageCode, setLanguageCode] = useState('en_US');
  const [mode, setMode] = useState<'text' | 'template'>('text');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [items, setItems] = useState<WhatsAppMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const load = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [statusRes, historyRes] = await Promise.all([
        api.get('/whatsapp/status'),
        api.get('/whatsapp/history', { params: { limit: '30' } }),
      ]);
      setConfigured(Boolean(statusRes.data?.data?.configured));
      setItems(historyRes.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load WhatsApp status');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true); setError(''); setSuccess('');
    try {
      const payload = mode === 'text'
        ? { to: recipient, text }
        : { to: recipient, templateName, languageCode };
      await api.post('/whatsapp/send', payload);
      setSuccess('WhatsApp message sent successfully.');
      setText('');
      setTemplateName('');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send WhatsApp message');
    } finally { setSending(false); }
  };

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">WhatsApp Messaging</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Send school messages through the official WhatsApp Cloud API.</p>
        </div>

        <div className={`rounded-2xl border p-4 ${configured ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50 dark:bg-amber-950/20'}`}>
          <p className="font-semibold">{configured ? 'WhatsApp is configured' : 'WhatsApp is not configured yet'}</p>
          <p className="mt-1 text-sm opacity-80">{configured ? 'The Meta WhatsApp Cloud API credentials are available to the backend.' : 'Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Coolify environment variables.'}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <form onSubmit={send} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card space-y-4">
            <h2 className="text-lg font-bold">Send a message</h2>
            <div>
              <label className="mb-1 block text-xs font-semibold">Recipient phone number</label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="2526XXXXXXXX" className="w-full rounded-xl border px-3 py-2.5 text-sm" required />
              <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">Use international format without spaces or the + sign.</p>
            </div>
            <div className="flex rounded-xl border p-1">
              <button type="button" onClick={() => setMode('text')} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode === 'text' ? 'bg-primary-600 text-white' : ''}`}>Text</button>
              <button type="button" onClick={() => setMode('template')} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode === 'template' ? 'bg-primary-600 text-white' : ''}`}>Template</button>
            </div>
            {mode === 'text' ? (
              <div>
                <label className="mb-1 block text-xs font-semibold">Message</label>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={6} className="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Write your message..." required />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Approved template name</label>
                  <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="attendance_notice" className="w-full rounded-xl border px-3 py-2.5 text-sm" required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Language code</label>
                  <input value={languageCode} onChange={e => setLanguageCode(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm" />
                </div>
              </div>
            )}
            {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{success}</div>}
            <button disabled={sending || !configured} className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{sending ? 'Sending...' : 'Send via WhatsApp'}</button>
          </form>

          <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
            <div className="border-b p-5"><h2 className="text-lg font-bold">Message history</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Latest WhatsApp send attempts.</p></div>
            {loadingHistory ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading...</div> : items.length === 0 ? <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No WhatsApp messages yet.</div> : (
              <div className="max-h-[560px] overflow-auto divide-y">
                {items.map(item => (
                  <div key={item._id} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="font-semibold text-sm">{item.recipient}</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{new Date(item.createdAt).toLocaleString()}</p></div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.status === 'sent' ? 'bg-green-100 text-green-700' : item.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{item.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">{item.kind === 'template' ? `Template: ${item.templateName}` : item.body}</p>
                    {item.error && <p className="mt-1 text-xs text-red-600">{item.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-5 text-sm">
          <p className="font-semibold">Automation-ready</p>
          <p className="mt-1 text-[var(--color-text-secondary)]">The WhatsApp sender and audit trail are now in the backend. Attendance, payment, announcement and other school events can call the same sender without exposing WhatsApp credentials to the browser.</p>
        </div>
      </div>
    </div>
  );
}

export default WhatsAppManage;
