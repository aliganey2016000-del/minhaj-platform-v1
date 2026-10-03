/**
 * Resolves the school whose website a request came through.
 */

import { Request } from 'express';
import School from '../models/school.model';

/**
 * The school whose website this request came through, or null on the
 * platform's own domain (and on hosts that are not a school). The frontend's
 * nginx forwards the visitor-facing host as X-Tenant-Host.
 */
export async function requestTenantSchool(req: Request): Promise<{ _id: string; name: string } | null> {
  const host = (req.get('x-tenant-host') || req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  const baseDomain = String(process.env.BASE_DOMAIN || 'sahaledu.com').toLowerCase();
  if (!hostname || hostname === baseDomain || hostname === `www.${baseDomain}` || hostname === `api.${baseDomain}`) return null;
  const tenant: any = await School.findByHost(hostname).catch(() => null);
  return tenant?._id ? { _id: tenant._id.toString(), name: tenant.name } : null;
}

