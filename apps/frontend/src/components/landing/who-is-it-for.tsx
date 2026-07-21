/**
 * Who Is It For — audience cards on cream.
 */

import { useTranslation } from 'react-i18next';
import { Eyebrow, Reveal, IslamicPattern } from './_decor';

const icons = ['🏫', '🎓', '🏢', '💼', '🏠', '🌐', '👨‍👩‍👧‍👦', '🏛️'];

export function WhoIsItForSection() {
  const { t } = useTranslation('landing');
  const audiences = t('audience.cards', { returnObjects: true }) as Array<{ title: string; description: string }>;

  return (
    <section id="audience" className="relative overflow-hidden bg-cream-100 py-24 font-dm dark:bg-obsidian-900 lg:py-32">
      <IslamicPattern tone="emerald" className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.04]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center lg:mb-20">
          <Reveal><Eyebrow center>{t('nav.solutions')}</Eyebrow></Reveal>
          <Reveal delay={80}>
            <h2 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-emerald-950 dark:text-white">
              {t('audience.title')}
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-5 text-base leading-8 text-emerald-950/60 dark:text-emerald-50/60 sm:text-lg">
              {t('audience.subtitle')}
            </p>
          </Reveal>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.isArray(audiences) && audiences.map((audience, i) => (
            <Reveal key={audience.title} delay={i * 60}>
              <div className="group h-full rounded-3xl border border-emerald-900/[0.07] bg-white/80 p-6 shadow-[0_2px_10px_-4px_rgba(3,35,26,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-gold-400/40 hover:shadow-[0_24px_50px_-24px_rgba(3,35,26,0.28)] dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:border-gold-400/30">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-cream-200 text-2xl ring-1 ring-emerald-900/5 transition-transform duration-300 group-hover:scale-110 dark:from-emerald-950/60 dark:to-emerald-900/30 dark:ring-white/10">
                  {icons[i] ?? '📚'}
                </div>
                <h3 className="mb-2 font-display text-lg font-semibold tracking-tight text-emerald-950 dark:text-white">
                  {audience.title}
                </h3>
                <p className="text-sm leading-relaxed text-emerald-950/55 dark:text-emerald-50/55">
                  {audience.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WhoIsItForSection;
