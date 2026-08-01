/**
 * Navbar — "Emerald & Gold" landing navigation.
 *
 * Transparent over the emerald hero at the top, condensing into a solid
 * emerald glass bar once scrolled. Gold star brand mark, gold primary CTA.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../shared/language-switcher';
import { ThemeToggle } from '../shared/theme-toggle';
import { StarGlyph } from '../landing/_decor';

const isSuganhub = typeof window !== 'undefined' && window.location.hostname.replace(/^www\./, '') === 'suganhub.com';
const BRAND_NAME = isSuganhub ? 'Suganhub' : 'Sahal Education Platform';

export function Navbar() {
  const { t } = useTranslation('landing');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { pathname } = useLocation();

  const navLinks = isSuganhub
    ? [{ href: '/#programs', label: 'Programs' }]
    : [
        { href: '/#features', label: t('nav.features') },
        { href: '/#audience', label: t('nav.solutions') },
        { href: '/#multitenant', label: t('nav.architecture') },
        { href: '/#pricing', label: t('nav.pricing') },
        { href: '/#faq', label: t('nav.faq') },
      ];

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOpen]);

  useEffect(() => { setIsMobileOpen(false); }, [pathname]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsMobileOpen(false);
  }, []);
  useEffect(() => {
    if (isMobileOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, handleKeyDown]);

  const brandMark = (
    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-500 text-emerald-950 shadow-lg shadow-gold-500/25">
      <StarGlyph className="h-5 w-5" />
    </div>
  );

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-400 ${
          isScrolled
            ? 'border-b border-white/10 bg-[#03231a]/85 shadow-lg shadow-emerald-950/30 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex flex-shrink-0 items-center gap-3">
            {brandMark}
            <span className="hidden font-display text-lg font-semibold text-white sm:block">{BRAND_NAME}</span>
          </Link>

          <div className="hidden lg:flex lg:items-center lg:gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-emerald-50/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="hidden lg:flex lg:flex-shrink-0 lg:items-center lg:gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
              <Link
                to="/auth/login"
                className={isSuganhub
                  ? "ms-2 inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-5 py-2.5 text-sm font-bold text-emerald-950 shadow-lg shadow-gold-500/25 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
                  : "ms-2 inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/10 active:scale-[0.98]"}
              >
                {isSuganhub ? 'Log In' : t('nav.sign_in')}
              </Link>
              {!isSuganhub && (
                <Link
                  to="/auth/register"
                  className="ms-1 inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-5 py-2.5 text-sm font-bold text-emerald-950 shadow-lg shadow-gold-500/25 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
                >
                  {t('nav.start_free')}
                  <svg className="h-4 w-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 7l5 5-5 5M6 12h12" /></svg>
                </Link>
              )}
            </div>

            {/* Tablet actions */}
            <div className="hidden items-center gap-2 sm:flex lg:hidden">
              <Link to="/auth/login" className={isSuganhub ? "whitespace-nowrap rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-4 py-1.5 text-sm font-bold text-emerald-950 transition-transform hover:-translate-y-0.5" : "whitespace-nowrap rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"}>
                {isSuganhub ? 'Log In' : t('nav.sign_in')}
              </Link>
              {!isSuganhub && (
                <Link to="/auth/register" className="whitespace-nowrap rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-4 py-1.5 text-sm font-bold text-emerald-950 transition-transform hover:-translate-y-0.5">
                  {t('nav.start_free')}
                </Link>
              )}
              <LanguageSwitcher />
              <ThemeToggle />
            </div>

            {/* Phone actions */}
            <div className="flex items-center gap-0.5 sm:hidden">
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
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 end-0 z-50 w-80 max-w-[85vw] bg-[#03231a] shadow-2xl shadow-black/40 lg:hidden"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    {brandMark}
                    <span className="font-display text-base font-semibold text-white">{isSuganhub ? 'Suganhub' : 'Sahal'}</span>
                  </div>
                  <button
                    onClick={() => setIsMobileOpen(false)}
                    className="rounded-lg p-2 text-white transition-colors hover:bg-white/10"
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
                          className="flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-emerald-50/90 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <StarGlyph className="h-3.5 w-3.5 text-gold-400" />
                          {link.label}
                        </a>
                      </motion.li>
                    ))}
                  </ul>
                </nav>

                <div className="space-y-3 border-t border-white/10 p-4">
                  <Link
                    to="/auth/login"
                    onClick={() => setIsMobileOpen(false)}
                    className={isSuganhub
                      ? "flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 px-6 py-3 text-base font-bold text-emerald-950 shadow-lg shadow-gold-500/20"
                      : "flex w-full items-center justify-center rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-base font-semibold text-white transition-all hover:bg-white/10"}
                  >
                    {isSuganhub ? 'Log In' : t('nav.sign_in')}
                  </Link>
                  {!isSuganhub && (
                    <Link
                      to="/auth/register"
                      onClick={() => setIsMobileOpen(false)}
                      className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 px-6 py-3 text-base font-bold text-emerald-950 shadow-lg shadow-gold-500/20"
                    >
                      {t('nav.start_free')}
                    </Link>
                  )}
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
