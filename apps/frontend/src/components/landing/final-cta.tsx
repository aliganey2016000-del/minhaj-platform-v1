/**
 * Final CTA — deep emerald closing band with gold call to action.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IslamicPattern, Reveal, StarGlyph } from './_decor';

export function FinalCTASection() {
  const { t } = useTranslation('landing');

  return (
    <section className="relative overflow-hidden bg-[#03231a] py-24 font-dm text-white lg:py-32">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(65%_60%_at_50%_0%,rgba(212,162,74,0.2),transparent_60%),linear-gradient(180deg,#03231a,#04372a_55%,#022c22)]" />
        <IslamicPattern tone="gold" className="absolute inset-0 opacity-[0.06]" />
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-500/10 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-500 text-emerald-950 shadow-[0_18px_45px_-12px_rgba(245,158,11,0.6)]">
            <StarGlyph className="h-7 w-7" />
          </span>
        </Reveal>

        <Reveal delay={80}>
          <h2 className="mt-8 font-display text-[clamp(2.1rem,4vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-white">
            {t('cta.title')}
          </h2>
        </Reveal>

        <Reveal delay={140}>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-emerald-100/70 sm:text-lg">
            {t('cta.subtitle')}
          </p>
        </Reveal>

        <Reveal delay={210}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth/register"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-4 text-sm font-bold text-emerald-950 shadow-[0_18px_50px_-14px_rgba(245,158,11,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-14px_rgba(245,158,11,0.8)] active:scale-[0.98] sm:w-auto"
            >
              {t('cta.primary')}
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="#pricing"
              className="inline-flex w-full items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 sm:w-auto"
            >
              {t('cta.secondary')}
            </a>
          </div>
        </Reveal>

        <Reveal delay={280}>
          <p className="mt-7 text-xs text-emerald-100/45">{t('cta.footer_note')}</p>
        </Reveal>
      </div>
    </section>
  );
}

export default FinalCTASection;
