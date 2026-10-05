import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Check, ChevronRight, Copy, Eye, EyeOff, FileText, Globe2,
  Image as ImageIcon, LayoutTemplate, Loader2, MoreVertical, Palette,
  PanelsTopLeft, Plus, Save, Search, Trash2, UploadCloud,
  Video, X,
} from 'lucide-react';
import api from '../../../lib/axios';
import { WebsitePreview } from '../../../components/website/website-preview';
import { useAuth } from '../../../store/auth-context';
import {
  WebsiteRenderer,
  type WebsiteCard,
  type WebsiteLink,
  type WebsiteMediaItem,
  type WebsiteOrganization,
  type WebsitePage,
  type WebsiteSection,
  type WebsiteSectionType,
  type WebsiteSiteDocument,
} from '../../../components/website/website-renderer';
import {
  ADVANCED_WEBSITE_TABS,
  WebsiteAdvancedPanel,
  type AdvancedWebsiteTab,
} from './website-management-advanced';

type TabKey = 'pages' | 'header' | 'sections' | 'media' | 'theme' | 'seo' | 'preview' | AdvancedWebsiteTab;

interface SchoolOption extends WebsiteOrganization {
  _id: string;
  status?: string;
}

interface ConfigResponse {
  school: SchoolOption;
  draft: WebsiteSiteDocument;
  isPublished: boolean;
  publishedAt?: string | null;
  version: number;
  updatedAt?: string;
  storage?: { provider: 'r2' | 'local'; durable: boolean };
}

const MAIN_TABS: Array<{ key: TabKey; label: string; icon: any }> = [
  { key: 'sections', label: 'Content', icon: LayoutTemplate },
  { key: 'theme', label: 'Design', icon: Palette },
  { key: 'header', label: 'Header & Footer', icon: PanelsTopLeft },
  { key: 'pages', label: 'Pages', icon: FileText },
  { key: 'media', label: 'Media', icon: ImageIcon },
];

const MANAGE_TABS: Array<{ key: TabKey; label: string; icon: any }> = [
  { key: 'seo', label: 'SEO', icon: Search },
  ...ADVANCED_WEBSITE_TABS,
];

// Tabs whose edits change the page itself; these get the live side preview on wide screens.
const LIVE_PREVIEW_TABS: TabKey[] = ['sections', 'theme', 'header', 'pages'];

const THEME_PRESETS = [
  { name: 'Emerald', primaryColor: '#0f766e', secondaryColor: '#082f49', accentColor: '#f59e0b' },
  { name: 'Ocean', primaryColor: '#2563eb', secondaryColor: '#0b1b3f', accentColor: '#06b6d4' },
  { name: 'Sunrise', primaryColor: '#ea580c', secondaryColor: '#431407', accentColor: '#facc15' },
  { name: 'Royal', primaryColor: '#7c3aed', secondaryColor: '#1e1b4b', accentColor: '#ec4899' },
  { name: 'Forest', primaryColor: '#15803d', secondaryColor: '#052e16', accentColor: '#eab308' },
  { name: 'Berry', primaryColor: '#db2777', secondaryColor: '#3b0764', accentColor: '#f97316' },
];

const SECTION_COLORS: Partial<Record<WebsiteSectionType, string>> = {
  hero: '#2563eb', stats: '#0d9488', programs: '#f59e0b', about: '#8b5cf6', services: '#ec4899',
  gallery: '#16a34a', news: '#ea580c', testimonials: '#7c3aed', faq: '#0891b2', contact: '#0f172a',
};

const SECTION_PRESETS: Array<{ type: WebsiteSectionType; label: string; description: string }> = [
  { type: 'hero', label: 'Hero', description: 'Main headline, image and call-to-action' },
  { type: 'about', label: 'About', description: 'Institution story and supporting image' },
  { type: 'services', label: 'Services', description: 'Service cards with icons and links' },
  { type: 'programs', label: 'Programs', description: 'Courses, programmes or departments' },
  { type: 'news', label: 'News & Events', description: 'Dated updates, announcements and events' },
  { type: 'staff', label: 'Staff', description: 'People, photos, roles and biographies' },
  { type: 'partners', label: 'Partners', description: 'Partner names and logos' },
  { type: 'stats', label: 'Statistics', description: 'Numbers and impact indicators' },
  { type: 'gallery', label: 'Gallery', description: 'Responsive image gallery' },
  { type: 'video', label: 'Video', description: 'Uploaded or YouTube/Vimeo video' },
  { type: 'testimonials', label: 'Testimonials', description: 'Student or community feedback' },
  { type: 'faq', label: 'FAQ', description: 'Expandable questions and answers' },
  { type: 'contact', label: 'Contact', description: 'Address, phone and email' },
  { type: 'custom', label: 'Custom', description: 'Flexible text and image section' },
];

const FONT_OPTIONS = [
  'Inter, ui-sans-serif, system-ui, sans-serif',
  'DM Sans, ui-sans-serif, system-ui, sans-serif',
  'Fraunces, Georgia, serif',
  'Arial, Helvetica, sans-serif',
  'Georgia, Times New Roman, serif',
  'Trebuchet MS, Arial, sans-serif',
];

const fieldClass = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10';
const labelClass = 'mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]';
const panelClass = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newLink(label = 'New Link', href = '#'): WebsiteLink {
  return { id: makeId('link'), label, href, visible: true };
}

function defaultCard(type: WebsiteSectionType): WebsiteCard {
  if (type === 'faq') return { id: makeId('faq'), title: '', text: '', question: 'New question', answer: 'Answer goes here.' };
  if (type === 'stats') return { id: makeId('stat'), title: 'Students', text: '', value: '100+', icon: 'Users' };
  if (type === 'gallery') return { id: makeId('image'), title: 'Gallery image', text: '', imageUrl: '' };
  if (type === 'testimonials') return { id: makeId('quote'), title: 'Student Name', text: 'Share a short testimonial here.', icon: 'Star' };
  return { id: makeId('card'), title: 'New item', text: 'Add a short description.', icon: 'BookOpen', imageUrl: '', link: '' };
}

function defaultSection(type: WebsiteSectionType): WebsiteSection {
  const labels: Record<WebsiteSectionType, string> = {
    hero: 'Welcome to Our Institution',
    about: 'About Us',
    services: 'Our Services',
    programs: 'Our Programs',
    stats: 'Our Impact',
    gallery: 'Gallery',
    video: 'Watch Our Story',
    testimonials: 'What People Say',
    faq: 'Frequently Asked Questions',
    contact: 'Contact Us',
    custom: 'New Section',
    news: 'News & Events', staff: 'Our Team', partners: 'Our Partners',
  };
  const section: WebsiteSection = {
    id: makeId(type),
    type,
    title: labels[type],
    subtitle: '',
    body: '',
    imageUrl: '',
    videoUrl: '',
    icon: type === 'hero' ? 'GraduationCap' : 'BookOpen',
    buttonText: type === 'hero' ? 'Learn More' : '',
    buttonUrl: type === 'hero' ? '#about' : '',
    background: type === 'contact' ? 'dark' : type === 'about' ? 'muted' : 'default',
    alignment: type === 'hero' ? 'left' : 'center',
    visible: true,
    cards: [],
  };
  if (['services', 'programs', 'stats', 'gallery', 'testimonials', 'faq', 'news', 'staff', 'partners'].includes(type)) {
    section.cards = [defaultCard(type), defaultCard(type), defaultCard(type)];
  }
  return section;
}

function newPage(index: number): WebsitePage {
  return {
    id: makeId('page'),
    title: `Page ${index + 1}`,
    slug: `page-${index + 1}`,
    showInNavigation: true,
    seoTitle: '',
    seoDescription: '',
    sections: [defaultSection('hero')],
  };
}

async function optimizeImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 450 * 1024) return file;
  return new Promise((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const maxDimension = 1920;
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob || blob.size >= file.size) {
          resolve(file);
          return;
        }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp', lastModified: Date.now() }));
      }, 'image/webp', 0.82);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    image.src = objectUrl;
  });
}

function LinkEditor({ items, onChange, title }: { items: WebsiteLink[]; onChange: (items: WebsiteLink[]) => void; title: string }) {
  const update = (index: number, patch: Partial<WebsiteLink>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{title}</h3>
        <button type="button" onClick={() => onChange([...items, newLink()])} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-default)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--color-surface-tertiary)]"><Plus className="h-3.5 w-3.5" />Add</button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id} className="grid gap-2 rounded-xl border border-[var(--color-border-subtle)] p-3 sm:grid-cols-[1fr_1.2fr_auto_auto]">
            <input value={item.label} onChange={(e) => update(index, { label: e.target.value })} placeholder="Label" className={fieldClass} />
            <input value={item.href} onChange={(e) => update(index, { href: e.target.value })} placeholder="/about or #about" className={fieldClass} />
            <button type="button" onClick={() => update(index, { visible: !item.visible })} className={`rounded-xl px-3 py-2 text-xs font-semibold ${item.visible ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]'}`}>{item.visible ? 'Visible' : 'Hidden'}</button>
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} className="rounded-xl p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {!items.length && <p className="rounded-xl border border-dashed border-[var(--color-border-default)] p-4 text-center text-xs text-[var(--color-text-tertiary)]">No links yet.</p>}
      </div>
    </div>
  );
}

function ImageField({ value, onChange, media }: { value: string; onChange: (url: string) => void; media: WebsiteMediaItem[] }) {
  return <div className="space-y-2">
    <input aria-label="Image URL" className={fieldClass} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Image URL or choose uploaded media" />
    <select aria-label="Choose uploaded image" className={fieldClass} value="" onChange={(e) => { if (e.target.value) onChange(e.target.value); }}>
      <option value="">Choose from uploaded images…</option>
      {media.filter((item) => item.type === 'image').map((item) => <option key={item.id} value={item.url}>{item.name}</option>)}
    </select>
    {value && <img src={value} alt="Selected image" className="h-20 max-w-full rounded-lg object-contain" />}
  </div>;
}

function VideoField({ value, onChange, media }: { value: string; onChange: (url: string) => void; media: WebsiteMediaItem[] }) {
  return <div className="space-y-2">
    <input
      aria-label="Video URL"
      className={fieldClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="YouTube, Vimeo, MP4, WEBM or uploaded video"
    />
    <select aria-label="Choose uploaded video" className={fieldClass} value="" onChange={(e) => { if (e.target.value) onChange(e.target.value); }}>
      <option value="">Choose from uploaded videos…</option>
      {media.filter((item) => item.type === 'video').map((item) => <option key={item.id} value={item.url}>{item.name}</option>)}
    </select>
    {value && <p className="rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-[11px] text-[var(--color-text-tertiary)]">Video selected. YouTube/Vimeo links are embedded inside the public website; the raw public link is not rendered.</p>}
  </div>;
}

function CardEditor({ section, onChange, media }: { section: WebsiteSection; onChange: (cards: WebsiteCard[]) => void; media: WebsiteMediaItem[] }) {
  const update = (index: number, patch: Partial<WebsiteCard>) => onChange(section.cards.map((card, i) => i === index ? { ...card, ...patch } : card));
  const add = () => onChange([...section.cards, defaultCard(section.type)]);
  return (
    <div className="mt-5 border-t border-[var(--color-border-subtle)] pt-5">
      <div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Section items</p><button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-default)] px-2.5 py-1.5 text-xs font-semibold"><Plus className="h-3.5 w-3.5" />Add item</button></div>
      <div className="space-y-3">
        {section.cards.map((card, index) => (
          <div key={card.id} className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-[var(--color-text-tertiary)]">Item {index + 1}</span><button type="button" onClick={() => onChange(section.cards.filter((_, i) => i !== index))} className="p-1 text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></div>
            {section.type === 'faq' ? (
              <div className="grid gap-2">
                <input className={fieldClass} value={card.question || ''} onChange={(e) => update(index, { question: e.target.value })} placeholder="Question" />
                <textarea className={fieldClass} rows={3} value={card.answer || ''} onChange={(e) => update(index, { answer: e.target.value })} placeholder="Answer" />
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={fieldClass} value={card.title} onChange={(e) => update(index, { title: e.target.value })} placeholder={section.type === 'testimonials' ? 'Person name' : 'Title'} />
                {section.type === 'news' && <input aria-label="Date" type="date" className={fieldClass} value={card.date || ''} onChange={(e) => update(index, { date: e.target.value })} />}
                {['staff', 'testimonials'].includes(section.type) && <input className={fieldClass} value={card.role || ''} onChange={(e) => update(index, { role: e.target.value })} placeholder="Role or organization" />}
                {section.type === 'stats' && <input className={fieldClass} value={card.value || ''} onChange={(e) => update(index, { value: e.target.value })} placeholder="Value e.g. 2,500+" />}
                {!['gallery', 'stats'].includes(section.type) && <input className={fieldClass} value={card.icon || ''} onChange={(e) => update(index, { icon: e.target.value })} placeholder="Icon: BookOpen, Users..." />}
                {['gallery', 'services', 'programs', 'testimonials', 'news', 'staff', 'partners'].includes(section.type) && <ImageField value={card.imageUrl || ''} onChange={(imageUrl) => update(index, { imageUrl })} media={media} />}
                {section.type !== 'gallery' && <textarea className={`${fieldClass} sm:col-span-2`} rows={2} value={card.text} onChange={(e) => update(index, { text: e.target.value })} placeholder="Description" />}
                {['services', 'programs', 'news', 'staff', 'partners'].includes(section.type) && <input className={`${fieldClass} sm:col-span-2`} value={card.link || ''} onChange={(e) => update(index, { link: e.target.value })} placeholder="Optional link" />}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WebsiteManagement() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState(user?.role === 'org_admin' ? user.organizationId || '' : '');
  const [organization, setOrganization] = useState<SchoolOption | null>(null);
  const [site, setSite] = useState<WebsiteSiteDocument | null>(null);
  const [tab, setTab] = useState<TabKey>('sections');
  const [livePreview, setLivePreview] = useState(true);
  const [activePageId, setActivePageId] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [storageProvider, setStorageProvider] = useState<'r2' | 'local'>('local');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sectionMediaRef = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  const [savedContent, setSavedContent] = useState('');
  const dirty = !!site && JSON.stringify(site) !== savedContent;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const { data } = await api.get('/schools', { params: { page: '1', limit: '100' } });
        const list = Array.isArray(data.data) ? data.data : [];
        setSchools(list);
        if (!selectedSchoolId && list[0]?._id) setSelectedSchoolId(list[0]._id);
      } catch (err: any) {
        setNotice({ type: 'error', text: err.response?.data?.message || 'Failed to load organizations.' });
      }
    })();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (user?.role === 'org_admin' && user.organizationId) setSelectedSchoolId(user.organizationId);
  }, [user]);

  const loadConfig = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setSite(null);
    setOrganization(null);
    if (!selectedSchoolId) { setLoading(false); return; }
    setLoading(true);
    setNotice(null);
    try {
      const { data } = await api.get('/website-management', { params: { schoolId: selectedSchoolId } });
      if (sequence !== loadSequence.current) return;
      const config = data.data as ConfigResponse;
      setOrganization(config.school);
      setSite(config.draft);
      setSavedContent(JSON.stringify(config.draft));
      setIsPublished(config.isPublished);
      setPublishedAt(config.publishedAt || null);
      setVersion(config.version || 1);
      setStorageProvider(config.storage?.provider || 'local');
      setActivePageId(config.draft.pages[0]?.id || '');
      setActiveSectionId(config.draft.pages[0]?.sections[0]?.id || '');
    } catch (err: any) {
      if (sequence === loadSequence.current) setNotice({ type: 'error', text: err.response?.data?.message || 'Failed to load website configuration.' });
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [selectedSchoolId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const activePage = useMemo(() => site?.pages.find((page) => page.id === activePageId) || site?.pages[0] || null, [site, activePageId]);
  const activeSection = useMemo(() => activePage?.sections.find((section) => section.id === activeSectionId) || activePage?.sections[0] || null, [activePage, activeSectionId]);

  const updateSite = (fn: (current: WebsiteSiteDocument) => WebsiteSiteDocument) => setSite((current) => current ? fn(current) : current);
  const updatePage = (patch: Partial<WebsitePage>) => {
    if (!activePage) return;
    updateSite((current) => ({ ...current, pages: current.pages.map((page) => page.id === activePage.id ? { ...page, ...patch } : page) }));
  };
  const updateSectionById = (sectionId: string, patch: Partial<WebsiteSection>) => {
    if (!activePage) return;
    updateSite((current) => ({
      ...current,
      pages: current.pages.map((page) => page.id === activePage.id
        ? { ...page, sections: page.sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section) }
        : page),
    }));
  };
  const updateSection = (patch: Partial<WebsiteSection>) => {
    if (!activeSection) return;
    updateSectionById(activeSection.id, patch);
  };
  const toggleSectionVisibility = (sectionId: string, visible: boolean) => {
    updateSectionById(sectionId, { visible: !visible });
  };

  const saveDraft = async (silent = false) => {
    if (!site || !selectedSchoolId) return false;
    setSaving(true);
    if (!silent) setNotice(null);
    try {
      const { data } = await api.put('/website-management', { schoolId: selectedSchoolId, site });
      const config = data.data as ConfigResponse;
      setSite(config.draft);
      setSavedContent(JSON.stringify(config.draft));
      setVersion(config.version || version + 1);
      if (!silent) setNotice({ type: 'success', text: 'Draft saved successfully.' });
      return true;
    } catch (err: any) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not save the draft.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!site || !selectedSchoolId) return;
    setPublishing(true);
    setNotice(null);
    try {
      const saved = await saveDraft(true);
      if (!saved) return;
      const { data } = await api.post('/website-management/publish', { schoolId: selectedSchoolId });
      setIsPublished(true);
      setPublishedAt(data.data?.publishedAt || new Date().toISOString());
      setVersion(data.data?.version || version + 1);
      setNotice({ type: 'success', text: 'Website published. The live domain now uses this version.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not publish the website.' });
    } finally {
      setPublishing(false);
    }
  };

  const unpublish = async () => {
    if (!selectedSchoolId) return;
    try {
      await api.post('/website-management/unpublish', { schoolId: selectedSchoolId });
      setIsPublished(false);
      setNotice({ type: 'success', text: 'Website unpublished. Visitors will see the coming-soon page.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not unpublish website.' });
    }
  };

  const resetDraft = async () => {
    if (!selectedSchoolId || !window.confirm('Reset the draft to the starter template? The published website will not change until you publish again.')) return;
    try {
      const { data } = await api.post('/website-management/reset', { schoolId: selectedSchoolId });
      setSite(data.data.draft);
      setSavedContent(JSON.stringify(data.data.draft));
      setVersion(data.data.version);
      setActivePageId(data.data.draft.pages[0]?.id || '');
      setActiveSectionId(data.data.draft.pages[0]?.sections[0]?.id || '');
      setNotice({ type: 'success', text: 'Draft reset to the starter template.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not reset draft.' });
    }
  };

  const addPage = () => {
    if (!site) return;
    const page = newPage(site.pages.length);
    updateSite((current) => ({
      ...current,
      pages: [...current.pages, page],
      header: {
        ...current.header,
        navItems: [...current.header.navItems, { id: makeId('nav'), label: page.title, href: `/${page.slug}`, visible: true }],
      },
    }));
    setActivePageId(page.id);
    setActiveSectionId(page.sections[0]?.id || '');
    setTab('pages');
  };

  const syncNavigation = () => {
    if (!site) return;
    updateSite((current) => {
      const pageLinks = current.pages.filter((page) => page.showInNavigation).map((page) => {
        const href = page.slug ? `/${page.slug}` : '/';
        const existing = current.header.navItems.find((item) => item.href === href);
        return existing ? { ...existing, label: page.title, visible: true } : { id: makeId('nav'), label: page.title, href, visible: true };
      });
      const nonPageLinks = current.header.navItems.filter((item) => !current.pages.some((page) => item.href === (page.slug ? `/${page.slug}` : '/')));
      return { ...current, header: { ...current.header, navItems: [...pageLinks, ...nonPageLinks] } };
    });
    setNotice({ type: 'success', text: 'Header navigation synced with visible pages.' });
  };

  const deletePage = (page: WebsitePage) => {
    if (!site || site.pages.length === 1 || page.slug === '') return;
    const next = site.pages.filter((item) => item.id !== page.id);
    updateSite((current) => ({ ...current, pages: next }));
    setActivePageId(next[0]?.id || '');
    setActiveSectionId(next[0]?.sections[0]?.id || '');
  };

  const addSection = (type: WebsiteSectionType) => {
    if (!activePage) return;
    const section = defaultSection(type);
    updatePage({ sections: [...activePage.sections, section] });
    setActiveSectionId(section.id);
  };

  const moveSection = (direction: -1 | 1) => {
    if (!activePage || !activeSection) return;
    const index = activePage.sections.findIndex((item) => item.id === activeSection.id);
    const target = index + direction;
    if (target < 0 || target >= activePage.sections.length) return;
    const next = [...activePage.sections];
    [next[index], next[target]] = [next[target], next[index]];
    updatePage({ sections: next });
  };

  const removeSection = () => {
    if (!activePage || !activeSection) return;
    const next = activePage.sections.filter((section) => section.id !== activeSection.id);
    updatePage({ sections: next });
    setActiveSectionId(next[0]?.id || '');
  };

  const uploadMedia = async (file?: File): Promise<WebsiteMediaItem | null> => {
    if (!file || !site || !selectedSchoolId) return null;
    setUploading(true);
    setNotice(null);
    try {
      const optimized = await optimizeImageFile(file);
      const form = new FormData();
      form.append('file', optimized);
      form.append('schoolId', selectedSchoolId);
      const { data } = await api.post('/website-management/media', form);
      const item = data.data as WebsiteMediaItem;
      updateSite((current) => ({ ...current, media: [item, ...current.media] }));
      const optimizedNote = optimized.size < file.size ? ` Image optimized from ${Math.round(file.size / 1024)} KB to ${Math.round(optimized.size / 1024)} KB.` : '';
      setNotice({ type: 'success', text: `Media uploaded to ${item.storageProvider === 'r2' ? 'Cloudflare R2' : 'storage'}.${optimizedNote} It is ready to use.` });
      return item;
    } catch (err: any) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Media upload failed.' });
      return null;
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
      if (sectionMediaRef.current) sectionMediaRef.current.value = '';
    }
  };

  const uploadSectionMedia = async (file?: File) => {
    if (!activeSection || !file) return;
    const item = await uploadMedia(file);
    if (!item) return;
    if (item.type === 'video') {
      updateSection({ videoUrl: item.url, imageUrl: '' });
    } else if (item.type === 'image') {
      updateSection({ imageUrl: item.url, videoUrl: '' });
    }
  };

  const deleteMedia = async (item: WebsiteMediaItem) => {
    if (!selectedSchoolId || !window.confirm(`Delete "${item.name}" from the media library and storage?`)) return;
    try {
      const { data } = await api.delete(`/website-management/media/${item.id}`, { params: { schoolId: selectedSchoolId } });
      updateSite((current) => ({ ...current, media: data.data?.media || current.media.filter((media) => media.id !== item.id) }));
      if (data.data?.version) setVersion(data.data.version);
      setNotice({ type: 'success', text: 'Media deleted from the library and storage.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not delete media.' });
    }
  };

  const replaceDraft = (draft: WebsiteSiteDocument, nextVersion?: number) => {
    setSite(draft);
    setSavedContent(JSON.stringify(draft));
    setActivePageId(draft.pages[0]?.id || '');
    setActiveSectionId(draft.pages[0]?.sections[0]?.id || '');
    if (nextVersion) setVersion(nextVersion);
    api.get('/website-management', { params: { schoolId: selectedSchoolId } }).then(({ data }) => {
      setIsPublished(data.data.isPublished); setPublishedAt(data.data.publishedAt || null);
    }).catch(() => undefined);
  };

  const showSidePreview = livePreview && LIVE_PREVIEW_TABS.includes(tab);

  const domain = organization
    ? organization.customDomain || `${organization.subdomain || organization.slug}.${import.meta.env.VITE_BASE_DOMAIN || 'sahaledu.com'}`
    : '';

  if (loading && !site) return <div className="flex min-h-[65vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>;

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] px-3 pb-10 pt-16 sm:px-5 lg:px-7 lg:pt-7">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2"><Globe2 className="h-6 w-6 text-primary-600" /><h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">Website Management</h1></div>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Build each organization website from header to footer, preview it, then publish when ready.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isPublished && domain && <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm font-semibold"><Eye className="h-4 w-4" />View live</a>}
            <button type="button" onClick={() => saveDraft()} disabled={!site || saving || publishing || uploading} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Draft</button>
            <button type="button" onClick={publish} disabled={!site || publishing || saving || uploading} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}Publish</button>
            <div className="relative group"><button type="button" className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2.5"><MoreVertical className="h-4 w-4" /></button><div className="invisible absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-1 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">{isPublished && <button type="button" onClick={unpublish} className="block w-full px-3 py-2 text-left text-xs font-medium hover:bg-[var(--color-surface-tertiary)]">Unpublish website</button>}<button type="button" onClick={resetDraft} className="block w-full px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20">Reset draft</button></div></div>
          </div>
        </div>

        <div className={`${panelClass} mb-5 p-4`}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-end">
            <div>
              <label className={labelClass}>Organization</label>
              {isSuperAdmin ? (
                <select value={selectedSchoolId} disabled={saving || publishing || uploading} onChange={(e) => { if (!dirty || window.confirm('Discard unsaved website changes?')) setSelectedSchoolId(e.target.value); }} className={fieldClass}>
                  <option value="">Select organization...</option>
                  {schools.map((school) => <option key={school._id} value={school._id}>{school.name}</option>)}
                </select>
              ) : <div className={`${fieldClass} bg-[var(--color-surface-tertiary)]`}>{organization?.name || user?.organizationName || 'Your organization'}</div>}
            </div>
            <div><label className={labelClass}>Domain</label><div className={`${fieldClass} flex items-center gap-2 overflow-hidden bg-[var(--color-surface-tertiary)]`}><Globe2 className="h-4 w-4 shrink-0" /><span className="truncate">{domain || 'No domain assigned'}</span></div></div>
            <div className="flex items-center gap-2 pb-1"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${isPublished ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}><span className={`h-2 w-2 rounded-full ${isPublished ? 'bg-green-500' : 'bg-amber-500'}`} />{dirty ? 'Unsaved changes' : isPublished ? 'Published · draft editable' : 'Draft only'}</span><span className="text-xs text-[var(--color-text-tertiary)]">v{version}</span></div>
          </div>
          {publishedAt && <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">Last published {new Date(publishedAt).toLocaleString()}</p>}
        </div>

        {notice && <div className={`mb-5 flex items-start justify-between gap-3 rounded-xl border p-3.5 text-sm ${notice.type === 'success' ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300'}`}><span>{notice.text}</span><button onClick={() => setNotice(null)}><X className="h-4 w-4" /></button></div>}

        {site && organization && <fieldset disabled={saving || publishing || uploading} className="min-w-0">
          <div className="mb-5 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5">
                {MAIN_TABS.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === item.key ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><item.icon className="h-4 w-4" />{item.label}</button>)}
              </div>
              <button type="button" onClick={() => setLivePreview((value) => !value)} className="hidden items-center gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm font-bold xl:inline-flex">{livePreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{livePreview ? 'Hide preview' : 'Show preview'}</button>
              <button type="button" onClick={() => setTab('preview')} className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold xl:hidden ${tab === 'preview' ? 'border-primary-600 bg-primary-600 text-white' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}><Eye className="h-4 w-4" />Preview</button>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="mr-1 shrink-0 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Manage</span>
              {MANAGE_TABS.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${tab === item.key ? 'bg-[var(--color-text-primary)] text-[var(--color-surface-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><item.icon className="h-3.5 w-3.5" />{item.label}</button>)}
            </div>
          </div>

          <div className={showSidePreview ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,46%)] xl:items-start xl:gap-5' : ''}>
          <div className="min-w-0">

          {tab === 'pages' && (
            <div className={`grid gap-5 ${showSidePreview ? '' : 'xl:grid-cols-[360px_1fr]'}`}>
              <div className={`${panelClass} p-4`}>
                <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-bold">Pages</h2><div className="flex gap-1"><button type="button" onClick={syncNavigation} className="rounded-lg border border-[var(--color-border-default)] px-2.5 py-1.5 text-[11px] font-semibold">Sync Menu</button><button type="button" onClick={addPage} className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700 dark:bg-primary-950/30 dark:text-primary-300"><Plus className="h-3.5 w-3.5" />New Page</button></div></div>
                <div className="space-y-2">{site.pages.map((page) => <button key={page.id} type="button" onClick={() => { setActivePageId(page.id); setActiveSectionId(page.sections[0]?.id || ''); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${activePage?.id === page.id ? 'border-primary-300 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/20' : 'border-[var(--color-border-subtle)]'}`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{page.title}</p><p className="truncate text-xs text-[var(--color-text-tertiary)]">/{page.slug}</p></div><ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" /></button>)}</div>
              </div>
              {activePage && <div className={`${panelClass} p-5 sm:p-6`}>
                <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Page Settings</h2><p className="text-xs text-[var(--color-text-tertiary)]">Control the page URL, navigation visibility and search metadata.</p></div>{activePage.slug !== '' && <button type="button" onClick={() => deletePage(activePage)} className="rounded-xl border border-red-200 p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><label className={labelClass}>Page title</label><input className={fieldClass} value={activePage.title} onChange={(e) => updatePage({ title: e.target.value })} /></div>
                  <div><label className={labelClass}>URL slug {activePage.slug === '' && <span className="font-normal text-[var(--color-text-tertiary)]">(home page)</span>}</label><input className={fieldClass} disabled={activePage.slug === ''} value={activePage.slug} onChange={(e) => updatePage({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} /></div>
                  <div className="md:col-span-2"><label className={labelClass}>SEO title</label><input className={fieldClass} value={activePage.seoTitle} onChange={(e) => updatePage({ seoTitle: e.target.value })} placeholder="Title shown in browser/search results" /></div>
                  <div className="md:col-span-2"><label className={labelClass}>SEO description</label><textarea className={fieldClass} rows={3} value={activePage.seoDescription} onChange={(e) => updatePage({ seoDescription: e.target.value })} /></div>
                  <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border-subtle)] p-3 text-sm font-medium"><input type="checkbox" checked={activePage.showInNavigation} onChange={(e) => updatePage({ showInNavigation: e.target.checked })} className="h-4 w-4 rounded" />Available for navigation menus</label>
                  <button type="button" onClick={() => setTab('sections')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white"><LayoutTemplate className="h-4 w-4" />Edit this page content</button>
                </div>
              </div>}
            </div>
          )}

          {tab === 'header' && (
            <div className={`${panelClass} p-5 sm:p-6`}>
              <div className="mb-6"><h2 className="text-lg font-bold">Header & Navigation</h2><p className="text-xs text-[var(--color-text-tertiary)]">Manage logo, organization name, menus and the main action button.</p></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className={labelClass}>Organization logo</label><ImageField value={site.header.logoUrl} onChange={(logoUrl) => updateSite((s) => ({ ...s, header: { ...s.header, logoUrl } }))} media={site.media} /><p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">Leave empty to use Organization Branding.</p></div>
                <div><label className={labelClass}>Website display name</label><input className={fieldClass} value={site.header.displayName || ''} placeholder={organization.name} onChange={(e) => updateSite((s) => ({ ...s, header: { ...s.header, displayName: e.target.value } }))} /></div>
                <div><label className={labelClass}>CTA text</label><input className={fieldClass} value={site.header.ctaText} onChange={(e) => updateSite((s) => ({ ...s, header: { ...s.header, ctaText: e.target.value } }))} /></div>
                <div><label className={labelClass}>CTA URL</label><input className={fieldClass} value={site.header.ctaUrl} onChange={(e) => updateSite((s) => ({ ...s, header: { ...s.header, ctaUrl: e.target.value } }))} /></div>
                <div className="flex flex-wrap gap-3 pt-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={site.header.showOrganizationName} onChange={(e) => updateSite((s) => ({ ...s, header: { ...s.header, showOrganizationName: e.target.checked } }))} />Show organization name</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={site.header.sticky} onChange={(e) => updateSite((s) => ({ ...s, header: { ...s.header, sticky: e.target.checked } }))} />Sticky header</label></div>
              </div>
              <div className="mt-6"><LinkEditor title="Navigation Menu" items={site.header.navItems} onChange={(items) => updateSite((s) => ({ ...s, header: { ...s.header, navItems: items } }))} /></div>
            </div>
          )}

          {tab === 'sections' && activePage && (
            <div className={`grid gap-5 ${showSidePreview ? '' : 'xl:grid-cols-[380px_1fr]'}`}>
              <div className={`${panelClass} p-4`}>
                <div className="mb-3"><label className={labelClass}>Editing page</label><select className={fieldClass} value={activePage.id} onChange={(e) => { const page = site.pages.find((item) => item.id === e.target.value); setActivePageId(e.target.value); setActiveSectionId(page?.sections[0]?.id || ''); }}>{site.pages.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}</select></div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Sections · click one to edit</p>
                <div className={`grid gap-2 ${showSidePreview ? 'sm:grid-cols-2' : ''}`}>{activePage.sections.map((section, index) => {
                  const color = SECTION_COLORS[section.type] || '#64748b';
                  return <div key={section.id} className={`flex w-full items-center gap-2 rounded-xl border p-2.5 transition ${activeSection?.id === section.id ? 'border-primary-400 bg-primary-50 ring-2 ring-primary-500/15 dark:border-primary-700 dark:bg-primary-950/20' : 'border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)]'} ${section.visible ? '' : 'opacity-70'}`}>
                    <button type="button" onClick={() => setActiveSectionId(section.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span style={{ backgroundColor: color }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white">{index + 1}</span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{section.title || SECTION_PRESETS.find((x) => x.type === section.type)?.label}</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{SECTION_PRESETS.find((x) => x.type === section.type)?.label || section.type} · {section.visible ? 'Shown' : 'Hidden'}</p></div>
                    </button>
                    <button
                      type="button"
                      aria-label={section.visible ? `Hide ${section.title || 'section'}` : `Show ${section.title || 'section'}`}
                      title={section.visible ? 'Hide section' : 'Show section'}
                      onClick={() => toggleSectionVisibility(section.id, section.visible)}
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${section.visible ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-tertiary)] hover:border-primary-300 hover:text-primary-600'}`}
                    >
                      {section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>;
                })}</div>
                <details className="group mt-4 border-t border-[var(--color-border-subtle)] pt-4">
                  <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-dashed border-primary-300 px-3 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-50/60 dark:text-primary-300 dark:hover:bg-primary-950/10 [&::-webkit-details-marker]:hidden"><Plus className="h-4 w-4 transition group-open:rotate-45" />Add a section</summary>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">{SECTION_PRESETS.map((preset) => <button key={preset.type} type="button" onClick={() => addSection(preset.type)} className="rounded-xl border border-[var(--color-border-subtle)] p-3 text-left hover:border-primary-300 hover:bg-primary-50/50 dark:hover:bg-primary-950/10"><p className="flex items-center gap-2 text-sm font-semibold"><span style={{ backgroundColor: SECTION_COLORS[preset.type] || '#64748b' }} className="h-2.5 w-2.5 rounded-full" />{preset.label}</p><p className="mt-0.5 text-[11px] leading-4 text-[var(--color-text-tertiary)]">{preset.description}</p></button>)}</div>
                </details>
              </div>
              {activeSection ? <div className={`${panelClass} p-5 sm:p-6`}>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="rounded-lg bg-primary-50 px-2 py-1 text-[11px] font-bold uppercase text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">{activeSection.type}</span><h2 className="text-lg font-bold">{activeSection.title || 'Untitled section'}</h2></div><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Edit content, media, layout and visibility.</p></div><div className="flex gap-1"><button type="button" onClick={() => moveSection(-1)} className="rounded-lg border border-[var(--color-border-default)] p-2"><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => moveSection(1)} className="rounded-lg border border-[var(--color-border-default)] p-2"><ArrowDown className="h-4 w-4" /></button><button type="button" onClick={() => toggleSectionVisibility(activeSection.id, activeSection.visible)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${activeSection.visible ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300' : 'border-[var(--color-border-default)] text-[var(--color-text-tertiary)]'}`}>{activeSection.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{activeSection.visible ? 'Shown' : 'Hidden'}</button><button type="button" onClick={removeSection} className="rounded-lg border border-red-200 p-2 text-red-500"><Trash2 className="h-4 w-4" /></button></div></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2"><label className={labelClass}>Title</label><input className={fieldClass} value={activeSection.title} onChange={(e) => updateSection({ title: e.target.value })} /></div>
                  <div className="md:col-span-2"><label className={labelClass}>Subtitle</label><input className={fieldClass} value={activeSection.subtitle} onChange={(e) => updateSection({ subtitle: e.target.value })} /></div>
                  <div className="md:col-span-2"><label className={labelClass}>Body text</label><textarea className={fieldClass} rows={5} value={activeSection.body} onChange={(e) => updateSection({ body: e.target.value })} /></div>
                  {activeSection.type === 'hero' && (
                    <div className="md:col-span-2 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-[var(--color-text-primary)]">Hero media</p>
                          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Show one image or one video. Upload a file, choose existing media, or paste a YouTube/Vimeo/direct video link.</p>
                        </div>
                        <div className="flex gap-2">
                          <input ref={sectionMediaRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" className="hidden" onChange={(e) => void uploadSectionMedia(e.target.files?.[0])} />
                          <button type="button" disabled={uploading} onClick={() => sectionMediaRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}Upload image/video
                          </button>
                          {(activeSection.imageUrl || activeSection.videoUrl) && <button type="button" onClick={() => updateSection({ imageUrl: '', videoUrl: '' })} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2.5 text-xs font-semibold">Clear</button>}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div><label className={labelClass}>Image</label><ImageField value={activeSection.imageUrl} onChange={(imageUrl) => updateSection({ imageUrl, ...(imageUrl ? { videoUrl: '' } : {}) })} media={site.media} /></div>
                        <div><label className={labelClass}>Video / YouTube link</label><VideoField value={activeSection.videoUrl} onChange={(videoUrl) => updateSection({ videoUrl, ...(videoUrl ? { imageUrl: '' } : {}) })} media={site.media} /></div>
                      </div>
                    </div>
                  )}
                  {activeSection.type !== 'contact' && activeSection.type !== 'hero' && activeSection.type !== 'video' && <div><label className={labelClass}>Image URL</label><ImageField value={activeSection.imageUrl} onChange={(imageUrl) => updateSection({ imageUrl })} media={site.media} /></div>}
                  {activeSection.type === 'video' && <div className="md:col-span-2"><label className={labelClass}>Video</label><VideoField value={activeSection.videoUrl} onChange={(videoUrl) => updateSection({ videoUrl })} media={site.media} /></div>}
                  <div><label className={labelClass}>Background</label><select className={fieldClass} value={activeSection.background} onChange={(e) => updateSection({ background: e.target.value as WebsiteSection['background'] })}><option value="default">White</option><option value="muted">Soft gray</option><option value="primary">Primary color</option><option value="dark">Dark</option></select></div>
                  <div><label className={labelClass}>Alignment</label><select className={fieldClass} value={activeSection.alignment} onChange={(e) => updateSection({ alignment: e.target.value as WebsiteSection['alignment'] })}><option value="left">Left</option><option value="center">Center</option></select></div>
                  {['hero', 'about', 'custom'].includes(activeSection.type) && <><div><label className={labelClass}>Button text</label><input className={fieldClass} value={activeSection.buttonText} onChange={(e) => updateSection({ buttonText: e.target.value })} /></div><div><label className={labelClass}>Button URL</label><input className={fieldClass} value={activeSection.buttonUrl} onChange={(e) => updateSection({ buttonUrl: e.target.value })} /></div></>}
                </div>
                {['services', 'programs', 'stats', 'gallery', 'testimonials', 'faq', 'news', 'staff', 'partners'].includes(activeSection.type) && <CardEditor media={site.media} section={activeSection} onChange={(cards) => updateSection({ cards })} />}
              </div> : <div className={`${panelClass} flex min-h-[300px] items-center justify-center p-8 text-center text-sm text-[var(--color-text-tertiary)]`}>Add or select a section to edit it.</div>}
            </div>
          )}

          {tab === 'media' && (
            <div className={`${panelClass} p-5 sm:p-6`}>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="text-lg font-bold">Media Library</h2><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${storageProvider === 'r2' ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}>{storageProvider === 'r2' ? 'Cloudflare R2' : 'Local fallback'}</span></div><p className="text-xs text-[var(--color-text-tertiary)]">Images are compressed in the browser before upload; public images use lazy loading.</p></div><div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf" className="hidden" onChange={(e) => uploadMedia(e.target.files?.[0])} /><button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}Upload Media</button></div></div>
              {site.media.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{site.media.map((item) => <div key={item.id} className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]">{item.type === 'image' ? <img src={item.url} alt={item.alt || item.name} className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-slate-900 text-white">{item.type === 'video' ? <Video className="h-8 w-8" /> : <FileText className="h-8 w-8" />}</div>}<div className="p-3"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 text-[11px] uppercase text-[var(--color-text-tertiary)]">{item.type}{item.size ? ` · ${Math.round(item.size / 1024)} KB` : ''}</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => navigator.clipboard?.writeText(item.url)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--color-border-default)] px-2 py-1.5 text-xs font-semibold"><Copy className="h-3.5 w-3.5" />Copy URL</button><button type="button" onClick={() => deleteMedia(item)} className="rounded-lg border border-red-200 p-1.5 text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></div></div></div>)}</div> : <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] py-16 text-center"><ImageIcon className="mx-auto h-9 w-9 text-[var(--color-text-tertiary)]" /><p className="mt-3 text-sm font-semibold">No media uploaded yet</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Upload JPG, PNG, WEBP, GIF, MP4, WEBM or PDF.</p></div>}
            </div>
          )}

          {tab === 'theme' && (
            <div className={`grid gap-5 ${showSidePreview ? '' : 'lg:grid-cols-[1fr_420px]'}`}>
              <div className={`${panelClass} p-5 sm:p-6`}><h2 className="text-lg font-bold">Design</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Pick a colour palette in one click, then fine-tune. These settings apply across every page.</p>
                <div className="mt-6"><p className={labelClass}>Colour palettes</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{THEME_PRESETS.map((preset) => {
                  const active = (['primaryColor', 'secondaryColor', 'accentColor'] as const).every((key) => (site.theme[key] || '').toLowerCase() === preset[key]);
                  return <button key={preset.name} type="button" onClick={() => updateSite((s) => ({ ...s, theme: { ...s.theme, primaryColor: preset.primaryColor, secondaryColor: preset.secondaryColor, accentColor: preset.accentColor } }))} className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-bold transition ${active ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)]'}`}>
                    <span className="flex -space-x-1.5">{[preset.primaryColor, preset.accentColor, preset.secondaryColor].map((color) => <span key={color} style={{ backgroundColor: color }} className="h-6 w-6 rounded-full ring-2 ring-[var(--color-surface-primary)]" />)}</span>
                    <span className="flex-1">{preset.name}</span>{active && <Check className="h-4 w-4 text-primary-600" />}
                  </button>;
                })}</div></div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[['Primary color', 'primaryColor'], ['Secondary color', 'secondaryColor'], ['Accent color', 'accentColor']].map(([label, key]) => <div key={key}><label className={labelClass}>{label}</label><div className="flex gap-2"><input type="color" value={(site.theme as any)[key]} onChange={(e) => updateSite((s) => ({ ...s, theme: { ...s.theme, [key]: e.target.value } }))} className="h-11 w-14 rounded-lg border border-[var(--color-border-default)] bg-transparent p-1" /><input className={fieldClass} value={(site.theme as any)[key]} onChange={(e) => updateSite((s) => ({ ...s, theme: { ...s.theme, [key]: e.target.value } }))} /></div></div>)}
                <div className="sm:col-span-2"><label className={labelClass}>Font</label><select className={fieldClass} value={site.theme.fontFamily} onChange={(e) => updateSite((s) => ({ ...s, theme: { ...s.theme, fontFamily: e.target.value } }))}>{FONT_OPTIONS.map((font) => <option key={font} value={font}>{font.split(',')[0]}</option>)}</select></div>
                <div><label className={labelClass}>Button style</label><select className={fieldClass} value={site.theme.buttonStyle} onChange={(e) => updateSite((s) => ({ ...s, theme: { ...s.theme, buttonStyle: e.target.value as WebsiteSiteDocument['theme']['buttonStyle'] } }))}><option value="rounded">Rounded</option><option value="pill">Pill</option><option value="square">Square</option></select></div>
                <div><label className={labelClass}>Card style</label><select className={fieldClass} value={site.theme.cardStyle} onChange={(e) => updateSite((s) => ({ ...s, theme: { ...s.theme, cardStyle: e.target.value as WebsiteSiteDocument['theme']['cardStyle'] } }))}><option value="soft">Soft shadow</option><option value="bordered">Bordered</option><option value="flat">Flat</option></select></div>
              </div></div>
              {!showSidePreview && <div className={`${panelClass} overflow-hidden`}><div className="border-b border-[var(--color-border-subtle)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Brand preview</div><div style={{ backgroundColor: site.theme.secondaryColor }} className="p-6 text-white"><div style={{ backgroundColor: site.theme.primaryColor }} className="h-14 w-14 rounded-2xl" /><h3 style={{ fontFamily: site.theme.fontFamily }} className="mt-5 text-2xl font-bold">{organization.name}</h3><p className="mt-2 text-sm text-white/70">Primary, secondary and typography preview.</p><button style={{ backgroundColor: site.theme.primaryColor, borderRadius: site.theme.buttonStyle === 'pill' ? 999 : site.theme.buttonStyle === 'square' ? 4 : 12 }} className="mt-5 px-4 py-2.5 text-sm font-semibold">Example Button</button></div></div>}
            </div>
          )}

          {tab === 'header' && (
            <div className={`${panelClass} mt-5 p-5 sm:p-6`}><h2 className="text-lg font-bold">Footer</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Manage contact information, quick links, social links and copyright.</p><div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><label className={labelClass}>Description</label><textarea className={fieldClass} rows={4} value={site.footer.description} onChange={(e) => updateSite((s) => ({ ...s, footer: { ...s.footer, description: e.target.value } }))} /></div>
              <div><label className={labelClass}>Address</label><input className={fieldClass} value={site.footer.address} onChange={(e) => updateSite((s) => ({ ...s, footer: { ...s.footer, address: e.target.value } }))} /></div>
              <div><label className={labelClass}>Phone</label><input className={fieldClass} value={site.footer.phone} onChange={(e) => updateSite((s) => ({ ...s, footer: { ...s.footer, phone: e.target.value } }))} /></div>
              <div><label className={labelClass}>Email</label><input className={fieldClass} value={site.footer.email} onChange={(e) => updateSite((s) => ({ ...s, footer: { ...s.footer, email: e.target.value } }))} /></div>
              <div><label className={labelClass}>Copyright</label><input className={fieldClass} value={site.footer.copyright} onChange={(e) => updateSite((s) => ({ ...s, footer: { ...s.footer, copyright: e.target.value } }))} /></div>
            </div><div className="mt-6 grid gap-6 lg:grid-cols-2"><LinkEditor title="Quick Links" items={site.footer.quickLinks} onChange={(items) => updateSite((s) => ({ ...s, footer: { ...s.footer, quickLinks: items } }))} /><LinkEditor title="Social Links" items={site.footer.socials} onChange={(items) => updateSite((s) => ({ ...s, footer: { ...s.footer, socials: items } }))} /></div></div>
          )}

          {tab === 'seo' && (
            <div className={`${panelClass} p-5 sm:p-6`}><h2 className="text-lg font-bold">SEO & Sharing</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Default search and social-sharing metadata for the organization website.</p><div className="mt-6 grid gap-4">
              <div><label className={labelClass}>Site title</label><input className={fieldClass} value={site.seo.siteTitle} onChange={(e) => updateSite((s) => ({ ...s, seo: { ...s.seo, siteTitle: e.target.value } }))} /></div>
              <div><label className={labelClass}>Description</label><textarea className={fieldClass} rows={4} value={site.seo.description} onChange={(e) => updateSite((s) => ({ ...s, seo: { ...s.seo, description: e.target.value } }))} /></div>
              <div><label className={labelClass}>Keywords</label><input className={fieldClass} value={site.seo.keywords} onChange={(e) => updateSite((s) => ({ ...s, seo: { ...s.seo, keywords: e.target.value } }))} placeholder="education, school, university..." /></div>
              <div><label className={labelClass}>Social preview image URL</label><input className={fieldClass} value={site.seo.ogImage} onChange={(e) => updateSite((s) => ({ ...s, seo: { ...s.seo, ogImage: e.target.value } }))} /></div>
            </div></div>
          )}

          {ADVANCED_WEBSITE_TABS.some((item) => item.key === tab) && (
            <WebsiteAdvancedPanel
              tab={tab as AdvancedWebsiteTab}
              schoolId={selectedSchoolId}
              site={site}
              organization={organization}
              onReplaceDraft={replaceDraft}
              onUpdateSite={updateSite}
              showNotice={(next) => setNotice(next)}
            />
          )}

          {tab === 'preview' && <WebsitePreview site={site} organization={organization} initialPageSlug={activePage?.slug || ''} />}
          </div>
          {showSidePreview && <div className="hidden xl:sticky xl:top-4 xl:block"><WebsitePreview site={site} organization={organization} initialPageSlug={activePage?.slug || ''} /></div>}
          </div>
        </fieldset>}
      </div>
    </div>
  );
}

export default WebsiteManagement;
