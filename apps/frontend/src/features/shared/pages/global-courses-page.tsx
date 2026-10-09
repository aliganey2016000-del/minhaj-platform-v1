import { useEffect, useState } from 'react';
import { useAuth } from '../../../store/auth-context';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Crown, GraduationCap, Search } from 'lucide-react';
import api from '../../../lib/axios';
import CoursesManage from '../../admin/pages/courses-manage';

type GlobalCourse = {
  _id: string;
  title: { en: string };
  description?: { en?: string };
  thumbnail?: string;
  globalGrade: number;
};

export function GlobalCoursesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<GlobalCourse[]>([]);
  const [grade, setGrade] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openingCourseId, setOpeningCourseId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState('');
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') return;
    let cancelled = false;

    api.get('/courses/global')
      .then(({ data }) => {
        if (!cancelled) {
          setCourses(data.data || []);
          setGrade(data.meta?.grade ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load global courses. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'student') return;
    let cancelled = false;
    api.get('/global-subscriptions/mine')
      .then(({ data }) => {
        const now = Date.now();
        const rows: any[] = data.data || [];
        const active = rows.some(row => row.status === 'approved' && Date.parse(row.startsAt) <= now && Date.parse(row.expiresAt) > now);
        if (!cancelled) setSubscribed(active);
      })
      .catch(() => { if (!cancelled) setSubscribed(false); });
    return () => { cancelled = true; };
  }, [user?.role]);

  const openGuuldoonCourse = async (course: GlobalCourse) => {
    if (openingCourseId) return;

    setOpeningCourseId(course._id);
    setAccessError('');

    try {
      await api.post(`/guuldoon/courses/${course._id}/open`);
      navigate(`/student/guuldoon/courses/${course._id}`);
    } catch (err: any) {
      setAccessError(
        err.response?.data?.message
        || 'Koorsada lama furi karin. Hubi rukumashada iyo xaqiijinta qalabka.',
      );
    } finally {
      setOpeningCourseId(null);
    }
  };

  if (user?.role === 'admin') return <CoursesManage />;

  if (user?.role === 'student') {
    const filteredCourses = courses.filter(
      course => course.globalGrade === grade
        && course.title.en.toLowerCase().includes(search.toLowerCase()),
    );

    return (
      <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-950 p-6 text-white sm:p-9">
          <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full border-[28px] border-white/5" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-200">
                Guuldoon{grade ? ` · Grade ${grade}` : ''}
              </p>
              <h1 className="mt-5 text-3xl font-bold leading-tight sm:text-4xl">
                U diyaar garow
                <br />
                imtixaankaaga
              </h1>
              <p className="mt-4 text-sm text-emerald-100">Cashirro, muuqaal iyo imtixaannadii hore</p>
            </div>
            <div className="hidden text-amber-200 min-[400px]:block" aria-hidden="true">
              <GraduationCap size={72} strokeWidth={1.2} />
              <BookOpen className="mx-auto mt-2" size={48} strokeWidth={1.2} />
            </div>
          </div>
        </header>

        {grade && subscribed === false && (
          <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100 p-5 text-slate-900">
            <span className="rounded-full bg-amber-200 p-3 text-amber-700">
              <Crown size={27} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">Cashirrada, muuqaalada iyo imtixaannadii hore ee Grade {grade}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">
                $5 <span className="text-sm font-normal text-slate-600">/ sanad</span>
              </p>
            </div>
            <Link
              to="/student/guuldoon/subscriptions"
              className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white"
            >
              Rukumo
            </Link>
          </section>
        )}

        <section aria-labelledby="subjects-title">
          <h2 id="subjects-title" className="mb-4 text-2xl font-bold">Maaddooyinkaaga</h2>

          <label className="mb-5 flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-4 py-3">
            <Search size={20} className="shrink-0 text-slate-400" />
            <input
              aria-label="Raadi maaddo"
              placeholder="Raadi maaddo..."
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>

          {accessError && (
            <div
              role="alert"
              className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
            >
              <p>{accessError}</p>
              <div className="mt-2 flex flex-wrap gap-4 text-xs font-bold">
                <Link to="/student/guuldoon/subscriptions" className="underline">Hubi rukumashada</Link>
                <Link to="/student/guuldoon/devices" className="underline">Hubi qalabka</Link>
              </div>
            </div>
          )}

          {loading ? (
            <p role="status">Koorsooyinka waa la soo rarayaa...</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : !grade ? (
            <p className="rounded-2xl border p-5">Koorsooyinka Guuldoon waxaa la soo bandhigayaa marka fasalkaaga la xaqiijiyo.</p>
          ) : filteredCourses.length === 0 ? (
            <p className="rounded-2xl border p-5">Maaddooyin lama helin.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredCourses.map((course, index) => {
                const opening = openingCourseId === course._id;

                return (
                  <button
                    key={course._id}
                    type="button"
                    onClick={() => void openGuuldoonCourse(course)}
                    disabled={!!openingCourseId}
                    aria-label={`Fur koorsada ${course.title.en}`}
                    className="group flex w-full overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-70"
                  >
                    <div className={`flex w-24 shrink-0 items-center justify-center sm:w-32 ${
                      index % 2
                        ? 'bg-gradient-to-br from-slate-700 to-emerald-950 text-amber-200'
                        : 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800'
                    }`}>
                      {course.thumbnail ? (
                        <img src={course.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <BookOpen size={44} strokeWidth={1.3} aria-hidden="true" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 p-4">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Grade {grade}
                      </span>
                      <h3 className="mt-2 break-words text-xl font-bold">{course.title.en}</h3>
                      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Cashirro · Maqal · Muuqaal</p>
                      <p className="mt-3 text-xs text-amber-700">Diyaarinta imtixaanka</p>
                      <span className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                        {opening ? 'Waa la furayaa...' : 'Fur koorsada'}
                        <ArrowRight
                          size={16}
                          className={opening ? 'animate-pulse' : 'transition-transform group-hover:translate-x-1'}
                        />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Guuldoon Courses</h1>
      <p>Grade 8 and Grade 12 certificate exam preparation, managed by Super Admin.</p>
      {loading ? (
        <p>Loading courses...</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : courses.length === 0 ? (
        <p>No global courses have been published yet.</p>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2">
          {courses.map(course => (
            <article
              key={course._id}
              className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-6"
            >
              <p className="text-sm text-primary-600">Grade {course.globalGrade}</p>
              <h2 className="mt-2 text-lg font-semibold">{course.title.en}</h2>
              <p className="mt-2 text-sm">{course.description?.en}</p>
              <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
                Learning access will open when subscriptions are available.
              </p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
