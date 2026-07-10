/**
 * Footer Component — Premium SaaS Footer
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const BRAND_NAME = 'EduRaah';

export function Footer() {
  const { t } = useTranslation('landing');
  const currentYear = new Date().getFullYear();

  const quickLinks = [
    { href: '/#features', label: t('nav.features') },
    { href: '/#audience', label: t('nav.solutions') },
    { href: '/#multitenant', label: t('nav.architecture') },
    { href: '/#pricing', label: t('nav.pricing') },
    { href: '/#faq', label: t('nav.faq') },
  ];

  const productLinks = [
    { href: '/#features', label: t('footer.product_course_builder') },
    { href: '/#features', label: t('footer.product_analytics') },
    { href: '/#features', label: t('footer.product_certificates') },
    { href: '/#features', label: t('footer.product_attendance') },
  ];

  const companyLinks = [
    { href: '/#', label: t('footer.company_about') },
    { href: '/#', label: t('footer.company_blog') },
    { href: '/#', label: t('footer.company_careers') },
    { href: '/#', label: t('footer.company_contact') },
  ];

  return (
    <footer className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-obsidian-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5zm0 17.5c-4.2-1.4-8-4.93-8-9V8.81l8-4 8 4V10.5c0 4.07-3.8 7.6-8 9z"/>
                </svg>
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{BRAND_NAME}</span>
            </Link>
            <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400 max-w-xs">
              {t('footer.brand_desc')}
            </p>
            <div className="flex items-center gap-3 pt-2">
              {['Twitter', 'LinkedIn', 'YouTube', 'GitHub'].map((social) => (
                <a key={social} href="#" className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400" aria-label={social}>
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" /></svg>
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">{t('footer.column_product')}</h3>
            <ul className="space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-gray-500 dark:text-gray-400 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">{t('footer.column_company')}</h3>
            <ul className="space-y-2.5">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-gray-500 dark:text-gray-400 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">{t('footer.column_legal')}</h3>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-gray-500 dark:text-gray-400 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-gray-100 dark:border-gray-800 pt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            &copy; {currentYear} {BRAND_NAME}. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-sm text-gray-400 dark:text-gray-500 transition-colors hover:text-gray-600 dark:hover:text-gray-300">{t('footer.privacy')}</a>
            <a href="#" className="text-sm text-gray-400 dark:text-gray-500 transition-colors hover:text-gray-600 dark:hover:text-gray-300">{t('footer.terms')}</a>
            <a href="#" className="text-sm text-gray-400 dark:text-gray-500 transition-colors hover:text-gray-600 dark:hover:text-gray-300">{t('footer.cookies')}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;