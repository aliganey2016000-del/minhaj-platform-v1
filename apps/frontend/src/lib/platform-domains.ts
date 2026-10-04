function cleanDomain(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
    .replace(/\/$/, '');
}

export function platformDomains(): string[] {
  const primary = cleanDomain(import.meta.env.VITE_BASE_DOMAIN || 'sahaledu.com');
  const aliases = String(import.meta.env.VITE_PLATFORM_DOMAINS || '')
    .split(',')
    .map(cleanDomain)
    .filter(Boolean);
  return [...new Set([primary, ...aliases])];
}

export function isPlatformRootHostname(hostname: string): boolean {
  const normalized = cleanDomain(hostname);
  return platformDomains().includes(normalized);
}

export function primaryPlatformDomain(): string {
  return platformDomains()[0] || 'sahaledu.com';
}
