import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import School from '../models/school.model';
import WebsiteConfig, {
  WebsiteCard,
  WebsiteLink,
  WebsitePage,
  WebsiteSection,
  WebsiteSectionType,
  WebsiteSiteDocument,
} from '../models/website-config.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';

const SECTION_TYPES = new Set<WebsiteSectionType>([
  'hero', 'about', 'services', 'programs', 'stats', 'gallery',
  'video', 'testimonials', 'faq', 'contact', 'custom',
]);
const BACKGROUNDS = new Set(['default', 'muted', 'primary', 'dark']);
const ALIGNMENTS = new Set(['left', 'center']);
const BUTTON_STYLES = new Set(['rounded', 'pill', 'square']);
const CARD_STYLES = new Set(['soft', 'bordered', 'flat']);
const SITE_MAX_BYTES = 2 * 1024 * 1024;

const text = (value: unknown, max = 5000, fallback = ''): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : fallback;
const bool = (value: unknown, fallback = true): boolean =>
  typeof value === 'boolean' ? value : fallback;
const id = (value: unknown, prefix: string): string => {
  const cleaned = text(value, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
};
const color = (value: unknown, fallback: string): string => {
  const candidate = text(value, 20);
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate) ? candidate : fallback;
};

function normalizeLink(value: any, prefix: string): WebsiteLink {
  return {
    id: id(value?.id, prefix),
    label: text(value?.label, 80, 'Link'),
    href: text(value?.href, 2048, '#'),
    visible: bool(value?.visible, true),
  };
}

function normalizeCard(value: any, prefix: string): WebsiteCard {
  return {
    id: id(value?.id, prefix),
    title: text(value?.title, 160),
    text: text(value?.text, 4000),
    value: text(value?.value, 80),
    icon: text(value?.icon, 50),
    imageUrl: text(value?.imageUrl, 2048),
    link: text(value?.link, 2048),
    question: text(value?.question, 500),
    answer: text(value?.answer, 4000),
  };
}

function normalizeSection(value: any, index: number): WebsiteSection {
  const requestedType = text(value?.type, 30) as WebsiteSectionType;
  const type: WebsiteSectionType = SECTION_TYPES.has(requestedType) ? requestedType : 'custom';
  const requestedBackground = text(value?.background, 20);
  const requestedAlignment = text(value?.alignment, 20);
  return {
    id: id(value?.id, `section${index + 1}`),
    type,
    title: text(value?.title, 240),
    subtitle: text(value?.subtitle, 500),
    body: text(value?.body, 12000),
    imageUrl: text(value?.imageUrl, 2048),
    videoUrl: text(value?.videoUrl, 2048),
    icon: text(value?.icon, 50),
    buttonText: text(value?.buttonText, 80),
    buttonUrl: text(value?.buttonUrl, 2048),
    background: (BACKGROUNDS.has(requestedBackground) ? requestedBackground : 'default') as WebsiteSection['background'],
    alignment: (ALIGNMENTS.has(requestedAlignment) ? requestedAlignment : 'left') as WebsiteSection['alignment'],
    visible: bool(value?.visible, true),
    cards: Array.isArray(value?.cards)
      ? value.cards.slice(0, 30).map((card: any, cardIndex: number) => normalizeCard(card, `card${cardIndex + 1}`))
      : [],
  };
}

function normalizeSlug(raw: unknown, index: number): string {
  const candidate = text(raw, 80).toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!candidate || candidate === 'home') return index === 0 ? '' : `page-${index + 1}`;
  const cleaned = candidate.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || `page-${index + 1}`;
}

function normalizePage(value: any, index: number): WebsitePage {
  return {
    id: id(value?.id, `page${index + 1}`),
    title: text(value?.title, 160, index === 0 ? 'Home' : `Page ${index + 1}`),
    slug: normalizeSlug(value?.slug, index),
    showInNavigation: bool(value?.showInNavigation, true),
    seoTitle: text(value?.seoTitle, 180),
    seoDescription: text(value?.seoDescription, 500),
    sections: Array.isArray(value?.sections)
      ? value.sections.slice(0, 50).map((section: any, sectionIndex: number) => normalizeSection(section, sectionIndex))
      : [],
  };
}

function normalizeSite(raw: any, school: any): WebsiteSiteDocument {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestError('Website content must be an object.');
  }
  const rawBytes = Buffer.byteLength(JSON.stringify(raw), 'utf8');
  if (rawBytes > SITE_MAX_BYTES) {
    throw new BadRequestError('Website content is too large. Keep the draft under 2 MB (media files should be uploaded separately).');
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

  return {
    header: {
      logoUrl: text(header.logoUrl, 2048),
      showOrganizationName: bool(header.showOrganizationName, true),
      sticky: bool(header.sticky, true),
      navItems: Array.isArray(header.navItems)
        ? header.navItems.slice(0, 20).map((link: any, index: number) => normalizeLink(link, `nav${index + 1}`))
        : [],
      ctaText: text(header.ctaText, 80, 'Portal Login'),
      ctaUrl: text(header.ctaUrl, 2048, '/auth/login'),
    },
    pages,
    footer: {
      description: text(footer.description, 2500, `Welcome to ${school.name}.`),
      address: text(footer.address, 500, school.address || ''),
      phone: text(footer.phone, 80, school.phone || ''),
      email: text(footer.email, 160, school.email || ''),
      quickLinks: Array.isArray(footer.quickLinks)
        ? footer.quickLinks.slice(0, 20).map((link: any, index: number) => normalizeLink(link, `footer${index + 1}`))
        : [],
      socials: Array.isArray(footer.socials)
        ? footer.socials.slice(0, 12).map((link: any, index: number) => normalizeLink(link, `social${index + 1}`))
        : [],
      copyright: text(footer.copyright, 300, `© ${new Date().getFullYear()} ${school.name}. All rights reserved.`),
    },
    theme: {
      primaryColor: color(theme.primaryColor, school.branding?.themeColor || '#0d9488'),
      secondaryColor: color(theme.secondaryColor, '#0f172a'),
      accentColor: color(theme.accentColor, '#f59e0b'),
      fontFamily: text(theme.fontFamily, 120, 'Inter, ui-sans-serif, system-ui, sans-serif'),
      buttonStyle: (BUTTON_STYLES.has(text(theme.buttonStyle, 20)) ? text(theme.buttonStyle, 20) : 'rounded') as WebsiteSiteDocument['theme']['buttonStyle'],
      cardStyle: (CARD_STYLES.has(text(theme.cardStyle, 20)) ? text(theme.cardStyle, 20) : 'soft') as WebsiteSiteDocument['theme']['cardStyle'],
    },
    seo: {
      siteTitle: text(seo.siteTitle, 180, school.name),
      description: text(seo.description, 500, `${school.name} official website`),
      keywords: text(seo.keywords, 800),
      ogImage: text(seo.ogImage, 2048),
    },
    media: Array.isArray(raw.media)
      ? raw.media.slice(0, 200).map((item: any, index: number) => ({
          id: id(item?.id, `media${index + 1}`),
          name: text(item?.name, 160, `Media ${index + 1}`),
          type: ['image', 'video', 'document'].includes(text(item?.type, 20))
            ? text(item?.type, 20) as 'image' | 'video' | 'document'
            : 'image',
          url: text(item?.url, 2048),
          alt: text(item?.alt, 300),
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
    media: [],
  };
}

async function getManagedSchool(req: Request, requestedSchoolId?: unknown): Promise<any> {
  if (!req.user) throw new ForbiddenError('Authentication required.');
  let schoolId = text(requestedSchoolId, 80);

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

  const school = await School.findById(schoolId).select('name slug subdomain customDomain branding address phone email status').lean();
  if (!school) throw new NotFoundError('Organization');
  return school;
}

function schoolSummary(school: any) {
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

  return ApiResponse.success(res, {
    school: schoolSummary(school),
    draft: config.draft,
    isPublished: config.isPublished,
    publishedAt: config.publishedAt || null,
    version: config.version || 1,
    updatedAt: config.updatedAt,
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

  const directory = path.resolve(process.cwd(), 'uploads', 'organization-websites', String(school._id));
  fs.mkdirSync(directory, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  fs.writeFileSync(path.join(directory, filename), req.file.buffer);

  const baseUrl = String(process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const url = `${baseUrl}/uploads/organization-websites/${school._id}/${filename}`;
  const mediaType = req.file.mimetype.startsWith('image/')
    ? 'image'
    : req.file.mimetype.startsWith('video/')
      ? 'video'
      : 'document';

  return ApiResponse.success(res, {
    id: `media-${crypto.randomUUID().slice(0, 12)}`,
    name: req.file.originalname.slice(0, 160),
    type: mediaType,
    url,
    alt: '',
  }, 'Media uploaded.');
}

export async function getPublicWebsite(req: Request, res: Response): Promise<Response> {
  if (!req.tenant) {
    return ApiResponse.success(res, { isMainSite: true, site: null });
  }

  const school = await School.findOne({ slug: req.tenant.slug, status: 'active' })
    .select('name slug subdomain customDomain branding address phone email')
    .lean();
  if (!school) throw new NotFoundError('Organization');

  const config = await WebsiteConfig.findOne({ school: school._id, isPublished: true })
    .select('published publishedAt version')
    .lean();

  return ApiResponse.success(res, {
    isMainSite: false,
    school: schoolSummary(school),
    site: config?.published || null,
    publishedAt: config?.publishedAt || null,
    version: config?.version || 0,
  });
}
