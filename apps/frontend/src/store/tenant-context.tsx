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

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hostname = useMemo(
    () => typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase(),
    [],
  );
  const subdomain = useMemo(() => extractSubdomain(hostname), [hostname]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError(null);
      setIsLoading(true);
      try {
        const { data } = await api.get('/tenant/current');
        if (cancelled) return;
        const value = data.data || {};
        setTenant({
          isMainSite: value.isMainSite === true,
          slug: value.slug || '',
          name: value.name || 'Sahal Education Platform',
          institutionType: value.institutionType || value.organizationType || 'school',
          branding: value.branding || DEFAULT_BRANDING,
          portalUrl: value.portalUrl,
        });
      } catch (err: any) {
        if (cancelled) return;
        setTenant(null);
        const status = err.response?.status;
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
