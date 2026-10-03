/**
 * Host helpers shared by the public site, navbar, footer and tenant context.
 *
 * Single source of truth for the platform base domain and for the few
 * domains that ship a hand-built landing page instead of the generic
 * organization website. Add a domain to `CUSTOM_SITE_HOSTS` rather than
 * scattering hostname checks through components.
 */

export const BASE_DOMAIN = String(import.meta.env.VITE_BASE_DOMAIN || 'sahaledu.com')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .replace(/:\d+$/, '')
  .replace(/\/$/, '');

/** Hand-built branded sites, keyed by hostname without `www.`. */
export type CustomSiteKey = 'suganhub';
export const CUSTOM_SITE_HOSTS: Record<string, CustomSiteKey> = {
  'suganhub.com': 'suganhub',
};

/** Current hostname, lower-cased and without a leading `www.`. */
export function currentHostname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname.toLowerCase().replace(/^www\./, '');
}

export function currentCustomSite(): CustomSiteKey | null {
  return CUSTOM_SITE_HOSTS[currentHostname()] ?? null;
}

export function isLocalOrIpHost(hostname: string): boolean {
  return hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

/**
 * The organization label of `<label>.<base-domain>`, or null for the root /
 * www host, localhost, IPs, nested labels and external (custom) domains.
 */
export function extractSubdomain(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (isLocalOrIpHost(host)) return null;
  const suffix = `.${BASE_DOMAIN}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!label || label === 'www' || label.includes('.')) return null;
  return label;
}
