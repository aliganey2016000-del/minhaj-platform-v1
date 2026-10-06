import { Globe2, BookOpen } from 'lucide-react';
import { useAuth } from '../../../store/auth-context';

/** Navigation foundation only: no paid content or subscription actions yet. */
export function GlobalCoursesPage() {
  const { user } = useAuth();
  const description = user?.role === 'admin'
    ? 'A central library for Grade 8 and Grade 12 certificate exam preparation, managed by Super Admin.'
    : 'Explore centrally managed Grade 8 and Grade 12 certificate exam preparation for your school.';

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-6 sm:p-8">
        <Globe2 className="mb-4 h-9 w-9 text-primary-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Global Courses</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">{description}</p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2" aria-label="Certificate exam grades">
        {[8, 12].map((grade) => (
          <article key={grade} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-6">
            <BookOpen className="mb-3 h-6 w-6 text-primary-600" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Grade {grade}</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Lessons, audio, videos and past certificate exams.</p>
            <p className="mt-4 text-sm font-medium text-[var(--color-text-tertiary)]">Coming soon</p>
          </article>
        ))}
      </section>
      <p className="text-sm text-[var(--color-text-secondary)]">The global course library is being prepared.</p>
    </main>
  );
}
