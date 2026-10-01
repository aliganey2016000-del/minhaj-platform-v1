import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowRight, Award, BookOpen, Briefcase, Building2, CalendarDays,
  CheckCircle2, Globe2, GraduationCap, Heart, Loader2, Mail, MapPin, Menu,
  Phone, PlayCircle, Send, Star, Users, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import api from '../../lib/axios';

export type WebsiteSectionType =
  | 'hero' | 'about' | 'services' | 'programs' | 'stats' | 'gallery'
  | 'video' | 'testimonials' | 'faq' | 'contact' | 'custom' | 'news' | 'staff' | 'partners';

export interface WebsiteLink {
  id: string;
  label: string;
  href: string;
  visible: boolean;
}

export interface WebsiteCard {
  id: string;
  title: string;
  text: string;
  value?: string;
  icon?: string;
  imageUrl?: string;
  link?: string;
  question?: string;
  answer?: string;
  date?: string;
  role?: string;
}

export interface WebsiteSection {
  id: string;
  type: WebsiteSectionType;
  title: string;
  subtitle: string;
  body: string;
  imageUrl: string;
  videoUrl: string;
  icon: string;
  buttonText: string;
  buttonUrl: string;
  background: 'default' | 'muted' | 'primary' | 'dark';
  alignment: 'left' | 'center';
  visible: boolean;
  cards: WebsiteCard[];
}

export interface WebsitePage {
  id: string;
  title: string;
  slug: string;
  showInNavigation: boolean;
  seoTitle: string;
  seoDescription: string;
  sections: WebsiteSection[];
}

export interface WebsiteMediaItem {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document';
  url: string;
  alt: string;
  storageKey?: string;
  storageProvider?: 'r2' | 'local';
  mimeType?: string;
  size?: number;
}

export interface WebsiteLanguage {
  code: string;
  label: string;
  direction: 'ltr' | 'rtl';
  enabled: boolean;
}

export interface WebsiteSiteDocument {
  header: {
    displayName?: string;
    logoUrl: string;
    showOrganizationName: boolean;
    sticky: boolean;
    navItems: WebsiteLink[];
    ctaText: string;
    ctaUrl: string;
  };
  pages: WebsitePage[];
  footer: {
    description: string;
    address: string;
    phone: string;
    email: string;
    quickLinks: WebsiteLink[];
    socials: WebsiteLink[];
    copyright: string;
  };
  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    buttonStyle: 'rounded' | 'pill' | 'square';
    cardStyle: 'soft' | 'bordered' | 'flat';
  };
  seo: {
    siteTitle: string;
    description: string;
    keywords: string;
    ogImage: string;
  };
  settings: {
    contactFormEnabled: boolean;
    analyticsEnabled: boolean;
  };
  defaultLanguage: string;
  languages: WebsiteLanguage[];
  translations: Record<string, Record<string, string>>;
  media: WebsiteMediaItem[];
}

export interface WebsiteOrganization {
  _id?: string;
  name: string;
  slug?: string;
  subdomain?: string;
  customDomain?: string;
  institutionType?: string;
  branding?: { logo?: string; themeColor?: string };
  address?: string;
  phone?: string;
  email?: string;
}

const ICONS: Record<string, LucideIcon> = {
  Award, BookOpen, Briefcase, Building2, CalendarDays, CheckCircle2, Globe2,
  GraduationCap, Heart, Mail, MapPin, Phone, PlayCircle, Star, Users,
};

function Icon({ name, className = 'h-5 w-5' }: { name?: string; className?: string }) {
  const Component = (name && ICONS[name]) || CheckCircle2;
  return <Component className={className} strokeWidth={1.8} />;
}

function youtubeEmbed(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (parsed.pathname.startsWith('/embed/')) return url;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function SectionShell({ section, primary, secondary, children }: {
  section: WebsiteSection;
  primary: string;
  secondary: string;
  children: ReactNode;
}) {
  const background =
    section.type === 'hero'
      ? `linear-gradient(135deg, ${secondary} 0%, ${secondary} 48%, ${primary} 145%)`
      : section.background === 'primary' ? primary
      : section.background === 'dark' ? secondary
      : section.background === 'muted' ? '#f6f8fb' : '#ffffff';
  const dark = section.type === 'hero' || section.background === 'primary' || section.background === 'dark';
  return (
    <section id={section.id} style={{ background, color: dark ? '#ffffff' : '#0f172a' }} className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-[1320px]">{children}</div>
    </section>
  );
}

type Translate = (key: string, fallback: string) => string;

function SectionHeading({ section, dark = false, tr }: { section: WebsiteSection; dark?: boolean; tr: Translate }) {
  const center = section.alignment === 'center';
  const title = tr(`section.${section.id}.title`, section.title);
  const subtitle = tr(`section.${section.id}.subtitle`, section.subtitle);
  const body = tr(`section.${section.id}.body`, section.body);
  return (
    <div className={`${center ? 'mx-auto text-center' : ''} max-w-3xl`}>
      {subtitle && <p className={`mb-4 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm ${dark ? 'text-white/65' : 'text-slate-500'}`}>{subtitle}</p>}
      {title && <h2 className="text-3xl font-extrabold leading-tight tracking-[-0.025em] sm:text-4xl lg:text-5xl">{title}</h2>}
      {body && <p className={`mt-5 whitespace-pre-line text-[15px] leading-7 sm:text-lg sm:leading-8 ${dark ? 'text-white/75' : 'text-slate-600'}`}>{body}</p>}
    </div>
  );
}

function ContactForm({ primary, sourcePage, preview, sessionId, tr }: {
  primary: string;
  sourcePage: string;
  preview: boolean;
  sessionId?: string;
  tr: Translate;
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '', website: '' });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (preview) return;
    setSending(true);
    setNotice(null);
    try {
      await api.post('/website-management/public/contact', { ...form, sourcePage, sessionId });
      setForm({ name: '', email: '', phone: '', subject: '', message: '', website: '' });
      setNotice({ ok: true, text: tr('contact.success', 'Thank you. Your message has been sent.') });
    } catch (err: any) {
      setNotice({ ok: false, text: err.response?.data?.message || tr('contact.error', 'Unable to send your message. Please try again.') });
    } finally {
      setSending(false);
    }
  };

  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100';
  return (
    <form onSubmit={submit} className="rounded-[2rem] border border-slate-200/80 bg-white p-5 text-slate-900 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.28)] sm:p-7">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={input} required value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder={tr('contact.name', 'Your name')} />
        <input className={input} type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} placeholder={tr('contact.email', 'Email address')} />
        <input className={input} value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} placeholder={tr('contact.phone', 'Phone number')} />
        <input className={input} value={form.subject} onChange={(e) => setForm((v) => ({ ...v, subject: e.target.value }))} placeholder={tr('contact.subject', 'Subject')} />
        <textarea className={`${input} sm:col-span-2`} rows={5} required value={form.message} onChange={(e) => setForm((v) => ({ ...v, message: e.target.value }))} placeholder={tr('contact.message', 'How can we help?')} />
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={(e) => setForm((v) => ({ ...v, website: e.target.value }))} />
      </div>
      {notice && <p className={`mt-3 text-xs font-medium ${notice.ok ? 'text-emerald-700' : 'text-red-600'}`}>{notice.text}</p>}
      <button disabled={sending || preview} type="submit" style={{ backgroundColor: primary }} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {preview ? tr('contact.preview', 'Contact form preview') : tr('contact.send', 'Send Message')}
      </button>
    </form>
  );
}

function WebsiteSectionView({ section, site, organization, tr, pageSlug, preview, sessionId, onTrack }: {
  section: WebsiteSection;
  site: WebsiteSiteDocument;
  organization: WebsiteOrganization;
  tr: Translate;
  pageSlug: string;
  preview: boolean;
  sessionId?: string;
  onTrack?: (event: 'cta', page: string) => void;
}) {
  const { primaryColor: primary, secondaryColor: secondary } = site.theme;
  const dark = section.type === 'hero' || section.background === 'primary' || section.background === 'dark';
  const buttonRadius = site.theme.buttonStyle === 'pill' ? '999px' : site.theme.buttonStyle === 'square' ? '4px' : '12px';
  const cardClass = site.theme.cardStyle === 'bordered'
    ? 'border border-slate-200 bg-white'
    : site.theme.cardStyle === 'flat'
      ? 'bg-white'
      : 'border border-slate-100 bg-white shadow-sm';

  if (section.type === 'hero') {
    const title = tr(`section.${section.id}.title`, section.title || organization.name);
    const subtitle = tr(`section.${section.id}.subtitle`, section.subtitle);
    const body = tr(`section.${section.id}.body`, section.body);
    const buttonText = tr(`section.${section.id}.buttonText`, section.buttonText);
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <div className={`${section.imageUrl ? 'grid lg:grid-cols-[1.03fr_.97fr]' : 'block'} min-h-[500px] items-center gap-12 lg:min-h-[570px] lg:gap-20`}>
          <div className={section.alignment === 'center' ? 'mx-auto max-w-4xl text-center' : section.imageUrl ? 'max-w-3xl' : 'mx-auto max-w-5xl text-center'}>
            {subtitle && <p className={`mb-6 inline-flex rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] sm:text-sm ${dark ? 'border-white/15 bg-white/10 text-white/75' : 'border-slate-200 bg-white text-slate-600'}`}>{subtitle}</p>}
            <h1 className="text-4xl font-black leading-[1.04] tracking-[-0.04em] sm:text-6xl lg:text-7xl">{title}</h1>
            {body && <p className={`mt-7 max-w-2xl whitespace-pre-line text-base leading-8 sm:text-xl sm:leading-9 ${section.alignment === 'center' || !section.imageUrl ? 'mx-auto' : ''} ${dark ? 'text-white/72' : 'text-slate-600'}`}>{body}</p>}
            {buttonText && (
              <a onClick={() => onTrack?.('cta', pageSlug || '/')} href={section.buttonUrl || '#'} style={{ backgroundColor: dark ? '#ffffff' : primary, color: dark ? primary : '#ffffff', borderRadius: buttonRadius }} className="mt-9 inline-flex items-center gap-2 px-6 py-3.5 text-sm font-bold shadow-xl transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:opacity-95">
                {buttonText}<ArrowRight className="h-4 w-4" />
              </a>
            )}
          </div>
          {section.imageUrl && (
            <div className={`overflow-hidden rounded-[2.25rem] border border-white/15 bg-white/10 p-2 shadow-2xl backdrop-blur ${section.alignment === 'center' ? 'mx-auto w-full max-w-5xl' : ''}`}>
              <img src={section.imageUrl} alt={title} fetchPriority="high" className="aspect-[5/4] h-full w-full rounded-[1.8rem] object-cover" />
            </div>
          )}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'about' || section.type === 'custom') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <div className={`grid items-center gap-12 lg:gap-20 ${section.imageUrl ? 'lg:grid-cols-2' : ''}`}>
          <div><SectionHeading section={section} dark={dark} tr={tr} />
          {section.buttonText && <a href={section.buttonUrl || '#'} style={{ backgroundColor: primary, borderRadius: buttonRadius }} className="mt-6 inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white">{tr(`section.${section.id}.buttonText`, section.buttonText)}<ArrowRight className="h-4 w-4" /></a>}</div>
          {section.imageUrl && <img loading="lazy" src={section.imageUrl} alt={tr(`section.${section.id}.title`, section.title)} className="aspect-[16/11] w-full rounded-[2rem] object-cover shadow-[0_24px_60px_-28px_rgba(15,23,42,0.32)]" />}
        </div>
      </SectionShell>
    );
  }

  if (['services', 'programs', 'testimonials', 'news', 'staff', 'partners'].includes(section.type)) {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} tr={tr} />
        <div className={section.type === 'partners' ? 'mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5' : 'mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3'}>
          {section.cards.map((card) => {
            const title = tr(`card.${card.id}.title`, card.title);
            const body = tr(`card.${card.id}.text`, card.text);
            return (
              <a key={card.id} onClick={() => card.link && onTrack?.('cta', pageSlug || '/')} href={card.link || undefined} className={`${cardClass} group block min-h-full overflow-hidden rounded-[1.75rem] p-6 text-slate-900 transition duration-200 hover:-translate-y-1 hover:shadow-xl`}>
                {card.imageUrl && <img loading="lazy" src={card.imageUrl} alt={title} className={`-mx-6 -mt-6 mb-5 w-[calc(100%+3rem)] ${section.type === 'partners' ? 'h-28 object-contain p-4 sm:h-32' : section.type === 'staff' || section.type === 'testimonials' ? 'aspect-[4/3] object-cover object-top' : 'aspect-[16/9] object-cover'}`} />}
                <div style={{ color: primary }} className={`${section.type === 'partners' ? 'hidden' : 'mb-5 inline-flex'} rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100`}><Icon name={card.icon || section.icon} className="h-5 w-5" /></div>
                {card.date && <p className="mb-2 text-xs font-semibold text-slate-500">{card.date}</p>}
                <h3 className={`${section.type === 'partners' ? 'text-center text-base sm:text-lg' : 'text-xl'} font-extrabold leading-snug tracking-tight`}>{title}</h3>
                {card.role && <p style={{ color: primary }} className="mt-1 text-sm font-semibold">{tr(`card.${card.id}.role`, card.role)}</p>}
                {body && <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-600">{body}</p>}
              </a>
            );
          })}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'stats') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} tr={tr} />
        <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {section.cards.map((card) => (
            <div key={card.id} className={`${dark ? 'border-white/15 bg-white/10 text-white' : cardClass} rounded-[1.75rem] border p-6 text-center shadow-sm sm:p-8`}>
              <p className="text-4xl font-black tracking-tight sm:text-5xl">{card.value || tr(`card.${card.id}.title`, card.title)}</p>
              <p className={`mt-2 text-sm ${dark ? 'text-white/70' : 'text-slate-500'}`}>{card.value ? tr(`card.${card.id}.title`, card.title) : tr(`card.${card.id}.text`, card.text)}</p>
            </div>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'gallery') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} tr={tr} />
        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {section.cards.filter((card) => card.imageUrl).map((card) => {
            const caption = tr(`card.${card.id}.title`, card.title) || tr(`card.${card.id}.text`, card.text);
            return (
              <figure key={card.id} className="group relative overflow-hidden rounded-[1.75rem] bg-slate-100 shadow-sm">
                <img loading="lazy" src={card.imageUrl} alt={caption} className="aspect-square h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                {caption && <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10 text-sm font-medium text-white">{caption}</figcaption>}
              </figure>
            );
          })}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'video') {
    const embed = youtubeEmbed(section.videoUrl);
    const isFileVideo = /\.(mp4|webm)(\?.*)?$/i.test(section.videoUrl || '');
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} tr={tr} />
        {section.videoUrl && (
          <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200/20 bg-black shadow-2xl">
            {embed ? (
              <iframe loading="lazy" src={embed} title={tr(`section.${section.id}.title`, section.title) || 'Video'} className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            ) : isFileVideo || section.videoUrl.includes('/website-management/public/media/') ? (
              <video preload="metadata" src={section.videoUrl} controls className="aspect-video w-full bg-black" />
            ) : (
              <a href={section.videoUrl} target="_blank" rel="noreferrer" className="flex aspect-video items-center justify-center gap-3 text-white"><PlayCircle className="h-10 w-10" />{tr('video.open', 'Open video')}</a>
            )}
          </div>
        )}
      </SectionShell>
    );
  }

  if (section.type === 'faq') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} tr={tr} />
        <div className="mx-auto mt-12 max-w-4xl space-y-4">
          {section.cards.map((card) => (
            <details key={card.id} className={`${dark ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white'} rounded-2xl border p-6 shadow-sm`}>
              <summary className="cursor-pointer text-base font-bold sm:text-lg">{tr(`card.${card.id}.question`, card.question || card.title)}</summary>
              <p className={`mt-3 whitespace-pre-line text-sm leading-6 ${dark ? 'text-white/75' : 'text-slate-600'}`}>{tr(`card.${card.id}.answer`, card.answer || card.text)}</p>
            </details>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'contact') {
    const contacts = [
      organization.address || site.footer.address ? { icon: 'MapPin', label: tr('contact.addressLabel', 'Address'), value: site.footer.address || organization.address || '' } : null,
      organization.phone || site.footer.phone ? { icon: 'Phone', label: tr('contact.phoneLabel', 'Phone'), value: site.footer.phone || organization.phone || '' } : null,
      organization.email || site.footer.email ? { icon: 'Mail', label: tr('contact.emailLabel', 'Email'), value: site.footer.email || organization.email || '' } : null,
    ].filter(Boolean) as Array<{ icon: string; label: string; value: string }>;
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <div className={`grid items-start gap-12 lg:gap-20 ${site.settings?.contactFormEnabled ? 'lg:grid-cols-2' : ''}`}>
          <div>
            <SectionHeading section={section} dark={dark} tr={tr} />
            <div className="mt-8 grid gap-4">
              {contacts.map((item) => (
                <div key={item.label} className={`${dark ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white'} flex items-start gap-4 rounded-2xl border p-5 shadow-sm sm:p-6`}>
                  <div className={dark ? 'text-white' : ''} style={dark ? undefined : { color: primary }}><Icon name={item.icon} /></div>
                  <div><p className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-white/60' : 'text-slate-400'}`}>{item.label}</p><p className="mt-1 font-medium">{item.value}</p></div>
                </div>
              ))}
            </div>
          </div>
          {site.settings?.contactFormEnabled && <ContactForm primary={primary} sourcePage={pageSlug || '/'} preview={preview} sessionId={sessionId} tr={tr} />}
        </div>
      </SectionShell>
    );
  }

  return null;
}

export function WebsiteRenderer({ site, organization, pageSlug = '', preview = false, sessionId, onTrack }: {
  site: WebsiteSiteDocument;
  organization: WebsiteOrganization;
  pageSlug?: string;
  preview?: boolean;
  sessionId?: string;
  onTrack?: (event: 'cta', page: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const enabledLanguages = (site.languages || []).filter((item) => item.enabled);
  const [language, setLanguage] = useState(site.defaultLanguage || enabledLanguages[0]?.code || 'en');
  const currentLanguage = enabledLanguages.find((item) => item.code === language) || enabledLanguages[0] || { code: 'en', label: 'English', direction: 'ltr' as const };
  const translations = site.translations?.[currentLanguage.code] || {};
  const tr: Translate = (key, fallback) => translations[key] || fallback;

  const normalizedSlug = pageSlug.replace(/^\/+|\/+$/g, '').toLowerCase();
  const page = useMemo(
    () => site.pages.find((item) => item.slug.toLowerCase() === normalizedSlug) || (normalizedSlug ? undefined : site.pages.find((item) => item.slug === '') || site.pages[0]),
    [site.pages, normalizedSlug],
  );
  const primary = site.theme.primaryColor || organization.branding?.themeColor || '#0d9488';
  const secondary = site.theme.secondaryColor || '#0f172a';
  const buttonRadius = site.theme.buttonStyle === 'pill' ? '999px' : site.theme.buttonStyle === 'square' ? '4px' : '12px';
  const css = { fontFamily: site.theme.fontFamily || undefined, '--website-primary': primary } as CSSProperties;
  const logo = site.header.logoUrl || organization.branding?.logo || '';
  const displayName = site.header.displayName || organization.name;

  return (
    <div dir={currentLanguage.direction} lang={currentLanguage.code} style={css} className={`min-h-screen overflow-x-clip bg-white text-slate-900 [overflow-wrap:anywhere] antialiased`}>
      <header className={`${site.header.sticky && !preview ? 'sticky top-0 z-40' : ''} border-b border-slate-200/60 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur-xl`}>
        <div className="mx-auto flex min-h-[76px] max-w-[1320px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3">
            {logo ? <img src={logo} alt={displayName} className="h-12 w-12 rounded-2xl object-contain" /> : <div style={{ backgroundColor: primary }} className="flex h-11 w-11 items-center justify-center rounded-xl text-white"><GraduationCap className="h-6 w-6" /></div>}
            {site.header.showOrganizationName && <span className="max-w-[190px] truncate text-base font-extrabold tracking-tight sm:max-w-[280px] sm:text-lg">{displayName}</span>}
          </a>
          <nav className="hidden items-center gap-1.5 lg:flex">
            {site.header.navItems.filter((item) => item.visible).map((item) => <a key={item.id} href={item.href} className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100/80 hover:text-slate-950">{tr(`link.${item.id}.label`, item.label)}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            {enabledLanguages.length > 1 && (
              <select aria-label="Website language" value={currentLanguage.code} onChange={(e) => setLanguage(e.target.value)} className="hidden rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold sm:block">
                {enabledLanguages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            )}
            {site.header.ctaText && <a onClick={() => onTrack?.('cta', pageSlug || '/')} href={site.header.ctaUrl || '/auth/login'} style={{ backgroundColor: primary, borderRadius: buttonRadius }} className="hidden px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:opacity-95 sm:inline-flex">{tr('header.ctaText', site.header.ctaText)}</a>}
            <button type="button" onClick={() => setMobileOpen((value) => !value)} className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm lg:hidden" aria-label="Toggle navigation">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {mobileOpen && <nav className="border-t border-slate-100 px-4 py-3 lg:hidden">
          {enabledLanguages.length > 1 && <select value={currentLanguage.code} onChange={(e) => setLanguage(e.target.value)} className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold">{enabledLanguages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select>}
          {site.header.navItems.filter((item) => item.visible).map((item) => <a key={item.id} href={item.href} onClick={() => setMobileOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">{tr(`link.${item.id}.label`, item.label)}</a>)}
          {site.header.ctaText && <a onClick={() => onTrack?.('cta', pageSlug || '/')} href={site.header.ctaUrl || '/auth/login'} style={{ backgroundColor: primary, borderRadius: buttonRadius }} className="mt-2 flex justify-center px-4 py-2.5 text-sm font-semibold text-white sm:hidden">{tr('header.ctaText', site.header.ctaText)}</a>}
        </nav>}
      </header>

      <main>
        {page ? page.sections.filter((section) => section.visible).map((section) => <WebsiteSectionView key={section.id} section={section} site={site} organization={organization} tr={tr} pageSlug={pageSlug} preview={preview} sessionId={sessionId} onTrack={onTrack} />) : (
          <section className="flex min-h-[55vh] items-center justify-center px-6 text-center">
            <div><p className="text-sm font-semibold uppercase tracking-wider text-slate-400">404</p><h1 className="mt-2 text-3xl font-bold">{tr('notFound.title', 'Page not found')}</h1><a href="/" style={{ color: primary }} className="mt-4 inline-block font-semibold">{tr('notFound.home', 'Return home')}</a></div>
          </section>
        )}
      </main>

      <footer style={{ backgroundColor: secondary }} className="px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-[1320px] gap-12 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              {logo && <img loading="lazy" src={logo} alt="" className="h-12 w-12 rounded-2xl bg-white object-contain p-1" />}
              <p className="text-xl font-extrabold tracking-tight">{displayName}</p>
            </div>
            {site.footer.description && <p className="mt-5 max-w-xl whitespace-pre-line text-sm leading-7 text-white/65">{tr('footer.description', site.footer.description)}</p>}
          </div>
          <div>
            <p className="text-sm font-semibold">{tr('footer.quickLinksTitle', 'Quick Links')}</p>
            <div className="mt-4 space-y-2">{site.footer.quickLinks.filter((item) => item.visible).map((item) => <a key={item.id} href={item.href} className="block text-sm text-white/70 hover:text-white">{tr(`link.${item.id}.label`, item.label)}</a>)}</div>
          </div>
          <div>
            <p className="text-sm font-semibold">{tr('footer.contactTitle', 'Contact')}</p>
            <div className="mt-4 space-y-2 text-sm text-white/70">{site.footer.address && <p>{site.footer.address}</p>}{site.footer.phone && <p>{site.footer.phone}</p>}{site.footer.email && <p>{site.footer.email}</p>}</div>
            {site.footer.socials.some((item) => item.visible) && <div className="mt-4 flex flex-wrap gap-2">{site.footer.socials.filter((item) => item.visible).map((item) => <a key={item.id} href={item.href} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/75 hover:bg-white/10">{tr(`link.${item.id}.label`, item.label)}</a>)}</div>}
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-[1320px] border-t border-white/10 pt-7 text-xs text-white/50">{tr('footer.copyright', site.footer.copyright)}</div>
      </footer>
    </div>
  );
}

export default WebsiteRenderer;
