/**
 * FAQ — accordion on white.
 *
 * Uses a CSS grid-rows height trick rather than a JS height animation so the
 * panel always settles fully open/closed (never stuck mid-transition).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eyebrow, Reveal } from './_decor';

export function FAQSection() {
  const { t } = useTranslation('landing');
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const faqs = t('faq.questions', { returnObjects: true }) as Array<{ q: string; a: string }>;

  return (
    <section id="faq" className="bg-white py-24 font-dm dark:bg-obsidian-800/40 lg:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-14 text-center">
          <Reveal><Eyebrow center>{t('nav.faq')}</Eyebrow></Reveal>
          <Reveal delay={80}>
            <h2 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-emerald-950 dark:text-white">
              {t('faq.title')}
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-5 text-base leading-8 text-emerald-950/60 dark:text-emerald-50/60">
              {t('faq.subtitle')}
            </p>
          </Reveal>
        </div>

        <div className="space-y-3">
          {Array.isArray(faqs) && faqs.map((faq, i) => {
            const open = openIdx === i;
            return (
              <Reveal key={i} delay={i * 45}>
                <div
                  className={`overflow-hidden rounded-2xl border transition-colors duration-300 ${
                    open
                      ? 'border-gold-400/50 bg-cream-100/80 dark:border-gold-400/30 dark:bg-white/[0.05]'
                      : 'border-emerald-900/[0.08] bg-cream-100/40 hover:border-gold-400/30 dark:border-white/[0.07] dark:bg-white/[0.02]'
                  }`}
                >
                  <button
                    onClick={() => setOpenIdx(open ? null : i)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-start"
                  >
                    <span className="font-display text-base font-semibold text-emerald-950 dark:text-white">{faq.q}</span>
                    <span
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                        open ? 'rotate-180 bg-gold-400 text-emerald-950' : 'bg-emerald-900/[0.06] text-emerald-950/50 dark:bg-white/10 dark:text-white/60'
                      }`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>

                  {/* grid-rows 0fr -> 1fr animates height without measuring */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-5 text-sm leading-relaxed text-emerald-950/60 dark:text-emerald-50/60">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default FAQSection;
