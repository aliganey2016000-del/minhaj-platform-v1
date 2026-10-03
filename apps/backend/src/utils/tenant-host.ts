/**
 * Shared host helpers for multi-tenant routing.
 *
 * One definition of "the platform base domain" and "a normalized hostname"
 * so the model, middleware, DNS automation and controllers cannot drift.
 */

import crypto from 'crypto';
import type { Request } from 'express';

/** Platform root domain (no scheme, no www., no port, no trailing slash). */
export function getBaseDomain(): string {
  return String(process.env.BASE_DOMAIN || 'sahaledu.com')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
    .replace(/\/$/, '');
}

/** Lower-cases a Host-style value, taking the first of a comma list and stripping the port. */
export function normalizeHostname(host: string | undefined | null): string {
  return String(host || '').split(',')[0].trim().replace(/:\d+$/, '').toLowerCase();
}

export function isLocalOrIpHost(hostname: string): boolean {
  return hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Resolves the visitor-facing hostname for a request.
 *
 * `X-Tenant-Host` / `X-Forwarded-Host` are only honoured when they come from
 * our own edge proxy. When `TENANT_PROXY_SECRET` is set, the proxy must also
 * send it in `X-Tenant-Proxy-Secret`; otherwise the forwarded headers are
 * ignored and the raw `Host` header is used. Without a configured secret the
 * legacy behaviour is kept (the edge nginx overwrites these headers).
 */
export function resolveRequestHost(req: Request): string {
  const secret = process.env.TENANT_PROXY_SECRET;
  const trusted = !secret || safeEqual(String(req.get('x-tenant-proxy-secret') || ''), secret);
  const raw = trusted
    ? req.get('x-tenant-host') || req.get('x-forwarded-host') || req.get('host')
    : req.get('host');
  return normalizeHostname(raw);
}

/** Random token used as the DNS TXT value that proves custom-domain ownership. */
export function generateDomainVerificationToken(): string {
  return `minhaj-verify-${crypto.randomBytes(16).toString('hex')}`;
}

/** DNS name under which the verification TXT record must be published. */
export function verificationRecordName(domain: string): string {
  return `_minhaj-verify.${domain}`;
}

/**
 * Canonical public origin for an organization: its custom domain once the
 * domain is verified (or grandfathered), otherwise the managed subdomain.
 */
export function portalUrlForSchool(school: {
  slug: string;
  subdomain?: string;
  customDomain?: string;
  customDomainVerified?: boolean;
}): string {
  if (school.customDomain && school.customDomainVerified !== false) {
    return `https://${school.customDomain}`;
  }
  return `https://${school.subdomain || school.slug}.${getBaseDomain()}`;
}
