/**
 * Suganhub Landing Page — the official landing page for the "suganhub.com"
 * custom domain, per the approved copy/layout brief: Hero, 6 Pillars,
 * Credibility (social proof), and FAQ. Reuses the shared "Emerald & Gold"
 * decor primitives so it reads as part of the same product family, but is
 * otherwise a standalone, hand-written page (no i18n dependency) so it can
 * evolve independently of the main sahaledu.com marketing copy.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { IslamicPattern, StarGlyph, Eyebrow, Reveal } from '../../../components/landing/_decor';

const PILLARS = [
  {
    icon: '💻',
    title: 'Tech & Critical Thinking',
    lead: '21st-Century Skills:',
    body: 'Mastering the fundamentals of coding, utilizing AI responsibly, and developing advanced problem-solving mindsets.',
  },
  {
    icon: '🕌',
    title: 'Islamic Studies & Tarbiyah',
    lead: 'Character Building:',
    body: 'Deepening knowledge in Qur’an and Aqeedah, while nurturing authentic moral values rooted in Islamic principles.',
  },
  {
    icon: '🗣️',
    title: 'Languages & Communication',
    lead: 'True Fluency:',
    body: 'Building real-world communication confidence and absolute command in Arabic, English, and Somali.',
  },
  {
    icon: '📐',
    title: 'Mathematics & Logic',
    lead: 'Analytical Minds:',
    body: 'From core arithmetic to advanced logic, sharpening the cognitive faculties needed for strategic thinking.',
  },
  {
    icon: '🧪',
    title: 'Science & Inquiry',
    lead: 'Exploring the World:',
    body: 'Sparking deep intellectual curiosity through hands-on, digital-friendly learning in Biology, Chemistry, and Physics.',
  },
  {
    icon: '🤝',
    title: 'Life Skills & Leadership',
    lead: 'Beyond the Classroom:',
    body: 'Instilling personal discipline, collaborative teamwork, and time management to foster confident future leaders.',
  },
];

const STATS = [
  { icon: '📊', value: '500+', label: 'Empowered Students and active learners.' },
  { icon: '🎓', value: '15+', label: 'Expert Instructors specializing in modern science and Islamic studies.' },
  { icon: '💻', value: '100%', label: 'Tech-Integrated interactive learning experience.' },
];

const FAQS = [
  {
    q: 'Who can enroll at Suganhub?',
    a: 'Suganhub welcomes students across primary and secondary levels. Each student is placed according to age and academic readiness.',
  },
  {
    q: 'Is Suganhub only religious education?',
    a: 'No — Suganhub delivers a balanced curriculum across all six pillars: technology, Islamic studies, languages, mathematics, science, and life skills.',
  },
  {
    q: 'Do you really teach coding to young students?',
    a: 'Yes. Coding fundamentals and responsible AI use are introduced early and built up year over year alongside every other subject.',
  },
  {
    q: 'How do I get started?',
    a: 'Log in to the Suganhub portal to enroll, or reach out using the contact details in the footer and our team will guide you through admissions.',
  },
];

function FAQItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-emerald-900/[0.07] bg-white/80 backdrop-blur-sm dark:border-white/[0.07] dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="font-display text-base font-semibold text-emerald-950 dark:text-white">{q}</span>
        <ChevronDown className={`h-5 w-5 flex-shrink-0 text-emerald-700/60 transition-transform duration-300 dark:text-emerald-200/60 ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
      </button>
      {open && (
        <p className="px-6 pb-5 text-sm leading-relaxed text-emerald-950/60 dark:text-emerald-50/60">{a}</p>
      )}
    </div>
  );
}

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

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-[140px] pb-24 sm:px-6 lg:px-8 lg:pt-48 lg:pb-32">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            {/* ── Left: copy ── */}
            <div className="text-center lg:text-start">
              <Reveal>
                <span className="inline-flex items-center gap-2.5 rounded-full border border-gold-400/25 bg-gold-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-200 backdrop-blur-sm">
                  <StarGlyph className="h-3.5 w-3.5 text-gold-400" />
                  A Center for Modern Learning
                </span>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="mt-6 font-display text-[clamp(2.4rem,5.4vw,4rem)] font-semibold leading-[1.06] tracking-[-0.02em] text-white">
                  Suganhub: Where{' '}
                  <span className="bg-gradient-to-r from-gold-300 via-gold-400 to-gold-200 bg-clip-text text-transparent">
                    Faith, Science, and Technology
                  </span>{' '}
                  Converge.
                </h1>
              </Reveal>

              <Reveal delay={160}>
                <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-emerald-100/80 sm:text-lg lg:mx-0">
                  Empowering the next generation with a balanced, forward-thinking education. Built
                  around six core pillars, Suganhub equips students with essential technology
                  skills, academic excellence, and strong spiritual grounding needed to lead in
                  tomorrow's world.
                </p>
              </Reveal>

              <Reveal delay={240}>
                <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                  <a
                    href="#pillars"
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-4 text-sm font-bold text-emerald-950 shadow-[0_18px_50px_-14px_rgba(245,158,11,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-14px_rgba(245,158,11,0.8)] active:scale-[0.98] sm:w-auto"
                  >
                    Explore Our Programs
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" strokeWidth={2.5} />
                  </a>
                  <Link
                    to="/auth/login"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 sm:w-auto"
                  >
                    Log In to Portal
                  </Link>
                </div>
              </Reveal>
            </div>

            {/* ── Right: visual ── */}
            <Reveal delay={140} className="relative">
              <div className="relative overflow-hidden rounded-[26px] border border-white/15 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.75)]">
                <img
                  src="/images/suganhub-hero.png"
                  alt="Suganhub students and teacher learning together in a modern, faith-centered classroom"
                  className="aspect-[4/3] w-full object-cover"
                  loading="eager"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#03231a]/40 via-transparent to-transparent" />
              </div>

              {/* floating badge */}
              <div className="absolute -end-4 -bottom-6 hidden animate-float items-center gap-2.5 rounded-2xl border border-white/15 bg-emerald-950/80 px-4 py-3 shadow-xl backdrop-blur-md sm:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 text-emerald-950">🎖️</div>
                <div>
                  <p className="text-[11px] font-semibold text-white">6 Core Pillars</p>
                  <p className="text-[10px] text-emerald-200/70">One balanced education</p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-cream-100 dark:to-obsidian-900" />
      </section>

      {/* ── The 6 Pillars ── */}
      <section id="pillars" className="relative overflow-hidden bg-cream-100 py-24 font-dm dark:bg-obsidian-900 lg:py-32">
        <IslamicPattern tone="emerald" className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.04]" />

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center lg:mb-20">
            <Reveal><Eyebrow center>Our Pillars</Eyebrow></Reveal>
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
            {PILLARS.map((pillar, i) => (
              <Reveal key={pillar.title} delay={(i % 3) * 60}>
                <div className="group h-full rounded-3xl border border-emerald-900/[0.07] bg-white/80 p-6 shadow-[0_2px_10px_-4px_rgba(3,35,26,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-gold-400/40 hover:shadow-[0_24px_50px_-24px_rgba(3,35,26,0.28)] dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:border-gold-400/30">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-cream-200 text-2xl ring-1 ring-emerald-900/5 transition-transform duration-300 group-hover:scale-110 dark:from-emerald-950/60 dark:to-emerald-900/30 dark:ring-white/10">
                    {pillar.icon}
                  </div>
                  <h3 className="mb-2 font-display text-lg font-semibold tracking-tight text-emerald-950 dark:text-white">
                    {pillar.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-emerald-950/55 dark:text-emerald-50/55">
                    <span className="font-semibold text-emerald-950/80 dark:text-emerald-50/80">{pillar.lead}</span> {pillar.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Credibility / Social Proof ── */}
      <section className="relative overflow-hidden bg-[#03231a] py-24 font-dm text-white lg:py-32">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_0%,rgba(212,162,74,0.14),transparent_60%),radial-gradient(60%_60%_at_10%_100%,rgba(5,150,105,0.3),transparent_65%),linear-gradient(180deg,#03231a,#04352a_60%,#03231a)]" />
          <IslamicPattern tone="gold" className="absolute inset-0 opacity-[0.05]" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <Reveal><Eyebrow center className="!text-gold-300">Social Proof</Eyebrow></Reveal>
            <Reveal delay={80}>
              <h2 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
                Why Parents Choose Suganhub
              </h2>
            </Reveal>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {STATS.map((stat, i) => (
              <Reveal key={stat.label} delay={i * 80}>
                <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 text-center backdrop-blur-sm">
                  <p className="text-3xl">{stat.icon}</p>
                  <p className="mt-3 font-display text-3xl font-semibold text-gold-300">{stat.value}</p>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-100/65">{stat.label}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200}>
            <blockquote className="mx-auto mt-12 max-w-2xl rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-center backdrop-blur-sm">
              <p className="font-display text-lg leading-relaxed text-white sm:text-xl">
                "I was amazed to see my child seamlessly balancing Qur’an memorization with learning
                basic animation and coding logic. Suganhub is truly built for the future!"
              </p>
              <footer className="mt-4 text-sm font-semibold text-gold-300">— Proud Parent</footer>
            </blockquote>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="relative overflow-hidden bg-cream-100 py-24 font-dm dark:bg-obsidian-900 lg:py-32">
        <IslamicPattern tone="emerald" className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.04]" />

        <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <Reveal><Eyebrow center>FAQ</Eyebrow></Reveal>
            <Reveal delay={80}>
              <h2 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-emerald-950 dark:text-white">
                Frequently Asked Questions
              </h2>
            </Reveal>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <Reveal key={faq.q} delay={i * 60}>
                <FAQItem q={faq.q} a={faq.a} defaultOpen={i === 0} />
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
              Students, teachers, and parents — log in to your Suganhub portal to get started.
            </p>
          </Reveal>

          <Reveal delay={210}>
            <div className="mt-10">
              <Link
                to="/auth/login"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-4 text-sm font-bold text-emerald-950 shadow-[0_18px_50px_-14px_rgba(245,158,11,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-14px_rgba(245,158,11,0.8)] active:scale-[0.98]"
              >
                Log In to Portal
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
