import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowRight, Award, BookOpen, Briefcase, Building2, CalendarDays,
  CheckCircle2, Globe2, GraduationCap, Heart, Mail, MapPin, Menu,
  Phone, PlayCircle, Star, Users, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type WebsiteSectionType =
  | 'hero' | 'about' | 'services' | 'programs' | 'stats' | 'gallery'
  | 'video' | 'testimonials' | 'faq' | 'contact' | 'custom';

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
}

export interface WebsiteSiteDocument {
  header: {
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
  media: WebsiteMediaItem[];
}

export interface WebsiteOrganization {
  _id?: string;
  name: string;
  slug?: string;
  subdomain?: string;
  customDomain?: string;
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
    section.background === 'primary' ? primary :
    section.background === 'dark' ? secondary :
    section.background === 'muted' ? '#f8fafc' : '#ffffff';
  const dark = section.background === 'primary' || section.background === 'dark';
  return (
    <section id={section.id} style={{ backgroundColor: background, color: dark ? '#ffffff' : '#0f172a' }} className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">{children}</div>
    </section>
  );
}

function SectionHeading({ section, dark = false }: { section: WebsiteSection; dark?: boolean }) {
  const center = section.alignment === 'center';
  return (
    <div className={`${center ? 'mx-auto text-center' : ''} max-w-3xl`}>
      {section.subtitle && <p className={`mb-3 text-sm font-semibold uppercase tracking-[0.18em] ${dark ? 'text-white/70' : 'text-slate-500'}`}>{section.subtitle}</p>}
      {section.title && <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{section.title}</h2>}
      {section.body && <p className={`mt-5 whitespace-pre-line text-base leading-7 sm:text-lg ${dark ? 'text-white/80' : 'text-slate-600'}`}>{section.body}</p>}
    </div>
  );
}

function WebsiteSectionView({ section, site, organization }: {
  section: WebsiteSection;
  site: WebsiteSiteDocument;
  organization: WebsiteOrganization;
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
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className={section.alignment === 'center' ? 'text-center lg:col-span-2 lg:mx-auto lg:max-w-4xl' : ''}>
            {section.subtitle && <p className={`mb-4 text-sm font-semibold uppercase tracking-[0.18em] ${dark ? 'text-white/70' : 'text-slate-500'}`}>{section.subtitle}</p>}
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">{section.title || organization.name}</h1>
            {section.body && <p className={`mt-6 max-w-2xl whitespace-pre-line text-lg leading-8 ${section.alignment === 'center' ? 'mx-auto' : ''} ${dark ? 'text-white/80' : 'text-slate-600'}`}>{section.body}</p>}
            {section.buttonText && (
              <a href={section.buttonUrl || '#'} style={{ backgroundColor: dark ? '#ffffff' : primary, color: dark ? primary : '#ffffff', borderRadius: buttonRadius }} className="mt-8 inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold shadow-sm transition hover:opacity-90">
                {section.buttonText}<ArrowRight className="h-4 w-4" />
              </a>
            )}
          </div>
          {section.imageUrl && section.alignment !== 'center' && (
            <div className="overflow-hidden rounded-3xl border border-white/20 shadow-xl">
              <img src={section.imageUrl} alt={section.title} className="aspect-[4/3] h-full w-full object-cover" />
            </div>
          )}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'about' || section.type === 'custom') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <div className={`grid items-center gap-10 ${section.imageUrl ? 'lg:grid-cols-2' : ''}`}>
          <SectionHeading section={section} dark={dark} />
          {section.imageUrl && <img src={section.imageUrl} alt={section.title} className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lg" />}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'services' || section.type === 'programs' || section.type === 'testimonials') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {section.cards.map((card) => (
            <a key={card.id} href={card.link || undefined} className={`${cardClass} block overflow-hidden rounded-2xl p-6 text-slate-900 transition hover:-translate-y-0.5 hover:shadow-md`}>
              {card.imageUrl && <img src={card.imageUrl} alt={card.title} className="-mx-6 -mt-6 mb-5 aspect-video w-[calc(100%+3rem)] object-cover" />}
              <div style={{ color: primary }} className="mb-4 inline-flex rounded-xl bg-slate-50 p-2.5"><Icon name={card.icon || section.icon} /></div>
              <h3 className="text-lg font-bold">{card.title}</h3>
              {card.text && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{card.text}</p>}
            </a>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'stats') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} />
        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {section.cards.map((card) => (
            <div key={card.id} className={`${dark ? 'border-white/15 bg-white/10 text-white' : cardClass} rounded-2xl border p-6 text-center`}>
              <p className="text-3xl font-extrabold">{card.value || card.title}</p>
              <p className={`mt-2 text-sm ${dark ? 'text-white/70' : 'text-slate-500'}`}>{card.value ? card.title : card.text}</p>
            </div>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'gallery') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} />
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {section.cards.filter((card) => card.imageUrl).map((card) => (
            <figure key={card.id} className="group relative overflow-hidden rounded-2xl bg-slate-100">
              <img src={card.imageUrl} alt={card.title || card.text} className="aspect-square h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              {(card.title || card.text) && <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10 text-sm font-medium text-white">{card.title || card.text}</figcaption>}
            </figure>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'video') {
    const embed = youtubeEmbed(section.videoUrl);
    const isFileVideo = /\.(mp4|webm)(\?.*)?$/i.test(section.videoUrl || '');
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} />
        {section.videoUrl && (
          <div className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-3xl bg-black shadow-xl">
            {embed ? (
              <iframe src={embed} title={section.title || 'Video'} className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            ) : isFileVideo ? (
              <video src={section.videoUrl} controls className="aspect-video w-full bg-black" />
            ) : (
              <a href={section.videoUrl} target="_blank" rel="noreferrer" className="flex aspect-video items-center justify-center gap-3 text-white"><PlayCircle className="h-10 w-10" />Open video</a>
            )}
          </div>
        )}
      </SectionShell>
    );
  }

  if (section.type === 'faq') {
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <SectionHeading section={section} dark={dark} />
        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {section.cards.map((card) => (
            <details key={card.id} className={`${dark ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white'} rounded-2xl border p-5`}>
              <summary className="cursor-pointer font-semibold">{card.question || card.title}</summary>
              <p className={`mt-3 whitespace-pre-line text-sm leading-6 ${dark ? 'text-white/75' : 'text-slate-600'}`}>{card.answer || card.text}</p>
            </details>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (section.type === 'contact') {
    const contacts = [
      organization.address || site.footer.address ? { icon: 'MapPin', label: 'Address', value: site.footer.address || organization.address || '' } : null,
      organization.phone || site.footer.phone ? { icon: 'Phone', label: 'Phone', value: site.footer.phone || organization.phone || '' } : null,
      organization.email || site.footer.email ? { icon: 'Mail', label: 'Email', value: site.footer.email || organization.email || '' } : null,
    ].filter(Boolean) as Array<{ icon: string; label: string; value: string }>;
    return (
      <SectionShell section={section} primary={primary} secondary={secondary}>
        <div className="grid gap-10 lg:grid-cols-2">
          <SectionHeading section={section} dark={dark} />
          <div className="grid gap-4">
            {contacts.map((item) => (
              <div key={item.label} className={`${dark ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white'} flex items-start gap-4 rounded-2xl border p-5`}>
                <div className={dark ? 'text-white' : ''} style={dark ? undefined : { color: primary }}><Icon name={item.icon} /></div>
                <div><p className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-white/60' : 'text-slate-400'}`}>{item.label}</p><p className="mt-1 font-medium">{item.value}</p></div>
              </div>
            ))}
          </div>
        </div>
      </SectionShell>
    );
  }

  return null;
}

export function WebsiteRenderer({ site, organization, pageSlug = '', preview = false }: {
  site: WebsiteSiteDocument;
  organization: WebsiteOrganization;
  pageSlug?: string;
  preview?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
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

  return (
    <div style={css} className={`min-h-full bg-white text-slate-900 ${preview ? 'overflow-hidden' : ''}`}>
      <header className={`${site.header.sticky && !preview ? 'sticky top-0 z-40' : ''} border-b border-slate-200/80 bg-white/95 backdrop-blur`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3">
            {logo ? <img src={logo} alt={organization.name} className="h-11 w-11 rounded-xl object-contain" /> : <div style={{ backgroundColor: primary }} className="flex h-11 w-11 items-center justify-center rounded-xl text-white"><GraduationCap className="h-6 w-6" /></div>}
            {site.header.showOrganizationName && <span className="truncate text-base font-bold sm:text-lg">{organization.name}</span>}
          </a>
          <nav className="hidden items-center gap-1 lg:flex">
            {site.header.navItems.filter((item) => item.visible).map((item) => <a key={item.id} href={item.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950">{item.label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            {site.header.ctaText && <a href={site.header.ctaUrl || '/auth/login'} style={{ backgroundColor: primary, borderRadius: buttonRadius }} className="hidden px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 sm:inline-flex">{site.header.ctaText}</a>}
            <button type="button" onClick={() => setMobileOpen((value) => !value)} className="rounded-xl border border-slate-200 p-2.5 lg:hidden" aria-label="Toggle navigation">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {mobileOpen && <nav className="border-t border-slate-100 px-4 py-3 lg:hidden">{site.header.navItems.filter((item) => item.visible).map((item) => <a key={item.id} href={item.href} onClick={() => setMobileOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">{item.label}</a>)}{site.header.ctaText && <a href={site.header.ctaUrl || '/auth/login'} style={{ backgroundColor: primary, borderRadius: buttonRadius }} className="mt-2 flex justify-center px-4 py-2.5 text-sm font-semibold text-white sm:hidden">{site.header.ctaText}</a>}</nav>}
      </header>

      <main>
        {page ? page.sections.filter((section) => section.visible).map((section) => <WebsiteSectionView key={section.id} section={section} site={site} organization={organization} />) : (
          <section className="flex min-h-[55vh] items-center justify-center px-6 text-center">
            <div><p className="text-sm font-semibold uppercase tracking-wider text-slate-400">404</p><h1 className="mt-2 text-3xl font-bold">Page not found</h1><a href="/" style={{ color: primary }} className="mt-4 inline-block font-semibold">Return home</a></div>
          </section>
        )}
      </main>

      <footer style={{ backgroundColor: secondary }} className="px-4 py-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              {logo && <img src={logo} alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-0.5" />}
              <p className="text-lg font-bold">{organization.name}</p>
            </div>
            {site.footer.description && <p className="mt-4 max-w-xl whitespace-pre-line text-sm leading-6 text-white/70">{site.footer.description}</p>}
          </div>
          <div>
            <p className="text-sm font-semibold">Quick Links</p>
            <div className="mt-4 space-y-2">{site.footer.quickLinks.filter((item) => item.visible).map((item) => <a key={item.id} href={item.href} className="block text-sm text-white/70 hover:text-white">{item.label}</a>)}</div>
          </div>
          <div>
            <p className="text-sm font-semibold">Contact</p>
            <div className="mt-4 space-y-2 text-sm text-white/70">{site.footer.address && <p>{site.footer.address}</p>}{site.footer.phone && <p>{site.footer.phone}</p>}{site.footer.email && <p>{site.footer.email}</p>}</div>
            {site.footer.socials.some((item) => item.visible) && <div className="mt-4 flex flex-wrap gap-2">{site.footer.socials.filter((item) => item.visible).map((item) => <a key={item.id} href={item.href} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/75 hover:bg-white/10">{item.label}</a>)}</div>}
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 pt-6 text-xs text-white/50">{site.footer.copyright}</div>
      </footer>
    </div>
  );
}

export default WebsiteRenderer;
