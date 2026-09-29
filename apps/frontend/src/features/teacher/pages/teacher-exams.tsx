import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileText,
  Grid2X2,
  List,
  ListChecks,
  MapPin,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';
import { toTitleCase } from '../../../lib/format';
import { TeacherExamWorkflowNav } from '../components/teacher-exam-workflow-nav';

interface Exam {
  _id: string;
  title: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  room?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  paperStatus?: 'draft' | 'submitted' | 'approved' | 'rejected' | null;
  course?: { _id: string; title?: { en?: string }; class?: { title?: string; section?: string } };
}

type ViewMode = 'card' | 'table';

const dayKey = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
};

function effectiveStatus(exam: Exam) {
  if (exam.status === 'cancelled') return 'cancelled';
  if (!exam.examDate || !exam.startTime || !exam.endTime) return exam.status;
  const day = dayKey(exam.examDate);
  const start = new Date(`${day}T${exam.startTime}:00`);
  const end = new Date(`${day}T${exam.endTime}:00`);
  const now = new Date();
  if (now >= start && now <= end) return 'ongoing';
  if (now > end) return 'completed';
  return 'scheduled';
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function Status({ value }: { value: string }) {
  const classes: Record<string, string> = {
    scheduled: 'border border-blue-500/30 bg-blue-500/10 text-blue-300',
    ongoing: 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
    completed: 'border border-violet-400/30 bg-violet-500/10 text-violet-300',
    cancelled: 'border border-red-400/30 bg-red-500/10 text-red-300',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${classes[value] || classes.scheduled}`}>{value}</span>;
}

function PaperStatus({ value }: { value?: Exam['paperStatus'] }) {
  const status = value || 'not started';
  return (
    <span className="inline-flex rounded-full bg-slate-700/70 px-2.5 py-1 text-[10px] font-semibold capitalize text-slate-300">
      Paper: {status}
    </span>
  );
}

function subjectTone(subject: string) {
  const key = subject.toLowerCase();
  if (key.includes('biology')) return {
    border: 'border-emerald-500/30',
    glow: 'shadow-[0_18px_45px_rgba(16,185,129,0.08)]',
    text: 'text-emerald-400',
    icon: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  };
  if (key.includes('chem')) return {
    border: 'border-fuchsia-500/30',
    glow: 'shadow-[0_18px_45px_rgba(217,70,239,0.07)]',
    text: 'text-fuchsia-400',
    icon: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400',
  };
  if (key.includes('geo')) return {
    border: 'border-amber-500/30',
    glow: 'shadow-[0_18px_45px_rgba(245,158,11,0.07)]',
    text: 'text-amber-400',
    icon: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  };
  return {
    border: 'border-sky-500/30',
    glow: 'shadow-[0_18px_45px_rgba(14,165,233,0.07)]',
    text: 'text-sky-400',
    icon: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  };
}

export function TeacherExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('teacher-exam-view-mode');
    return saved === 'table' ? 'table' : 'card';
  });
  const [compact, setCompact] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/exams', { params: { limit: 200 } });
      setExams(data?.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load your exam workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { localStorage.setItem('teacher-exam-view-mode', viewMode); }, [viewMode]);

  const visible = useMemo(() => exams.filter((exam) => {
    const status = effectiveStatus(exam);
    const text = `${exam.title} ${exam.course?.title?.en || ''} ${exam.course?.class?.title || ''} ${exam.room || ''}`.toLowerCase();
    return (filter === 'all' || status === filter) && text.includes(query.trim().toLowerCase());
  }).sort((a, b) => {
    const da = new Date(a.examDate || 0).getTime();
    const db = new Date(b.examDate || 0).getTime();
    return da - db || String(a.startTime || '').localeCompare(String(b.startTime || ''));
  }), [exams, filter, query]);

  const filters = ['all', 'scheduled', 'ongoing', 'completed'];

  return (
    <div className="min-h-screen bg-[#06111f] p-3 pt-16 text-slate-100 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-[1380px] space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Teacher Exam Operations
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Exam Workspace</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              One place for your exam schedule, paper preparation, invigilation, attendance, incidents, and results.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-slate-700 bg-[#0b1726] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-emerald-500/50 hover:bg-[#0f1d2e] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-[#0a1625] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
          <TeacherExamWorkflowNav />
        </div>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm font-medium text-red-300">{error}</div>}

        <section className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-2xl font-black text-white">My Exam Schedule</h2>
              <p className="mt-1 text-sm text-slate-400">Only exams linked to your assigned courses appear here.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-700 bg-[#0a1625] p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-xs font-bold transition ${viewMode === 'card' ? 'bg-emerald-500 text-white shadow-[0_0_22px_rgba(16,185,129,0.25)]' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  <Grid2X2 className="h-4 w-4" /> Card View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-xs font-bold transition ${viewMode === 'table' ? 'bg-emerald-500 text-white shadow-[0_0_22px_rgba(16,185,129,0.25)]' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  <List className="h-4 w-4" /> Table View
                </button>
              </div>
              <button
                type="button"
                onClick={() => setCompact((value) => !value)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition ${compact ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-[#0a1625] text-slate-300 hover:bg-slate-800'}`}
              >
                <Settings2 className="h-4 w-4" /> Customize
              </button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative min-w-0">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search exam, course, class..."
                className="min-h-12 w-full rounded-xl border border-slate-700 bg-[#0a1625] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {filters.map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`min-h-12 whitespace-nowrap rounded-xl border px-4 text-xs font-bold capitalize transition ${filter === item ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.12)]' : 'border-slate-700 bg-[#0a1625] text-slate-300 hover:bg-slate-800'}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-700 border-t-emerald-500" />
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-[#0a1625] p-10 text-center text-slate-400">
              <CalendarDays className="mx-auto mb-3 h-9 w-9" />
              <p className="font-bold text-white">No exams found</p>
              <p className="mt-1 text-sm">Your assigned exam schedule will appear here.</p>
            </div>
          ) : viewMode === 'card' ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {visible.map((exam) => {
                const status = effectiveStatus(exam);
                const subject = exam.course?.title?.en || 'Course';
                const tone = subjectTone(subject);
                const classLabel = `${exam.course?.class?.title || 'Class'}${exam.course?.class?.section ? ` - ${exam.course.class.section}` : ''}`;

                return (
                  <article
                    key={exam._id}
                    className={`group overflow-hidden rounded-2xl border bg-[linear-gradient(135deg,rgba(12,27,43,.98),rgba(8,19,32,.98))] ${tone.border} ${tone.glow} transition duration-200 hover:-translate-y-0.5 hover:border-emerald-400/40`}
                  >
                    <div className={compact ? 'p-4' : 'p-4 sm:p-5'}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className={`hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border sm:flex ${tone.icon}`}>
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className={`truncate text-[11px] font-black uppercase tracking-wide ${tone.text}`}>{subject}</p>
                            <h3 className="mt-1 truncate text-lg font-black text-white">{toTitleCase(exam.title)}</h3>
                            <p className="mt-1 text-sm text-slate-400">{classLabel}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <Link to={`/teacher/exams/${exam._id}/paper`} className="hidden items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white sm:inline-flex">
                            View Details <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                          <Status value={status} />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-xl bg-[#06111f]/90 p-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> Date</p>
                          <p className="mt-1 text-sm font-bold text-white">{formatDate(exam.examDate)}</p>
                        </div>
                        <div className="rounded-xl bg-[#06111f]/90 p-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Time</p>
                          <p className="mt-1 text-sm font-bold text-white">{exam.startTime || '—'}{exam.endTime ? `–${exam.endTime}` : ''}</p>
                        </div>
                        <div className="rounded-xl bg-[#06111f]/90 p-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><FileText className="h-3.5 w-3.5" /> Marks</p>
                          <p className="mt-1 text-sm font-bold text-white">{exam.totalMarks || '—'}</p>
                        </div>
                        <div className="rounded-xl bg-[#06111f]/90 p-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><MapPin className="h-3.5 w-3.5" /> Room</p>
                          <p className="mt-1 truncate text-sm font-bold text-white">{exam.room || 'By allocation'}</p>
                        </div>
                      </div>

                      {!compact && (
                        <div className="mt-3 flex items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
                          <PaperStatus value={exam.paperStatus} />
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><Users className="h-3.5 w-3.5" /> {exam.course?.class?.title || 'Assigned class'}</span>
                        </div>
                      )}

                      <div className={`flex flex-wrap gap-2 ${compact ? 'mt-4' : 'mt-3'}`}>
                        <Link to={`/teacher/exams/${exam._id}/paper`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-black text-white shadow-[0_0_18px_rgba(16,185,129,0.2)] transition hover:bg-emerald-400"><FileText className="h-4 w-4" /> Paper</Link>
                        <Link to={`/teacher/exams/${exam._id}/attendance`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0b1726] px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800"><Users className="h-4 w-4" /> Roster</Link>
                        <Link to={`/teacher/exam-incidents?exam=${exam._id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0b1726] px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800"><TriangleAlert className="h-4 w-4" /> Incident</Link>
                        <Link to="/teacher/results/enter" className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0b1726] px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800"><ListChecks className="h-4 w-4" /> Results</Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {visible.map((exam) => {
                  const status = effectiveStatus(exam);
                  return (
                    <div key={exam._id} className="rounded-2xl border border-slate-700 bg-[#0a1625] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold uppercase text-emerald-400">{exam.course?.title?.en || 'Course'}</p>
                          <p className="mt-1 truncate font-black text-white">{toTitleCase(exam.title)}</p>
                          <p className="mt-1 text-xs text-slate-400">{exam.course?.class?.title || 'Class'}</p>
                        </div>
                        <Status value={status} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <span className="rounded-lg bg-[#06111f] p-2.5 text-slate-300">{formatDate(exam.examDate)}</span>
                        <span className="rounded-lg bg-[#06111f] p-2.5 text-slate-300">{exam.startTime || '—'}{exam.endTime ? `–${exam.endTime}` : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-slate-700 bg-[#0a1625] md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left">
                    <thead className="bg-[#07121f] text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Course / Exam</th>
                        <th className="px-4 py-3">Class</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3">Marks</th>
                        <th className="px-4 py-3">Room</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {visible.map((exam) => {
                        const status = effectiveStatus(exam);
                        return (
                          <tr key={exam._id} className="transition hover:bg-slate-800/35">
                            <td className="px-4 py-4">
                              <p className="text-[11px] font-black uppercase text-emerald-400">{exam.course?.title?.en || 'Course'}</p>
                              <p className="mt-1 font-bold text-white">{toTitleCase(exam.title)}</p>
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">{exam.course?.class?.title || '—'}{exam.course?.class?.section ? ` - ${exam.course.class.section}` : ''}</td>
                            <td className="px-4 py-4 text-sm text-slate-300">{formatDate(exam.examDate)}</td>
                            <td className="px-4 py-4 text-sm text-slate-300">{exam.startTime || '—'}{exam.endTime ? `–${exam.endTime}` : ''}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-white">{exam.totalMarks || '—'}</td>
                            <td className="px-4 py-4 text-sm text-slate-300">{exam.room || 'By allocation'}</td>
                            <td className="px-4 py-4"><Status value={status} /></td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-2">
                                <Link to={`/teacher/exams/${exam._id}/paper`} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white">Paper</Link>
                                <Link to={`/teacher/exams/${exam._id}/attendance`} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200">Roster</Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-[#0a1625] p-3 text-xs text-slate-400">
          <Building2 className="h-4 w-4 text-emerald-500" />
          <span>Invigilation room assignments are controlled by Exam Operations. You only see rooms specifically assigned to you.</span>
        </div>
      </div>
    </div>
  );
}

export default TeacherExams;
