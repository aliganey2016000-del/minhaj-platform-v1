/**
 * Tenant Public Routes
 *
 * Mounted at /api/v1/tenant
 * These routes are PUBLIC — no authentication required.
 * Used by the frontend to fetch tenant branding by slug for
 * dynamic per-organization theming.
 */

import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { tenantMiddleware } from '../../middleware/tenant.middleware';
import { getBrandingBySlug, getCurrentBranding, getManifest } from '../../controllers/tenant.controller';

const router = Router();

// GET /api/v1/tenant/:slug/branding — public branding data by slug
router.get('/:slug/branding', asyncHandler(getBrandingBySlug));

// GET /api/v1/tenant/current — resolve current tenant from Host header
router.get('/current', tenantMiddleware, asyncHandler(getCurrentBranding));

// GET /api/v1/tenant/manifest.webmanifest — per-org PWA install manifest
router.get('/manifest.webmanifest', tenantMiddleware, asyncHandler(getManifest));

export default router;