/**
 * How It Works Section
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const stepIcons = ['🏗️', '👥', '📚', '🚀'];

export function HowItWorksSection() {
  const { t } = useTranslation('landing');
  const steps = t('how.steps', { returnObjects: true }) as Array<{ title: string; description: string }>;

  return (
    <section id="how-it-works" className="py-20 lg:py-32 bg-gray-50 dark:bg-obsidian-800/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16 lg:mb-20"
        >
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">
            {t('how.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-500 dark:text-gray-400">
            {t('how.subtitle')}
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto">
          {Array.isArray(steps) && steps.map((step, i) => (
            <motion.div
              key={`step-${i}`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative flex gap-6 lg:gap-8"
            >
              {i < steps.length - 1 && (
                <div className="absolute left-[27px] top-16 bottom-0 w-0.5 bg-gradient-to-b from-emerald-300 to-emerald-100 dark:from-emerald-600 dark:to-emerald-900/50" />
              )}

              <div className="relative z-10 flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <span className="text-lg font-bold">{String(i + 1).padStart(2, '0')}</span>
              </div>

              <div className={`flex-1 pb-16 ${i === steps.length - 1 ? 'pb-0' : ''}`}>
                <div className="group rounded-2xl border border-gray-200/60 dark:border-gray-700/50 bg-white dark:bg-obsidian-800/40 p-6 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-lg transition-all duration-300">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <span className="text-2xl">{stepIcons[i] ?? '📚'}</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        {step.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-md">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorksSection;