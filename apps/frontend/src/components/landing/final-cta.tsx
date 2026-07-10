/**
 * Final CTA Section
 */

import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function FinalCTASection() {
  const { t } = useTranslation('landing');

  return (
    <section className="py-20 lg:py-32 bg-white dark:bg-obsidian-900 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-emerald-400/10 via-blue-400/5 to-amber-400/10 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">
            {t('cta.title')}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 dark:text-gray-400 leading-relaxed">
            {t('cta.subtitle')}
          </p>

          <div className="mt-10 flex flex-wrap gap-4 justify-center">
            <Link
              to="/auth/register"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-8 py-4 text-base font-bold text-white shadow-2xl shadow-emerald-500/30 transition-all hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              {t('cta.primary')}
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-obsidian-800 px-8 py-4 text-base font-semibold text-gray-700 dark:text-gray-200 shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-obsidian-700 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]"
            >
              {t('cta.secondary')}
            </a>
          </div>

          <p className="mt-6 text-sm text-gray-400 dark:text-gray-500">
            {t('cta.footer_note')}
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export default FinalCTASection;