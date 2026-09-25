import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, CheckCircle2, Clock3, Cloud, Copy, ExternalLink, Globe2,
  Inbox, Languages, Loader2, Mail, RefreshCcw, RotateCcw, Settings2,
  ShieldCheck, Sparkles, Trash2,
} from 'lucide-react';
import api from '../../../lib/axios';
import type {
  WebsiteLanguage,
  WebsiteOrganization,
  WebsiteSiteDocument,
} from '../../../components/website/website-renderer';

export type AdvancedWebsiteTab = 'templates' | 'messages' | 'analytics' | 'languages' | 'versions' | 'domain' | 'settings';

export const ADVANCED_WEBSITE_TABS: Array<{ key: AdvancedWebsiteTab; label: string; icon: any }> = [
  { key: 'templates', label: 'Templates', icon: Sparkles },
  { key: 'messages', label: 'Inbox', icon: Inbox },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'languages', label: 'Languages', icon: Languages },
  { key: 'versions', label: 'Versions', icon: Clock3 },
  { key: 'domain', label: 'Domain', icon: Globe2 },
  { key: 'settings', label: 'Settings', icon: Settings2 },
];

const panelClass = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const fieldClass = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10';
const labelClass = 'mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]';

type Notice = { type: 'success' | 'error'; text: string };

interface Props {
  tab: AdvancedWebsiteTab;
  schoolId: string;
  site: WebsiteSiteDocument;
  organization: WebsiteOrganization;
  onReplaceDraft: (site: WebsiteSiteDocument, version?: number) => void;
  onUpdateSite: (fn: (site: WebsiteSiteDocument) => WebsiteSiteDocument) => void;
  showNotice: (notice: Notice) => void;
}

interface TemplateInfo { id: string; name: string; description: string; }
interface MessageItem {
  _id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  sourcePage: string;
  createdAt: string;
}
interface VersionItem { version: number; note?: string; publishedBy?: { email?: string }; createdAt: string; }
interface AnalyticsData {
  periodDays: number;
  totals: { views: number; visitors: number; ctaClicks: number; contactSubmissions: number };
  topPages: Array<{ page: string; views: number; ctaClicks: number; contacts: number }>;
  daily: Array<{ date: string; views: number; visitors: number }>;
}
interface DomainStatus {
  hostname: string;
  type: 'custom' | 'managed';
  dns: { resolved: boolean; a: string[]; aaaa: string[]; cname: string[] };
  ssl: { active: boolean; authorized: boolean; expiresAt?: string };
  connected: boolean;
  cloudflareAutomationConfigured: boolean;
  expected: { cnameTarget: string };
}

function TemplatesPanel({ schoolId, onReplaceDraft, showNotice }: Pick<Props, 'schoolId' | 'onReplaceDraft' | 'showNotice'>) {
  const [items, setItems] = useState<TemplateInfo[]>([]);
  const [loadingId, setLoadingId] = useState('');
  useEffect(() => {
    api.get('/website-management/templates').then(({ data }) => setItems(data.data || [])).catch(() => setItems([]));
  }, []);

  const apply = async (id: string) => {
    setLoadingId(id);
    try {
      const { data } = await api.post(`/website-management/templates/${id}/apply`, { schoolId });
      onReplaceDraft(data.data.draft, data.data.version);
      showNotice({ type: 'success', text: 'Template applied to the draft. Review it in Preview, then publish when ready.' });
    } catch (err: any) {
      showNotice({ type: 'error', text: err.response?.data?.message || 'Could not apply template.' });
    } finally {
      setLoadingId('');
    }
  };

  return (
    <div className={`${panelClass} p-5 sm:p-6`}>
      <h2 className="text-lg font-bold">Website Templates</h2>
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Choose a professional starter design. Applying a template changes only the draft, never the live website until you publish.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item, index) => (
          <div key={item.id} className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)]">
            <div className={`h-28 bg-gradient-to-br ${index === 0 ? 'from-emerald-500 to-teal-800' : index === 1 ? 'from-blue-600 to-indigo-950' : index === 2 ? 'from-emerald-700 to-amber-600' : 'from-slate-700 to-slate-950'} p-4 text-white`}>
              <Sparkles className="h-6 w-6" /><p className="mt-5 text-lg font-bold">{item.name}</p>
            </div>
            <div className="p-4"><p className="min-h-[48px] text-xs leading-5 text-[var(--color-text-tertiary)]">{item.description}</p><button disabled={!!loadingId} onClick={() => apply(item.id)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loadingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Use Template</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessagesPanel({ schoolId, showNotice }: Pick<Props, 'schoolId' | 'showNotice'>) {
  const [items, setItems] = useState<MessageItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/website-management/messages', { params: { schoolId, status: filter || undefined, limit: 50 } });
      setItems(data.data?.items || []);
      setUnread(data.data?.unread || 0);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [schoolId, filter]);

  const update = async (id: string, status: MessageItem['status']) => {
    try {
      const { data } = await api.patch(`/website-management/messages/${id}`, { schoolId, status });
      setItems((current) => current.map((item) => item._id === id ? data.data : item));
      if (status !== 'new') setUnread((value) => Math.max(0, value - (items.find((x) => x._id === id)?.status === 'new' ? 1 : 0)));
    } catch (err: any) {
      showNotice({ type: 'error', text: err.response?.data?.message || 'Could not update message.' });
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this website message?')) return;
    try {
      await api.delete(`/website-management/messages/${id}`, { params: { schoolId } });
      setItems((current) => current.filter((item) => item._id !== id));
    } catch (err: any) {
      showNotice({ type: 'error', text: err.response?.data?.message || 'Could not delete message.' });
    }
  };

  return (
    <div className={`${panelClass} p-5 sm:p-6`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="flex items-center gap-2 text-lg font-bold">Website Inbox {unread > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{unread}</span>}</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Messages sent from the public Contact form.</p></div>
        <div className="flex gap-2"><select className={fieldClass} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All messages</option><option value="new">New</option><option value="read">Read</option><option value="replied">Replied</option><option value="archived">Archived</option></select><button onClick={load} className="rounded-xl border border-[var(--color-border-default)] p-2.5"><RefreshCcw className="h-4 w-4" /></button></div>
      </div>
      {loading ? <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div> : items.length ? <div className="mt-5 space-y-3">{items.map((item) => (
        <div key={item._id} className={`rounded-2xl border p-4 ${item.status === 'new' ? 'border-primary-300 bg-primary-50/50 dark:border-primary-800 dark:bg-primary-950/10' : 'border-[var(--color-border-subtle)]'}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{item.name}</p><span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[10px] font-bold uppercase">{item.status}</span></div><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{item.email || item.phone} · {new Date(item.createdAt).toLocaleString()} · {item.sourcePage}</p><p className="mt-3 text-sm font-semibold">{item.subject}</p><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[var(--color-text-secondary)]">{item.message}</p></div>
            <div className="flex shrink-0 gap-1"><select value={item.status} onChange={(e) => update(item._id, e.target.value as MessageItem['status'])} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1.5 text-xs"><option value="new">New</option><option value="read">Read</option><option value="replied">Replied</option><option value="archived">Archived</option></select><button onClick={() => remove(item._id)} className="rounded-lg border border-red-200 p-2 text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></div>
          </div>
        </div>
      ))}</div> : <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border-default)] py-16 text-center"><Mail className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" /><p className="mt-3 text-sm font-semibold">No website messages yet</p></div>}
    </div>
  );
}

function AnalyticsPanel({ schoolId }: Pick<Props, 'schoolId'>) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/website-management/analytics', { params: { schoolId, days } })
      .then(({ data }) => setData(data.data))
      .finally(() => setLoading(false));
  }, [schoolId, days]);

  const maxViews = Math.max(1, ...(data?.daily || []).map((item) => item.views));
  return (
    <div className="space-y-5">
      <div className={`${panelClass} p-5 sm:p-6`}>
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Website Analytics</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Privacy-friendly first-party website activity.</p></div><select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></div>
        {loading ? <div className="py-16"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div> : data && <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{[
            ['Page Views', data.totals.views],
            ['Visitors', data.totals.visitors],
            ['CTA Clicks', data.totals.ctaClicks],
            ['Contact Leads', data.totals.contactSubmissions],
          ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">{label}</p><p className="mt-1 text-2xl font-extrabold">{value}</p></div>)}</div>
          <div className="mt-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Views trend</p>
            <div className="flex h-40 items-end gap-1 overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] p-3">{data.daily.length ? data.daily.map((item) => <div key={item.date} title={`${item.date}: ${item.views} views, ${item.visitors} visitors`} style={{ height: `${Math.max(5, (item.views / maxViews) * 100)}%` }} className="min-w-[5px] flex-1 rounded-t bg-primary-500/80" />) : <p className="m-auto text-xs text-[var(--color-text-tertiary)]">No analytics yet.</p>}</div>
          </div>
        </>}
      </div>
      {data && <div className={`${panelClass} overflow-hidden`}><div className="border-b border-[var(--color-border-subtle)] px-5 py-4"><h3 className="font-bold">Popular Pages</h3></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[var(--color-surface-secondary)] text-left text-xs text-[var(--color-text-tertiary)]"><tr><th className="px-5 py-3">Page</th><th className="px-5 py-3">Views</th><th className="px-5 py-3">CTA</th><th className="px-5 py-3">Contacts</th></tr></thead><tbody>{data.topPages.map((page) => <tr key={page.page} className="border-t border-[var(--color-border-subtle)]"><td className="px-5 py-3 font-medium">{page.page}</td><td className="px-5 py-3">{page.views}</td><td className="px-5 py-3">{page.ctaClicks}</td><td className="px-5 py-3">{page.contacts}</td></tr>)}</tbody></table></div></div>}
    </div>
  );
}

const LANGUAGE_PRESETS: WebsiteLanguage[] = [
  { code: 'en', label: 'English', direction: 'ltr', enabled: true },
  { code: 'so', label: 'Somali', direction: 'ltr', enabled: false },
  { code: 'ar', label: 'العربية', direction: 'rtl', enabled: false },
];

function LanguagesPanel({ site, onUpdateSite }: Pick<Props, 'site' | 'onUpdateSite'>) {
  const [editingLanguage, setEditingLanguage] = useState(() => site.languages?.find((item) => item.enabled && item.code !== site.defaultLanguage)?.code || 'so');
  const languages = site.languages?.length ? site.languages : LANGUAGE_PRESETS;

  const setLanguages = (next: WebsiteLanguage[]) => onUpdateSite((current) => ({ ...current, languages: next }));
  const updateTranslation = (key: string, value: string) => onUpdateSite((current) => ({
    ...current,
    translations: {
      ...(current.translations || {}),
      [editingLanguage]: {
        ...(current.translations?.[editingLanguage] || {}),
        [key]: value,
      },
    },
  }));
  const translation = (key: string) => site.translations?.[editingLanguage]?.[key] || '';
  const selected = languages.find((item) => item.code === editingLanguage);

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className={`${panelClass} p-5`}>
        <h2 className="text-lg font-bold">Website Languages</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Enable Somali, English and Arabic. Arabic automatically renders RTL.</p>
        <div className="mt-5 space-y-2">{LANGUAGE_PRESETS.map((preset) => {
          const current = languages.find((item) => item.code === preset.code) || preset;
          return <div key={preset.code} className="flex items-center gap-3 rounded-xl border border-[var(--color-border-subtle)] p-3"><input type="checkbox" checked={current.enabled} onChange={(e) => {
            const next = LANGUAGE_PRESETS.map((base) => {
              const existing = languages.find((item) => item.code === base.code) || base;
              return base.code === preset.code ? { ...existing, enabled: e.target.checked || site.defaultLanguage === base.code } : existing;
            });
            setLanguages(next);
          }} /><div className="flex-1"><p className="text-sm font-semibold">{current.label}</p><p className="text-[11px] uppercase text-[var(--color-text-tertiary)]">{current.code} · {current.direction}</p></div>{site.defaultLanguage === current.code ? <span className="rounded-full bg-primary-50 px-2 py-1 text-[10px] font-bold text-primary-700">Default</span> : current.enabled && <button onClick={() => onUpdateSite((s) => ({ ...s, defaultLanguage: current.code }))} className="text-[11px] font-semibold text-primary-600">Make default</button>}</div>;
        })}</div>
        <div className="mt-5"><label className={labelClass}>Translate content into</label><select value={editingLanguage} onChange={(e) => setEditingLanguage(e.target.value)} className={fieldClass}>{languages.filter((item) => item.enabled && item.code !== site.defaultLanguage).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
      </div>
      <div className={`${panelClass} p-5 sm:p-6`}>
        {!selected || selected.code === site.defaultLanguage ? <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">Enable another language to add translations.</div> : <>
          <div><h3 className="text-lg font-bold">{selected.label} Translation</h3><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Blank fields automatically fall back to the default language.</p></div>
          <div className="mt-6 space-y-6">
            <div><p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Header</p><div className="grid gap-3 md:grid-cols-2"><div><label className={labelClass}>Portal CTA</label><input className={fieldClass} value={translation('header.ctaText')} onChange={(e) => updateTranslation('header.ctaText', e.target.value)} placeholder={site.header.ctaText} /></div>{site.header.navItems.map((item) => <div key={item.id}><label className={labelClass}>{item.label}</label><input className={fieldClass} value={translation(`link.${item.id}.label`)} onChange={(e) => updateTranslation(`link.${item.id}.label`, e.target.value)} placeholder={item.label} /></div>)}</div></div>
            {site.pages.map((page) => <div key={page.id} className="border-t border-[var(--color-border-subtle)] pt-5"><p className="mb-4 font-bold">{page.title}</p><div className="space-y-4">{page.sections.map((section) => <div key={section.id} className="rounded-xl border border-[var(--color-border-subtle)] p-4"><p className="mb-3 text-xs font-bold uppercase text-primary-600">{section.type} · {section.title || 'Untitled'}</p><div className="grid gap-3 md:grid-cols-2"><input className={fieldClass} value={translation(`section.${section.id}.title`)} onChange={(e) => updateTranslation(`section.${section.id}.title`, e.target.value)} placeholder={section.title || 'Title'} /><input className={fieldClass} value={translation(`section.${section.id}.subtitle`)} onChange={(e) => updateTranslation(`section.${section.id}.subtitle`, e.target.value)} placeholder={section.subtitle || 'Subtitle'} /><textarea className={`${fieldClass} md:col-span-2`} rows={3} value={translation(`section.${section.id}.body`)} onChange={(e) => updateTranslation(`section.${section.id}.body`, e.target.value)} placeholder={section.body || 'Body text'} />{section.cards.map((card) => <div key={card.id} className="md:col-span-2 grid gap-2 rounded-lg bg-[var(--color-surface-secondary)] p-3 md:grid-cols-2"><input className={fieldClass} value={translation(`card.${card.id}.title`)} onChange={(e) => updateTranslation(`card.${card.id}.title`, e.target.value)} placeholder={card.question || card.title || 'Item title'} /><input className={fieldClass} value={translation(`card.${card.id}.text`)} onChange={(e) => updateTranslation(`card.${card.id}.text`, e.target.value)} placeholder={card.answer || card.text || 'Item text'} /></div>)}</div></div>)}</div></div>)}
            <div className="border-t border-[var(--color-border-subtle)] pt-5"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Contact & Footer</p><div className="grid gap-3 md:grid-cols-2"><input className={fieldClass} value={translation('contact.send')} onChange={(e) => updateTranslation('contact.send', e.target.value)} placeholder="Send Message" /><input className={fieldClass} value={translation('footer.quickLinksTitle')} onChange={(e) => updateTranslation('footer.quickLinksTitle', e.target.value)} placeholder="Quick Links" /><textarea className={`${fieldClass} md:col-span-2`} rows={3} value={translation('footer.description')} onChange={(e) => updateTranslation('footer.description', e.target.value)} placeholder={site.footer.description} /></div></div>
          </div>
        </>}
      </div>
    </div>
  );
}

function VersionsPanel({ schoolId, onReplaceDraft, showNotice }: Pick<Props, 'schoolId' | 'onReplaceDraft' | 'showNotice'>) {
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    api.get('/website-management/versions', { params: { schoolId } }).then(({ data }) => setVersions(data.data || [])).finally(() => setLoading(false));
  };
  useEffect(load, [schoolId]);
  const rollback = async (version: number) => {
    if (!window.confirm(`Restore published version ${version}? This will publish that snapshot again.`)) return;
    try {
      const { data } = await api.post(`/website-management/versions/${version}/rollback`, { schoolId });
      onReplaceDraft(data.data.draft, data.data.version);
      showNotice({ type: 'success', text: `Version ${version} restored and published.` });
      load();
    } catch (err: any) { showNotice({ type: 'error', text: err.response?.data?.message || 'Rollback failed.' }); }
  };
  return <div className={`${panelClass} p-5 sm:p-6`}><h2 className="text-lg font-bold">Version History & Rollback</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Every publish creates a recoverable snapshot.</p>{loading ? <div className="py-16"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div> : versions.length ? <div className="mt-5 space-y-2">{versions.map((item) => <div key={item.version} className="flex flex-col gap-3 rounded-xl border border-[var(--color-border-subtle)] p-4 sm:flex-row sm:items-center"><div className="flex-1"><p className="text-sm font-bold">Version {item.version}</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{new Date(item.createdAt).toLocaleString()} · {item.publishedBy?.email || 'Administrator'}{item.note ? ` · ${item.note}` : ''}</p></div><button onClick={() => rollback(item.version)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-tertiary)]"><RotateCcw className="h-3.5 w-3.5" />Restore</button></div>)}</div> : <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border-default)] py-14 text-center text-sm text-[var(--color-text-tertiary)]">Publish the website to create the first version.</div>}</div>;
}

function DomainPanel({ schoolId, organization, showNotice }: Pick<Props, 'schoolId' | 'organization' | 'showNotice'>) {
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/website-management/domain/status', { params: { schoolId } });
      setStatus(data.data);
    } catch (err: any) {
      showNotice({ type: 'error', text: err.response?.data?.message || 'Could not verify domain.' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [schoolId]);

  const provision = async () => {
    setProvisioning(true);
    try {
      await api.post('/website-management/domain/provision', { schoolId });
      showNotice({ type: 'success', text: 'Cloudflare DNS record provisioned. DNS/SSL may need a short period to become active.' });
      await load();
    } catch (err: any) { showNotice({ type: 'error', text: err.response?.data?.message || 'Could not provision domain.' }); }
    finally { setProvisioning(false); }
  };

  if (loading) return <div className={`${panelClass} py-20`}><Loader2 className="mx-auto h-7 w-7 animate-spin" /></div>;
  if (!status) return null;

  return <div className="grid gap-5 lg:grid-cols-[1fr_420px]"><div className={`${panelClass} p-5 sm:p-6`}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Domain & SSL</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Live DNS and TLS verification for this organization website.</p></div><button onClick={load} className="rounded-xl border border-[var(--color-border-default)] p-2.5"><RefreshCcw className="h-4 w-4" /></button></div><div className="mt-6 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Hostname</p><div className="mt-1 flex items-center gap-2"><Globe2 className="h-4 w-4" /><p className="break-all font-bold">{status.hostname}</p><a href={`https://${status.hostname}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></div><p className="mt-1 text-[11px] uppercase text-[var(--color-text-tertiary)]">{status.type} domain</p></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{[
    ['DNS', status.dns.resolved, status.dns.resolved ? 'Resolved' : 'Pending'],
    ['SSL', status.ssl.active && status.ssl.authorized, status.ssl.active ? (status.ssl.authorized ? 'Valid' : 'Certificate issue') : 'Pending'],
    ['Overall', status.connected, status.connected ? 'Connected' : 'Needs attention'],
  ].map(([label, ok, detail]) => <div key={String(label)} className="rounded-xl border border-[var(--color-border-subtle)] p-4"><div className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Clock3 className="h-4 w-4 text-amber-500" />}<p className="text-xs font-bold">{label}</p></div><p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{detail}</p></div>)}</div>{status.type === 'custom' ? <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300"><p className="font-bold">Custom-domain DNS instruction</p><p className="mt-2 text-xs leading-5">At your domain provider, point the custom hostname to <strong>{status.expected.cnameTarget}</strong>. Then return here and click refresh to verify DNS and SSL.</p></div> : status.cloudflareAutomationConfigured ? <button disabled={provisioning} onClick={provision} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}Provision / Repair Cloudflare DNS</button> : <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">Cloudflare automation credentials are not configured. Wildcard DNS may still make this managed subdomain work automatically.</div>}</div><div className={`${panelClass} p-5`}><h3 className="font-bold">Technical Details</h3><div className="mt-4 space-y-3 text-xs"><div><p className="text-[var(--color-text-tertiary)]">DNS A</p><p className="mt-1 break-all font-medium">{status.dns.a.join(', ') || '—'}</p></div><div><p className="text-[var(--color-text-tertiary)]">DNS CNAME</p><p className="mt-1 break-all font-medium">{status.dns.cname.join(', ') || '—'}</p></div><div><p className="text-[var(--color-text-tertiary)]">SSL expiry</p><p className="mt-1 font-medium">{status.ssl.expiresAt ? new Date(status.ssl.expiresAt).toLocaleDateString() : '—'}</p></div><div><p className="text-[var(--color-text-tertiary)]">SEO files</p><div className="mt-1 space-y-1"><a target="_blank" rel="noreferrer" href={`https://${status.hostname}/sitemap.xml`} className="flex items-center gap-1 font-semibold text-primary-600">sitemap.xml <ExternalLink className="h-3 w-3" /></a><a target="_blank" rel="noreferrer" href={`https://${status.hostname}/robots.txt`} className="flex items-center gap-1 font-semibold text-primary-600">robots.txt <ExternalLink className="h-3 w-3" /></a></div></div></div></div></div>;
}

function SettingsPanel({ site, onUpdateSite }: Pick<Props, 'site' | 'onUpdateSite'>) {
  return <div className={`${panelClass} p-5 sm:p-6`}><h2 className="text-lg font-bold">Website Settings</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Public interaction and privacy controls.</p><div className="mt-6 grid gap-3 md:grid-cols-2"><label className="flex items-start gap-3 rounded-2xl border border-[var(--color-border-subtle)] p-4"><input type="checkbox" className="mt-1 h-4 w-4" checked={site.settings?.contactFormEnabled !== false} onChange={(e) => onUpdateSite((s) => ({ ...s, settings: { ...(s.settings || { analyticsEnabled: true, contactFormEnabled: true }), contactFormEnabled: e.target.checked } }))} /><div><p className="text-sm font-bold">Contact Form</p><p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">Allow visitors to send enquiries directly into Website Inbox.</p></div></label><label className="flex items-start gap-3 rounded-2xl border border-[var(--color-border-subtle)] p-4"><input type="checkbox" className="mt-1 h-4 w-4" checked={site.settings?.analyticsEnabled !== false} onChange={(e) => onUpdateSite((s) => ({ ...s, settings: { ...(s.settings || { analyticsEnabled: true, contactFormEnabled: true }), analyticsEnabled: e.target.checked } }))} /><div><p className="text-sm font-bold">First-party Analytics</p><p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">Track page views, anonymous sessions, CTA clicks and contact leads without third-party trackers.</p></div></label></div><div className="mt-5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4 text-xs leading-5 text-[var(--color-text-tertiary)]"><ShieldCheck className="mb-2 h-5 w-5 text-primary-600" />Analytics stores anonymous session hashes rather than names, emails or browsing profiles. Contact details are stored only when a visitor explicitly submits the contact form.</div></div>;
}

export function WebsiteAdvancedPanel(props: Props) {
  if (props.tab === 'templates') return <TemplatesPanel {...props} />;
  if (props.tab === 'messages') return <MessagesPanel {...props} />;
  if (props.tab === 'analytics') return <AnalyticsPanel {...props} />;
  if (props.tab === 'languages') return <LanguagesPanel {...props} />;
  if (props.tab === 'versions') return <VersionsPanel {...props} />;
  if (props.tab === 'domain') return <DomainPanel {...props} />;
  return <SettingsPanel {...props} />;
}

export default WebsiteAdvancedPanel;
