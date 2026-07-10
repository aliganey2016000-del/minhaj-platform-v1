/**
 * Trust Section — Logo banner
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const logos = [
  'Global Academy', 'LearnHub', 'EduPrime', 'SkillForge',
  'MindBridge', 'CloudCampus', 'NovaLearn', 'Pathway Institute',
];

export function TrustSection() {
  const { t } = useTranslation('landing');

  return (
    <section className="py-16 lg:py-20 bg-gray-50 dark:bg-obsidian-800/50 border-y border-gray-100 dark:border-gray-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center text-sm font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-10"
        >
          {t('trust.title')}
        </motion.p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 lg:gap-12 items-center justify-items-center">
          {logos.map((logo, i) => (
            <motion.div
              key={logo}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex items-center justify-center"
            >
              <div className="flex items-center gap-2 text-gray-300 dark:text-gray-600">
                <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <span className="text-sm font-bold text-gray-400 dark:text-gray-500">{logo.charAt(0)}</span>
                </div>
                <span className="text-sm font-semibold text-gray-400 dark:text-gray-500 hidden sm:inline">{logo}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TrustSection;