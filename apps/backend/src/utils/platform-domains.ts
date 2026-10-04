/**
 * Platform base-domain helpers.
 *
 * BASE_DOMAIN remains the primary/legacy managed domain used when generating
 * new URLs and Cloudflare records. PLATFORM_DOMAINS adds aliases that must
 * resolve the same tenants (for example during a zero-downtime migration from
 * sahaledu.com to schoolapp.so).
 */

function cleanDomain(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
    .replace(/\/$/, '');
}

export function primaryPlatformDomain(): string {
  return cleanDomain(process.env.BASE_DOMAIN || 'sahaledu.com');
}

export function platformDomains(): string[] {
  const configured = String(process.env.PLATFORM_DOMAINS || '')
    .split(',')
    .map(cleanDomain)
    .filter(Boolean);
  return [...new Set([primaryPlatformDomain(), ...configured])];
}

export function isPlatformRootHost(host: string): boolean {
  const hostname = cleanDomain(host);
  return platformDomains().includes(hostname);
}

export function isPlatformInfrastructureHost(host: string): boolean {
  const hostname = String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
  return platformDomains().some(
    (domain) => hostname === domain || hostname === `www.${domain}` || hostname === `api.${domain}`,
  );
}

/**
 * Return the single tenant label from <tenant>.<platform-domain>.
 * Nested hosts (x.tenant.domain) and reserved www/api roots are rejected.
 */
export function managedTenantLabel(host: string): string | null {
  const hostname = String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
  for (const domain of platformDomains()) {
    const suffix = `.${domain}`;
    if (!hostname.endsWith(suffix)) continue;
    const label = hostname.slice(0, -suffix.length);
    if (
      !label ||
      label === 'www' ||
      label === 'api' ||
      label.includes('.') ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)
    ) return null;
    return label;
  }
  return null;
}
