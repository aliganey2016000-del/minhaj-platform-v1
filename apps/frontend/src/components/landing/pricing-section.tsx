/**
 * Pricing — three tiers on cream, gold-highlighted popular plan.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eyebrow, Reveal } from './_decor';

export function PricingSection() {
  const { t } = useTranslation('landing');

  const plans = [
    { key: 'starter', link: '/auth/register' },
    { key: 'professional', link: '/auth/register' },
    { key: 'enterprise', link: '/auth/register' },
  ];

  return (
    <section id="pricing" className="relative overflow-hidden bg-cream-100 py-24 font-dm dark:bg-obsidian-900 lg:py-32">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-gold-400/[0.06] blur-[130px]" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center lg:mb-20">
          <Reveal><Eyebrow center>{t('nav.pricing')}</Eyebrow></Reveal>
          <Reveal delay={80}>
            <h2 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-emerald-950 dark:text-white">
              {t('pricing.title')}
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-5 text-base leading-8 text-emerald-950/60 dark:text-emerald-50/60 sm:text-lg">
              {t('pricing.subtitle')}
            </p>
          </Reveal>
        </div>

        <div className="mx-auto grid max-w-5xl items-start gap-6 lg:grid-cols-3">
          {plans.map((plan, i) => {
            const planT = (t(`pricing.${plan.key}`, { returnObjects: true }) as unknown) as {
              name: string; description: string; price: string; period: string;
              features: string[]; cta: string;
            };
            const featured = i === 1;

            return (
              <Reveal key={plan.key} delay={i * 90} className={featured ? 'lg:-mt-4' : ''}>
                <div
                  className={`relative flex h-full flex-col rounded-3xl p-8 transition-all duration-300 ${
                    featured
                      ? 'border-2 border-gold-400/60 bg-white shadow-[0_30px_70px_-30px_rgba(180,131,53,0.45)] dark:bg-white/[0.06]'
                      : 'border border-emerald-900/[0.08] bg-white/80 hover:-translate-y-1.5 hover:border-gold-400/40 hover:shadow-[0_24px_50px_-24px_rgba(3,35,26,0.25)] dark:border-white/[0.07] dark:bg-white/[0.03]'
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-950 shadow-lg shadow-gold-500/30">
                      {t('pricing.popular')}
                    </span>
                  )}

                  <h3 className="font-display text-xl font-semibold text-emerald-950 dark:text-white">{planT.name}</h3>
                  <p className="mt-2 text-sm text-emerald-950/55 dark:text-emerald-50/55">{planT.description}</p>

                  <div className="my-7 flex items-end gap-1">
                    <span className="font-display text-5xl font-semibold tracking-tight text-emerald-950 dark:text-white">{planT.price}</span>
                    {planT.period ? <span className="pb-1.5 text-base text-emerald-950/45 dark:text-emerald-50/45">{planT.period}</span> : null}
                  </div>

                  <ul className="mb-8 flex-1 space-y-3.5">
                    {Array.isArray(planT.features) && planT.features.map((f: string) => (
                      <li key={f} className="flex items-start gap-3 text-sm text-emerald-950/70 dark:text-emerald-50/70">
                        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gold-400/20 text-gold-600 dark:text-gold-400">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    to={plan.link}
                    className={`block rounded-2xl px-6 py-3.5 text-center text-sm font-bold transition-all active:scale-[0.98] ${
                      featured
                        ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-emerald-950 shadow-lg shadow-gold-500/30 hover:-translate-y-0.5 hover:shadow-xl'
                        : 'border border-emerald-900/15 text-emerald-900 hover:border-gold-400/60 hover:bg-gold-400/10 dark:border-white/15 dark:text-white'
                    }`}
                  >
                    {planT.cta}
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default PricingSection;
