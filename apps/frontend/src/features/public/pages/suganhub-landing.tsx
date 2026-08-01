/**
 * Suganhub Landing Page — a dedicated marketing page for the "suganhub.com"
 * custom domain, distinct from the generic multi-tenant SaaS landing page.
 * Positions Suganhub as a modern learning center spanning 21st-century
 * skills, languages, Islamic studies, mathematics, science, and life
 * skills. Reuses the shared "Emerald & Gold" decor primitives so it reads
 * as part of the same product family, but is otherwise a standalone,
 * hand-written page (no i18n dependency) so it can evolve independently.
 */

import { Link } from 'react-router-dom';
import {
  Sparkles,
  Languages,
  Moon,
  Calculator,
  FlaskConical,
  HeartHandshake,
  ArrowRight,
} from 'lucide-react';
import { IslamicPattern, StarGlyph, Eyebrow, Reveal } from '../../../components/landing/_decor';

const PROGRAMS = [
  {
    icon: Sparkles,
    title: '21st-Century Skills',
    description: 'Critical thinking, digital literacy, and creativity for a fast-changing world.',
  },
  {
    icon: Languages,
    title: 'Languages',
    description: 'Arabic, English, and Somali — built for real fluency, not just grammar drills.',
  },
  {
    icon: Moon,
    title: 'Islamic Studies',
    description: 'Qur’an, Aqeedah, and character rooted in authentic knowledge.',
  },
  {
    icon: Calculator,
    title: 'Mathematics',
    description: 'From foundational arithmetic to problem-solving that sticks.',
  },
  {
    icon: FlaskConical,
    title: 'Science',
    description: 'Curiosity-driven learning across biology, chemistry, and physics.',
  },
  {
    icon: HeartHandshake,
    title: 'Life Skills',
    description: 'Discipline, teamwork, and character for life beyond the classroom.',
  },
];

export function SuganhubLandingPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-[#03231a] font-dm text-white">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_15%_10%,rgba(212,162,74,0.22),transparent_55%),radial-gradient(65%_70%_at_90%_90%,rgba(5,150,105,0.4),transparent_60%),linear-gradient(160deg,#03231a,#04372a_55%,#022c22)]" />
          <IslamicPattern tone="gold" className="absolute inset-0 opacity-[0.055]" />
          <div className="absolute -top-24 left-1/4 h-[420px] w-[420px] rounded-full bg-gold-500/10 blur-[130px]" />
          <div className="absolute bottom-0 right-1/4 h-[460px] w-[460px] rounded-full bg-emerald-500/20 blur-[140px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 pt-[140px] pb-24 text-center sm:px-6 lg:px-8 lg:pt-48 lg:pb-32">
          <Reveal>
            <span className="inline-flex items-center gap-2.5 rounded-full border border-gold-400/25 bg-gold-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-200 backdrop-blur-sm">
              <StarGlyph className="h-3.5 w-3.5 text-gold-400" />
              A Center for Modern Learning
            </span>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mt-6 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
              Welcome to{' '}
              <span className="bg-gradient-to-r from-gold-300 via-gold-400 to-gold-200 bg-clip-text text-transparent">
                Suganhub
              </span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-emerald-100/80 sm:text-lg">
              A modern learning center built around six pillars: 21st-century skills, languages,
              Islamic studies, mathematics, science, and life skills — where every student is
              equipped for both this world and the next.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/auth/login"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-4 text-sm font-bold text-emerald-950 shadow-[0_18px_50px_-14px_rgba(245,158,11,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-14px_rgba(245,158,11,0.8)] active:scale-[0.98] sm:w-auto"
              >
                Log In to Your Portal
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" strokeWidth={2.5} />
              </Link>
              <a
                href="#programs"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 sm:w-auto"
              >
                Explore Our Programs
              </a>
            </div>
          </Reveal>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-cream-100 dark:to-obsidian-900" />
      </section>

      {/* ── Programs ── */}
      <section id="programs" className="relative overflow-hidden bg-cream-100 py-24 font-dm dark:bg-obsidian-900 lg:py-32">
        <IslamicPattern tone="emerald" className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.04]" />

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center lg:mb-20">
            <Reveal><Eyebrow center>Our Programs</Eyebrow></Reveal>
            <Reveal delay={80}>
              <h2 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-emerald-950 dark:text-white">
                Six pillars, one center
              </h2>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-5 text-base leading-8 text-emerald-950/60 dark:text-emerald-50/60 sm:text-lg">
                A well-rounded education that balances faith, knowledge, and real-world readiness.
              </p>
            </Reveal>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PROGRAMS.map((program, i) => (
              <Reveal key={program.title} delay={i * 60}>
                <div className="group h-full rounded-3xl border border-emerald-900/[0.07] bg-white/80 p-6 shadow-[0_2px_10px_-4px_rgba(3,35,26,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-gold-400/40 hover:shadow-[0_24px_50px_-24px_rgba(3,35,26,0.28)] dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:border-gold-400/30">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-cream-200 ring-1 ring-emerald-900/5 transition-transform duration-300 group-hover:scale-110 dark:from-emerald-950/60 dark:to-emerald-900/30 dark:ring-white/10">
                    <program.icon className="h-6 w-6 text-emerald-700 dark:text-gold-300" strokeWidth={1.75} />
                  </div>
                  <h3 className="mb-2 font-display text-lg font-semibold tracking-tight text-emerald-950 dark:text-white">
                    {program.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-emerald-950/55 dark:text-emerald-50/55">
                    {program.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
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
              Ready to begin?
            </h2>
          </Reveal>

          <Reveal delay={140}>
            <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-emerald-100/70 sm:text-lg">
              Students, teachers, and parents — sign in to your Suganhub portal to get started.
            </p>
          </Reveal>

          <Reveal delay={210}>
            <div className="mt-10">
              <Link
                to="/auth/login"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-4 text-sm font-bold text-emerald-950 shadow-[0_18px_50px_-14px_rgba(245,158,11,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-14px_rgba(245,158,11,0.8)] active:scale-[0.98]"
              >
                Log In
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" strokeWidth={2.5} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

export default SuganhubLandingPage;
