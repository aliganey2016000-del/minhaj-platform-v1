import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowRight, Award, BookOpen, Briefcase, Building2, CalendarDays, Camera,
  CheckCircle2, Dumbbell, FlaskConical, Globe2, GraduationCap, Heart, Loader2, Mail, MapPin, Menu,
  Palette, Phone, PlayCircle, Quote, School, Send, ShieldCheck, Sparkles, Star, Trophy, Users, X,
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
  Award, BookOpen, Briefcase, Building2, CalendarDays, Camera, CheckCircle2, Dumbbell,
  FlaskConical, Globe2, GraduationCap, Heart, Mail, MapPin, Palette, Phone, PlayCircle,
  Quote, School, ShieldCheck, Sparkles, Star, Trophy, Users,
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

const SCHOOL_ACCENTS = ['#2563eb', '#0d9488', '#f59e0b', '#7c3aed', '#ec4899', '#16a34a'];

function SectionShell({ section, primary, secondary, children }: {
  section: WebsiteSection;
  primary: string;
  secondary: string;
  children: ReactNode;
}) {
  const typeBackground =
    section.type === 'hero'
      ? `radial-gradient(circle at 10% 15%, ${primary}1f 0, transparent 28%), radial-gradient(circle at 88% 12%, #fbbf2438 0, transparent 24%), radial-gradient(circle at 82% 88%, #22c55e20 0, transparent 25%), linear-gradient(135deg, #ffffff 0%, #f7fbff 52%, #ecfeff 100%)`
      : section.type === 'testimonials' ? 'linear-gradient(135deg, #f8f7ff 0%, #fff7ed 100%)'
      : section.type === 'gallery' ? 'linear-gradient(135deg, #ecfeff 0%, #f0fdf4 100%)'
      : section.type === 'news' ? 'linear-gradient(135deg, #fffaf0 0%, #ffffff 100%)'
      : null;
  const background =
    section.background === 'primary' ? primary
      : section.background === 'dark' ? secondary
      : section.background === 'muted' ? (typeBackground || '#f6f8fb')
      : (typeBackground || '#ffffff');
  const dark = section.background === 'primary' || section.background === 'dark';
  return (
    <section
      id={section.id}
      style={{ background, color: dark ? '#ffffff' : '#0f172a' }}
      className={`relative scroll-mt-24 overflow-hidden px-4 py-16 sm:px-6 sm:py-20 lg:px-8 ${section.type === 'hero' ? 'lg:py-16' : 'lg:py-24'}`}
    >
      {section.type === 'hero' && <>
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-24 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl" />
      </>}
      <div className="relative mx-auto max-w-[1320px]">{children}</div>
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
  const dark = section.background === 'primary' || section.background === 'dark';
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
        <div className={`${section.imageUrl ? 'grid lg:grid-cols-[.92fr_1.08fr]' : 'block'} min-h-[520px] items-center gap-10 py-3 sm:py-6 lg:min-h-[590px] lg:gap-14`}>
          <div className={section.alignment === 'center' ? 'mx-auto max-w-4xl text-center' : section.imageUrl ? 'max-w-2xl' : 'mx-auto max-w-5xl text-center'}>
            {subtitle && <p style={{ color: primary }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white bg-white/90 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] shadow-sm sm:text-sm"><Sparkles className="h-4 w-4" />{subtitle}</p>}
            <h1 className="text-4xl font-black leading-[1.02] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-[4.6rem]">{title}</h1>
            {body && <p className={`mt-6 max-w-2xl whitespace-pre-line text-base leading-8 text-slate-600 sm:text-lg sm:leading-9 ${section.alignment === 'center' || !section.imageUrl ? 'mx-auto' : ''}`}>{body}</p>}
            <div className={`mt-8 flex flex-wrap gap-3 ${section.alignment === 'center' || !section.imageUrl ? 'justify-center' : ''}`}>
              {buttonText && (
                <a onClick={() => onTrack?.('cta', pageSlug || '/')} href={section.buttonUrl || '#'} style={{ backgroundColor: primary, borderRadius: buttonRadius }} className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-extrabold text-white shadow-xl transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl">
                  {buttonText}<ArrowRight className="h-4 w-4" />
                </a>
              )}
              {site.header.ctaText && (
                <a href={site.header.ctaUrl || '/auth/login'} style={{ borderRadius: buttonRadius }} className="inline-flex items-center gap-2 border border-slate-200 bg-white px-6 py-3.5 text-sm font-extrabold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <School className="h-4 w-4" />{tr('header.ctaText', site.header.ctaText)}
                </a>
              )}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-500 sm:text-sm">
              <span className="inline-flex items-center gap-2"><ShieldCheck style={{ color: primary }} className="h-4 w-4" />Safe & supportive</span>
              <span className="inline-flex items-center gap-2"><Heart className="h-4 w-4 text-rose-500" />Student centred</span>
              <span className="inline-flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" />Future focused</span>
            </div>
          </div>
          {section.imageUrl ? (
            <div className="relative">
              <div className="absolute -inset-3 -z-10 rounded-[2.6rem] bg-gradient-to-br from-sky-200 via-amber-100 to-emerald-200 blur-sm" />
              <div className="overflow-hidden rounded-[2.4rem] border-8 border-white bg-white shadow-[0_30px_80px_-34px_rgba(15,23,42,.45)]">
                <img src={section.imageUrl} alt={title} fetchPriority="high" className="aspect-[6/5] h-full w-full object-cover" />
              </div>
              <div className="absolute -bottom-5 left-4 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-xl backdrop-blur sm:left-8">
                <p className="text-xs font-extrabold uppercase tracking-[.16em] text-slate-400">Our school community</p>
                <p className="mt-1 text-sm font-black text-slate-900">Learn • Grow • Belong</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 lg:hidden">
              {['Academic Excellence', 'Student Wellbeing', 'Creative Learning', 'Strong Values'].map((label, index) => (
                <div key={label} className="rounded-2xl border border-white bg-white/80 p-4 text-center text-xs font-extrabold text-slate-700 shadow-sm">
                  <div style={{ backgroundColor: `${SCHOOL_ACCENTS[index]}18`, color: SCHOOL_ACCENTS[index] }} className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl"><Icon name={['BookOpen','Heart','Sparkles','Award'][index]} /></div>
                  {label}
                </div>
              ))}
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

  if (section.type === 'testimonials') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} tr={tr} />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {section.cards.map((card, index) => {
            const title = tr(`card.${card.id}.title`, card.title);
            const body = tr(`card.${card.id}.text`, card.text);
            const accent = SCHOOL_ACCENTS[index % SCHOOL_ACCENTS.length];
            return (
              <article key={card.id} className="relative overflow-hidden rounded-[1.75rem] border border-white bg-white p-6 shadow-[0_18px_50px_-30px_rgba(15,23,42,.35)] sm:p-7">
                <Quote style={{ color: accent }} className="absolute right-5 top-5 h-9 w-9 opacity-15" />
                <div className="flex items-center gap-3">
                  {card.imageUrl ? <img loading="lazy" src={card.imageUrl} alt={title} className="h-14 w-14 rounded-full object-cover" /> : <div style={{ backgroundColor: `${accent}18`, color: accent }} className="flex h-14 w-14 items-center justify-center rounded-full"><Users className="h-6 w-6" /></div>}
                  <div className="min-w-0"><h3 className="truncate font-extrabold text-slate-900">{title}</h3>{card.role && <p className="mt-0.5 truncate text-xs font-bold" style={{ color: accent }}>{tr(`card.${card.id}.role`, card.role)}</p>}</div>
                </div>
                <div className="mt-5 flex gap-1 text-amber-400">{[0,1,2,3,4].map((n) => <Star key={n} className="h-4 w-4 fill-current" />)}</div>
                {body && <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">{body}</p>}
              </article>
            );
          })}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'news') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} tr={tr} />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {section.cards.map((card, index) => {
            const title = tr(`card.${card.id}.title`, card.title);
            const body = tr(`card.${card.id}.text`, card.text);
            const accent = SCHOOL_ACCENTS[index % SCHOOL_ACCENTS.length];
            return (
              <a key={card.id} href={card.link || undefined} className="group overflow-hidden rounded-[1.75rem] border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                {card.imageUrl ? <img loading="lazy" src={card.imageUrl} alt={title} className="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <div style={{ background: `linear-gradient(135deg, ${accent}20, #ffffff)` }} className="flex aspect-[16/9] items-center justify-center"><CalendarDays style={{ color: accent }} className="h-11 w-11" /></div>}
                <div className="p-6">
                  {card.date && <p style={{ color: accent }} className="mb-2 text-xs font-extrabold uppercase tracking-[.15em]">{card.date}</p>}
                  <h3 className="text-xl font-extrabold tracking-tight text-slate-900">{title}</h3>
                  {body && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{body}</p>}
                  <span style={{ color: accent }} className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold">Read more <ArrowRight className="h-4 w-4" /></span>
                </div>
              </a>
            );
          })}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'partners') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} tr={tr} />
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {section.cards.map((card) => {
            const title = tr(`card.${card.id}.title`, card.title);
            return (
              <div key={card.id} className="flex min-h-32 items-center justify-center rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                {card.imageUrl ? <img loading="lazy" src={card.imageUrl} alt={title} className="max-h-16 max-w-full object-contain" /> : <div><Building2 className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-extrabold text-slate-700">{title}</p></div>}
              </div>
            );
          })}
        </div>
      </SectionShell>
    );
  }

  if (['services', 'programs', 'staff'].includes(section.type)) {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} tr={tr} />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {section.cards.map((card, index) => {
            const title = tr(`card.${card.id}.title`, card.title);
            const body = tr(`card.${card.id}.text`, card.text);
            const accent = SCHOOL_ACCENTS[index % SCHOOL_ACCENTS.length];
            return (
              <a key={card.id} onClick={() => card.link && onTrack?.('cta', pageSlug || '/')} href={card.link || undefined} className={`${cardClass} group block min-h-full overflow-hidden rounded-[1.75rem] text-slate-900 transition duration-200 hover:-translate-y-1 hover:shadow-xl`}>
                {card.imageUrl ? <img loading="lazy" src={card.imageUrl} alt={title} className={`w-full ${section.type === 'staff' ? 'aspect-[4/3] object-cover object-top' : 'aspect-[16/10] object-cover'}`} /> : <div style={{ background: `linear-gradient(135deg, ${accent}20, #ffffff)` }} className="flex h-28 items-center justify-center"><Icon name={card.icon || section.icon} className="h-9 w-9" /></div>}
                <div className="p-6">
                  <div style={{ backgroundColor: `${accent}16`, color: accent }} className="mb-4 inline-flex rounded-2xl p-3"><Icon name={card.icon || section.icon} className="h-5 w-5" /></div>
                  <h3 className="text-xl font-extrabold leading-snug tracking-tight">{title}</h3>
                  {card.role && <p style={{ color: accent }} className="mt-1 text-sm font-bold">{tr(`card.${card.id}.role`, card.role)}</p>}
                  {body && <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-600">{body}</p>}
                  {card.link && <span style={{ color: accent }} className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold">Learn more <ArrowRight className="h-4 w-4" /></span>}
                </div>
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
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {section.cards.map((card, index) => {
            const accent = SCHOOL_ACCENTS[index % SCHOOL_ACCENTS.length];
            return (
              <div key={card.id} className={`${dark ? 'border-white/15 bg-white/10 text-white' : 'border-slate-100 bg-white'} rounded-[1.6rem] border p-5 text-center shadow-sm sm:p-7`}>
                <div style={{ backgroundColor: `${accent}16`, color: accent }} className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl"><Icon name={card.icon || ['Users','GraduationCap','BookOpen','Trophy'][index % 4]} /></div>
                <p className="text-3xl font-black tracking-tight sm:text-4xl">{card.value || tr(`card.${card.id}.title`, card.title)}</p>
                <p className={`mt-2 text-xs font-bold sm:text-sm ${dark ? 'text-white/70' : 'text-slate-500'}`}>{card.value ? tr(`card.${card.id}.title`, card.title) : tr(`card.${card.id}.text`, card.text)}</p>
              </div>
            );
          })}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'gallery') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} tr={tr} />
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {section.cards.filter((card) => card.imageUrl).map((card) => {
            const caption = tr(`card.${card.id}.title`, card.title) || tr(`card.${card.id}.text`, card.text);
            return (
              <figure key={card.id} className="group relative overflow-hidden rounded-[1.75rem] bg-slate-100 shadow-sm">
                <img loading="lazy" src={card.imageUrl} alt={caption} className="aspect-square h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                {caption && <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4 pt-12 text-sm font-extrabold text-white">{caption}</figcaption>}
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
      <header style={{ borderTopColor: primary }} className={`${site.header.sticky && !preview ? 'sticky top-0 z-40' : ''} border-t-4 border-b border-slate-200/60 bg-white/92 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur-xl`}>
        <div className="mx-auto flex min-h-[76px] max-w-[1320px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3">
            {logo ? <img src={logo} alt={displayName} className="h-12 w-12 rounded-2xl object-contain" /> : <div style={{ background: `linear-gradient(135deg, ${primary}, ${site.theme.accentColor || '#f59e0b'})` }} className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md"><School className="h-6 w-6" /></div>}
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

      <footer style={{ background: `linear-gradient(135deg, ${secondary} 0%, #071b35 100%)`, borderTopColor: site.theme.accentColor || '#f59e0b' }} className="border-t-4 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
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
