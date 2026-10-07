import { useEffect, useState } from 'react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';
import CoursesManage from '../../admin/pages/courses-manage';

type GlobalCourse = { _id: string; title: { en: string }; description?: { en?: string }; globalGrade: number };
export function GlobalCoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<GlobalCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user?.role === 'admin') return;
    let cancelled = false;
    api.get('/courses/global').then(({ data }) => { if (!cancelled) setCourses(data.data || []); })
      .catch(() => { if (!cancelled) setError('Unable to load global courses. Please try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.role]);
  if (user?.role === 'admin') return <CoursesManage />;
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <h1 className="text-2xl font-bold">Guuldoon Courses</h1>
    <p>Grade 8 and Grade 12 certificate exam preparation, managed by Super Admin.</p>
    {loading ? <p>Loading courses...</p> : error ? <p role="alert">{error}</p> : courses.length === 0 ? <p>No global courses have been published yet.</p> :
      <section className="grid gap-4 sm:grid-cols-2">{courses.map(course => <article key={course._id} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-6">
        <p className="text-sm text-primary-600">Grade {course.globalGrade}</p>
        <h2 className="mt-2 text-lg font-semibold">{course.title.en}</h2>
        <p className="mt-2 text-sm">{course.description?.en}</p>
        <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">Learning access will open when subscriptions are available.</p>
      </article>)}</section>}
  </main>;
}
