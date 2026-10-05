import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowRight, Award, BookOpen, Briefcase, Building2, CalendarDays, Camera, CheckCircle2, ChevronDown,
  Dumbbell, FlaskConical, Globe2, GraduationCap, Heart, Loader2, LogIn, Mail, MapPin, Menu,
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
  return <Component className={className} strokeWidth={1.9} />;
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

// Premium institutional palette inspired by the approved school-site reference.
// Tenant theme colours remain authoritative; these are supporting accents only.
const PALETTE = ['#33469b', '#00a66a', '#ffb71b', '#12377b', '#087b62', '#ffffff'];
const paletteAt = (index: number) => PALETTE[index % PALETTE.length];
// color-mix tolerates any CSS colour an admin types, unlike appending hex alpha digits.
const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

type Translate = (key: string, fallback: string) => string;

interface RenderContext {
  site: WebsiteSiteDocument;
  organization: WebsiteOrganization;
  tr: Translate;
  preview: boolean;
  sessionId?: string;
  pageSlug: string;
  onTrack?: (event: 'cta', page: string) => void;
  primary: string;
  secondary: string;
  accent: string;
  radius: string;
  displayName: string;
  logo: string;
}

const text = (ctx: RenderContext, section: WebsiteSection, field: 'title' | 'subtitle' | 'body' | 'buttonText') =>
  ctx.tr(`section.${section.id}.${field}`, section[field] || '');
const cardTitle = (ctx: RenderContext, card: WebsiteCard) => ctx.tr(`card.${card.id}.title`, card.title || '');
const cardText = (ctx: RenderContext, card: WebsiteCard) => ctx.tr(`card.${card.id}.text`, card.text || '');

function formatDate(value: string | undefined, locale: string) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Eyebrow({ label, color, dark }: { label: string; color: string; dark?: boolean }) {
  if (!label) return null;
  return (
    <p
      style={dark ? { borderColor: tint('#ffffff', 28), color: '#ffbf24' } : { borderColor: tint(color, 28), color }}
      className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[.2em] sm:text-[11px]"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {label}
    </p>
  );
}

function Heading({ ctx, section, dark, center, color, className = '' }: {
  ctx: RenderContext; section: WebsiteSection; dark?: boolean; center?: boolean; color?: string; className?: string;
}) {
  const centered = center ?? section.alignment === 'center';
  const title = text(ctx, section, 'title');
  const body = text(ctx, section, 'body');
  return (
    <div className={`${centered ? 'mx-auto text-center' : ''} max-w-3xl ${className}`}>
      <Eyebrow label={text(ctx, section, 'subtitle')} color={color || ctx.primary} dark={dark} />
      {title && <h2 className={`mt-5 text-3xl font-black leading-[1.06] tracking-[-.035em] sm:text-4xl lg:text-[2.9rem] ${dark ? 'text-white' : 'text-[#25388d]'}`}>{title}</h2>}
      {body && <p className={`mt-5 whitespace-pre-line text-sm leading-7 sm:text-base sm:leading-8 ${dark ? 'text-white/76' : 'text-slate-600'}`}>{body}</p>}
    </div>
  );
}

function PrimaryButton({ ctx, href, children, onClick, light }: { ctx: RenderContext; href: string; children: ReactNode; onClick?: () => void; light?: boolean }) {
  return (
    <a
      href={href}
      onClick={onClick}
      style={light ? { borderRadius: ctx.radius, color: ctx.secondary } : { backgroundColor: ctx.accent, borderRadius: ctx.radius }}
      className={`group inline-flex min-h-11 items-center justify-center gap-2 px-6 py-3 text-sm font-black transition duration-200 hover:-translate-y-0.5 ${light ? 'bg-white shadow-lg' : 'text-[#173b33] shadow-[0_10px_28px_-12px_rgba(0,0,0,.35)]'}`}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 rtl:rotate-180" />
    </a>
  );
}

function SecondaryButton({ ctx, href, children, dark }: { ctx: RenderContext; href: string; children: ReactNode; dark?: boolean }) {
  return (
    <a
      href={href}
      style={{ borderRadius: ctx.radius }}
      className={`inline-flex min-h-11 items-center justify-center gap-2 border px-6 py-3 text-sm font-extrabold transition duration-200 hover:-translate-y-0.5 ${dark ? 'border-white/30 bg-white/5 text-white hover:bg-white/10' : 'border-white/30 bg-transparent text-white hover:bg-white/10'}`}
    >
      {children}
    </a>
  );
}

function PreviewHint({ ctx, children }: { ctx: RenderContext; children: ReactNode }) {
  if (!ctx.preview) return null;
  return <p className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm font-semibold text-slate-500">{children}</p>;
}

function Shell({ section, ctx, children, className = '' }: { section: WebsiteSection; ctx: RenderContext; children: ReactNode; className?: string }) {
  const dark = section.background === 'primary' || section.background === 'dark';
  const background =
    section.background === 'primary'
      ? `linear-gradient(135deg, ${ctx.primary}, color-mix(in srgb, ${ctx.primary} 78%, #004d3b))`
      : section.background === 'dark'
        ? `linear-gradient(135deg, ${ctx.secondary}, color-mix(in srgb, ${ctx.secondary} 82%, #0d235f))`
        : section.background === 'muted'
          ? '#f6f7f9'
          : '#ffffff';
  return (
    <section id={section.id} style={{ background }} className={`relative scroll-mt-24 overflow-hidden px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28 ${className}`}>
      {dark && <>
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full border border-white/5" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full border border-white/5" />
      </>}
      <div className="relative mx-auto max-w-[1180px]">{children}</div>
    </section>
  );
}

function isDark(section: WebsiteSection) {
  return section.background === 'primary' || section.background === 'dark';
}

function HeroBlock({ ctx, section, badge }: { ctx: RenderContext; section: WebsiteSection; badge?: WebsiteCard }) {
  const title = text(ctx, section, 'title') || ctx.displayName;
  const body = text(ctx, section, 'body');
  const buttonText = text(ctx, section, 'buttonText');
  const centered = section.alignment === 'center' && !section.imageUrl;
  return (
    <section
      id={section.id}
      style={{ background: `linear-gradient(115deg, color-mix(in srgb, ${ctx.secondary} 84%, #39499b), #39499b 56%, color-mix(in srgb, ${ctx.primary} 28%, #39499b))` }}
      className="relative scroll-mt-24 overflow-hidden text-white"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
      <div aria-hidden="true" style={{ backgroundColor: tint(ctx.primary, 28) }} className="pointer-events-none absolute -right-36 -top-44 h-[520px] w-[520px] rounded-full blur-3xl" />
      <div className={`relative mx-auto grid max-w-[1180px] items-center gap-12 px-4 pb-24 pt-14 sm:px-6 sm:pb-28 sm:pt-20 lg:px-8 lg:pb-32 lg:pt-20 ${centered ? '' : 'lg:grid-cols-[1.02fr_.98fr]'}`}>
        <div className={centered ? 'mx-auto max-w-4xl text-center' : ''}>
          <Eyebrow label={text(ctx, section, 'subtitle')} color={ctx.accent} dark />
          <h1 className="mt-6 max-w-[680px] text-[2.8rem] font-black leading-[.97] tracking-[-.045em] text-white sm:text-6xl lg:text-[4.5rem]">
            {title}
          </h1>
          {body && <p className={`mt-6 max-w-xl whitespace-pre-line text-[15px] leading-7 text-white/82 sm:text-base sm:leading-8 ${centered ? 'mx-auto' : ''}`}>{body}</p>}
          {(buttonText || ctx.site.header.ctaText) && (
            <div className={`mt-8 flex flex-wrap gap-3 ${centered ? 'justify-center' : ''}`}>
              {buttonText && <PrimaryButton ctx={ctx} href={section.buttonUrl || '#about'} onClick={() => ctx.onTrack?.('cta', ctx.pageSlug || '/')}>{buttonText}</PrimaryButton>}
              {ctx.site.header.ctaText && <SecondaryButton ctx={ctx} dark href={ctx.site.header.ctaUrl || '/auth/login'}><LogIn className="h-4 w-4" />{ctx.tr('header.ctaText', ctx.site.header.ctaText)}</SecondaryButton>}
            </div>
          )}
          <div className={`mt-8 flex items-center gap-4 ${centered ? 'justify-center' : ''}`}>
            <div className="flex -space-x-2">
              {[ctx.accent, ctx.primary, '#4cc9f0', '#f472b6'].map((color) => <span key={color} style={{ backgroundColor: color }} className="h-7 w-7 rounded-full border-2 border-white/70" />)}
            </div>
            <div>
              <div className="text-[11px] tracking-[.16em] text-[#ffbf24]">★★★★★</div>
              <p className="text-[10px] font-semibold text-white/65">Learning · Community · Achievement</p>
            </div>
          </div>
        </div>

        {!centered && (
          <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
            <div className="relative overflow-hidden rounded-[24px] border border-white/20 bg-white/10 p-2 shadow-[0_30px_70px_-30px_rgba(0,0,0,.65)] backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between rounded-[17px] bg-white/10 px-4 py-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[.18em] text-[#ffbf24]">School in action</p>
                  <p className="mt-1 text-sm font-black text-white">{ctx.displayName}</p>
                </div>
                <div className="flex gap-1.5"><span className="h-2 w-2 rounded-full bg-[#ffbf24]" /><span className="h-2 w-2 rounded-full bg-[#2dd4bf]" /><span className="h-2 w-2 rounded-full bg-[#60a5fa]" /></div>
              </div>
              {section.imageUrl ? (
                <img src={section.imageUrl} alt={title} {...{ fetchpriority: 'high' }} className="aspect-[16/10] w-full rounded-[16px] object-cover" />
              ) : (
                <div style={{ background: `linear-gradient(145deg, ${tint(ctx.primary, 35)}, rgba(255,255,255,.12))` }} className="flex aspect-[16/10] w-full items-center justify-center rounded-[16px]">
                  <School className="h-24 w-24 text-white/70" />
                </div>
              )}
              <p className="px-4 pb-3 pt-4 text-xs leading-5 text-white/65">Discover academics, admissions, student life and school achievements from one trusted website.</p>
            </div>
            {badge && cardTitle(ctx, badge) && (
              <div className="absolute -bottom-5 left-5 flex items-center gap-3 rounded-xl border border-white/25 bg-[#34479a]/95 px-4 py-3 shadow-xl backdrop-blur sm:-left-5">
                <div style={{ backgroundColor: ctx.accent }} className="flex h-9 w-9 items-center justify-center rounded-lg text-[#173b33]"><Icon name={badge.icon || 'ShieldCheck'} /></div>
                <div className="max-w-[12rem]">
                  <p className="text-xs font-black leading-tight text-white">{cardTitle(ctx, badge)}</p>
                  {cardText(ctx, badge) && <p className="mt-0.5 line-clamp-1 text-[10px] text-white/60">{cardText(ctx, badge)}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function StatTile({ ctx, card, index, dark }: { ctx: RenderContext; card: WebsiteCard; index: number; dark?: boolean }) {
  const value = card.value || cardTitle(ctx, card);
  const label = card.value ? cardTitle(ctx, card) : cardText(ctx, card);
  return (
    <div className={`flex min-h-[112px] flex-col items-center justify-center border-white/15 px-4 py-5 text-center ${dark ? 'bg-white/[.045]' : 'bg-[#3c4fa4]'}`}>
      <Icon name={card.icon || ['Users', 'GraduationCap', 'BookOpen', 'Trophy'][index % 4]} className="h-5 w-5 text-white/75" />
      <p className="mt-2 whitespace-nowrap text-2xl font-black leading-none tracking-tight text-[#ffbf24] sm:text-3xl">{value}</p>
      {label && <p className="mt-2 text-[9px] font-black uppercase tracking-[.12em] text-white/65 sm:text-[10px]">{label}</p>}
    </div>
  );
}

function StatsBlock({ ctx, section, overlap }: { ctx: RenderContext; section: WebsiteSection; overlap?: boolean }) {
  const cards = section.cards.slice(0, 8);
  if (!cards.length) return null;
  const cols = cards.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  if (overlap) {
    return (
      <section id={section.id} className="relative z-10 -mt-12 scroll-mt-24 px-4 sm:px-6 lg:px-8">
        <div className={`mx-auto grid max-w-[1020px] grid-cols-2 overflow-hidden rounded-[18px] border border-white/15 bg-[#3c4fa4] shadow-[0_24px_50px_-30px_rgba(0,0,0,.55)] ${cols}`}>
          {cards.map((card, index) => <StatTile key={card.id} ctx={ctx} card={card} index={index} dark />)}
        </div>
      </section>
    );
  }
  const dark = isDark(section);
  return (
    <Shell section={section} ctx={ctx}>
      {(section.title || section.subtitle) && <Heading ctx={ctx} section={section} dark={dark} className="mb-12" />}
      <div className={`grid grid-cols-2 overflow-hidden rounded-[18px] border ${dark ? 'border-white/15' : 'border-slate-200'} ${cols}`}>
        {cards.map((card, index) => <StatTile key={card.id} ctx={ctx} card={card} index={index} dark={dark} />)}
      </div>
    </Shell>
  );
}

function CardsBlock({ ctx, section }: { ctx: RenderContext; section: WebsiteSection }) {
  const dark = isDark(section);
  const staff = section.type === 'staff';
  const cardSurface = ctx.site.theme.cardStyle === 'flat' ? 'bg-white' : ctx.site.theme.cardStyle === 'bordered' ? 'bg-white ring-1 ring-slate-200' : 'bg-white ring-1 ring-slate-200/70 shadow-[0_18px_45px_-30px_rgba(15,23,42,.35)]';
  return (
    <Shell section={section} ctx={ctx}>
      <Heading ctx={ctx} section={section} dark={dark} />
      {section.cards.length ? (
        <div className={`mt-14 grid gap-6 sm:grid-cols-2 ${staff ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {section.cards.map((card, index) => {
            const color = paletteAt(index);
            const title = cardTitle(ctx, card);
            const body = cardText(ctx, card);
            const inner = (
              <>
                {card.imageUrl ? (
                  <div className="overflow-hidden"><img loading="lazy" src={card.imageUrl} alt={title} className={`w-full object-cover transition duration-500 group-hover:scale-[1.04] ${staff ? 'aspect-square object-top' : 'aspect-[16/10]'}`} /></div>
                ) : staff ? (
                  <div style={{ background: `linear-gradient(135deg, ${tint(color, 22)}, ${tint(color, 6)})` }} className="flex aspect-square items-center justify-center"><Users style={{ color }} className="h-14 w-14" /></div>
                ) : null}
                <div className={`relative flex flex-1 flex-col p-7 ${staff ? 'text-center' : ''}`}>
                  {!card.imageUrl && !staff && (
                    <>
                      <div aria-hidden="true" style={{ backgroundColor: tint(color, 10) }} className="absolute -right-10 -top-10 h-32 w-32 rounded-full" />
                      <div style={{ backgroundColor: color, boxShadow: `0 14px 28px -14px ${color}` }} className="relative mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-white"><Icon name={card.icon || section.icon} className="h-6 w-6" /></div>
                    </>
                  )}
                  <h3 className="relative text-xl font-extrabold leading-snug tracking-tight text-slate-950">{title}</h3>
                  {card.role && <p style={{ color }} className="mt-1 text-sm font-bold">{ctx.tr(`card.${card.id}.role`, card.role)}</p>}
                  {body && <p className="relative mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-600">{body}</p>}
                  {card.link && <span style={{ color }} className="relative mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-extrabold">{ctx.tr('common.learnMore', 'Learn more')}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1 rtl:rotate-180" /></span>}
                </div>
                <span aria-hidden="true" style={{ backgroundColor: color }} className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 transition duration-300 group-hover:scale-x-100" />
              </>
            );
            const className = `${cardSurface} group relative flex flex-col overflow-hidden rounded-[2rem] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_30px_60px_-30px_rgba(15,23,42,.45)]`;
            return card.link
              ? <a key={card.id} href={card.link} onClick={() => ctx.onTrack?.('cta', ctx.pageSlug || '/')} className={className}>{inner}</a>
              : <article key={card.id} className={className}>{inner}</article>;
          })}
        </div>
      ) : <div className="mt-12"><PreviewHint ctx={ctx}>Add items to this section in Content.</PreviewHint></div>}
    </Shell>
  );
}

function AboutBlock({ ctx, section, values }: { ctx: RenderContext; section: WebsiteSection; values?: WebsiteCard[] }) {
  const dark = isDark(section);
  const title = text(ctx, section, 'title');
  const buttonText = text(ctx, section, 'buttonText');
  const points = values || [];
  const showVisual = section.type === 'about' || !!section.imageUrl;
  return (
    <Shell section={section} ctx={ctx}>
      <div className={`grid items-center gap-16 lg:gap-20 ${showVisual ? 'lg:grid-cols-2' : ''}`}>
        {showVisual && <div className="relative order-last mx-auto w-full max-w-xl lg:order-first lg:max-w-none">
          <div aria-hidden="true" style={{ backgroundColor: tint(ctx.accent, 30) }} className="absolute -bottom-5 -right-5 h-2/3 w-2/3 rounded-[2.5rem]" />
          <div aria-hidden="true" style={{ backgroundImage: `radial-gradient(${tint(ctx.primary, 35)} 1.5px, transparent 1.6px)`, backgroundSize: '18px 18px' }} className="absolute -left-6 -top-6 h-36 w-36" />
          {section.imageUrl ? (
            <img loading="lazy" src={section.imageUrl} alt={title} className="relative aspect-[4/3.4] w-full rounded-[2.5rem] object-cover shadow-[0_34px_80px_-40px_rgba(15,23,42,.55)]" />
          ) : (
            <div style={{ background: `linear-gradient(145deg, ${tint(ctx.primary, 22)}, ${tint(ctx.accent, 20)})` }} className="relative flex aspect-[4/3.4] w-full flex-col items-center justify-center gap-4 rounded-[2.5rem]">
              <div style={{ backgroundColor: ctx.primary }} className="flex h-24 w-24 items-center justify-center rounded-[2rem] text-white shadow-xl"><Building2 className="h-12 w-12" /></div>
              {ctx.preview && <p className="rounded-full bg-slate-900/80 px-3 py-1 text-[11px] font-semibold text-white">Add an image for this section in Content</p>}
            </div>
          )}
          <div className="absolute -bottom-7 left-6 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-slate-100">
            {ctx.logo ? <img src={ctx.logo} alt="" className="h-10 w-10 rounded-xl object-contain" /> : <div style={{ backgroundColor: ctx.primary }} className="flex h-10 w-10 items-center justify-center rounded-xl text-white"><School className="h-5 w-5" /></div>}
            <p className="max-w-[14rem] text-sm font-black leading-tight text-slate-900">{ctx.displayName}</p>
          </div>
        </div>}
        <div className={showVisual ? '' : section.alignment === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
          <Heading ctx={ctx} section={section} dark={dark} center={showVisual ? false : undefined} />
          {points.length > 0 && (
            <div className="mt-9 grid gap-4 sm:grid-cols-2">
              {points.map((card, index) => {
                const color = paletteAt(index + 1);
                return (
                  <div key={card.id} className={`flex items-start gap-3.5 rounded-2xl p-4 ${dark ? 'bg-white/10' : 'bg-white shadow-sm ring-1 ring-slate-100'}`}>
                    <div style={{ backgroundColor: tint(color, dark ? 35 : 14), color: dark ? '#fff' : color }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"><Icon name={card.icon || 'CheckCircle2'} /></div>
                    <div>
                      <p className={`font-extrabold ${dark ? 'text-white' : 'text-slate-900'}`}>{cardTitle(ctx, card)}</p>
                      {cardText(ctx, card) && <p className={`mt-1 text-sm leading-6 ${dark ? 'text-white/70' : 'text-slate-500'}`}>{cardText(ctx, card)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {buttonText && <div className="mt-9"><PrimaryButton ctx={ctx} href={section.buttonUrl || '#contact'} light={dark}>{buttonText}</PrimaryButton></div>}
        </div>
      </div>
    </Shell>
  );
}

function GalleryBlock({ ctx, section }: { ctx: RenderContext; section: WebsiteSection }) {
  const images = section.cards.filter((card) => card.imageUrl).slice(0, 9);
  if (!images.length && !ctx.preview) return null;
  return (
    <Shell section={section} ctx={ctx}>
      <Heading ctx={ctx} section={section} dark={isDark(section)} color={PALETTE[1]} />
      {images.length ? (
        <div className="mt-14 grid grid-cols-2 gap-3 sm:gap-4 lg:auto-rows-[220px] lg:grid-cols-4">
          {images.map((card, index) => {
            const caption = cardTitle(ctx, card) || cardText(ctx, card);
            const feature = index === 0 && images.length >= 3;
            return (
              <figure key={card.id} className={`group relative overflow-hidden rounded-[1.75rem] bg-slate-100 ${feature ? 'col-span-2 lg:row-span-2' : ''}`}>
                <img loading="lazy" src={card.imageUrl} alt={caption} className={`h-full w-full object-cover transition duration-700 group-hover:scale-105 ${feature ? 'aspect-[16/10] lg:aspect-auto' : 'aspect-square lg:aspect-auto'}`} />
                {caption && <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-4 pt-14 text-sm font-extrabold text-white">{caption}</figcaption>}
              </figure>
            );
          })}
        </div>
      ) : <div className="mt-12"><PreviewHint ctx={ctx}>Gallery is hidden on the live site until you add photos in Content.</PreviewHint></div>}
    </Shell>
  );
}

function NewsBlock({ ctx, section }: { ctx: RenderContext; section: WebsiteSection; }) {
  if (!section.cards.length && !ctx.preview) return null;
  const locale = ctx.site.defaultLanguage || 'en';
  return (
    <Shell section={section} ctx={ctx}>
      <Heading ctx={ctx} section={section} dark={isDark(section)} color={PALETTE[2]} />
      {section.cards.length ? (
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {section.cards.map((card, index) => {
            const color = paletteAt(index);
            const title = cardTitle(ctx, card);
            const body = cardText(ctx, card);
            const inner = (
              <>
                <div className="relative overflow-hidden">
                  {card.imageUrl
                    ? <img loading="lazy" src={card.imageUrl} alt={title} className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                    : <div style={{ background: `linear-gradient(135deg, ${tint(color, 25)}, ${tint(color, 8)})` }} className="flex aspect-[16/10] items-center justify-center"><CalendarDays style={{ color }} className="h-12 w-12" /></div>}
                  {card.date && <span style={{ backgroundColor: color }} className="absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-extrabold text-white shadow-lg">{formatDate(card.date, locale)}</span>}
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="text-lg font-extrabold leading-snug tracking-tight text-slate-950">{title}</h3>
                  {body && <p className="mt-2.5 line-clamp-3 text-sm leading-6 text-slate-600">{body}</p>}
                  {card.link && <span style={{ color }} className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-extrabold">{ctx.tr('common.readMore', 'Read more')}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></span>}
                </div>
              </>
            );
            const className = 'group flex flex-col overflow-hidden rounded-[2rem] bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,.35)] ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-1.5 hover:shadow-xl';
            return card.link ? <a key={card.id} href={card.link} className={className}>{inner}</a> : <article key={card.id} className={className}>{inner}</article>;
          })}
        </div>
      ) : <div className="mt-12"><PreviewHint ctx={ctx}>News & Events is hidden on the live site until you add items in Content.</PreviewHint></div>}
    </Shell>
  );
}

function TestimonialsBlock({ ctx, section }: { ctx: RenderContext; section: WebsiteSection }) {
  if (!section.cards.length && !ctx.preview) return null;
  return (
    <Shell section={section} ctx={ctx}>
      <Heading ctx={ctx} section={section} dark={isDark(section)} color={PALETTE[3]} />
      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {section.cards.map((card, index) => {
          const color = paletteAt(index + 3);
          const name = cardTitle(ctx, card);
          return (
            <figure key={card.id} className="relative flex flex-col rounded-[2rem] bg-white p-7 shadow-[0_18px_45px_-30px_rgba(15,23,42,.35)] ring-1 ring-slate-200/70">
              <div style={{ backgroundColor: color }} className="absolute -top-5 left-7 flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg"><Quote className="h-5 w-5" /></div>
              <div className="mt-3 flex gap-1 text-amber-400">{[0, 1, 2, 3, 4].map((n) => <Star key={n} className="h-4 w-4 fill-current" />)}</div>
              {cardText(ctx, card) && <blockquote className="mt-4 flex-1 whitespace-pre-line text-[15px] leading-7 text-slate-700">“{cardText(ctx, card)}”</blockquote>}
              <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
                {card.imageUrl
                  ? <img loading="lazy" src={card.imageUrl} alt={name} className="h-12 w-12 rounded-full object-cover" />
                  : <div style={{ backgroundColor: tint(color, 15), color }} className="flex h-12 w-12 items-center justify-center rounded-full text-base font-black">{(name || '?').trim().charAt(0).toUpperCase()}</div>}
                <div className="min-w-0"><p className="truncate font-extrabold text-slate-900">{name}</p>{card.role && <p style={{ color }} className="truncate text-xs font-bold">{ctx.tr(`card.${card.id}.role`, card.role)}</p>}</div>
              </figcaption>
            </figure>
          );
        })}
      </div>
      {!section.cards.length && <div className="mt-6"><PreviewHint ctx={ctx}>Add testimonials in Content to show this section.</PreviewHint></div>}
    </Shell>
  );
}

function PartnersBlock({ ctx, section }: { ctx: RenderContext; section: WebsiteSection }) {
  if (!section.cards.length && !ctx.preview) return null;
  return (
    <Shell section={section} ctx={ctx}>
      <Heading ctx={ctx} section={section} dark={isDark(section)} />
      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {section.cards.map((card) => {
          const title = cardTitle(ctx, card);
          const content = card.imageUrl
            ? <img loading="lazy" src={card.imageUrl} alt={title} className="max-h-14 max-w-full object-contain opacity-80 grayscale transition group-hover:opacity-100 group-hover:grayscale-0" />
            : <p className="text-sm font-extrabold text-slate-700">{title}</p>;
          const className = 'group flex min-h-28 items-center justify-center rounded-2xl bg-white p-5 text-center ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-lg';
          return card.link ? <a key={card.id} href={card.link} target="_blank" rel="noreferrer" className={className}>{content}</a> : <div key={card.id} className={className}>{content}</div>;
        })}
      </div>
    </Shell>
  );
}

function VideoBlock({ ctx, section }: { ctx: RenderContext; section: WebsiteSection }) {
  if (!section.videoUrl && !ctx.preview) return null;
  const embed = youtubeEmbed(section.videoUrl);
  const isFileVideo = /\.(mp4|webm)(\?.*)?$/i.test(section.videoUrl || '') || section.videoUrl.includes('/website-management/public/media/');
  return (
    <Shell section={section} ctx={ctx}>
      <Heading ctx={ctx} section={section} dark={isDark(section)} />
      {section.videoUrl ? (
        <div className="relative mx-auto mt-14 max-w-5xl">
          <div aria-hidden="true" style={{ background: `linear-gradient(135deg, ${ctx.primary}, ${ctx.accent})` }} className="absolute -inset-3 rounded-[2.5rem] opacity-80 blur-xl" />
          <div className="relative overflow-hidden rounded-[2rem] bg-black shadow-2xl ring-4 ring-white">
            {embed ? (
              <iframe loading="lazy" src={embed} title={text(ctx, section, 'title') || 'Video'} className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            ) : isFileVideo ? (
              <video preload="metadata" src={section.videoUrl} controls className="aspect-video w-full bg-black" />
            ) : (
              <a href={section.videoUrl} target="_blank" rel="noreferrer" className="flex aspect-video items-center justify-center gap-3 font-bold text-white"><PlayCircle className="h-12 w-12" />{ctx.tr('video.open', 'Open video')}</a>
            )}
          </div>
        </div>
      ) : <div className="mt-12"><PreviewHint ctx={ctx}>Add a YouTube, Vimeo or uploaded video URL in Content.</PreviewHint></div>}
    </Shell>
  );
}

function FaqBlock({ ctx, section }: { ctx: RenderContext; section: WebsiteSection }) {
  if (!section.cards.length && !ctx.preview) return null;
  const dark = isDark(section);
  return (
    <Shell section={section} ctx={ctx}>
      <Heading ctx={ctx} section={section} dark={dark} />
      <div className="mx-auto mt-12 max-w-3xl space-y-3">
        {section.cards.map((card, index) => (
          <details key={card.id} className={`group rounded-2xl p-5 transition open:shadow-lg sm:p-6 ${dark ? 'bg-white/10 ring-1 ring-white/15' : 'bg-white ring-1 ring-slate-200/80'}`}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-extrabold sm:text-lg [&::-webkit-details-marker]:hidden">
              {ctx.tr(`card.${card.id}.question`, card.question || card.title)}
              <span style={{ backgroundColor: tint(paletteAt(index), 15), color: dark ? '#fff' : paletteAt(index) }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition group-open:rotate-180"><ChevronDown className="h-4 w-4" /></span>
            </summary>
            <p className={`mt-3 whitespace-pre-line text-[15px] leading-7 ${dark ? 'text-white/75' : 'text-slate-600'}`}>{ctx.tr(`card.${card.id}.answer`, card.answer || card.text)}</p>
          </details>
        ))}
      </div>
    </Shell>
  );
}

function ContactForm({ ctx }: { ctx: RenderContext }) {
  const { tr, preview } = ctx;
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '', website: '' });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (preview) return;
    setSending(true);
    setNotice(null);
    try {
      await api.post('/website-management/public/contact', { ...form, sourcePage: ctx.pageSlug || '/', sessionId: ctx.sessionId });
      setForm({ name: '', email: '', phone: '', subject: '', message: '', website: '' });
      setNotice({ ok: true, text: tr('contact.success', 'Thank you. Your message has been sent.') });
    } catch (err: any) {
      setNotice({ ok: false, text: err.response?.data?.message || tr('contact.error', 'Unable to send your message. Please try again.') });
    } finally {
      setSending(false);
    }
  };

  const input = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100';
  return (
    <form onSubmit={submit} className="rounded-[2rem] bg-white p-6 text-slate-900 shadow-[0_40px_80px_-40px_rgba(0,0,0,.6)] sm:p-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={input} required value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder={tr('contact.name', 'Your name')} />
        <input className={input} type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} placeholder={tr('contact.email', 'Email address')} />
        <input className={input} value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} placeholder={tr('contact.phone', 'Phone number')} />
        <input className={input} value={form.subject} onChange={(e) => setForm((v) => ({ ...v, subject: e.target.value }))} placeholder={tr('contact.subject', 'Subject')} />
        <textarea className={`${input} sm:col-span-2`} rows={5} required value={form.message} onChange={(e) => setForm((v) => ({ ...v, message: e.target.value }))} placeholder={tr('contact.message', 'How can we help?')} />
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={(e) => setForm((v) => ({ ...v, website: e.target.value }))} />
      </div>
      {notice && <p className={`mt-3 text-sm font-semibold ${notice.ok ? 'text-emerald-700' : 'text-red-600'}`}>{notice.text}</p>}
      <button disabled={sending || preview} type="submit" style={{ backgroundColor: ctx.primary, borderRadius: ctx.radius }} className="mt-5 inline-flex w-full items-center justify-center gap-2 px-4 py-4 text-sm font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}
        {preview ? tr('contact.preview', 'Contact form preview') : tr('contact.send', 'Send Message')}
      </button>
    </form>
  );
}

function ContactBlock({ ctx, section }: { ctx: RenderContext; section: WebsiteSection }) {
  const dark = isDark(section);
  const { site, organization, tr } = ctx;
  const address = site.footer.address || organization.address || '';
  const phone = site.footer.phone || organization.phone || '';
  const email = site.footer.email || organization.email || '';
  const items = [
    address && { icon: MapPin, label: tr('contact.addressLabel', 'Address'), value: address, href: `https://maps.google.com/?q=${encodeURIComponent(address)}` },
    phone && { icon: Phone, label: tr('contact.phoneLabel', 'Phone'), value: phone, href: `tel:${phone.replace(/\s+/g, '')}` },
    email && { icon: Mail, label: tr('contact.emailLabel', 'Email'), value: email, href: `mailto:${email}` },
  ].filter(Boolean) as Array<{ icon: LucideIcon; label: string; value: string; href: string }>;
  const showForm = site.settings?.contactFormEnabled !== false;
  return (
    <Shell section={section} ctx={ctx}>
      <div className={`grid items-start gap-12 lg:gap-16 ${showForm ? 'lg:grid-cols-[.9fr_1.1fr]' : ''}`}>
        <div>
          <Heading ctx={ctx} section={section} dark={dark} center={false} />
          {items.length > 0 && (
            <div className="mt-10 grid gap-4">
              {items.map((item, index) => (
                <a key={item.label} href={item.href} target={item.icon === MapPin ? '_blank' : undefined} rel="noreferrer" className={`group flex items-center gap-4 rounded-2xl p-4 transition sm:p-5 ${dark ? 'bg-white/10 ring-1 ring-white/10 hover:bg-white/15' : 'bg-white ring-1 ring-slate-200 hover:shadow-md'}`}>
                  <div style={{ backgroundColor: paletteAt(index + 2) }} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"><item.icon className="h-5 w-5" /></div>
                  <div className="min-w-0"><p className={`text-xs font-bold uppercase tracking-wider ${dark ? 'text-white/55' : 'text-slate-400'}`}>{item.label}</p><p className={`mt-0.5 font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>{item.value}</p></div>
                </a>
              ))}
            </div>
          )}
          {!items.length && <div className="mt-8"><PreviewHint ctx={ctx}>Add an address, phone or email in Header & Footer.</PreviewHint></div>}
        </div>
        {showForm && <ContactForm ctx={ctx} />}
      </div>
    </Shell>
  );
}

function SectionView({ ctx, section, values }: { ctx: RenderContext; section: WebsiteSection; values?: WebsiteCard[] }) {
  switch (section.type) {
    case 'hero': return <HeroBlock ctx={ctx} section={section} />;
    case 'about':
    case 'custom': return <AboutBlock ctx={ctx} section={section} values={values} />;
    case 'services':
    case 'programs':
    case 'staff': return <CardsBlock ctx={ctx} section={section} />;
    case 'stats': return <StatsBlock ctx={ctx} section={section} />;
    case 'gallery': return <GalleryBlock ctx={ctx} section={section} />;
    case 'news': return <NewsBlock ctx={ctx} section={section} />;
    case 'testimonials': return <TestimonialsBlock ctx={ctx} section={section} />;
    case 'partners': return <PartnersBlock ctx={ctx} section={section} />;
    case 'video': return <VideoBlock ctx={ctx} section={section} />;
    case 'faq': return <FaqBlock ctx={ctx} section={section} />;
    case 'contact': return <ContactBlock ctx={ctx} section={section} />;
    default: return null;
  }
}

/**
 * The home page keeps the admin's section order, with two school-specific touches:
 * the stats directly under the hero overlap it, and the "values" cards (the starter's
 * `values` services section) are shown as the About section's highlights instead of a
 * separate card grid.
 */
function SchoolHome({ ctx, page }: { ctx: RenderContext; page: WebsitePage }) {
  const sections = page.sections.filter((section) => section.visible);
  const about = sections.find((section) => section.type === 'about');
  const values = about ? sections.find((section) => section.id === 'values' && section.type === 'services') : undefined;
  const heroIndex = sections.findIndex((section) => section.type === 'hero');
  const overlapStats = heroIndex >= 0 && sections[heroIndex + 1]?.type === 'stats' ? sections[heroIndex + 1] : undefined;
  return (
    <>
      {sections.map((section) => {
        if (section === values) return null;
        if (section === overlapStats) return <StatsBlock key={section.id} ctx={ctx} section={section} overlap />;
        if (section.type === 'hero') return <HeroBlock key={section.id} ctx={ctx} section={section} badge={values?.cards[0]} />;
        if (section === about) return <AboutBlock key={section.id} ctx={ctx} section={section} values={values?.cards} />;
        return <SectionView key={section.id} ctx={ctx} section={section} />;
      })}
    </>
  );
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
  const accent = site.theme.accentColor || '#f59e0b';
  const radius = site.theme.buttonStyle === 'pill' ? '999px' : site.theme.buttonStyle === 'square' ? '6px' : '14px';
  const logo = site.header.logoUrl || organization.branding?.logo || '';
  const displayName = site.header.displayName || organization.name;
  const ctx: RenderContext = { site, organization, tr, preview, sessionId, pageSlug, onTrack, primary, secondary, accent, radius, displayName, logo };

  const navItems = site.header.navItems.filter((item) => item.visible);
  const phone = site.footer.phone || organization.phone || '';
  const email = site.footer.email || organization.email || '';
  const address = site.footer.address || organization.address || '';
  const languagePicker = (className: string) => enabledLanguages.length > 1 && (
    <select aria-label="Website language" value={currentLanguage.code} onChange={(e) => setLanguage(e.target.value)} className={className}>
      {enabledLanguages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
    </select>
  );
  const brandMark = (size: string) => logo
    ? <img src={logo} alt={displayName} className={`${size} shrink-0 rounded-2xl bg-white object-contain`} />
    : <div style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }} className={`${size} flex shrink-0 items-center justify-center rounded-2xl text-white shadow-md`}><GraduationCap className="h-6 w-6" /></div>;

  return (
    <div dir={currentLanguage.direction} lang={currentLanguage.code} style={{ fontFamily: site.theme.fontFamily || undefined, '--website-primary': primary } as CSSProperties} className="min-h-screen overflow-x-clip bg-white text-slate-900 antialiased [overflow-wrap:anywhere]">
      <header className={`${site.header.sticky && !preview ? 'sticky top-0' : 'relative'} z-40 bg-[#004f43] text-white shadow-sm [overflow-wrap:normal]`}>
        <div className="mx-auto flex h-[74px] max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3">
            {brandMark('h-11 w-11')}
            {site.header.showOrganizationName && (
              <span className="line-clamp-2 max-w-[250px] text-[15px] font-black uppercase leading-tight tracking-[.045em] text-white sm:max-w-[330px] sm:text-[16px]">{displayName}</span>
            )}
          </a>
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => <a key={item.id} href={item.href} className="whitespace-nowrap rounded-full px-3.5 py-2 text-[12px] font-bold text-white/78 transition hover:bg-white/10 hover:text-white">{tr(`link.${item.id}.label`, item.label)}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            {languagePicker('hidden rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white sm:block')}
            <a href="/auth/login" className="hidden rounded-full border border-white/25 px-4 py-2 text-xs font-black text-white transition hover:bg-white/10 sm:inline-flex">Sign in</a>
            {site.header.ctaText && <a onClick={() => onTrack?.('cta', pageSlug || '/')} href={site.header.ctaUrl || '/auth/login'} style={{ backgroundColor: accent }} className="hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-xs font-black text-[#18433a] shadow-sm transition hover:-translate-y-0.5 md:inline-flex">{tr('header.ctaText', site.header.ctaText)}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></a>}
            <button type="button" onClick={() => setMobileOpen((value) => !value)} aria-expanded={mobileOpen} aria-label="Toggle navigation" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white lg:hidden">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {mobileOpen && (
          <nav aria-label="Mobile" className="border-t border-white/10 bg-[#004f43] px-4 pb-5 pt-3 shadow-xl lg:hidden">
            {navItems.map((item) => (
              <a key={item.id} href={item.href} onClick={() => setMobileOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-bold text-white/90 hover:bg-white/10">
                {tr(`link.${item.id}.label`, item.label)}<ArrowRight className="h-4 w-4 text-white/45 rtl:rotate-180" />
              </a>
            ))}
            {languagePicker('mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-sm font-bold text-white sm:hidden')}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href="/auth/login" className="flex items-center justify-center rounded-xl border border-white/20 px-4 py-3 text-sm font-black text-white">Sign in</a>
              {site.header.ctaText && <a onClick={() => onTrack?.('cta', pageSlug || '/')} href={site.header.ctaUrl || '/auth/login'} style={{ backgroundColor: accent }} className="flex items-center justify-center rounded-xl px-4 py-3 text-sm font-black text-[#18433a]">{tr('header.ctaText', site.header.ctaText)}</a>}
            </div>
          </nav>
        )}
      </header>

      <main>
        {page ? (
          normalizedSlug === ''
            ? <SchoolHome ctx={ctx} page={page} />
            : page.sections.filter((section) => section.visible).map((section) => <SectionView key={section.id} ctx={ctx} section={section} />)
        ) : (
          <section className="flex min-h-[60vh] items-center justify-center px-6 text-center">
            <div>
              <p style={{ color: primary }} className="text-7xl font-black tracking-tight">404</p>
              <h1 className="mt-3 text-3xl font-black text-slate-950">{tr('notFound.title', 'Page not found')}</h1>
              <div className="mt-8 flex justify-center"><PrimaryButton ctx={ctx} href="/">{tr('notFound.home', 'Return home')}</PrimaryButton></div>
            </div>
          </section>
        )}
      </main>

      <footer className="relative overflow-hidden bg-[#12377b] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 top-8 h-48 w-48 rounded-full border border-white/5" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 top-16 h-32 w-32 rounded-full border border-white/5" />
        <div className="relative mx-auto max-w-[1180px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="shrink-0">{brandMark('h-12 w-12 sm:h-14 sm:w-14')}</div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black leading-tight tracking-[.02em] text-white sm:text-2xl">{displayName}</p>
              {site.footer.description && (
                <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] leading-4 text-white/55 sm:text-xs sm:leading-5">
                  {tr('footer.description', site.footer.description)}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-3 text-[9px] text-white/45 sm:text-[10px]">
            <p>{tr('footer.copyright', site.footer.copyright)}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default WebsiteRenderer;
