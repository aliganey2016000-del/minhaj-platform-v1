/**
 * Who Is It For Section
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export function WhoIsItForSection() {
  const { t } = useTranslation('landing');
  const audiences = t('audience.cards', { returnObjects: true }) as Array<{ title: string; description: string }>;

  const icons = ['🏫', '🎓', '🏢', '💼', '🏠', '🌐', '👨‍👩‍👧‍👦', '🏛️'];

  return (
    <section id="audience" className="py-20 lg:py-32 bg-white dark:bg-obsidian-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16 lg:mb-20"
        >
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">
            {t('audience.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-500 dark:text-gray-400">
            {t('audience.subtitle')}
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.isArray(audiences) && audiences.map((audience, i) => (
            <motion.div
              key={audience.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="group rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-obsidian-800/30 p-6 hover:bg-white dark:hover:bg-obsidian-800/60 hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-lg transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <span className="text-2xl">{icons[i] ?? '📚'}</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {audience.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {audience.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WhoIsItForSection;