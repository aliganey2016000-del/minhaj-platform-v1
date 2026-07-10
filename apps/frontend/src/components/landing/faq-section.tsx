/**
 * FAQ Section — Modern accordion
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export function FAQSection() {
  const { t } = useTranslation('landing');
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const faqs = t('faq.questions', { returnObjects: true }) as Array<{ q: string; a: string }>;

  return (
    <section id="faq" className="py-20 lg:py-32 bg-white dark:bg-obsidian-900">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">{t('faq.title')}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-500 dark:text-gray-400">{t('faq.subtitle')}</p>
        </motion.div>
        <div className="space-y-4">
          {Array.isArray(faqs) && faqs.map((faq, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-obsidian-800/30 overflow-hidden"
            >
              <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full flex items-center justify-between px-6 py-5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-obsidian-800/50">
                <span className="text-base font-semibold text-gray-900 dark:text-white pr-4">{faq.q}</span>
                <motion.svg animate={{ rotate: openIdx === i ? 180 : 0 }} transition={{ duration: 0.3 }} className="w-5 h-5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></motion.svg>
              </button>
              <AnimatePresence>
                {openIdx === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                    <p className="px-6 pb-5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FAQSection;