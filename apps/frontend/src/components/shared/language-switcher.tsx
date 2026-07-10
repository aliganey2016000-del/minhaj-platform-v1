/**
 * Language Switcher Component
 *
 * Dropdown to switch between English (EN), Somali (SO), and Arabic (AR).
 * Updates i18next language and sets the `dir` attribute on <html> for RTL support.
 */

import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const languages = [
  { code: 'en', label: 'EN', native: 'English' },
  { code: 'so', label: 'SO', native: 'Soomaali' },
  { code: 'ar', label: 'AR', native: 'العربية' },
] as const;

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------------
  // Close on outside click
  // ------------------------------------------------------------------

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  // ------------------------------------------------------------------
  // Close on Escape
  // ------------------------------------------------------------------

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // ------------------------------------------------------------------
  // Switch language
  // ------------------------------------------------------------------

  const switchLanguage = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('masjid-language', code);

    // Handle RTL and lang attribute for Arabic
    if (code === 'ar') {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', 'ar');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
      document.documentElement.setAttribute('lang', code);
    }

    setIsOpen(false);
  };

  const currentLang = languages.find((l) => l.code === i18n.language) ?? languages[0];

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium
                   text-[var(--color-text-secondary)] transition-colors
                   hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span>{currentLang.label}</span>
        <svg
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-36 overflow-hidden rounded-xl
                       glass-strong shadow-elevated backdrop-blur-xl"
          >
            {languages.map((lang) => (
              <li key={lang.code}>
                <button
                  onClick={() => switchLanguage(lang.code)}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors
                    ${lang.code === i18n.language
                      ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 font-semibold'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  role="option"
                  aria-selected={lang.code === i18n.language}
                >
                  <span className="w-7 text-center font-mono text-xs">{lang.label}</span>
                  <span>{lang.native}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LanguageSwitcher;