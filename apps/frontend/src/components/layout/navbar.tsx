/**
 * Navbar Component — Premium SaaS Navigation
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../shared/language-switcher';
import { ThemeToggle } from '../shared/theme-toggle';

const BRAND_NAME = 'Sahal Education Platform';

export function Navbar() {
  const { t } = useTranslation('landing');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { pathname } = useLocation();

  const navLinks = [
    {
      href: '/#features',
      label: t('nav.features'),
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      ),
    },
    {
      href: '/#audience',
      label: t('nav.solutions'),
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    {
      href: '/#multitenant',
      label: t('nav.architecture'),
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19h16M4 5h16M4 12h16" />
        </svg>
      ),
    },
    {
      href: '/#pricing',
      label: t('nav.pricing'),
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1l3 5 5 .7-3.8 3.7.9 5.1L12 14.5 6.9 15.8l.9-5.1L4 6.7 9 6z" />
        </svg>
      ),
    },
    {
      href: '/#faq',
      label: t('nav.faq'),
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 17h.01M12 13a3 3 0 10-3-3" />
          <path d="M12 2a10 10 0 110 20 10 10 0 010-20z" />
        </svg>
      ),
    },
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
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 bg-gradient-to-r from-[#081a33] via-[#0c1f43] to-[#081a33] shadow-xl shadow-slate-950/20`}
      >
        <nav className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 bg-transparent backdrop-blur-xl border-b border-white/15">
          <Link to="/" className="flex items-center gap-3 flex-shrink-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-500 text-white shadow-xl shadow-sky-500/20">
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5zm0 17.5c-4.2-1.4-8-4.93-8-9V8.81l8-4 8 4V10.5c0 4.07-3.8 7.6-8 9z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <span className="hidden text-lg font-bold text-white sm:block">
              {BRAND_NAME}
            </span>
          </Link>

          <div className="hidden lg:flex lg:items-center lg:gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium text-white transition-all hover:bg-white/10 hover:text-white"
              >
                {link.icon}
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Desktop actions */}
            <div className="hidden lg:flex lg:items-center lg:gap-2 lg:flex-shrink-0">
              <LanguageSwitcher />
              <ThemeToggle />
              <Link
                to="/auth/login"
                className="ms-3 inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/20 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 21h-6a2 2 0 01-2-2V5a2 2 0 012-2h6a2 2 0 012 2v14a2 2 0 01-2 2z" />
                  <path d="M12 7v4" />
                  <path d="M12 15h.01" />
                </svg>
                {t('nav.sign_in')}
              </Link>
              <Link
                to="/auth/register"
                className="ms-2 inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                {t('nav.start_free')}
              </Link>
            </div>

            {/* Tablet actions — CTAs (medium screens only) + language + theme + hamburger */}
            <div className="hidden sm:flex lg:hidden items-center gap-2 flex-nowrap">
              <Link
                to="/auth/login"
                className="flex-shrink-0 rounded-lg whitespace-nowrap min-w-max bg-slate-900/80 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                {t('nav.sign_in')}
              </Link>
              <Link
                to="/auth/register"
                className="flex-shrink-0 rounded-lg whitespace-nowrap min-w-max bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
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
              className="ms-1 rounded-lg p-2 text-white hover:bg-white/10 lg:hidden"
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
              className="fixed top-0 right-0 bottom-0 z-50 w-80 max-w-[85vw] bg-[#071428] shadow-2xl shadow-slate-950/40 lg:hidden"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <span className="text-lg font-bold text-white">{BRAND_NAME}</span>
                  <button
                    onClick={() => setIsMobileOpen(false)}
                    className="rounded-lg p-2 text-white hover:bg-white/10 transition-colors"
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
                          className="flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-slate-100 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          {link.icon}
                          {link.label}
                        </a>
                      </motion.li>
                    ))}
                  </ul>
                </nav>

                <div className="border-t border-white/10 p-4 space-y-3">
                  <Link
                    to="/auth/login"
                    onClick={() => setIsMobileOpen(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-base font-semibold text-white transition-all hover:bg-white/10"
                  >
                    {t('nav.sign_in')}
                  </Link>
                  <Link
                    to="/auth/register"
                    onClick={() => setIsMobileOpen(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-sky-500/20 transition-all hover:shadow-xl"
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