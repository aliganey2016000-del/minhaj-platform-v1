/**
 * Tenant Context — resolves the active organization from the real request host.
 *
 * The backend is authoritative so both platform subdomains and fully custom
 * domains work the same way. This avoids treating a two-label custom domain
 * (for example school.edu) as the main Sahal marketing site.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import api from '../lib/axios';

import { isPlatformRootHostname, primaryPlatformDomain } from '../lib/platform-domains';

export interface TenantBranding {
  logo?: string;
  themeColor?: string;
}

export interface TenantData {
  isMainSite: boolean;
  slug: string;
  name: string;
  institutionType: string;
  branding: TenantBranding;
  portalUrl?: string;
}

interface TenantContextValue {
  tenant: TenantData | null;
  isLoading: boolean;
  isMainSite: boolean;
  error: string | null;
  /** True when /tenant/current got no response at all (offline / no real internet). */
  unreachable: boolean;
  subdomain: string | null;
}

const DEFAULT_BRANDING: TenantBranding = {
  logo: '',
  themeColor: '#0d9488',
};

function extractSubdomain(hostname: string): string | null {
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
  const parts = hostname.split('.');
  if (parts.length <= 2 || parts[0].toLowerCase() === 'www') return null;
  return parts[0].toLowerCase();
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

// Offline branding is public tenant metadata, not an authorization decision.
// Key by exact hostname; only a verified, non-expired teacher device may
// use it while the backend is unreachable.
const cacheKey = (host: string) => 'sahal-offline-tenant:' + host;
function getOfflineTenant(host: string): TenantData | null {
  // Public branding is not an authorization boundary: PIN selection needs it before login.
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey(host)) || 'null');
    if (stored?.hostname !== host || stored?.expiresAt < Date.now() || !stored?.tenant ||
        stored.tenant.isMainSite === true) return null;
    return stored.tenant as TenantData;
  } catch { return null; }
}


export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const hostname = useMemo(
    () => typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase(),
    [],
  );
  const subdomain = useMemo(() => extractSubdomain(hostname), [hostname]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError(null);
      setUnreachable(false);
      setIsLoading(true);

      // The platform root domain is always the Sahal marketing website.
      // Resolve it locally instead of depending on /tenant/current, because
      // reverse proxies may rewrite forwarded host headers before the API
      // receives the request. Tenant subdomains/custom domains still use the
      // authoritative backend resolver below.
      const baseDomain = primaryPlatformDomain();
      const normalizedHost = hostname.replace(/^www\./, '');
      const isLocalMainHost =
        isPlatformRootHostname(normalizedHost) ||
        normalizedHost === 'localhost' ||
        /^\d+\.\d+\.\d+\.\d+$/.test(normalizedHost);

      if (isLocalMainHost) {
        if (!cancelled) {
          setTenant({
            isMainSite: true,
            slug: '',
            name: 'Sahal Education Platform',
            institutionType: 'platform',
            branding: DEFAULT_BRANDING,
            portalUrl: baseDomain,
          });
          setIsLoading(false);
        }
        return;
      }

      const cached = getOfflineTenant(hostname);
      if (!navigator.onLine && cached) {
        if (!cancelled) { setTenant(cached); setIsLoading(false); }
        return;
      }

      try {
        const { data } = await api.get('/tenant/current');
        if (cancelled) return;
        const value = data.data || {};
        const resolved: TenantData = {
          isMainSite: value.isMainSite === true,
          slug: value.slug || '',
          name: value.name || 'Sahal Education Platform',
          institutionType: value.institutionType || value.organizationType || 'school',
          branding: value.branding || DEFAULT_BRANDING,
          portalUrl: value.portalUrl,
        };
        setTenant(resolved);
        if (!resolved.isMainSite) {
          try { localStorage.setItem(cacheKey(hostname), JSON.stringify({
            hostname, tenant: resolved, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          })); } catch { /* storage disabled */ }
        }
      } catch (err: any) {
        if (cancelled) return;
        const status = err.response?.status;
        // Never use a cached tenant after an explicit server rejection.
        if (!status && cached) { setTenant(cached); return; }
        setTenant(null);
        setUnreachable(!err.response);
        setError(
          status === 404
            ? `Portal "${hostname}" not found. The organization does not exist or has been deactivated.`
            : err.response?.data?.message || 'Failed to load portal branding. Please try again.',
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [hostname]);

  const value: TenantContextValue = {
    tenant,
    isLoading,
    isMainSite: tenant?.isMainSite === true,
    error,
    unreachable,
    subdomain,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (context === undefined) throw new Error('useTenant must be used within a TenantProvider');
  return context;
}

export default TenantContext;
