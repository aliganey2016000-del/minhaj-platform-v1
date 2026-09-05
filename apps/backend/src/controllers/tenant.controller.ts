/**
 * Tenant Controller
 *
 * Public endpoints for tenant branding lookups.
 * No authentication required — used by the frontend for dynamic theming
 * based on the subdomain/slug.
 */

import { Request, Response } from 'express';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

// ---------------------------------------------------------------------------
// GET /api/v1/tenant/:slug/branding — Public branding by slug
// ---------------------------------------------------------------------------

export const getBrandingBySlug = async (req: Request, res: Response): Promise<Response> => {
  const { slug } = req.params;

  if (!slug || slug.length < 3) {
    throw new BadRequestError('Slug must be at least 3 characters');
  }

  const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (!SLUG_REGEX.test(slug)) {
    throw new BadRequestError('Slug may only contain lowercase letters, numbers, and hyphens');
  }

  const school = await School.findOne({ slug, status: 'active' })
    .select('slug name organizationType branding')
    .lean();

  if (!school) {
    throw new NotFoundError('Organization not found');
  }

  return ApiResponse.success(res, {
    slug: school.slug,
    name: school.name,
    organizationType: school.organizationType,
    branding: school.branding || {},
    portalUrl: `${school.slug}.${process.env.BASE_DOMAIN || 'sahaledu.com'}`,
  });
};

// ---------------------------------------------------------------------------
// GET /api/v1/tenant/current — Resolve from Host header
// ---------------------------------------------------------------------------

export const getCurrentBranding = async (req: Request, res: Response): Promise<Response> => {
  if (!req.tenant) {
    // No tenant detected in host header (root / www / localhost)
    return ApiResponse.success(res, {
      isMainSite: true,
      name: 'Sahal Education Platform',
      branding: {
        logo: '',
        themeColor: '#0d9488',
      },
    });
  }

  return ApiResponse.success(res, {
    isMainSite: false,
    ...req.tenant,
    portalUrl: `${process.env.BASE_DOMAIN || 'sahaledu.com'}`,
  });
};

// ---------------------------------------------------------------------------
// GET /api/v1/tenant/manifest.webmanifest — Per-org PWA install manifest
// ---------------------------------------------------------------------------

const DEFAULT_ICONS = [
  { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
  { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  { src: '/icons/pwa-180x180.png', sizes: '180x180', type: 'image/png', purpose: 'apple touch icon' },
];

/**
 * Served as the page's <link rel="manifest">, resolved per-tenant via the
 * same Host-header lookup as getCurrentBranding — so "Add to Home Screen"
 * on an org's own subdomain shows that org's name/logo instead of the
 * platform's. Must stay outside ApiResponse's {success,data} envelope: the
 * browser's install prompt reads this JSON directly, not through the app.
 */
export const getManifest = async (req: Request, res: Response): Promise<void> => {
  const tenant = req.tenant;
  const name = tenant?.name?.trim() || 'Sahal Education Platform';
  const shortName = name.length > 30 ? `${name.slice(0, 29)}…` : name;
  const themeColor = tenant?.branding?.themeColor || '#059669';
  const logo = tenant?.branding?.logo;

  res.set('Content-Type', 'application/manifest+json');
  res.set('Cache-Control', 'no-cache');
  res.json({
    name,
    short_name: shortName,
    description: tenant
      ? `${name} — Islamic education platform`
      : 'Barashada Diinta Islaamka — Learn Quran, Fiqh, Aqeedah & Arabic online',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: themeColor,
    orientation: 'any',
    scope: '/',
    lang: 'en',
    dir: 'ltr',
    categories: ['education', 'religious', 'productivity'],
    icons: logo
      ? [
          { src: logo, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: logo, sizes: '512x512', type: 'image/png', purpose: 'any' },
        ]
      : DEFAULT_ICONS,
  });
};