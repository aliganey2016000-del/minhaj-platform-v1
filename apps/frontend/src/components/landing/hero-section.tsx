/**
 * Hero Section — "Emerald & Gold, Premium Islamic" landing centerpiece.
 *
 * Split layout: a magnetic Fraunces headline + dual CTAs on the left, an
 * animated glass dashboard preview with floating accent cards on the right,
 * over a deep-emerald canvas textured with a faint Islamic star pattern and
 * warm gold light. A full-width stat band anchors the fold.
 *
 * All motion is CSS-driven (transitions + keyframes) rather than JS/RAF so
 * content always settles fully visible, even on throttled/slow tabs.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IslamicPattern, StarGlyph, Reveal } from './_decor';

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const duration = 1600;
    const steps = 50;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) { setCount(value); clearInterval(timer); }
      else setCount(Math.floor(current));
    }, duration / steps);
    // Guarantee the final value even if the interval is throttled/stalled.
    const settle = setTimeout(() => setCount(value), duration + 400);
    return () => { clearInterval(timer); clearTimeout(settle); };
  }, [value]);
  return <span>{count.toLocaleString()}{suffix}</span>;
}

// A compact, animated dashboard preview — pure decoration, all localized.
function DashboardPreview() {
  const { t } = useTranslation('landing');
  const months = (t('hero.dashboard_chart_months', { returnObjects: true }) as string[]) || [];
  const bars = [42, 58, 49, 71, 63, 86, 78];
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setGrown(true), 250);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="relative">
      <Reveal className="relative rounded-[26px] border border-white/15 bg-white/[0.07] p-5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.75)] backdrop-blur-xl sm:p-6" delay={120}>
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 text-emerald-950 shadow-lg shadow-gold-500/30">
              <StarGlyph className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{t('hero.dashboard_course_builder')}</p>
              <p className="text-[11px] text-emerald-200/70">{t('hero.dashboard_drag_drop')}</p>
            </div>
          </div>
          <div className="flex -space-x-2">
            {['#fbbf24', '#34d399', '#38bdf8'].map((c) => (
              <span key={c} className="h-7 w-7 rounded-full border-2 border-emerald-950/40" style={{ background: c }} />
            ))}
          </div>
        </div>

        {/* stat tiles */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <p className="text-[11px] uppercase tracking-wider text-emerald-200/70">{t('hero.dashboard_total_learners')}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-white">12,480</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <p className="text-[11px] uppercase tracking-wider text-emerald-200/70">{t('hero.dashboard_active_courses')}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-white">128</p>
          </div>
        </div>

        {/* mini bar chart */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-emerald-100">{t('hero.dashboard_learner_growth')}</p>
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">+24%</span>
          </div>
          <div className="flex h-24 items-end justify-between gap-1.5">
            {bars.map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-md transition-[height] duration-700 ease-out ${i === bars.length - 1 ? 'bg-gradient-to-t from-gold-500 to-gold-300' : 'bg-gradient-to-t from-emerald-500/80 to-emerald-300/80'}`}
                    style={{ height: grown ? `${h}%` : '6px', transitionDelay: `${i * 70}ms` }}
                  />
                </div>
                <span className="text-[9px] text-emerald-200/60">{months[i]?.slice(0, 1)}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* floating: completion ring */}
      <div className="absolute -start-6 top-1/3 hidden animate-float rounded-2xl border border-white/15 bg-emerald-950/70 p-3 shadow-xl backdrop-blur-md sm:block">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11">
            <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#fbbf24" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="97.4" strokeDashoffset="19" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">80%</span>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-white">{t('hero.dashboard_completion')}</p>
            <p className="text-[10px] text-emerald-200/70">{t('hero.floating_engagement')}</p>
          </div>
        </div>
      </div>

      {/* floating: certificate badge */}
      <div className="absolute -end-4 bottom-8 hidden animate-float-delayed items-center gap-2.5 rounded-2xl border border-white/15 bg-emerald-950/70 px-4 py-3 shadow-xl backdrop-blur-md sm:flex">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 text-emerald-950">🎖️</div>
        <div>
          <p className="text-[11px] font-semibold text-white">{t('hero.dashboard_certificates')}</p>
          <p className="text-[10px] text-emerald-200/70">{t('hero.floating_completed')}</p>
        </div>
      </div>
    </div>
  );
}

export function HeroSection() {
  const { t } = useTranslation('landing');

  return (
    <section className="relative overflow-hidden bg-[#03231a] font-dm text-white">
      {/* layered light + pattern */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_15%_10%,rgba(212,162,74,0.22),transparent_55%),radial-gradient(65%_70%_at_90%_90%,rgba(5,150,105,0.4),transparent_60%),linear-gradient(160deg,#03231a,#04372a_55%,#022c22)]" />
        <IslamicPattern tone="gold" className="absolute inset-0 opacity-[0.055]" />
        <div className="absolute -top-24 left-1/4 h-[420px] w-[420px] rounded-full bg-gold-500/10 blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 h-[460px] w-[460px] rounded-full bg-emerald-500/20 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-[132px] pb-20 sm:px-6 lg:px-8 lg:pt-40 lg:pb-28">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          {/* ── Left: copy ── */}
          <div className="text-center lg:text-start">
            <Reveal>
              <span className="inline-flex items-center gap-2.5 rounded-full border border-gold-400/25 bg-gold-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-200 backdrop-blur-sm">
                <StarGlyph className="h-3.5 w-3.5 text-gold-400" />
                {t('hero.badge')}
              </span>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 font-display text-[clamp(2.7rem,5.4vw,5rem)] font-semibold leading-[1.03] tracking-[-0.02em] text-white">
                {t('hero.title_part1')}{' '}
                <span className="bg-gradient-to-r from-gold-300 via-gold-400 to-gold-200 bg-clip-text text-transparent">
                  {t('hero.title_highlight')}
                </span>{' '}
                {t('hero.title_part2')}
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-emerald-100/80 sm:text-lg lg:mx-0">
                {t('hero.subtitle')}
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link
                  to="/auth/register"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-4 text-sm font-bold text-emerald-950 shadow-[0_18px_50px_-14px_rgba(245,158,11,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-14px_rgba(245,158,11,0.8)] active:scale-[0.98] sm:w-auto"
                >
                  {t('hero.cta_primary')}
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <a
                  href="#features"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 sm:w-auto"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 9l5 3-5 3V9z" />
                  </svg>
                  {t('hero.cta_secondary')}
                </a>
              </div>
            </Reveal>

            {/* trust row */}
            <Reveal delay={320}>
              <div className="mt-8 flex items-center justify-center gap-3 lg:justify-start">
                <div className="flex -space-x-2.5">
                  {['#fbbf24', '#34d399', '#38bdf8', '#f472b6'].map((c) => (
                    <span key={c} className="h-8 w-8 rounded-full border-2 border-[#03231a]" style={{ background: c }} />
                  ))}
                </div>
                <div className="text-start">
                  <div className="flex items-center gap-1 text-gold-400">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <svg key={i} className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.28 3.94a1 1 0 00.95.69h4.15c.97 0 1.37 1.24.59 1.81l-3.36 2.44a1 1 0 00-.36 1.12l1.28 3.94c.3.92-.75 1.69-1.54 1.12l-3.35-2.44a1 1 0 00-1.18 0l-3.35 2.44c-.79.57-1.84-.2-1.54-1.12l1.28-3.94a1 1 0 00-.36-1.12L1.94 9.37c-.78-.57-.38-1.81.59-1.81h4.15a1 1 0 00.95-.69L9.05 2.93z" /></svg>
                    ))}
                  </div>
                  <p className="text-xs text-emerald-100/70">{t('hero.stat_orgs')} · {t('hero.stat_countries')}</p>
                </div>
              </div>
            </Reveal>
          </div>

          {/* ── Right: preview ── */}
          <DashboardPreview />
        </div>

        {/* ── Stat band ── */}
        <Reveal className="mt-20 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-sm sm:grid-cols-4">
          {[
            { value: 15, suffix: 'k+', labelKey: 'hero.stat_learners' },
            { value: 500, suffix: '+', labelKey: 'hero.stat_orgs' },
            { value: 99, suffix: '.9%', labelKey: 'hero.stat_uptime' },
            { value: 40, suffix: '+', labelKey: 'hero.stat_countries' },
          ].map((stat) => (
            <div key={stat.labelKey} className="bg-white/[0.02] px-6 py-8 text-center">
              <p className="font-display text-3xl font-semibold text-gold-300 sm:text-4xl">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} />
              </p>
              <p className="mt-2 text-[0.7rem] uppercase tracking-[0.22em] text-emerald-100/70">
                {t(stat.labelKey)}
              </p>
            </div>
          ))}
        </Reveal>
      </div>

      {/* bottom fade into next (cream) section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-cream-100 dark:to-obsidian-900" />
    </section>
  );
}

export default HeroSection;
