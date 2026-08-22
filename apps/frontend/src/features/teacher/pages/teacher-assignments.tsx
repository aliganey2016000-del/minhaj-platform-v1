import { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock3, FileText, Loader2, Plus, Search, X, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';

interface Course { _id: string; title?: { en?: string } }
interface Assignment {
  _id: string;
  title: string;
  description?: string;
  dueDate: string;
  startDate?: string | null;
  totalMarks?: number;
  allowLateSubmission?: boolean;
  status?: string;
  course?: Course;
  class?: { title?: string; section?: string } | null;
  submissionCount?: number;
  totalStudents?: number;
  tab?: 'active' | 'upcoming' | 'past';
}

type Tab = 'active' | 'upcoming' | 'past';

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const isPast = (a: Assignment) => new Date(a.dueDate) < new Date();

export function TeacherAssignments() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('active');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', course: '', dueDate: '', totalMarks: '100', allowLateSubmission: false });

  const load = async (nextTab = tab) => {
    setLoading(true); setError('');
    try {
      const [a, c] = await Promise.all([
        api.get('/assignments', { params: { tab: nextTab, limit: 100 } }),
        api.get('/courses', { params: { my: 'true', limit: 200 } }),
      ]);
      setAssignments(a.data?.data || []);
      setCourses(c.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not load assignments.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? assignments.filter((a) => `${a.title} ${a.course?.title?.en || ''}`.toLowerCase().includes(q)) : assignments;
  }, [assignments, search]);

  const openCreate = () => {
    setForm({ title: '', description: '', course: courses[0]?._id || '', dueDate: '', totalMarks: '100', allowLateSubmission: false });
    setShowCreate(true); setError('');
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.course || !form.dueDate) { setError('Title, course and due date are required.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/assignments', {
        title: form.title.trim(), description: form.description.trim(), course: form.course,
        dueDate: new Date(form.dueDate).toISOString(), totalMarks: Number(form.totalMarks) || 100,
        allowLateSubmission: form.allowLateSubmission,
      });
      setShowCreate(false);
      setTab('active');
      await load('active');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not create assignment.');
    } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 lg:p-8">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-600"><FileText className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wide">Teaching</span></div>
          <h1 className="mt-1 text-2xl font-black text-[var(--color-text-primary)]">Assignments</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Create tasks, track due dates, and review student work.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"><Plus className="h-4 w-4" /> New Assignment</button>
      </header>

      <div className="mb-5 grid grid-cols-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-1">
        {(['active', 'upcoming', 'past'] as Tab[]).map((value) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-xl px-2 py-3 text-xs font-bold capitalize sm:text-sm ${tab === value ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>{value}</button>
        ))}
      </div>

      <div className="mb-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assignments or courses…" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-4 text-sm outline-none focus:border-emerald-500" />
      </div>

      {error && !showCreate && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {loading ? <div className="flex min-h-[35vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div> : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-12 text-center"><FileText className="mx-auto mb-3 h-9 w-9 text-[var(--color-text-tertiary)]" /><p className="font-semibold text-[var(--color-text-primary)]">No {tab} assignments</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Create an assignment for one of your courses.</p></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((a) => {
            const due = isPast(a) ? 'Past due' : formatDate(a.dueDate);
            return <article key={a._id} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-base font-bold text-[var(--color-text-primary)]">{a.title}</h2><p className="mt-1 text-xs font-semibold text-emerald-600">{a.course?.title?.en || 'Course'}</p>{a.class?.title && <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{a.class.title}{a.class.section ? ` · ${a.class.section}` : ''}</p>}</div><span className="shrink-0 rounded-lg bg-[var(--color-surface-secondary)] px-2 py-1 text-xs font-bold">{a.totalMarks ?? 100} marks</span></div>
              {a.description && <p className="mt-3 line-clamp-2 text-sm text-[var(--color-text-secondary)]">{a.description}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="flex items-center gap-2 rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><Calendar className="h-4 w-4 text-emerald-600" /><span><b>Due</b><br />{due}</span></div><div className="flex items-center gap-2 rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span><b>Submissions</b><br />{a.submissionCount ?? 0}{a.totalStudents ? ` / ${a.totalStudents}` : ''}</span></div></div>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-3"><span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{a.allowLateSubmission ? 'Late submissions allowed' : 'On-time only'}</span><button type="button" onClick={() => navigate(`/teacher/assignments/${a._id}/review`)} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-bold text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">Review submissions <ChevronRight className="h-4 w-4" /></button></div>
            </article>;
          })}
        </div>
      )}

      {showCreate && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.currentTarget === e.target) setShowCreate(false); }}>
        <form onSubmit={create} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-[var(--color-surface-primary)] p-5 shadow-2xl sm:rounded-3xl sm:p-6">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-black text-[var(--color-text-primary)]">New Assignment</h2><p className="text-xs text-[var(--color-text-tertiary)]">Keep it simple and clear for students.</p></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-full p-2 hover:bg-[var(--color-surface-secondary)]"><X className="h-5 w-5" /></button></div>
          {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          <div className="space-y-4">
            <label className="block text-xs font-bold">Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] px-3 py-3 text-sm" placeholder="e.g. Lesson 4 Homework" /></label>
            <label className="block text-xs font-bold">Course<select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] px-3 py-3 text-sm">{courses.length ? courses.map((c) => <option key={c._id} value={c._id}>{c.title?.en || 'Course'}</option>) : <option value="">No courses found</option>}</select></label>
            <label className="block text-xs font-bold">Instructions<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} className="mt-1 w-full resize-y rounded-xl border border-[var(--color-border-default)] px-3 py-3 text-sm" placeholder="What should students do?" /></label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-xs font-bold">Due date & time<input type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] px-3 py-3 text-sm" /></label><label className="block text-xs font-bold">Total marks<input type="number" min="1" value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] px-3 py-3 text-sm" /></label></div>
            <label className="flex min-h-12 items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-3 text-sm font-semibold"><input type="checkbox" checked={form.allowLateSubmission} onChange={(e) => setForm({ ...form, allowLateSubmission: e.target.checked })} className="h-5 w-5 accent-emerald-600" /> Allow late submissions</label>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowCreate(false)} className="min-h-11 rounded-xl border border-[var(--color-border-default)] px-4 text-sm font-bold">Cancel</button><button type="submit" disabled={saving || !courses.length} className="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create Assignment'}</button></div>
        </form>
      </div>}
    </div>
  );
}

export default TeacherAssignments;
