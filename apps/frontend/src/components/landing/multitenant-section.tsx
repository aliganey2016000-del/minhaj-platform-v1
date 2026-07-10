/**
 * Multi-Tenant Section — Premium Visual
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const benefitIcons = ['🔒', '⚙️', '🛡️', '☁️', '🏛️'];

const organizations = [
  { letter: 'A', name: 'Org A', color: 'from-emerald-400 to-emerald-500', shadow: 'shadow-emerald-500/25', delay: 0.3 },
  { letter: 'B', name: 'Org B', color: 'from-blue-400 to-blue-500', shadow: 'shadow-blue-500/25', delay: 0.45 },
  { letter: 'C', name: 'Org C', color: 'from-amber-400 to-amber-500', shadow: 'shadow-amber-500/25', delay: 0.6 },
  { letter: 'D', name: 'Org D', color: 'from-purple-400 to-purple-500', shadow: 'shadow-purple-500/25', delay: 0.75 },
];

export function MultiTenantSection() {
  const { t } = useTranslation('landing');
  const benefits = t('multitenant.benefits', { returnObjects: true }) as Array<{ title: string; description: string }>;

  return (
    <section id="multitenant" className="py-20 lg:py-32 bg-white dark:bg-obsidian-900 overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full bg-emerald-400/5 dark:bg-emerald-400/3 blur-[100px]" />
        <div className="absolute bottom-1/3 left-0 w-[400px] h-[400px] rounded-full bg-blue-400/5 dark:bg-blue-400/3 blur-[80px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 lg:mb-24"
        >
          <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-4 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-5">
            🏗️ {t('multitenant.badge')}
          </span>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl lg:text-5xl leading-tight">
            {t('multitenant.title_part1')}
            <span className="block bg-gradient-to-r from-emerald-500 via-emerald-600 to-blue-600 bg-clip-text text-transparent">
              {t('multitenant.title_highlight')}
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg text-gray-500 dark:text-gray-400 leading-relaxed">
            {t('multitenant.subtitle')}
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto mb-20 lg:mb-28">
          <div className="relative flex flex-col items-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative z-20 w-full max-w-sm rounded-3xl border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-obsidian-800/60 p-6 text-center shadow-xl shadow-emerald-500/5"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25 mb-4">
                <span className="text-3xl">☁️</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{t('multitenant.platform_title')}</h3>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{t('multitenant.platform_subtitle')}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{t('multitenant.platform_desc')}</p>
            </motion.div>

            <div className="relative w-full max-w-md h-16 my-2">
              <motion.div
                initial={{ scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                style={{ originY: 0 }}
                className="absolute left-1/2 top-0 -translate-x-1/2 w-0.5 h-full bg-gradient-to-b from-emerald-400 via-emerald-400 to-transparent"
              />
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.4 + i * 0.12 }}
                  className="absolute bottom-0 w-0.5 h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent"
                  style={{ left: i === 0 ? '20%' : i === 1 ? '38%' : i === 2 ? '62%' : '80%' }}
                >
                  <motion.div
                    animate={{ y: [0, -20, 0] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400"
                  />
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 w-full max-w-3xl">
              {organizations.map((org) => (
                <motion.div
                  key={org.letter}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: org.delay }}
                  whileHover={{ y: -6, transition: { duration: 0.25 } }}
                  className={`group relative rounded-2xl bg-gradient-to-br ${org.color} p-5 text-white text-center shadow-lg ${org.shadow} cursor-default`}
                >
                  <div className="absolute top-2 right-2 opacity-50 group-hover:opacity-80 transition-opacity">
                    <span className="text-xs">🔒</span>
                  </div>
                  <div className="w-12 h-12 mx-auto rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-2xl font-bold">{org.letter}</span>
                  </div>
                  <p className="text-sm font-bold">{org.name}</p>
                  <p className="text-[10px] opacity-75 mt-1 font-medium">{t('multitenant.org_label')}</p>
                  <div className="flex items-center justify-center gap-1 mt-3 opacity-60">
                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} className="w-1 h-1 rounded-full bg-white" />
                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }} className="w-1 h-1 rounded-full bg-white" />
                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, delay: 1 }} className="w-1 h-1 rounded-full bg-white" />
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 1, duration: 0.6 }}
              className="mt-6 text-sm text-gray-400 dark:text-gray-500 flex items-center gap-2"
            >
              <span>🔒</span>
              <span>{t('multitenant.security_caption')}</span>
            </motion.p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-10"
          >
            {t('multitenant.benefits_title')}
          </motion.p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.isArray(benefits) && benefits.map((benefit, i) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="group rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-obsidian-800/30 p-6 hover:border-emerald-200 dark:hover:border-emerald-800 hover:bg-white dark:hover:bg-obsidian-800/60 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <span className="text-2xl">{benefitIcons[i] ?? '🔒'}</span>
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">
                  {benefit.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {benefit.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default MultiTenantSection;