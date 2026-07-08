/**
 * Hero Section
 *
 * High-impact hero with elegant Islamic typography on the left,
 * animated abstract geometric pattern on the right.
 * Framer Motion reveal effects for a premium feel.
 */

import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="text-center sm:text-left"
    >
      <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
        {value}
      </p>
      <p className="text-sm text-[var(--color-text-tertiary)]">{label}</p>
    </motion.div>
  );
}

/** Abstract Islamic geometric pattern — purely decorative SVG */
function GeometricPattern() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="absolute inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      {/* Concentric ornament circles */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]">
        <svg viewBox="0 0 400 400" className="animate-spin-slow opacity-[0.06] dark:opacity-[0.08]">
          <circle cx="200" cy="200" r="190" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-primary-500" />
          <circle cx="200" cy="200" r="160" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-primary-500" />
          <circle cx="200" cy="200" r="130" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-primary-500" />
          <circle cx="200" cy="200" r="100" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-gold-500" />
          <circle cx="200" cy="200" r="70" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-gold-500" />
          {/* Eight-pointed star */}
          <polygon points="200,40 220,170 200,200 180,170" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-gold-500" />
          <polygon points="200,360 220,230 200,200 180,230" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-gold-500" />
          <polygon points="40,200 170,180 200,200 170,220" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-gold-500" />
          <polygon points="360,200 230,180 200,200 230,220" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-gold-500" />
          {/* Diagonal lines */}
          <line x1="60" y1="60" x2="340" y2="340" stroke="currentColor" strokeWidth="0.3" className="text-primary-500" />
          <line x1="340" y1="60" x2="60" y2="340" stroke="currentColor" strokeWidth="0.3" className="text-primary-500" />
          <line x1="200" y1="10" x2="200" y2="390" stroke="currentColor" strokeWidth="0.3" className="text-primary-500" />
          <line x1="10" y1="200" x2="390" y2="200" stroke="currentColor" strokeWidth="0.3" className="text-primary-500" />
        </svg>
      </div>

      {/* Floating accent orbs */}
      <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full bg-primary-500/10 dark:bg-primary-400/15 blur-3xl animate-float" />
      <div className="absolute bottom-1/4 left-1/4 w-48 h-48 rounded-full bg-gold-500/10 dark:bg-gold-400/15 blur-3xl animate-float-delayed" />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function HeroSection() {
  const { t } = useTranslation('landing');

  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.1 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
  };

  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center overflow-hidden pt-18
                 bg-geometric bg-[var(--color-surface-secondary)] dark:bg-grid"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* ── Left Column: Typography ── */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="space-y-8"
          >
            {/* Subtle label */}
            <motion.div variants={item}>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/50 px-4 py-1.5 text-xs font-semibold text-primary-700 dark:text-primary-300">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-500 animate-pulse-soft" />
                {t('hero.cta_secondary')}
              </span>
            </motion.div>

            {/* Main heading */}
            <motion.h1
              variants={item}
              className="text-4xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-5xl lg:text-6xl xl:text-7xl leading-[1.1]"
            >
              {t('hero.title')}
              <span className="mt-2 block text-gradient-gold">
                مسجد الرحمة
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={item}
              className="max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)] sm:text-xl"
            >
              {t('hero.subtitle')}
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={item}
              className="flex flex-wrap gap-4 pt-2"
            >
              <Link
                to="/#programs"
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-primary-600/25 transition-all hover:bg-primary-700 hover:shadow-xl hover:shadow-primary-600/30 active:scale-[0.98]"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                {t('hero.cta_primary')}
              </Link>
              <a
                href="/#about"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-7 py-3.5 text-base font-semibold text-[var(--color-text-primary)] shadow-sm transition-all hover:bg-[var(--color-surface-tertiary)] hover:shadow-md active:scale-[0.98]"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('hero.cta_secondary')}
              </a>
            </motion.div>

            {/* Stats row */}
            <motion.div
              variants={item}
              className="flex flex-wrap gap-8 pt-4 border-t border-[var(--color-border-subtle)]"
            >
              <StatItem value="2,500+" label={t('hero.stats_students')} />
              <StatItem value="45+" label={t('hero.stats_teachers')} />
              <StatItem value="120+" label={t('hero.stats_courses')} />
              <StatItem value="15+" label={t('hero.stats_countries')} />
            </motion.div>
          </motion.div>

          {/* ── Right Column: Visual ── */}
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="relative hidden lg:flex items-center justify-center"
          >
            {/* Premium mockup / geometric pattern */}
            <GeometricPattern />

            {/* Central decorative element */}
            <div className="relative flex h-80 w-80 items-center justify-center rounded-full bg-primary-600/5 dark:bg-primary-400/10 shadow-gold-sm backdrop-blur-sm">
              <div className="flex h-64 w-64 items-center justify-center rounded-full bg-primary-600/10 dark:bg-primary-400/15 shadow-gold-md">
                <div className="flex h-48 w-48 items-center justify-center rounded-full bg-primary-600/15 dark:bg-primary-400/20 shadow-gold-lg">
                  <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-2xl shadow-primary-600/40">
                    <svg className="h-16 w-16" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5zm0 17.5c-4.2-1.4-8-4.93-8-9V8.81l8-4 8 4V10.5c0 4.07-3.8 7.6-8 9z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;