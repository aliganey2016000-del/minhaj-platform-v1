/**
 * Public Routes Configuration
 */
import { lazy, Suspense } from 'react';
import { type RouteObject } from 'react-router-dom';
import { PublicLayout } from '../components/layout/public-layout';
import { useTenant } from '../store/tenant-context';

const LandingPage = lazy(() => import('../features/public/pages/landing').then((m) => ({ default: m.LandingPage })));
const SuganhubLandingPage = lazy(() => import('../features/public/pages/suganhub-landing').then((m) => ({ default: m.SuganhubLandingPage })));
const TenantWebsitePage = lazy(() => import('../features/public/pages/tenant-website').then((m) => ({ default: m.TenantWebsitePage })));

const CUSTOM_DOMAIN_LANDING: Record<string, typeof SuganhubLandingPage> = { 'suganhub.com': SuganhubLandingPage };

function PageLoader() {
  return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]"><div className="flex flex-col items-center gap-4"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /><p className="text-sm text-[var(--color-text-tertiary)]">Loading...</p></div></div>;
}

function HomePage() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname.replace(/^www\./, '') : '';
  const CustomLanding = CUSTOM_DOMAIN_LANDING[hostname];
  const { isMainSite, isLoading, error } = useTenant();
  const baseDomain = String(import.meta.env.VITE_BASE_DOMAIN || 'sahaledu.com')
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .toLowerCase();

  if (CustomLanding) return <CustomLanding />;

  // sahaledu.com is the platform marketing landing page, never a tenant
  // website. Keep this independent from tenant API/proxy resolution.
  if (hostname === baseDomain || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return <LandingPage />;
  }

  if (isLoading) return <PageLoader />;
  if (error) return <TenantWebsitePage />;
  return isMainSite ? <LandingPage /> : <TenantWebsitePage />;
}

const lazyPage = (element: JSX.Element) => <Suspense fallback={<PageLoader />}>{element}</Suspense>;

export const publicRoutes: RouteObject[] = [
  {
    element: <Suspense fallback={<PageLoader />}><PublicLayout /></Suspense>,
    children: [
      { index: true, element: lazyPage(<HomePage />) },
      { path: ':pageSlug', element: lazyPage(<TenantWebsitePage />) },
    ],
  },
];
