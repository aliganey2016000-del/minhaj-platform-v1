/**
 * Pricing Section — Three-tier plans with feature lists
 */

import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function PricingSection() {
  const { t } = useTranslation('landing');

  const plans = [
    { key: 'starter', link: '/auth/register' },
    { key: 'professional', link: '/auth/register' },
    { key: 'enterprise', link: '/contact' },
  ];

  return (
    <section id="pricing" className="py-20 lg:py-32 bg-gray-50 dark:bg-obsidian-800/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-16 lg:mb-20">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">{t('pricing.title')}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-500 dark:text-gray-400">{t('pricing.subtitle')}</p>
        </motion.div>
        <div className="grid gap-8 lg:grid-cols-3 max-w-5xl mx-auto">
          {plans.map((plan, i) => {
            const planT = (t(`pricing.${plan.key}`, { returnObjects: true }) as unknown) as {
              name: string; description: string; price: string; period: string;
              features: string[]; cta: string;
            };
            const isHighlighted = i === 1;
            return (
              <motion.div key={plan.key} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`relative rounded-3xl border-2 p-8 flex flex-col hover:-translate-y-1 transition-all duration-300 ${
                  isHighlighted ? 'border-emerald-500 bg-white dark:bg-obsidian-800 shadow-2xl shadow-emerald-500/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-obsidian-800/60 hover:shadow-xl hover:border-emerald-300 dark:hover:border-emerald-700'
                }`}
              >
                {isHighlighted && <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-1.5 text-xs font-bold text-white shadow-lg">{t('pricing.popular')}</div>}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{planT.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{planT.description}</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold text-gray-900 dark:text-white">{planT.price}</span>
                  {planT.period ? <span className="text-lg text-gray-400">{planT.period}</span> : null}
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {Array.isArray(planT.features) && planT.features.map((f: string) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to={plan.link} className={`block text-center rounded-2xl px-6 py-3.5 text-base font-semibold transition-all active:scale-[0.98] ${
                  isHighlighted ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-xl shadow-emerald-500/25 hover:shadow-2xl hover:-translate-y-0.5' : 'border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-obsidian-700 hover:border-emerald-300'
                }`}>{planT.cta}</Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default PricingSection;