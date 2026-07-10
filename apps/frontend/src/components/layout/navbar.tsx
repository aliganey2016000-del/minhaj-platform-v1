/**
 * Navbar Component — Premium SaaS Navigation
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../shared/language-switcher';
import { ThemeToggle } from '../shared/theme-toggle';

const BRAND_NAME = 'EduRaah';

export function Navbar() {
  const { t } = useTranslation('landing');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { pathname } = useLocation();

  const navLinks = [
    { href: '/#features', label: t('nav.features') },
    { href: '/#audience', label: t('nav.solutions') },
    { href: '/#multitenant', label: t('nav.architecture') },
    { href: '/#pricing', label: t('nav.pricing') },
    { href: '/#faq', label: t('nav.faq') },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOpen]);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsMobileOpen(false);
  }, []);
  useEffect(() => {
    if (isMobileOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, handleKeyDown]);

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
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25">
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5zm0 17.5c-4.2-1.4-8-4.93-8-9V8.81l8-4 8 4V10.5c0 4.07-3.8 7.6-8 9z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <span className="hidden text-lg font-bold text-gray-900 dark:text-white sm:block">
              {BRAND_NAME}
            </span>
          </Link>

          <div className="hidden lg:flex lg:items-center lg:gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="link-underline rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Desktop actions */}
            <div className="hidden lg:flex lg:items-center lg:gap-1">
              <LanguageSwitcher />
              <ThemeToggle />
              <Link
                to="/auth/login"
                className="ml-3 inline-flex items-center gap-1.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-transparent px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 transition-all hover:bg-gray-50 dark:hover:bg-obsidian-700 active:scale-[0.98]"
              >
                {t('nav.sign_in')}
              </Link>
              <Link
                to="/auth/register"
                className="ml-2 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
              >
                {t('nav.start_free')}
              </Link>
            </div>

            {/* Tablet actions — CTAs (medium screens only) + language + theme + hamburger */}
            <div className="hidden sm:flex lg:hidden items-center gap-1">
              <Link
                to="/auth/login"
                className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-obsidian-700 transition-colors"
              >
                {t('nav.sign_in')}
              </Link>
              <Link
                to="/auth/register"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                {t('nav.start_free')}
              </Link>
              <LanguageSwitcher />
              <ThemeToggle />
            </div>

            {/* Phone actions — only language + theme + hamburger (CTAs inside drawer) */}
            <div className="flex sm:hidden items-center gap-0.5">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>

            <button
              onClick={() => setIsMobileOpen(true)}
              className="ml-1 rounded-lg p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-obsidian-700 lg:hidden"
              aria-label="Menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-80 max-w-[85vw] bg-white dark:bg-obsidian-900 shadow-2xl lg:hidden"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{BRAND_NAME}</span>
                  <button
                    onClick={() => setIsMobileOpen(false)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-obsidian-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

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
                          className="flex items-center rounded-xl px-4 py-3 text-base font-medium text-gray-600 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-obsidian-700 hover:text-gray-900 dark:hover:text-white"
                        >
                          {link.label}
                        </a>
                      </motion.li>
                    ))}
                  </ul>
                </nav>

                <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
                  <Link
                    to="/auth/login"
                    onClick={() => setIsMobileOpen(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 px-6 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 transition-all hover:bg-gray-50 dark:hover:bg-obsidian-700"
                  >
                    {t('nav.sign_in')}
                  </Link>
                  <Link
                    to="/auth/register"
                    onClick={() => setIsMobileOpen(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-md transition-all hover:shadow-lg"
                  >
                    {t('nav.start_free')}
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