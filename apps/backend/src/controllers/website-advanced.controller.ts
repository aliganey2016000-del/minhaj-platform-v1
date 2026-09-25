import { Request, Response } from 'express';
import crypto from 'crypto';
import dns from 'dns/promises';
import https from 'https';
import tls from 'tls';
import mongoose from 'mongoose';
import School from '../models/school.model';
import WebsiteConfig, { WebsiteSiteDocument } from '../models/website-config.model';
import WebsiteMessage from '../models/website-message.model';
import WebsiteAnalyticsDaily from '../models/website-analytics.model';
import WebsiteVersion from '../models/website-version.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import {
  buildDefaultSite,
  cleanText,
  getManagedSchool,
  normalizeSite,
} from './website-management.controller';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function currentTenantSchool(req: Request) {
  if (!req.tenant?.slug) throw new NotFoundError('Organization');
  return School.findOne({ slug: req.tenant.slug, status: 'active' })
    .select('name slug subdomain customDomain branding address phone email institutionType')
    .lean();
}

async function incrementAnalytics(
  schoolId: mongoose.Types.ObjectId | string,
  page: string,
  event: 'view' | 'cta' | 'contact',
  sessionId?: string,
) {
  const date = new Date().toISOString().slice(0, 10);
  const safePage = cleanText(page || '/', 120, '/') || '/';
  const inc = event === 'view'
    ? { views: 1 }
    : event === 'cta'
      ? { ctaClicks: 1 }
      : { contactSubmissions: 1 };
  const update: any = { $inc: inc, $setOnInsert: { school: schoolId, date, page: safePage } };
  if (sessionId) {
    const hash = crypto.createHash('sha256').update(`${schoolId}:${sessionId.slice(0, 160)}`).digest('hex').slice(0, 32);
    update.$addToSet = { visitorHashes: hash };
  }
  await WebsiteAnalyticsDaily.updateOne(
    { school: schoolId, date, page: safePage },
    update,
    { upsert: true },
  );
}

export async function submitContact(req: Request, res: Response): Promise<Response> {
  const school = await currentTenantSchool(req);
  if (!school) throw new NotFoundError('Organization');

  const config = await WebsiteConfig.findOne({ school: school._id, isPublished: true }).select('published').lean();
  if (!(config?.published as any)?.settings?.contactFormEnabled) {
    throw new ForbiddenError('The contact form is disabled for this website.');
  }

  if (cleanText(req.body?.website, 200)) {
    return ApiResponse.success(res, { accepted: true }, 'Message received.');
  }

  const name = cleanText(req.body?.name, 120);
  const email = cleanText(req.body?.email, 180).toLowerCase();
  const phone = cleanText(req.body?.phone, 60);
  const subject = cleanText(req.body?.subject, 180, 'Website enquiry');
  const message = cleanText(req.body?.message, 6000);
  const sourcePage = cleanText(req.body?.sourcePage, 120, '/');

  if (!name || !message) throw new BadRequestError('Name and message are required.');
  if (!email && !phone) throw new BadRequestError('Provide an email address or phone number.');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestError('Enter a valid email address.');

  const item = await WebsiteMessage.create({
    school: school._id,
    name,
    email,
    phone,
    subject,
    message,
    status: 'new',
    sourcePage,
  });
  await incrementAnalytics(school._id, sourcePage, 'contact', cleanText(req.body?.sessionId, 160));

  return ApiResponse.created(res, { id: item._id }, 'Your message has been sent.');
}

export async function listMessages(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.query.schoolId);
  const status = cleanText(req.query.status, 20);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const query: any = { school: school._id };
  if (['new', 'read', 'replied', 'archived'].includes(status)) query.status = status;

  const [items, total, unread] = await Promise.all([
    WebsiteMessage.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    WebsiteMessage.countDocuments(query),
    WebsiteMessage.countDocuments({ school: school._id, status: 'new' }),
  ]);

  return ApiResponse.success(res, { items, total, unread, page, limit });
}

export async function updateMessage(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  const status = cleanText(req.body?.status, 20);
  if (!['new', 'read', 'replied', 'archived'].includes(status)) throw new BadRequestError('Invalid message status.');

  const item = await WebsiteMessage.findOneAndUpdate(
    { _id: req.params.messageId, school: school._id },
    { status },
    { new: true },
  ).lean();
  if (!item) throw new NotFoundError('Website message');
  return ApiResponse.success(res, item, 'Message updated.');
}

export async function deleteMessage(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  const item = await WebsiteMessage.findOneAndDelete({ _id: req.params.messageId, school: school._id });
  if (!item) throw new NotFoundError('Website message');
  return ApiResponse.success(res, { deleted: true }, 'Message deleted.');
}

export async function recordAnalytics(req: Request, res: Response): Promise<Response> {
  const school = await currentTenantSchool(req);
  if (!school) throw new NotFoundError('Organization');

  const config = await WebsiteConfig.findOne({ school: school._id, isPublished: true }).select('published').lean();
  if ((config?.published as any)?.settings?.analyticsEnabled === false) {
    return ApiResponse.success(res, { recorded: false });
  }

  const event = cleanText(req.body?.event, 20);
  if (!['view', 'cta'].includes(event)) throw new BadRequestError('Invalid analytics event.');
  await incrementAnalytics(
    school._id,
    cleanText(req.body?.page, 120, '/'),
    event as 'view' | 'cta',
    cleanText(req.body?.sessionId, 160),
  );
  return ApiResponse.success(res, { recorded: true });
}

export async function getAnalytics(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.query.schoolId);
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const rows = await WebsiteAnalyticsDaily.find({ school: school._id, date: { $gte: since } })
    .sort({ date: 1 }).lean();

  const visitors = new Set<string>();
  let views = 0;
  let ctaClicks = 0;
  let contactSubmissions = 0;
  const pageMap = new Map<string, { page: string; views: number; ctaClicks: number; contacts: number }>();
  const dayMap = new Map<string, { date: string; views: number; visitors: Set<string> }>();

  for (const row of rows) {
    views += row.views || 0;
    ctaClicks += row.ctaClicks || 0;
    contactSubmissions += row.contactSubmissions || 0;
    for (const hash of row.visitorHashes || []) visitors.add(hash);

    const page = pageMap.get(row.page) || { page: row.page, views: 0, ctaClicks: 0, contacts: 0 };
    page.views += row.views || 0;
    page.ctaClicks += row.ctaClicks || 0;
    page.contacts += row.contactSubmissions || 0;
    pageMap.set(row.page, page);

    const day = dayMap.get(row.date) || { date: row.date, views: 0, visitors: new Set<string>() };
    day.views += row.views || 0;
    for (const hash of row.visitorHashes || []) day.visitors.add(hash);
    dayMap.set(row.date, day);
  }

  return ApiResponse.success(res, {
    periodDays: days,
    totals: { views, visitors: visitors.size, ctaClicks, contactSubmissions },
    topPages: [...pageMap.values()].sort((a, b) => b.views - a.views).slice(0, 10),
    daily: [...dayMap.values()].map((day) => ({ date: day.date, views: day.views, visitors: day.visitors.size })),
  });
}

export async function listVersions(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.query.schoolId);
  const versions = await WebsiteVersion.find({ school: school._id })
    .select('version note publishedBy createdAt')
    .populate('publishedBy', 'email')
    .sort({ version: -1 })
    .limit(30)
    .lean();
  return ApiResponse.success(res, versions);
}

export async function rollbackVersion(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  const version = Number(req.params.version);
  if (!Number.isInteger(version) || version < 1) throw new BadRequestError('Invalid website version.');

  const snapshot = await WebsiteVersion.findOne({ school: school._id, version }).lean();
  if (!snapshot) throw new NotFoundError('Website version');

  const config = await WebsiteConfig.findOne({ school: school._id });
  if (!config) throw new NotFoundError('Website configuration');

  const restored = normalizeSite(snapshot.site, school);
  config.draft = clone(restored);
  config.published = clone(restored);
  config.isPublished = true;
  config.publishedAt = new Date();
  config.updatedBy = new mongoose.Types.ObjectId(req.user!.userId);
  config.version += 1;
  await config.save();

  await WebsiteVersion.create({
    school: school._id,
    version: config.version,
    site: restored,
    publishedBy: req.user!.userId,
    note: `Rollback to version ${version}`,
  });

  return ApiResponse.success(res, {
    draft: restored,
    isPublished: true,
    publishedAt: config.publishedAt,
    version: config.version,
  }, `Rolled back to version ${version}.`);
}

const TEMPLATE_META = [
  { id: 'modern-school', name: 'Modern School', description: 'Bright, student-focused school website with programs and impact.' },
  { id: 'university', name: 'University', description: 'Academic, research and admissions-oriented institution website.' },
  { id: 'islamic-school', name: 'Islamic School', description: 'Warm education layout for faith, values and academic excellence.' },
  { id: 'minimal', name: 'Minimal', description: 'Clean, simple and fast website with essential information only.' },
];

function buildTemplate(templateId: string, school: any): WebsiteSiteDocument {
  const site = buildDefaultSite(school);
  if (templateId === 'university') {
    site.theme.primaryColor = '#1d4ed8';
    site.theme.secondaryColor = '#172554';
    site.header.navItems = [
      { id: 'nav-home', label: 'Home', href: '/', visible: true },
      { id: 'nav-academics', label: 'Academics', href: '/#programs', visible: true },
      { id: 'nav-research', label: 'Research', href: '/#research', visible: true },
      { id: 'nav-admissions', label: 'Admissions', href: '/#admissions', visible: true },
      { id: 'nav-contact', label: 'Contact', href: '/#contact', visible: true },
    ];
    site.pages[0].sections.splice(3, 0,
      { id: 'research', type: 'services', title: 'Research & Innovation', subtitle: 'Knowledge with impact', body: '', imageUrl: '', videoUrl: '', icon: 'BookOpen', buttonText: '', buttonUrl: '', background: 'muted', alignment: 'center', visible: true, cards: [
        { id: 'research-1', title: 'Research', text: 'Support discovery, scholarship and evidence-based solutions.', icon: 'BookOpen' },
        { id: 'research-2', title: 'Innovation', text: 'Transform ideas into practical solutions for society.', icon: 'Award' },
        { id: 'research-3', title: 'Partnerships', text: 'Collaborate locally and internationally.', icon: 'Users' },
      ]},
      { id: 'admissions', type: 'custom', title: 'Admissions', subtitle: 'Start your academic journey', body: 'Explore programmes, entry requirements and opportunities to study with us.', imageUrl: '', videoUrl: '', icon: 'GraduationCap', buttonText: 'Portal Login', buttonUrl: '/auth/login', background: 'default', alignment: 'center', visible: true, cards: [] },
    );
  } else if (templateId === 'islamic-school') {
    site.theme.primaryColor = '#047857';
    site.theme.secondaryColor = '#064e3b';
    site.theme.accentColor = '#d97706';
    site.pages[0].sections[0].subtitle = 'Knowledge · Character · Faith';
    site.pages[0].sections[0].body = 'Nurturing confident learners through excellent education, strong values and service to the community.';
    site.pages[0].sections[1].body = `${school.name} brings together academic excellence, character development and a supportive learning environment.`;
  } else if (templateId === 'minimal') {
    site.theme.primaryColor = '#0f172a';
    site.theme.secondaryColor = '#020617';
    site.theme.cardStyle = 'bordered';
    site.pages[0].sections = [
      site.pages[0].sections[0],
      site.pages[0].sections[1],
      site.pages[0].sections[3],
    ];
    site.header.navItems = [
      { id: 'nav-home', label: 'Home', href: '/', visible: true },
      { id: 'nav-about', label: 'About', href: '/#about', visible: true },
      { id: 'nav-contact', label: 'Contact', href: '/#contact', visible: true },
    ];
  } else if (templateId !== 'modern-school') {
    throw new BadRequestError('Unknown website template.');
  }
  return site;
}

export async function listTemplates(_req: Request, res: Response): Promise<Response> {
  return ApiResponse.success(res, TEMPLATE_META);
}

export async function applyTemplate(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  const templateId = cleanText(req.params.templateId, 50);
  const draft = buildTemplate(templateId, school);
  const config = await WebsiteConfig.findOneAndUpdate(
    { school: school._id },
    {
      $set: { draft, updatedBy: req.user!.userId },
      $inc: { version: 1 },
      $setOnInsert: { isPublished: false },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return ApiResponse.success(res, { draft: config!.draft, version: config!.version }, 'Template applied to draft.');
}

async function tlsCheck(hostname: string): Promise<{ active: boolean; authorized: boolean; expiresAt?: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      rejectUnauthorized: false,
    }, () => {
      const cert = socket.getPeerCertificate();
      const result = {
        active: true,
        authorized: socket.authorized,
        expiresAt: cert?.valid_to ? new Date(cert.valid_to).toISOString() : undefined,
      };
      socket.end();
      resolve(result);
    });
    socket.setTimeout(5000);
    socket.on('error', () => resolve({ active: false, authorized: false }));
    socket.on('timeout', () => { socket.destroy(); resolve({ active: false, authorized: false }); });
  });
}

async function dnsCheck(hostname: string) {
  const [a, aaaa, cname] = await Promise.all([
    dns.resolve4(hostname).catch(() => [] as string[]),
    dns.resolve6(hostname).catch(() => [] as string[]),
    dns.resolveCname(hostname).catch(() => [] as string[]),
  ]);
  return { resolved: a.length + aaaa.length + cname.length > 0, a, aaaa, cname };
}

export async function getDomainStatus(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.query.schoolId);
  const baseDomain = (process.env.BASE_DOMAIN || 'sahaledu.com').toLowerCase();
  const managedHostname = `${school.subdomain || school.slug}.${baseDomain}`;
  const hostname = (school.customDomain || managedHostname).toLowerCase();
  const [dnsStatus, ssl] = await Promise.all([dnsCheck(hostname), tlsCheck(hostname)]);

  return ApiResponse.success(res, {
    hostname,
    type: school.customDomain ? 'custom' : 'managed',
    dns: dnsStatus,
    ssl,
    connected: dnsStatus.resolved && ssl.active,
    cloudflareAutomationConfigured: Boolean(
      process.env.CLOUDFLARE_API_TOKEN &&
      process.env.CLOUDFLARE_ZONE_ID &&
      process.env.CLOUDFLARE_ORIGIN_HOST,
    ),
    expected: school.customDomain
      ? { cnameTarget: process.env.CLOUDFLARE_CUSTOM_DOMAIN_TARGET || managedHostname }
      : { cnameTarget: process.env.CLOUDFLARE_ORIGIN_HOST || baseDomain },
  });
}

async function cloudflareRequest(method: string, requestPath: string, body?: any): Promise<any> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new BadRequestError('Cloudflare API token is not configured.');
  const payload = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'api.cloudflare.com',
      port: 443,
      method,
      path: requestPath,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(payload.length ? { 'Content-Length': String(payload.length) } : {}),
      },
      timeout: 12000,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300 || parsed.success === false) {
            reject(new Error(parsed.errors?.[0]?.message || `Cloudflare API error ${response.statusCode || 0}`));
            return;
          }
          resolve(parsed);
        } catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Cloudflare API timed out')));
    request.on('error', reject);
    if (payload.length) request.write(payload);
    request.end();
  });
}

export async function provisionManagedDomain(req: Request, res: Response): Promise<Response> {
  const school = await getManagedSchool(req, req.body?.schoolId || req.query.schoolId);
  if (school.customDomain) throw new BadRequestError('Custom domains must be configured at the domain owner DNS provider.');

  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const origin = process.env.CLOUDFLARE_ORIGIN_HOST;
  if (!zoneId || !origin || !process.env.CLOUDFLARE_API_TOKEN) {
    throw new BadRequestError('Cloudflare DNS automation is not configured on the server.');
  }

  const baseDomain = (process.env.BASE_DOMAIN || 'sahaledu.com').toLowerCase();
  const hostname = `${school.subdomain || school.slug}.${baseDomain}`;
  const encoded = encodeURIComponent(hostname);
  const existing = await cloudflareRequest('GET', `/client/v4/zones/${zoneId}/dns_records?type=CNAME&name=${encoded}`);
  const record = existing.result?.[0];
  const payload = { type: 'CNAME', name: hostname, content: origin, ttl: 1, proxied: true };

  if (record?.id) {
    await cloudflareRequest('PUT', `/client/v4/zones/${zoneId}/dns_records/${record.id}`, payload);
  } else {
    await cloudflareRequest('POST', `/client/v4/zones/${zoneId}/dns_records`, payload);
  }
  return ApiResponse.success(res, { hostname, target: origin }, 'Managed domain provisioned in Cloudflare.');
}

function requestHost(req: Request): string {
  return (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim().replace(/:\d+$/, '').toLowerCase();
}

export async function getSitemap(req: Request, res: Response): Promise<void> {
  const school = await currentTenantSchool(req);
  if (!school) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  const config = await WebsiteConfig.findOne({ school: school._id, isPublished: true }).select('published updatedAt').lean();
  if (!config?.published) {
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    return;
  }
  const site = normalizeSite(config.published, school);
  const host = requestHost(req);
  const base = `https://${host}`;
  const lastmod = (config.updatedAt || new Date()).toISOString();
  const urls = site.pages.map((page) => {
    const loc = page.slug ? `${base}/${page.slug}` : base + '/';
    return `<url><loc>${loc.replace(/&/g, '&amp;')}</loc><lastmod>${lastmod}</lastmod></url>`;
  }).join('');
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
}

export async function getRobots(req: Request, res: Response): Promise<void> {
  const school = await currentTenantSchool(req);
  if (!school) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  const host = requestHost(req);
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /student/\nDisallow: /teacher/\nSitemap: https://${host}/sitemap.xml\n`);
}
