/**
 * Allowed CORS origins — CLIENT_URL accepts a comma-separated list so the
 * platform can serve more than one frontend origin (e.g. the main
 * sahaledu.com deployment plus a fully separate custom domain some
 * organizations use), not just a single hardcoded URL.
 */

import { getBaseDomain } from './tenant-host';

export function getAllowedOrigins(): string[] {
  const raw = process.env.CLIENT_URL || 'http://localhost:5173';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Tenant origins are registered in the same directory used for host routing. */
export async function isAllowedOrigin(origin?: string): Promise<boolean> {
  if (!origin || getAllowedOrigins().includes(origin)) return true;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (url.protocol !== 'https:' || url.origin !== origin || url.port || url.username || url.password) return false;
  const base = getBaseDomain();
  if (url.hostname === base || url.hostname === `www.${base}`) return true;
  const { default: School } = await import('../models/school.model');
  return Boolean(await School.findByHost(url.hostname));
}
