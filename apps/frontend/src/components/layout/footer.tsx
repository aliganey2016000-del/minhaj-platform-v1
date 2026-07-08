/**
 * Footer Component
 *
 * Premium multi-column footer with mosque info, quick links,
 * programs, contact info, social links, and copyright.
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function Footer() {
  const { t } = useTranslation('landing');
  const { t: tc } = useTranslation('common');
  const currentYear = new Date().getFullYear();

  const quickLinks = [
    { href: '/#home', labelKey: 'home' },
    { href: '/#about', labelKey: 'about' },
    { href: '/#courses', labelKey: 'courses' },
    { href: '/#events', labelKey: 'events' },
    { href: '/#contact', labelKey: 'contact' },
  ];

  const programLinks = [
    { href: '/#programs', label: 'Quran Studies' },
    { href: '/#programs', label: 'Fiqh & Jurisprudence' },
    { href: '/#programs', label: 'Arabic Language' },
    { href: '/#programs', label: 'Aqeedah' },
  ];

  return (
    <footer className="border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* ── Column 1: About ── */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5zm0 17.5c-4.2-1.4-8-4.93-8-9V8.81l8-4 8 4V10.5c0 4.07-3.8 7.6-8 9z"/>
                </svg>
              </div>
              <span className="text-lg font-bold text-[var(--color-text-primary)]">
                {tc('site_name')}
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {t('footer.about_text')}
            </p>
            {/* Social links */}
            <div className="flex items-center gap-3 pt-2">
              {['Facebook', 'Twitter', 'YouTube', 'Instagram'].map((social) => (
                <a
                  key={social}
                  href="#"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-tertiary)] transition-colors hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                  aria-label={social}
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* ── Column 2: Quick Links ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
              {t('footer.quick_links')}
            </h3>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-primary-600 dark:hover:text-primary-400"
                  >
                    {tc(link.labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Column 3: Programs ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
              {t('footer.programs_footer')}
            </h3>
            <ul className="space-y-2.5">
              {programLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-primary-600 dark:hover:text-primary-400"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Column 4: Contact ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
              {t('footer.contact_footer')}
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-sm text-[var(--color-text-secondary)]">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>123 Islamic Center Road, Mogadishu, Somalia</span>
              </li>
              <li className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                <svg className="h-4 w-4 flex-shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>+252 61 234 5678</span>
              </li>
              <li className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                <svg className="h-4 w-4 flex-shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>info@masjidalrahma.com</span>
              </li>
            </ul>
          </div>
        </div>

        {/* ── Copyright Bar ── */}
        <div className="mt-12 border-t border-[var(--color-border-subtle)] pt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            &copy; {currentYear} Masjid Al-Rahma. {tc('all_rights_reserved')}.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-sm text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]">
              {tc('privacy_policy')}
            </a>
            <a href="#" className="text-sm text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]">
              {tc('terms_of_service')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;