/**
 * How It Works — numbered timeline on white.
 */

import { useTranslation } from 'react-i18next';
import { Eyebrow, Reveal } from './_decor';

const stepIcons = ['🏗️', '👥', '📚', '🚀'];

export function HowItWorksSection() {
  const { t } = useTranslation('landing');
  const steps = t('how.steps', { returnObjects: true }) as Array<{ title: string; description: string }>;

  return (
    <section id="how-it-works" className="bg-white py-24 font-dm dark:bg-obsidian-800/40 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center lg:mb-20">
          <Reveal><Eyebrow center>{t('how.eyebrow')}</Eyebrow></Reveal>
          <Reveal delay={80}>
            <h2 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-emerald-950 dark:text-white">
              {t('how.title')}
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-5 text-base leading-8 text-emerald-950/60 dark:text-emerald-50/60 sm:text-lg">
              {t('how.subtitle')}
            </p>
          </Reveal>
        </div>

        <div className="mx-auto max-w-3xl">
          {Array.isArray(steps) && steps.map((step, i) => (
            <Reveal key={`step-${i}`} delay={i * 90}>
              <div className="relative flex gap-6 lg:gap-8">
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-16 h-[calc(100%-2rem)] w-px bg-gradient-to-b from-gold-400/60 to-transparent"
                    style={{ insetInlineStart: '27px' }}
                  />
                )}

                <div className="relative z-10 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 font-display text-lg font-semibold text-gold-300 shadow-lg shadow-emerald-700/25">
                  {String(i + 1).padStart(2, '0')}
                </div>

                <div className={`flex-1 ${i === steps.length - 1 ? 'pb-0' : 'pb-10'}`}>
                  <div className="group rounded-3xl border border-emerald-900/[0.07] bg-cream-100/70 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-gold-400/40 hover:shadow-[0_24px_50px_-24px_rgba(3,35,26,0.25)] dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:border-gold-400/30">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-2xl ring-1 ring-emerald-900/5 transition-transform duration-300 group-hover:scale-110 dark:bg-white/5 dark:ring-white/10">
                        {stepIcons[i] ?? '📚'}
                      </div>
                      <div>
                        <h3 className="mb-2 font-display text-xl font-semibold tracking-tight text-emerald-950 dark:text-white">
                          {step.title}
                        </h3>
                        <p className="max-w-md text-sm leading-relaxed text-emerald-950/55 dark:text-emerald-50/55">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorksSection;
