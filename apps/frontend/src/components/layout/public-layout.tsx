/**
 * Public Layout
 *
 * Wraps all public-facing pages with the global Navbar and Footer.
 * Provides scroll-aware glass morphism effects.
 */

import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Navbar } from './navbar';
import { Footer } from './footer';

export function PublicLayout() {
  const { pathname } = useLocation();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface-primary)]">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default PublicLayout;