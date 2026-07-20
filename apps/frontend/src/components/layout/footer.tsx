/**
 * Footer Component — Premium SaaS Footer
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const BRAND_NAME = 'Sahal Education Platform';

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

  return (
    <footer className="bg-[#08152d] text-slate-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="space-y-6">
            <Link to="/" className="inline-flex items-center gap-3 rounded-3xl bg-slate-900/70 px-4 py-3 shadow-xl shadow-slate-950/20 ring-1 ring-white/10 transition hover:bg-slate-900">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-yellow-400 text-white shadow-lg shadow-orange-500/20">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5zm0 17.5c-4.2-1.4-8-4.93-8-9V8.81l8-4 8 4V10.5c0 4.07-3.8 7.6-8 9z" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-white">{BRAND_NAME}</span>
            </Link>
            <p className="max-w-xl text-sm leading-7 text-slate-300">
              {t('footer.brand_desc')}
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#" aria-label={t('footer.social_facebook')} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/70 text-slate-200 transition hover:bg-slate-800">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.99 3.657 9.128 8.438 9.878v-6.99h-2.54v-2.888h2.54V9.845c0-2.507 1.492-3.89 3.777-3.89 1.095 0 2.238.196 2.238.196v2.462h-1.26c-1.243 0-1.63.771-1.63 1.562v1.875h2.773l-.443 2.888h-2.33v6.99C18.343 21.128 22 16.99 22 12z" /></svg>
              </a>
              <a href="#" aria-label={t('footer.social_linkedin')} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/70 text-slate-200 transition hover:bg-slate-800">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M4.98 3.5C3.336 3.5 2 4.846 2 6.49c0 1.26.81 2.323 1.95 2.73v10.78c0 .65.52 1.17 1.17 1.17h4.74V15.1H7.13v-2.16h1.78V10.7c0-1.76 1.08-2.72 2.66-2.72.76 0 1.43.06 1.63.09v1.9h-1.12c-.88 0-1.05.42-1.05 1.03v1.36h2.1l-.27 2.16h-1.83v6.16h3.6c.65 0 1.17-.52 1.17-1.17V9.221c1.14-.409 1.95-1.469 1.95-2.73 0-1.644-1.336-2.99-2.98-2.99H4.98z" /></svg>
              </a>
              <a href="#" aria-label={t('footer.social_github')} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/70 text-slate-200 transition hover:bg-slate-800">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.04c-5.51 0-9.96 4.45-9.96 9.96 0 4.4 2.86 8.15 6.84 9.47.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.71-2.78.61-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.48-1.1-1.48-.9-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.95 0-1.09.39-2 1.03-2.71-.1-.26-.45-1.28.1-2.68 0 0 .84-.27 2.75 1.03A9.56 9.56 0 0112 6.78c.85.004 1.71.11 2.51.32 1.9-1.3 2.74-1.03 2.74-1.03.55 1.4.2 2.42.1 2.68.64.71 1.03 1.62 1.03 2.71 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.18.59.69.49 3.98-1.32 6.84-5.07 6.84-9.47 0-5.51-4.45-9.96-9.96-9.96z" /></svg>
              </a>
            </div>
          </div>

          <div className="space-y-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{t('footer.column_explore')}</h3>
            <ul className="space-y-3 text-sm text-slate-400">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="transition-colors hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{t('footer.column_account')}</h3>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><Link to="/auth/login" className="transition-colors hover:text-white">{t('nav.sign_in')}</Link></li>
              <li><Link to="/auth/register" className="transition-colors hover:text-white">{t('footer.account_create')}</Link></li>
            </ul>
          </div>

          <div className="space-y-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{t('footer.column_contact')}</h3>
            <div className="space-y-3 text-sm text-slate-400">
              <a href="mailto:invo@sahaledu.com" className="flex items-center gap-2 transition-colors hover:text-white">
                <span className="text-slate-300">📧</span>
                invo@sahaledu.com
              </a>
              <a href="tel:+252615328006" className="flex items-center gap-2 transition-colors hover:text-white">
                <span className="text-slate-300">📞</span>
                +252615328006
              </a>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-slate-300">📍</span>
                {t('footer.address')}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-14 border-t border-slate-800 pt-8 sm:flex sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            © {currentYear} {BRAND_NAME}. All rights reserved.
          </p>
          {/* TODO: these link to "#" because there are no dedicated legal pages yet — wire up real routes once they exist. */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500 sm:mt-0">
            <a href="#" className="transition-colors hover:text-white">{t('footer.privacy')}</a>
            <a href="#" className="transition-colors hover:text-white">{t('footer.terms')}</a>
            <a href="#" className="transition-colors hover:text-white">{t('footer.cookies')}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;