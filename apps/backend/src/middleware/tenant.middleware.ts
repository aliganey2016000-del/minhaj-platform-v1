/**
 * Tenant Middleware — Multi-Tenant Subdomain Resolution
 *
 * Extracts the subdomain from the request `Host` header, looks up the
 * corresponding organization, and attaches it to `req.tenant`.
 *
 * Behavior:
 *   - localhost / IP address / root domain / www → no tenant (main site)
 *   - Valid subdomain → attaches `req.tenant` with { slug, name, branding }
 *   - Invalid / unknown subdomain → returns 404 JSON error
 *
 * This middleware should be applied globally so every route can access
 * `req.tenant` to provide tenant-scoped behavior or branding.
 */

import { Request, Response, NextFunction } from 'express';
import School, { TenantBranding } from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { requestHostname } from '../utils/request-tenant';

// ---------------------------------------------------------------------------
// Augment Express Request
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantBranding | null;
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Resolves the current tenant from the Host header.
 *
 * - On localhost / IP / root domain / www: `req.tenant` is set to `null`
 *   (main marketing site — no tenant-specific behavior).
 * - On a recognized active subdomain: `req.tenant` is populated.
 * - On an unrecognized subdomain: returns a 404 JSON error.
 */
export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // The frontend proxies API requests through the backend's public host,
    // so the visitor-facing organization hostname must survive every proxy
    // hop. X-Tenant-Host is our stable application header; X-Forwarded-Host
    // remains a compatibility fallback for older deployments/direct proxies.
    // Both are honoured only from our own proxy once TENANT_PROXY_KEY is set
    // (see utils/request-tenant.ts), so a direct caller cannot pick a tenant.
    // This is intentionally generic: any school subdomain (foo.<base-domain>)
    // or exact custom domain can resolve without school-specific code.
    const hostname = requestHostname(req);

    // Fast-path: localhost or IP → main site (no tenant lookup)
    if (
      hostname === 'localhost' ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
    ) {
      req.tenant = null;
      return next();
    }

    // The platform's own root/www domain is always the main marketing
    // site — never a tenant lookup, even though a bare org customDomain
    // (e.g. "yourschool.edu") has the same two-label shape.
    const baseDomain = (process.env.BASE_DOMAIN || 'sahaledu.com').toLowerCase();
    if (hostname === baseDomain || hostname === `www.${baseDomain}`) {
      req.tenant = null;
      return next();
    }

    // Look up tenant by custom domain, then by slug/subdomain.
    const tenant = await School.findByHost(hostname);

    if (!tenant) {
      // Unrecognized subdomain or custom domain — return 404
      ApiResponse.error(
        res,
        404,
        'Portal not found. The organization you are trying to reach does not exist or has been deactivated.'
      );
      return; // void return — response already sent
    }

    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

export default tenantMiddleware;