/**
 * Courses Section
 *
 * Responsive grid of course cards with multilingual content,
 * category badges, level indicators, and enrollment CTAs.
 */

import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Dummy course data (in production, fetched from API)
// ---------------------------------------------------------------------------

interface Course {
  id: string;
  title: { en: string; so: string; ar: string };
  category: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  duration: number;
  fee: number;
  enrolledStudents: number;
  maxStudents: number;
  thumbnail: string;
}

const dummyCourses: Course[] = [
  {
    id: '1',
    title: { en: 'Tajweed Mastery', so: 'Tajwiidka Heer Sare', ar: 'إتقان التجويد' },
    category: 'tajweed',
    level: 'intermediate',
    duration: 12,
    fee: 0,
    enrolledStudents: 87,
    maxStudents: 100,
    thumbnail: '',
  },
  {
    id: '2',
    title: { en: 'Fiqh of Worship', so: 'Fiqhiga Cibaadada', ar: 'فقه العبادات' },
    category: 'fiqh',
    level: 'beginner',
    duration: 8,
    fee: 25,
    enrolledStudents: 154,
    maxStudents: 200,
    thumbnail: '',
  },
  {
    id: '3',
    title: { en: 'Quran Memorization', so: 'Xifdinta Qur\'aanka', ar: 'حفظ القرآن' },
    category: 'quran',
    level: 'advanced',
    duration: 24,
    fee: 0,
    enrolledStudents: 63,
    maxStudents: 80,
    thumbnail: '',
  },
  {
    id: '4',
    title: { en: 'Arabic for Beginners', so: 'Carabiga Bilowga', ar: 'العربية للمبتدئين' },
    category: 'arabic',
    level: 'beginner',
    duration: 10,
    fee: 30,
    enrolledStudents: 210,
    maxStudents: 250,
    thumbnail: '',
  },
  {
    id: '5',
    title: { en: 'Aqeedah Foundations', so: 'Aasaaska Cajiidada', ar: 'أسس العقيدة' },
    category: 'aqeedah',
    level: 'beginner',
    duration: 6,
    fee: 0,
    enrolledStudents: 94,
    maxStudents: 120,
    thumbnail: '',
  },
  {
    id: '6',
    title: { en: 'Seerah of the Prophet', so: 'Siirada Nebiga ﷺ', ar: 'السيرة النبوية' },
    category: 'seerah',
    level: 'intermediate',
    duration: 14,
    fee: 20,
    enrolledStudents: 72,
    maxStudents: 90,
    thumbnail: '',
  },
];

// ---------------------------------------------------------------------------
// Icon map per category
// ---------------------------------------------------------------------------

const categoryIcons: Record<string, string> = {
  quran: '📖',
  fiqh: '⚖️',
  aqeedah: '🕌',
  seerah: '📜',
  arabic: '🗣️',
  tajweed: '🎙️',
  hadith: '📚',
  akhlaq: '💎',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CourseCard({ course, index }: { course: Course; index: number }) {
  const { t, i18n } = useTranslation('landing');
  const lang = i18n.language as 'en' | 'so' | 'ar';

  const title = course.title[lang] || course.title.en;
  const seatsLeft = course.maxStudents - course.enrolledStudents;

  return (
    <motion.article
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1"
    >
      {/* Thumbnail area */}
      <div className="relative h-48 overflow-hidden bg-gradient-to-br from-primary-100 via-primary-50 to-gold-100 dark:from-primary-950 dark:via-primary-900 dark:to-gold-950">
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-6xl opacity-30 grayscale group-hover:opacity-50 group-hover:grayscale-0 transition-all duration-500">
            {categoryIcons[course.category] || '📚'}
          </span>
        </div>

        {/* Category badge */}
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 dark:bg-black/60 backdrop-blur-sm px-3 py-1 text-xs font-semibold text-[var(--color-text-primary)] shadow-sm">
            {t(`courses.${course.category}` as any, { defaultValue: course.category })}
          </span>
        </div>

        {/* Level badge */}
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm
            ${course.level === 'beginner' ? 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300' : ''}
            ${course.level === 'intermediate' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' : ''}
            ${course.level === 'advanced' ? 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300' : ''}
          `}>
            {t(`courses.${course.level}`)}
          </span>
        </div>

        {/* Free badge */}
        {course.fee === 0 && (
          <div className="absolute bottom-3 left-3">
            <span className="inline-flex items-center rounded-full bg-primary-600/90 backdrop-blur-sm px-3 py-1 text-xs font-bold text-white shadow-md">
              {t('courses.free')}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold text-[var(--color-text-primary)] line-clamp-2 mb-2">
          {title}
        </h3>

        {/* Meta info */}
        <div className="mt-auto space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-text-tertiary)]">
              {course.duration} {t('courses.duration_label')}
            </span>
            <span className="text-[var(--color-text-tertiary)]">
              {course.enrolledStudents} {t('courses.students_enrolled')}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-500"
              style={{ width: `${(course.enrolledStudents / course.maxStudents) * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
            <span>{seatsLeft} {t('courses.seats_available')}</span>
            {course.fee > 0 && (
              <span className="font-semibold text-primary-600 dark:text-primary-400">
                ${course.fee}
              </span>
            )}
          </div>

          {/* CTA */}
          <button
            className="mt-3 w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary-600/20 transition-all hover:bg-primary-700 hover:shadow-lg active:scale-[0.98]"
          >
            {t('courses.enroll_cta')}
          </button>
        </div>
      </div>
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CoursesSection() {
  const { t } = useTranslation('landing');

  return (
    <section
      id="courses"
      className="py-20 lg:py-28 bg-[var(--color-surface-secondary)]"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-14 text-center"
        >
          <h2 className="text-3xl font-extrabold text-[var(--color-text-primary)] sm:text-4xl lg:text-5xl">
            {t('courses.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--color-text-secondary)]">
            {t('courses.subtitle')}
          </p>
        </motion.div>

        {/* Course Grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {dummyCourses.map((course, idx) => (
            <CourseCard key={course.id} course={course} index={idx} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default CoursesSection;