/**
 * Public Layout
 *
 * The Sahal marketing site uses the global Navbar/Footer. A resolved tenant
 * website owns its complete chrome (header through footer), so those wrappers
 * are intentionally omitted on organization domains.
 */
import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Navbar } from './navbar';
import { Footer } from './footer';
import { useTenant } from '../../store/tenant-context';

export function PublicLayout() {
  const { pathname } = useLocation();
  const { tenant, isLoading } = useTenant();
  const tenantWebsite = !isLoading && tenant?.isMainSite === false;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);

  if (tenantWebsite) {
    return (
      <div className="min-h-screen bg-white">
        <main className="min-h-screen"><Outlet /></main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface-primary)]">
      <Navbar />
      <main className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}

export default PublicLayout;
