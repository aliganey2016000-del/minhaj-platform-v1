/**
 * Features — deep emerald band. The dark centrepiece of the page rhythm.
 */

import { useTranslation } from 'react-i18next';
import { Eyebrow, Reveal, IslamicPattern } from './_decor';

const featureIcons = ['📚', '🎬', '📄', '📋', '❓', '🎖️', '📊', '📈', '✅', '💬', '🔔', '🔐', '📱', '🌙', '🔌', '🌍'];

export function FeaturesSection() {
  const { t } = useTranslation('landing');
  const features = t('features.list', { returnObjects: true }) as Array<{ title: string; description: string }>;

  return (
    <section id="features" className="relative overflow-hidden bg-[#03231a] py-24 font-dm text-white lg:py-32">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_0%,rgba(212,162,74,0.14),transparent_60%),radial-gradient(60%_60%_at_10%_100%,rgba(5,150,105,0.3),transparent_65%),linear-gradient(180deg,#03231a,#04352a_60%,#03231a)]" />
        <IslamicPattern tone="gold" className="absolute inset-0 opacity-[0.05]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center lg:mb-20">
          <Reveal>
            <Eyebrow center className="!text-gold-300">{t('nav.features')}</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
              {t('features.title')}
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-5 text-base leading-8 text-emerald-100/65 sm:text-lg">
              {t('features.subtitle')}
            </p>
          </Reveal>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.isArray(features) && features.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 4) * 60}>
              <div className="group h-full rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-gold-400/35 hover:bg-white/[0.07]">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-white/10 to-white/[0.03] text-xl ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-110">
                  {featureIcons[i] ?? '📚'}
                </div>
                <h3 className="mb-1.5 text-[0.95rem] font-semibold tracking-tight text-white">
                  {feature.title}
                </h3>
                <p className="text-[0.82rem] leading-relaxed text-emerald-100/55">
                  {feature.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturesSection;
