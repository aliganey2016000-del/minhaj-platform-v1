/**
 * Hero Section — SSI-style Landing
 *
 * Rebuild the hero to match the SSI landing page layout, colors,
 * typography, and spacing while preserving the existing hero text.
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return <span>{count.toLocaleString()}{suffix}</span>;
}

export function HeroSection() {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // No public course catalog exists yet — route the search intent into
    // sign-up so it isn't a dead end, carrying the query along so it can
    // pre-fill a real search once that page exists.
    const q = searchQuery.trim();
    navigate(q ? `/auth/register?q=${encodeURIComponent(q)}` : '/auth/register');
  };

  const container = {
    hidden: { opacity: 0, y: 28 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.85,
        ease: [0.22, 0.61, 0.36, 1],
        staggerChildren: 0.1,
        delayChildren: 0.15,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 26 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 0.61, 0.36, 1] } },
  };

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(60%_78%_at_5%_28%,_rgba(255,132,1,0.28),_rgba(0,0,0,0)_62%),radial-gradient(52%_72%_at_98%_88%,_rgba(13,111,198,0.42),_rgba(0,0,0,0)_64%),linear-gradient(138deg,_rgb(4,26,49),_rgb(7,52,95)_52%,_rgb(0,82,142))] text-white font-dm px-4 sm:px-6 lg:px-8 pt-[120px] pb-[72px]">
      <div className="absolute -top-10 -left-10 h-[480px] w-[480px] rounded-full bg-orange-500/20 blur-[120px] opacity-80" />
      <div className="absolute -bottom-24 right-0 h-[520px] w-[520px] rounded-full bg-sky-500/25 blur-[140px]" />

      <div className="relative z-10 mx-auto flex min-h-[680px] max-w-6xl flex-col items-center text-center">
        <motion.div variants={container} initial="hidden" animate="visible" className="w-full space-y-8">
          <motion.span
            variants={item}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/80 backdrop-blur-sm"
          >
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-orange-400 shadow-[0_0_0_6px_rgba(251,146,60,0.13)]" />
            {t('hero.badge')}
          </motion.span>

          <motion.h1
            variants={item}
            className="mx-auto max-w-4xl text-[clamp(2.75rem,5vw,5.75rem)] font-black leading-[0.98] tracking-[-0.045em] text-white"
          >
            {t('hero.title_part1')}
            <span className="block">{t('hero.title_highlight')} {t('hero.title_part2')}</span>
          </motion.h1>

          <motion.p variants={item} className="mx-auto max-w-2xl text-base leading-8 text-slate-200/90 sm:text-lg">
            {t('hero.subtitle')}
          </motion.p>

          <motion.div variants={item} className="mx-auto w-full max-w-3xl space-y-4">
            <form onSubmit={handleSearch} className="relative">
              <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-slate-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
              </span>
              <input
                type="search"
                aria-label="Search courses"
                placeholder="Search courses, instructors, topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-white/10 bg-white/10 py-4 ps-14 pe-36 text-sm text-white placeholder:text-slate-300 shadow-[0_30px_120px_-90px_rgba(15,23,42,0.9)] outline-none transition focus:border-white/20 focus:ring-2 focus:ring-orange-400/20"
              />
              <button
                type="submit"
                className="absolute end-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-400"
              >
                Search
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </form>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                to="/auth/register"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/10 px-7 py-3 text-sm font-semibold text-white shadow-sm shadow-white/5 transition hover:bg-white/15"
              >
                {t('hero.cta_primary')}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                {t('hero.cta_secondary')}
              </a>
            </div>
          </motion.div>

          <motion.div
            variants={item}
            className="grid w-full grid-cols-2 gap-4 border-t border-white/10 pt-10 text-start sm:grid-cols-4 sm:text-center"
          >
            {[
              { value: 15, suffix: 'k+', labelKey: 'hero.stat_learners' },
              { value: 500, suffix: '+', labelKey: 'hero.stat_orgs' },
              { value: 99, suffix: '.9%', labelKey: 'hero.stat_uptime' },
              { value: 40, suffix: '+', labelKey: 'hero.stat_countries' },
            ].map((stat) => (
              <div key={stat.labelKey} className="space-y-1">
                <p className="text-3xl font-black text-white sm:text-4xl">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                </p>
                <p className="text-[0.72rem] uppercase tracking-[0.26em] text-slate-300">
                  {t(stat.labelKey)}
                </p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

export default HeroSection;
