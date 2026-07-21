/**
 * Trust Section — logo band on warm cream.
 */

import { useTranslation } from 'react-i18next';
import { Reveal, StarGlyph } from './_decor';

const logos = [
  'Global Academy', 'LearnHub', 'EduPrime', 'SkillForge',
  'MindBridge', 'CloudCampus', 'NovaLearn', 'Pathway Institute',
];

export function TrustSection() {
  const { t } = useTranslation('landing');

  return (
    <section className="border-b border-emerald-900/5 bg-cream-100 py-16 font-dm dark:border-white/5 dark:bg-obsidian-900 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <p className="mb-12 text-center text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-emerald-900/45 dark:text-emerald-100/40">
            {t('trust.title')}
          </p>
        </Reveal>

        <div className="grid grid-cols-2 items-center justify-items-center gap-x-8 gap-y-10 sm:grid-cols-4">
          {logos.map((logo, i) => (
            <Reveal key={logo} delay={i * 50}>
              <div className="group flex items-center gap-2.5 opacity-60 transition-opacity duration-300 hover:opacity-100">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-900/[0.06] text-gold-600 transition-colors group-hover:bg-gold-400/15 dark:bg-white/5 dark:text-gold-400">
                  <StarGlyph className="h-4 w-4" />
                </span>
                <span className="hidden text-sm font-semibold tracking-tight text-emerald-950/70 dark:text-emerald-50/70 sm:inline">
                  {logo}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TrustSection;
