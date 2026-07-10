/**
 * Features Grid Section
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const featureIcons = ['📚', '🎬', '📄', '📋', '❓', '🎖️', '📊', '📈', '✅', '💬', '🔔', '🔐', '📱', '🌙', '🔌', '🌍'];

export function FeaturesSection() {
  const { t } = useTranslation('landing');
  const features = t('features.list', { returnObjects: true }) as Array<{ title: string; description: string }>;

  return (
    <section id="features" className="py-20 lg:py-32 bg-gray-50 dark:bg-obsidian-800/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16 lg:mb-20"
        >
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">
            {t('features.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-500 dark:text-gray-400">
            {t('features.subtitle')}
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.isArray(features) && features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.04 }}
              className="group rounded-2xl border border-gray-200/60 dark:border-gray-700/50 bg-white dark:bg-obsidian-800/40 p-6 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <span className="text-xl">{featureIcons[i] ?? '📚'}</span>
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturesSection;