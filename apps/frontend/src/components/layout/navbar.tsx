/**
 * Navbar Component
 *
 * Premium sticky glassmorphism navigation bar with:
 * - Desktop menu links with link-underline hover effects
 * - Language selector (EN/SO/AR)
 * - Dark/Light theme toggle
 * - "Portal Login" CTA button
 * - Animated mobile drawer (Framer Motion) with backdrop
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { LanguageSwitcher } from '../shared/language-switcher';
import { ThemeToggle } from '../shared/theme-toggle';

// ---------------------------------------------------------------------------
// Navigation Links
// ---------------------------------------------------------------------------

const navLinks = [
  { href: '/#home', labelKey: 'home' },
  { href: '/#about', labelKey: 'about' },
  { href: '/#programs', labelKey: 'programs' },
  { href: '/#courses', labelKey: 'courses' },
  { href: '/#events', labelKey: 'events' },
  { href: '/#contact', labelKey: 'contact' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Navbar() {
  const { t } = useTranslation('common');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { pathname } = useLocation();

  // ------------------------------------------------------------------
  // Scroll detection for glass morphism
  // ------------------------------------------------------------------

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ------------------------------------------------------------------
  // Lock body scroll when mobile drawer is open
  // ------------------------------------------------------------------

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOpen]);

  // Close mobile on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsMobileOpen(false);
  }, []);
  useEffect(() => {
    if (isMobileOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, handleKeyDown]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 ${
          isScrolled
            ? 'glass shadow-glass-light dark:shadow-glass-dark'
            : 'bg-transparent'
        }`}
      >
        <nav className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* ── Logo ── */}
          <Link
            to="/"
            className="flex items-center gap-2.5 flex-shrink-0"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-gold-sm">
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5zm0 17.5c-4.2-1.4-8-4.93-8-9V8.81l8-4 8 4V10.5c0 4.07-3.8 7.6-8 9z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <span className="hidden text-lg font-bold text-[var(--color-text-primary)] sm:block">
              {t('site_name')}
            </span>
          </Link>

          {/* ── Desktop Navigation ── */}
          <div className="hidden lg:flex lg:items-center lg:gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="link-underline rounded-lg px-3.5 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                {t(link.labelKey)}
              </a>
            ))}
          </div>

          {/* ── Right Side Actions ── */}
          <div className="flex items-center gap-1.5">
            {/* Desktop actions */}
            <div className="hidden lg:flex lg:items-center lg:gap-1">
              <LanguageSwitcher />
              <ThemeToggle />
              <Link
                to="/auth/login"
                className="ml-3 inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary-600/20 transition-all hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-600/30 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {t('portal_login')}
              </Link>
            </div>

            {/* Mobile actions */}
            <div className="flex items-center gap-0.5 lg:hidden">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setIsMobileOpen(true)}
              className="ml-1 rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] lg:hidden"
              aria-label={t('menu')}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </nav>
      </header>

      {/* ── Mobile Drawer (Framer Motion) ── */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMobileOpen(false)}
            />

            {/* Drawer */}
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-80 max-w-[85vw] bg-[var(--color-surface-primary)] shadow-2xl lg:hidden"
            >
              <div className="flex h-full flex-col">
                {/* Drawer Header */}
                <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
                  <span className="text-lg font-bold text-[var(--color-text-primary)]">
                    {t('site_name')}
                  </span>
                  <button
                    onClick={() => setIsMobileOpen(false)}
                    className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                    aria-label={t('close')}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Drawer Nav Links */}
                <nav className="flex-1 overflow-y-auto px-4 py-6">
                  <ul className="space-y-1">
                    {navLinks.map((link, idx) => (
                      <motion.li
                        key={link.href}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <a
                          href={link.href}
                          onClick={() => setIsMobileOpen(false)}
                          className="flex items-center rounded-xl px-4 py-3 text-base font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
                        >
                          {t(link.labelKey)}
                        </a>
                      </motion.li>
                    ))}
                  </ul>
                </nav>

                {/* Drawer Footer CTA */}
                <div className="border-t border-[var(--color-border-subtle)] p-4">
                  <Link
                    to="/auth/login"
                    onClick={() => setIsMobileOpen(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-base font-semibold text-white shadow-md shadow-primary-600/20 transition-all hover:bg-primary-700"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {t('portal_login')}
                  </Link>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default Navbar;