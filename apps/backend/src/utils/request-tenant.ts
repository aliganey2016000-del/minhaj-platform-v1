/**
 * Resolves the school whose website a request came through.
 *
 * The frontend's nginx forwards the visitor-facing host as X-Tenant-Host.
 * That header is only meaningful when it really came from our own proxy: a
 * client calling the API host directly could otherwise name any school's
 * domain and step around the domain-login control (an account may only sign
 * in on its own school's site). When TENANT_PROXY_KEY is set, the proxy also
 * sends X-Sahal-Proxy-Key and the tenant headers are honoured only when that
 * key matches; every other request is treated as arriving on its Host.
 */

import crypto from 'crypto';
import { Request } from 'express';
import School from '../models/school.model';
import { isPlatformInfrastructureHost } from './platform-domains';

export const PROXY_KEY_HEADER = 'x-sahal-proxy-key';

let warnedUnset = false;

/** The configured proxy key, or '' when tenant headers are trusted from anyone (legacy). */
function proxyKey(): string {
  const key = String(process.env.TENANT_PROXY_KEY || '');
  if (!key && !warnedUnset) {
    warnedUnset = true;
    console.warn('[SECURITY] TENANT_PROXY_KEY is not set: X-Tenant-Host / X-Forwarded-Host are trusted from every caller. Set the same TENANT_PROXY_KEY on the backend and the frontend proxy.');
  }
  return key;
}

/**
 * True when TENANT_PROXY_KEY is configured and this request carries it in
 * X-Sahal-Proxy-Key (constant-time comparison).
 */
export function isTrustedProxyRequest(req: Pick<Request, 'headers'>): boolean {
  const key = proxyKey();
  if (!key) return false;
  const raw = req.headers[PROXY_KEY_HEADER];
  const presented = Array.isArray(raw) ? raw[0] : raw;
  if (typeof presented !== 'string' || !presented) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(key, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * The visitor-facing host of this request (port stripped, lower-cased).
 *
 * X-Tenant-Host and X-Forwarded-Host are honoured only from our own proxy
 * (see isTrustedProxyRequest). Without TENANT_PROXY_KEY the legacy
 * behaviour — trusting them from anyone — is kept, with one startup warning.
 */
export function requestHostname(req: Request): string {
  const trustForwarded = !proxyKey() || isTrustedProxyRequest(req);
  const host = (
    (trustForwarded ? (req.get('x-tenant-host') || req.get('x-forwarded-host')) : '') ||
    req.get('host') ||
    ''
  ).split(',')[0].trim();
  return host.replace(/:\d+$/, '').toLowerCase();
}

/**
 * The school whose website this request came through, or null on the
 * platform's own domain (and on hosts that are not a school).
 */
export async function requestTenantSchool(req: Request): Promise<{ _id: string; name: string } | null> {
  const hostname = requestHostname(req);
  if (!hostname || isPlatformInfrastructureHost(hostname)) return null;
  const tenant: any = await School.findByHost(hostname).catch(() => null);
  return tenant?._id ? { _id: tenant._id.toString(), name: tenant.name } : null;
}
