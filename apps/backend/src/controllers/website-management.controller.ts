import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import School from '../models/school.model';
import WebsiteConfig, {
  WebsiteCard,
  WebsiteLanguage,
  WebsiteLink,
  WebsitePage,
  WebsiteSection,
  WebsiteSectionType,
  WebsiteSiteDocument,
} from '../models/website-config.model';
import WebsiteVersion from '../models/website-version.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { deleteFromR2, getFromR2, r2Enabled, uploadToR2, websiteMediaProxyUrl } from '../utils/r2-storage';

const SECTION_TYPES = new Set<WebsiteSectionType>([
  'hero', 'about', 'services', 'programs', 'stats', 'gallery',
  'video', 'testimonials', 'faq', 'contact', 'custom',
]);
const BACKGROUNDS = new Set(['default', 'muted', 'primary', 'dark']);
const ALIGNMENTS = new Set(['left', 'center']);
const BUTTON_STYLES = new Set(['rounded', 'pill', 'square']);
const CARD_STYLES = new Set(['soft', 'bordered', 'flat']);
const LANGUAGE_DIRECTIONS = new Set(['ltr', 'rtl']);
const SITE_MAX_BYTES = 3 * 1024 * 1024;

export const cleanText = (value: unknown, max = 5000, fallback = ''): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : fallback;
const bool = (value: unknown, fallback = true): boolean =>
  typeof value === 'boolean' ? value : fallback;
const id = (value: unknown, prefix: string): string => {
  const cleaned = cleanText(value, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
};
const color = (value: unknown, fallback: string): string => {
  const candidate = cleanText(value, 20);
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate) ? candidate : fallback;
};

function normalizeLink(value: any, prefix: string): WebsiteLink {
  return {
    id: id(value?.id, prefix),
    label: cleanText(value?.label, 80, 'Link'),
    href: cleanText(value?.href, 2048, '#'),
    visible: bool(value?.visible, true),
  };
}

function normalizeCard(value: any, prefix: string): WebsiteCard {
  return {
    id: id(value?.id, prefix),
    title: cleanText(value?.title, 160),
    text: cleanText(value?.text, 4000),
    value: cleanText(value?.value, 80),
    icon: cleanText(value?.icon, 50),
    imageUrl: cleanText(value?.imageUrl, 2048),
    link: cleanText(value?.link, 2048),
    question: cleanText(value?.question, 500),
    answer: cleanText(value?.answer, 4000),
  };
}

function normalizeSection(value: any, index: number): WebsiteSection {
  const requestedType = cleanText(value?.type, 30) as WebsiteSectionType;
  const type: WebsiteSectionType = SECTION_TYPES.has(requestedType) ? requestedType : 'custom';
  const requestedBackground = cleanText(value?.background, 20);
  const requestedAlignment = cleanText(value?.alignment, 20);
  return {
    id: id(value?.id, `section${index + 1}`),
    type,
    title: cleanText(value?.title, 240),
    subtitle: cleanText(value?.subtitle, 500),
    body: cleanText(value?.body, 12000),
    imageUrl: cleanText(value?.imageUrl, 2048),
    videoUrl: cleanText(value?.videoUrl, 2048),
    icon: cleanText(value?.icon, 50),
    buttonText: cleanText(value?.buttonText, 80),
    buttonUrl: cleanText(value?.buttonUrl, 2048),
    background: (BACKGROUNDS.has(requestedBackground) ? requestedBackground : 'default') as WebsiteSection['background'],
    alignment: (ALIGNMENTS.has(requestedAlignment) ? requestedAlignment : 'left') as WebsiteSection['alignment'],
    visible: bool(value?.visible, true),
    cards: Array.isArray(value?.cards)
      ? value.cards.slice(0, 30).map((card: any, cardIndex: number) => normalizeCard(card, `card${cardIndex + 1}`))
      : [],
  };
}

function normalizeSlug(raw: unknown, index: number): string {
  const candidate = cleanText(raw, 80).toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!candidate || candidate === 'home') return index === 0 ? '' : `page-${index + 1}`;
  const cleaned = candidate.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || `page-${index + 1}`;
}

function normalizePage(value: any, index: number): WebsitePage {
  return {
    id: id(value?.id, `page${index + 1}`),
    title: cleanText(value?.title, 160, index === 0 ? 'Home' : `Page ${index + 1}`),
    slug: normalizeSlug(value?.slug, index),
    showInNavigation: bool(value?.showInNavigation, true),
    seoTitle: cleanText(value?.seoTitle, 180),
    seoDescription: cleanText(value?.seoDescription, 500),
    sections: Array.isArray(value?.sections)
      ? value.sections.slice(0, 50).map((section: any, sectionIndex: number) => normalizeSection(section, sectionIndex))
      : [],
  };
}

function normalizeLanguages(raw: any): WebsiteLanguage[] {
  const source = Array.isArray(raw) ? raw.slice(0, 8) : [];
  const seen = new Set<string>();
  const items: WebsiteLanguage[] = [];
  for (const item of source) {
    const code = cleanText(item?.code, 12).toLowerCase().replace(/[^a-z-]/g, '');
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const direction = cleanText(item?.direction, 3) as 'ltr' | 'rtl';
    items.push({
      code,
      label: cleanText(item?.label, 60, code.toUpperCase()),
      direction: LANGUAGE_DIRECTIONS.has(direction) ? direction : 'ltr',
      enabled: bool(item?.enabled, true),
    });
  }
  if (!items.length) items.push({ code: 'en', label: 'English', direction: 'ltr', enabled: true });
  return items;
}

function normalizeTranslations(raw: any, languages: WebsiteLanguage[]): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const allowed = new Set(languages.map((language) => language.code));
  for (const [language, entries] of Object.entries(raw)) {
    if (!allowed.has(language) || !entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
    const translated: Record<string, string> = {};
    for (const [key, value] of Object.entries(entries as Record<string, unknown>).slice(0, 1000)) {
      const safeKey = cleanText(key, 180).replace(/[^a-zA-Z0-9_.:-]/g, '');
      if (safeKey && typeof value === 'string') translated[safeKey] = value.trim().slice(0, 12000);
    }
    result[language] = translated;
  }
  return result;
}

export function normalizeSite(raw: any, school: any): WebsiteSiteDocument {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestError('Website content must be an object.');
  }
  const rawBytes = Buffer.byteLength(JSON.stringify(raw), 'utf8');
  if (rawBytes > SITE_MAX_BYTES) {
    throw new BadRequestError('Website content is too large. Keep the draft under 3 MB (media files should be uploaded separately).');
  }

  const pagesInput = Array.isArray(raw.pages) && raw.pages.length ? raw.pages.slice(0, 30) : buildDefaultSite(school).pages;
  const pages = pagesInput.map((page: any, index: number) => normalizePage(page, index));
  if (!pages.some((page: WebsitePage) => page.slug === '')) pages[0].slug = '';

  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page.slug)) throw new BadRequestError(`Duplicate page slug: ${page.slug || 'home'}`);
    seen.add(page.slug);
  }

  const header = raw.header || {};
  const footer = raw.footer || {};
  const theme = raw.theme || {};
  const seo = raw.seo || {};
  const settings = raw.settings || {};
  const languages = normalizeLanguages(raw.languages);
  const defaultLanguageCandidate = cleanText(raw.defaultLanguage, 12).toLowerCase();
  const defaultLanguage = languages.some((language) => language.code === defaultLanguageCandidate && language.enabled)
    ? defaultLanguageCandidate
    : languages.find((language) => language.enabled)?.code || languages[0].code;

  return {
    header: {
      logoUrl: cleanText(header.logoUrl, 2048),
      showOrganizationName: bool(header.showOrganizationName, true),
      sticky: bool(header.sticky, true),
      navItems: Array.isArray(header.navItems)
        ? header.navItems.slice(0, 30).map((link: any, index: number) => normalizeLink(link, `nav${index + 1}`))
        : [],
      ctaText: cleanText(header.ctaText, 80, 'Portal Login'),
      ctaUrl: cleanText(header.ctaUrl, 2048, '/auth/login'),
    },
    pages,
    footer: {
      description: cleanText(footer.description, 2500, `Welcome to ${school.name}.`),
      address: cleanText(footer.address, 500, school.address || ''),
      phone: cleanText(footer.phone, 80, school.phone || ''),
      email: cleanText(footer.email, 160, school.email || ''),
      quickLinks: Array.isArray(footer.quickLinks)
        ? footer.quickLinks.slice(0, 30).map((link: any, index: number) => normalizeLink(link, `footer${index + 1}`))
        : [],
      socials: Array.isArray(footer.socials)
        ? footer.socials.slice(0, 20).map((link: any, index: number) => normalizeLink(link, `social${index + 1}`))
        : [],
      copyright: cleanText(footer.copyright, 300, `© ${new Date().getFullYear()} ${school.name}. All rights reserved.`),
    },
    theme: {
      primaryColor: color(theme.primaryColor, school.branding?.themeColor || '#0d9488'),
      secondaryColor: color(theme.secondaryColor, '#0f172a'),
      accentColor: color(theme.accentColor, '#f59e0b'),
      fontFamily: cleanText(theme.fontFamily, 120, 'Inter, ui-sans-serif, system-ui, sans-serif'),
      buttonStyle: (BUTTON_STYLES.has(cleanText(theme.buttonStyle, 20)) ? cleanText(theme.buttonStyle, 20) : 'rounded') as WebsiteSiteDocument['theme']['buttonStyle'],
      cardStyle: (CARD_STYLES.has(cleanText(theme.cardStyle, 20)) ? cleanText(theme.cardStyle, 20) : 'soft') as WebsiteSiteDocument['theme']['cardStyle'],
    },
    seo: {
      siteTitle: cleanText(seo.siteTitle, 180, school.name),
      description: cleanText(seo.description, 500, `${school.name} official website`),
      keywords: cleanText(seo.keywords, 800),
      ogImage: cleanText(seo.ogImage, 2048),
    },
    settings: {
      contactFormEnabled: bool(settings.contactFormEnabled, true),
      analyticsEnabled: bool(settings.analyticsEnabled, true),
    },
    defaultLanguage,
    languages,
    translations: normalizeTranslations(raw.translations, languages),
    media: Array.isArray(raw.media)
      ? raw.media.slice(0, 400).map((item: any, index: number) => ({
          id: id(item?.id, `media${index + 1}`),
          name: cleanText(item?.name, 160, `Media ${index + 1}`),
          type: ['image', 'video', 'document'].includes(cleanText(item?.type, 20))
            ? cleanText(item?.type, 20) as 'image' | 'video' | 'document'
            : 'image',
          url: cleanText(item?.url, 2048),
          alt: cleanText(item?.alt, 300),
          storageKey: cleanText(item?.storageKey, 1024),
          storageProvider: ['r2', 'local'].includes(cleanText(item?.storageProvider, 12))
            ? cleanText(item?.storageProvider, 12) as 'r2' | 'local'
            : undefined,
          mimeType: cleanText(item?.mimeType, 120),
          size: Number.isFinite(Number(item?.size)) ? Math.max(0, Math.min(Number(item.size), 100 * 1024 * 1024)) : undefined,
        }))
      : [],
  };
}

export function buildDefaultSite(school: any): WebsiteSiteDocument {
  const primary = school.branding?.themeColor || '#0d9488';
  return {
    header: {
      logoUrl: school.branding?.logo || '',
      showOrganizationName: true,
      sticky: true,
      navItems: [
        { id: 'nav-home', label: 'Home', href: '/', visible: true },
        { id: 'nav-about', label: 'About', href: '/#about', visible: true },
        { id: 'nav-programs', label: 'Programs', href: '/#programs', visible: true },
        { id: 'nav-contact', label: 'Contact', href: '/#contact', visible: true },
      ],
      ctaText: 'Portal Login',
      ctaUrl: '/auth/login',
    },
    pages: [{
      id: 'page-home',
      title: 'Home',
      slug: '',
      showInNavigation: true,
      seoTitle: school.name,
      seoDescription: `Welcome to ${school.name}.`,
      sections: [
        {
          id: 'hero', type: 'hero', title: school.name,
          subtitle: 'Learning, growth and opportunity in one connected community.',
          body: 'Build knowledge, develop skills and stay connected with our institution.',
          imageUrl: '', videoUrl: '', icon: 'GraduationCap',
          buttonText: 'Explore Programs', buttonUrl: '/#programs',
          background: 'default', alignment: 'left', visible: true, cards: [],
        },
        {
          id: 'about', type: 'about', title: 'About Us',
          subtitle: 'A learning community built for student success.',
          body: `${school.name} is committed to quality education, strong values and meaningful student development.`,
          imageUrl: '', videoUrl: '', icon: 'Building2', buttonText: '', buttonUrl: '',
          background: 'muted', alignment: 'left', visible: true, cards: [],
        },
        {
          id: 'programs', type: 'programs', title: 'Our Programs',
          subtitle: 'Discover opportunities designed for every learner.',
          body: '', imageUrl: '', videoUrl: '', icon: 'BookOpen', buttonText: '', buttonUrl: '',
          background: 'default', alignment: 'center', visible: true,
          cards: [
            { id: 'program-1', title: 'Quality Learning', text: 'Structured learning experiences with clear outcomes.', icon: 'BookOpen' },
            { id: 'program-2', title: 'Student Support', text: 'A supportive environment focused on progress and wellbeing.', icon: 'Users' },
            { id: 'program-3', title: 'Future Ready', text: 'Skills and knowledge that prepare learners for what comes next.', icon: 'Award' },
          ],
        },
        {
          id: 'contact', type: 'contact', title: 'Contact Us',
          subtitle: 'We would be happy to hear from you.',
          body: '', imageUrl: '', videoUrl: '', icon: 'Mail', buttonText: '', buttonUrl: '',
          background: 'dark', alignment: 'left', visible: true, cards: [],
        },
      ],
    }],
    footer: {
      description: `Official website of ${school.name}.`,
      address: school.address || '',
      phone: school.phone || '',
      email: school.email || '',
      quickLinks: [
        { id: 'footer-home', label: 'Home', href: '/', visible: true },
        { id: 'footer-login', label: 'Portal Login', href: '/auth/login', visible: true },
      ],
      socials: [],
      copyright: `© ${new Date().getFullYear()} ${school.name}. All rights reserved.`,
    },
    theme: {
      primaryColor: primary,
      secondaryColor: '#0f172a',
      accentColor: '#f59e0b',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      buttonStyle: 'rounded',
      cardStyle: 'soft',
    },
    seo: {
      siteTitle: school.name,
      description: `${school.name} official website`,
      keywords: 'education, learning, students',
      ogImage: school.branding?.logo || '',
    },
    settings: { contactFormEnabled: true, analyticsEnabled: true },
    defaultLanguage: 'en',
    languages: [
      { code: 'en', label: 'English', direction: 'ltr', enabled: true },
      { code: 'so', label: 'Somali', direction: 'ltr', enabled: false },
      { code: 'ar', label: 'العربية', direction: 'rtl', enabled: false },
    ],
    translations: {},
    media: [],
  };
}

export async function getManagedSchool(req: Request, requestedSchoolId?: unknown): Promise<any> {
  if (!req.user) throw new ForbiddenError('Authentication required.');
  let schoolId = cleanText(requestedSchoolId, 80);

  if (req.user.role === 'org_admin') {
    if (!req.user.organizationId) throw new ForbiddenError('No organization is linked to this account.');
    if (schoolId && schoolId !== req.user.organizationId) throw new ForbiddenError('You can manage only your own organization website.');
    schoolId = req.user.organizationId;
  } else if (req.user.role !== 'admin') {
    throw new ForbiddenError('Only platform administrators and organization administrators can manage websites.');
  }

  if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
    throw new BadRequestError('Select a valid organization.');
  }

  const school = await School.findById(schoolId).select('name slug subdomain customDomain branding address phone email status institutionType').lean();
  if (!school) throw new NotFoundError('Organization');
  return school;
}

export function schoolSummary(school: any) {
  return {
    _id: school._id,
    name: school.name,
    slug: school.slug,
    subdomain: school.subdomain,
    customDomain: school.customDomain || '',
    branding: school.branding || {},
    address: school.address || '',
    phone: school.phone || '',
    email: school.email || '',
    institutionType: school.institutionType || 'school',
  };
}

export async function getWebsiteConfig(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.query.schoolId);
  let config = await WebsiteConfig.findOne({ school: school._id }).lean();

  if (!config) {
    const draft = buildDefaultSite(school);
    const created = await WebsiteConfig.create({
      school: school._id,
      draft,
      published: null,
      isPublished: false,
      version: 1,
      updatedBy: req.user!.userId,
    });
    config = created.toObject() as any;
  }

  const currentConfig = config!;
  return ApiResponse.success(res, {
    school: schoolSummary(school),
    draft: normalizeSite(currentConfig.draft, school),
    isPublished: currentConfig.isPublished,
    publishedAt: currentConfig.publishedAt || null,
    version: currentConfig.version || 1,
    updatedAt: currentConfig.updatedAt,
    storage: { provider: r2Enabled ? 'r2' : 'local', durable: r2Enabled },
  });
}

export async function saveWebsiteDraft(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  const normalized = normalizeSite(req.body?.site, school);

  const config = await WebsiteConfig.findOneAndUpdate(
    { school: school._id },
    {
      $set: { draft: normalized, updatedBy: req.user!.userId },
      $inc: { version: 1 },
      $setOnInsert: { isPublished: false },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return ApiResponse.success(res, {
    school: schoolSummary(school),
    draft: config!.draft,
    isPublished: config!.isPublished,
    publishedAt: config!.publishedAt || null,
    version: config!.version,
    updatedAt: config!.updatedAt,
  }, 'Website draft saved.');
}

export async function publishWebsite(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  const config = await WebsiteConfig.findOne({ school: school._id });
  if (!config) throw new BadRequestError('Save the website draft before publishing.');

  const normalized = normalizeSite(config.draft, school);
  config.draft = normalized;
  config.published = JSON.parse(JSON.stringify(normalized));
  config.isPublished = true;
  config.publishedAt = new Date();
  config.updatedBy = new mongoose.Types.ObjectId(req.user!.userId);
  config.version += 1;
  await config.save();

  await WebsiteVersion.findOneAndUpdate(
    { school: school._id, version: config.version },
    {
      $setOnInsert: {
        school: school._id,
        version: config.version,
        site: config.published,
        publishedBy: req.user!.userId,
        note: cleanText(req.body?.note, 300),
      },
    },
    { upsert: true, new: true },
  );

  return ApiResponse.success(res, {
    isPublished: true,
    publishedAt: config.publishedAt,
    version: config.version,
  }, 'Website published successfully.');
}

export async function unpublishWebsite(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  const config = await WebsiteConfig.findOne({ school: school._id });
  if (!config) throw new NotFoundError('Website configuration');

  config.isPublished = false;
  config.updatedBy = new mongoose.Types.ObjectId(req.user!.userId);
  config.version += 1;
  await config.save();

  return ApiResponse.success(res, {
    isPublished: false,
    version: config.version,
  }, 'Website unpublished.');
}

export async function resetWebsiteDraft(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  const draft = buildDefaultSite(school);
  const config = await WebsiteConfig.findOneAndUpdate(
    { school: school._id },
    {
      $set: { draft, updatedBy: req.user!.userId },
      $inc: { version: 1 },
      $setOnInsert: { isPublished: false },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return ApiResponse.success(res, {
    draft: config!.draft,
    isPublished: config!.isPublished,
    version: config!.version,
  }, 'Website draft reset to the starter template.');
}

const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'application/pdf': '.pdf',
};

export async function uploadWebsiteMedia(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  if (!req.file) throw new BadRequestError('Choose an image, video, or PDF to upload.');

  const extension = MEDIA_EXTENSIONS[req.file.mimetype];
  if (!extension) throw new BadRequestError('Unsupported media type. Use JPG, PNG, WEBP, GIF, MP4, WEBM, or PDF.');

  const mediaType = req.file.mimetype.startsWith('image/')
    ? 'image'
    : req.file.mimetype.startsWith('video/')
      ? 'video'
      : 'document';

  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const storageKey = `organization-websites/${school._id}/${filename}`;
  let url = '';
  let storageProvider: 'r2' | 'local' = 'local';

  if (r2Enabled) {
    await uploadToR2(storageKey, req.file.buffer, req.file.mimetype);
    url = websiteMediaProxyUrl(String(school._id), storageKey);
    storageProvider = 'r2';
  } else {
    const directory = path.resolve(process.cwd(), 'uploads', 'organization-websites', String(school._id));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, filename), req.file.buffer);
    const baseUrl = String(process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    url = `${baseUrl}/uploads/organization-websites/${school._id}/${filename}`;
  }

  return ApiResponse.success(res, {
    id: `media-${crypto.randomUUID().slice(0, 12)}`,
    name: req.file.originalname.slice(0, 160),
    type: mediaType,
    url,
    alt: '',
    storageKey,
    storageProvider,
    mimeType: req.file.mimetype,
    size: req.file.size,
  }, r2Enabled ? 'Media uploaded to Cloudflare R2.' : 'Media uploaded to local storage.');
}

export async function deleteWebsiteMedia(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  const mediaId = cleanText(req.params.mediaId, 120);
  const config = await WebsiteConfig.findOne({ school: school._id });
  if (!config) throw new NotFoundError('Website configuration');

  const draft = normalizeSite(config.draft, school);
  const media = draft.media.find((item) => item.id === mediaId);
  if (!media) throw new NotFoundError('Media item');

  if (media.storageProvider === 'r2' && media.storageKey && r2Enabled) {
    await deleteFromR2(media.storageKey);
  } else if (media.storageKey && media.storageProvider === 'local') {
    const root = path.resolve(process.cwd(), 'uploads');
    const target = path.resolve(process.cwd(), 'uploads', media.storageKey);
    if (target.startsWith(root + path.sep) && fs.existsSync(target)) fs.unlinkSync(target);
  }

  draft.media = draft.media.filter((item) => item.id !== mediaId);
  config.draft = draft;
  config.updatedBy = new mongoose.Types.ObjectId(req.user!.userId);
  config.version += 1;
  await config.save();

  return ApiResponse.success(res, { media: draft.media, version: config.version }, 'Media deleted.');
}

export async function getPublicMedia(req: Request, res: Response): Promise<void> {
  const schoolId = cleanText(req.params.schoolId, 80);
  const key = cleanText(req.query.key, 1024);
  if (!mongoose.Types.ObjectId.isValid(schoolId) || !key || !key.startsWith(`organization-websites/${schoolId}/`)) {
    throw new BadRequestError('Invalid media request.');
  }

  const config = await WebsiteConfig.findOne({ school: schoolId }).select('draft published isPublished').lean();
  if (!config) throw new NotFoundError('Website media');
  const allMedia = [
    ...((config.published as any)?.media || []),
    ...((config.draft as any)?.media || []),
  ];
  const media = allMedia.find((item: any) => item?.storageKey === key);
  if (!media) throw new NotFoundError('Website media');

  if (media.storageProvider !== 'r2' || !r2Enabled) throw new NotFoundError('R2 media');
  const object = await getFromR2(key);
  res.set('Content-Type', media.mimeType || object.contentType || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.send(object.body);
}

export async function getPublicWebsite(req: Request, res: Response): Promise<Response> {
  if (!req.tenant) {
    return ApiResponse.success(res, { isMainSite: true, site: null });
  }

  const school = await School.findOne({ slug: req.tenant.slug, status: 'active' })
    .select('name slug subdomain customDomain branding address phone email institutionType')
    .lean();
  if (!school) throw new NotFoundError('Organization');

  const config = await WebsiteConfig.findOne({ school: school._id, isPublished: true })
    .select('published publishedAt version')
    .lean();

  return ApiResponse.success(res, {
    isMainSite: false,
    school: schoolSummary(school),
    site: config?.published ? normalizeSite(config.published, school) : null,
    publishedAt: config?.publishedAt || null,
    version: config?.version || 0,
  });
}
