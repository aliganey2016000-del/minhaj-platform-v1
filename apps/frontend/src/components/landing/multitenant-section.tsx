/**
 * Multi-Tenant Section — architecture diagram on cream.
 *
 * Palette kept strictly on-brand (emerald + gold + cream); the old blue /
 * purple org tiles were off-identity.
 */

import { useTranslation } from 'react-i18next';
import { Eyebrow, Reveal, StarGlyph } from './_decor';

const benefitIcons = ['🔒', '⚙️', '🛡️', '☁️', '🏛️'];

const organizations = [
  { letter: 'A', tint: 'from-emerald-500 to-emerald-600', glow: 'shadow-emerald-600/25' },
  { letter: 'B', tint: 'from-emerald-600 to-emerald-700', glow: 'shadow-emerald-700/25' },
  { letter: 'C', tint: 'from-gold-400 to-gold-500', glow: 'shadow-gold-500/25' },
  { letter: 'D', tint: 'from-gold-500 to-gold-600', glow: 'shadow-gold-600/25' },
];

export function MultiTenantSection() {
  const { t } = useTranslation('landing');
  const benefits = t('multitenant.benefits', { returnObjects: true }) as Array<{ title: string; description: string }>;

  return (
    <section id="multitenant" className="relative overflow-hidden bg-cream-100 py-24 font-dm dark:bg-obsidian-900 lg:py-32">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute right-0 top-1/4 h-[420px] w-[420px] rounded-full bg-gold-400/[0.07] blur-[120px]" />
        <div className="absolute bottom-1/4 left-0 h-[380px] w-[380px] rounded-full bg-emerald-500/[0.07] blur-[110px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center lg:mb-24">
          <Reveal><Eyebrow center>{t('multitenant.badge')}</Eyebrow></Reveal>
          <Reveal delay={80}>
            <h2 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-emerald-950 dark:text-white">
              {t('multitenant.title_part1')}{' '}
              <span className="bg-gradient-to-r from-gold-500 to-gold-600 bg-clip-text text-transparent dark:from-gold-300 dark:to-gold-400">
                {t('multitenant.title_highlight')}
              </span>
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-5 text-base leading-8 text-emerald-950/60 dark:text-emerald-50/60 sm:text-lg">
              {t('multitenant.subtitle')}
            </p>
          </Reveal>
        </div>

        {/* Architecture diagram */}
        <div className="mx-auto mb-20 max-w-4xl lg:mb-28">
          <div className="flex flex-col items-center">
            <Reveal className="w-full max-w-sm">
              <div className="rounded-3xl border border-emerald-900/10 bg-white p-6 text-center shadow-[0_20px_50px_-28px_rgba(3,35,26,0.35)] dark:border-white/10 dark:bg-white/[0.04]">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-700/25">
                  <StarGlyph className="h-7 w-7 text-gold-300" />
                </div>
                <h3 className="font-display text-xl font-semibold text-emerald-950 dark:text-white">{t('multitenant.platform_title')}</h3>
                <p className="mt-1 text-sm font-medium text-gold-600 dark:text-gold-400">{t('multitenant.platform_subtitle')}</p>
                <p className="mt-2 text-xs text-emerald-950/45 dark:text-emerald-50/45">{t('multitenant.platform_desc')}</p>
              </div>
            </Reveal>

            {/* connectors */}
            <div className="my-3 h-14 w-full max-w-md">
              <svg viewBox="0 0 400 56" className="h-full w-full" aria-hidden="true">
                <path d="M200 0 V22" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500/40" />
                <path d="M200 22 H60 V56 M200 22 H153 V56 M200 22 H247 V56 M200 22 H340 V56" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500/25" />
              </svg>
            </div>

            <div className="grid w-full max-w-3xl grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
              {organizations.map((org, i) => (
                <Reveal key={org.letter} delay={i * 90}>
                  <div className={`group relative rounded-2xl bg-gradient-to-br ${org.tint} p-5 text-center text-white shadow-lg ${org.glow} transition-transform duration-300 hover:-translate-y-1.5`}>
                    <span className="absolute end-2.5 top-2.5 text-[10px] opacity-60">🔒</span>
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-xl font-bold backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                      {org.letter}
                    </div>
                    <p className="text-sm font-bold">Org {org.letter}</p>
                    <p className="mt-1 text-[10px] font-medium opacity-75">{t('multitenant.org_label')}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={200}>
              <p className="mt-7 flex items-center gap-2 text-sm text-emerald-950/45 dark:text-emerald-50/45">
                <span>🔒</span>{t('multitenant.security_caption')}
              </p>
            </Reveal>
          </div>
        </div>

        {/* Benefits */}
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <p className="mb-10 text-center text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-emerald-900/45 dark:text-emerald-100/40">
              {t('multitenant.benefits_title')}
            </p>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.isArray(benefits) && benefits.map((benefit, i) => (
              <Reveal key={benefit.title} delay={i * 70}>
                <div className="group h-full rounded-3xl border border-emerald-900/[0.07] bg-white/80 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-gold-400/40 hover:shadow-[0_24px_50px_-24px_rgba(3,35,26,0.28)] dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:border-gold-400/30">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-cream-200 text-2xl ring-1 ring-emerald-900/5 transition-transform duration-300 group-hover:scale-110 dark:from-emerald-950/60 dark:to-emerald-900/30 dark:ring-white/10">
                    {benefitIcons[i] ?? '🔒'}
                  </div>
                  <h3 className="mb-2 font-display text-base font-semibold tracking-tight text-emerald-950 dark:text-white">
                    {benefit.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-emerald-950/55 dark:text-emerald-50/55">
                    {benefit.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default MultiTenantSection;
