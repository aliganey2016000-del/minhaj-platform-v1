/**
 * Tenant Context — Multi-Tenant Branding Provider
 *
 * On mount, parses the subdomain from `window.location.hostname`, fetches
 * the tenant's branding data, and stores it globally for dynamic theming.
 *
 * Usage:
 *   Wrap your app with <TenantProvider> (already done in App.tsx).
 *   import { useTenant } from '../store/tenant-context';
 *   const { tenant, isLoading, isMainSite, error } = useTenant();
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /** Full tenant data, or null while loading / on main site with no tenant */
  tenant: TenantData | null;
  /** True while the initial branding fetch is in progress */
  isLoading: boolean;
  /** Convenience: true when we're on the root domain / www / localhost */
  isMainSite: boolean;
  /** Error message if the subdomain is invalid / tenant not found */
  error: string | null;
  /** The subdomain extracted from the URL, or null if on main site */
  subdomain: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_BRANDING: TenantBranding = {
  logo: '',
  themeColor: '#0d9488', // emerald-600
};

/**
 * Extracts the subdomain from the current hostname.
 * Returns null for localhost, IP addresses, root domain, or www.
 */
function extractSubdomain(hostname: string): string | null {
  // localhost or IP address → main site
  if (
    hostname === 'localhost' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  ) {
    return null;
  }

  const parts = hostname.split('.');

  // Single-part or two-part (e.g., example.com) → main site
  if (parts.length <= 2) return null;

  const sub = parts[0].toLowerCase();

  // www → main site
  if (sub === 'www') return null;

  return sub;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface TenantProviderProps {
  children: ReactNode;
}

export function TenantProvider({ children }: TenantProviderProps) {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subdomain = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return extractSubdomain(window.location.hostname);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchTenant() {
      setError(null);
      setIsLoading(true);

      try {
        if (!subdomain) {
          // Main site — use default branding
          if (!cancelled) {
            setTenant({
              isMainSite: true,
              slug: '',
              name: 'Sahal Education Platform',
              institutionType: 'school',
              branding: DEFAULT_BRANDING,
            });
          }
          return;
        }

        const { data } = await api.get(`/tenant/${subdomain}/branding`);

        if (!cancelled) {
          setTenant({
            isMainSite: false,
            slug: data.data?.slug || subdomain,
            name: data.data?.name || '',
            institutionType: data.data?.institutionType || data.data?.organizationType || 'school',
            branding: data.data?.branding || DEFAULT_BRANDING,
            portalUrl: data.data?.portalUrl,
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          const status = err.response?.status;
          if (status === 404) {
            setError(
              `Portal "${subdomain}" not found. The organization you are trying to reach does not exist or has been deactivated.`
            );
          } else {
            setError(
              err.response?.data?.message || 'Failed to load portal branding. Please try again.'
            );
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchTenant();

    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  const value: TenantContextValue = {
    tenant,
    isLoading,
    isMainSite: !subdomain || tenant?.isMainSite === true,
    error,
    subdomain,
  };

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

export default TenantContext;