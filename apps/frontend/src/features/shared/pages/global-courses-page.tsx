import { useEffect, useState } from 'react';
import { useAuth } from '../../../store/auth-context';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Crown, GraduationCap, Search, TrendingUp } from 'lucide-react';
import api from '../../../lib/axios';
import CoursesManage from '../../admin/pages/courses-manage';

type GlobalCourse = { _id: string; title: { en: string }; description?: { en?: string }; thumbnail?: string; globalGrade: number };
export function GlobalCoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<GlobalCourse[]>([]);
  const [grade, setGrade] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<GlobalCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user?.role === 'admin') return;
    let cancelled = false;
    api.get('/courses/global').then(({ data }) => { if (!cancelled) { setCourses(data.data || []); setGrade(data.meta?.grade ?? null); } })
      .catch(() => { if (!cancelled) setError('Unable to load global courses. Please try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.role]);
  if (user?.role === 'admin') return <CoursesManage />;
  if (user?.role === 'student') return <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-950 p-6 text-white sm:p-9">
      <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full border-[28px] border-white/5" aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-200">Guuldoon{grade ? ` · Grade ${grade}` : ''}</p><h1 className="mt-5 text-3xl font-bold leading-tight sm:text-4xl">U diyaar garow<br />imtixaankaaga</h1><p className="mt-4 text-sm text-emerald-100">Cashirro, muuqaal iyo imtixaannadii hore</p></div><div className="hidden text-amber-200 min-[400px]:block" aria-hidden="true"><GraduationCap size={72} strokeWidth={1.2} /><BookOpen className="mx-auto mt-2" size={48} strokeWidth={1.2} /></div></div>
    </header>
    <Link to="/student/guuldoon/performance" className="flex items-center gap-4 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 shadow-sm"><span className="rounded-full bg-emerald-50 p-3 text-emerald-700"><TrendingUp size={25} /></span><div className="flex-1"><h2 className="font-bold">Horumarkayga</h2><p className="mt-1 text-xs text-[var(--color-text-secondary)]">La soco cashirrada aad dhammaystirtay</p></div><ArrowRight size={18} /></Link>
    {grade && <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100 p-5 text-slate-900"><span className="rounded-full bg-amber-200 p-3 text-amber-700"><Crown size={27} /></span><div className="min-w-0 flex-1"><p className="text-sm">Cashirrada, muuqaalada iyo imtixaannadii hore ee Grade {grade}</p><p className="mt-1 text-2xl font-bold text-emerald-900">$5 <span className="text-sm font-normal text-slate-600">/ sanad</span></p></div><Link to="/student/guuldoon/subscriptions" className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white">Rukumo</Link></section>}
    <section aria-labelledby="subjects-title"><h2 id="subjects-title" className="mb-4 text-2xl font-bold">Maaddooyinkaaga</h2><label className="mb-5 flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-4 py-3"><Search size={20} className="shrink-0 text-slate-400" /><input aria-label="Raadi maaddo" placeholder="Raadi maaddo..." value={search} onChange={event => setSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none" /></label>
    {loading ? <p role="status">Koorsooyinka waa la soo rarayaa...</p> : error ? <p role="alert">{error}</p> : !grade ? <p className="rounded-2xl border p-5">Koorsooyinka Guuldoon waxaa la soo bandhigayaa marka fasalkaaga la xaqiijiyo.</p> : courses.filter(c => c.globalGrade === grade && c.title.en.toLowerCase().includes(search.toLowerCase())).length === 0 ? <p className="rounded-2xl border p-5">Maaddooyin lama helin.</p> : <div className="grid gap-4 lg:grid-cols-2">{courses.filter(c => c.globalGrade === grade && c.title.en.toLowerCase().includes(search.toLowerCase())).map((course, index) => <article key={course._id} className="flex overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm"><div className={`flex w-24 shrink-0 items-center justify-center sm:w-32 ${index % 2 ? 'bg-gradient-to-br from-slate-700 to-emerald-950 text-amber-200' : 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800'}`}>{course.thumbnail ? <img src={course.thumbnail} alt="" className="h-full w-full object-cover" /> : <BookOpen size={44} strokeWidth={1.3} aria-hidden="true" />}</div><div className="min-w-0 flex-1 p-4"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Grade {grade}</span><h3 className="mt-2 break-words text-xl font-bold">{course.title.en}</h3><p className="mt-2 text-xs text-[var(--color-text-secondary)]">Cashirro · Maqal · Muuqaal</p><p className="mt-3 text-xs text-amber-700">Diyaarinta imtixaanka</p><button onClick={() => setSelected(course)} className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">Eeg koorsada <ArrowRight size={16} /></button></div></article>)}</div>}</section>
    {selected && <section className="rounded-2xl border border-emerald-200 bg-[var(--color-surface-primary)] p-6" role="region" aria-label="Course preview"><button onClick={() => setSelected(null)} className="float-right text-sm">Xir</button><p className="text-sm text-emerald-700">Grade {grade}</p><h2 className="mt-2 text-xl font-bold">{selected.title.en}</h2><p className="mt-3 text-sm">{selected.description?.en || 'Diyaarinta imtixaanka shahaadiga.'}</p><p className="mt-3 text-sm">Gelitaanka cashirrada wuxuu furmayaa marka xaqiijinta qalabka la hawlgeliyo.</p></section>}
  </main>;
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
