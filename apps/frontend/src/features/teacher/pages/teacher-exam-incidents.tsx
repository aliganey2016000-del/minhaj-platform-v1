import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Grid2X2,
  List,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { TeacherExamWorkflowNav } from '../components/teacher-exam-workflow-nav';

const TYPES = ['cheating', 'disruption', 'technical_issue', 'accommodation', 'other'];
const SEVERITIES = ['low', 'medium', 'high'];
const PAGE_SIZE = 8;

interface Exam {
  _id: string;
  title: string;
  examDate?: string;
  room?: string;
  course?: {
    title?: { en?: string };
    class?: { title?: string; section?: string };
  };
}

interface Incident {
  _id: string;
  exam?: Exam;
  student?: {
    studentId?: string;
    profile?: { firstName?: string; lastName?: string };
  };
  reportedBy?: { _id?: string; email?: string };
  resolvedBy?: { _id?: string; email?: string };
  type: string;
  severity: string;
  description: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
}

type ViewMode = 'table' | 'card';

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function Badge({ value, tone }: { value: string; tone?: 'severity' | 'status' | 'type' }) {
  const styles: Record<string, string> = tone === 'severity'
    ? {
        low: 'border border-sky-500/30 bg-sky-500/10 text-sky-300',
        medium: 'border border-amber-500/30 bg-amber-500/10 text-amber-300',
        high: 'border border-red-500/30 bg-red-500/10 text-red-300',
      }
    : tone === 'status'
      ? {
          open: 'border border-amber-500/30 bg-amber-500/10 text-amber-300',
          resolved: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
          dismissed: 'border border-slate-600 bg-slate-700/50 text-slate-300',
        }
      : {
          cheating: 'border border-red-500/30 bg-red-500/10 text-red-300',
          disruption: 'border border-amber-500/30 bg-amber-500/10 text-amber-300',
          technical_issue: 'border border-sky-500/30 bg-sky-500/10 text-sky-300',
          accommodation: 'border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300',
          other: 'border border-slate-600 bg-slate-700/50 text-slate-300',
        };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${styles[value] || 'border border-slate-600 bg-slate-700/50 text-slate-300'}`}>
      {titleCase(value)}
    </span>
  );
}

export function TeacherExamIncidents() {
  const [params] = useSearchParams();
  const [exams, setExams] = useState<Exam[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [examId, setExamId] = useState(params.get('exam') || '');
  const [type, setType] = useState('cheating');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [examFilter, setExamFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>(() => localStorage.getItem('teacher-incident-view') === 'card' ? 'card' : 'table');
  const [showReport, setShowReport] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [columns, setColumns] = useState({
    exam: true,
    type: true,
    severity: true,
    description: true,
    reporter: true,
    date: true,
    status: true,
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [e, i] = await Promise.all([
        api.get('/exams', { params: { limit: 200 } }),
        api.get('/exam-incidents'),
      ]);
      setExams(e.data.data || []);
      setIncidents(i.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { localStorage.setItem('teacher-incident-view', viewMode); }, [viewMode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examId || !description.trim()) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/exam-incidents', {
        exam: examId,
        type,
        severity,
        description: description.trim(),
      });
      setIncidents((p) => [data.data, ...p]);
      setDescription('');
      setShowReport(false);
      setMessage('Incident reported successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to report incident');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: 'resolved' | 'dismissed') => {
    try {
      const { data } = await api.patch(`/exam-incidents/${id}`, { status });
      setIncidents((p) => p.map((i) => i._id === id ? data.data : i));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update incident');
    }
  };

  const counts = useMemo(() => ({
    open: incidents.filter((i) => i.status === 'open').length,
    resolved: incidents.filter((i) => i.status === 'resolved').length,
    dismissed: incidents.filter((i) => i.status === 'dismissed').length,
    total: incidents.length,
  }), [incidents]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return incidents.filter((i) => {
      const searchable = [
        i.exam?.title,
        i.exam?.course?.title?.en,
        i.exam?.course?.class?.title,
        i.exam?.room,
        i.description,
        i.student?.profile?.firstName,
        i.student?.profile?.lastName,
        i.reportedBy?.email,
      ].filter(Boolean).join(' ').toLowerCase();

      return (filter === 'all' || i.status === filter)
        && (examFilter === 'all' || i.exam?._id === examFilter)
        && (typeFilter === 'all' || i.type === typeFilter)
        && (severityFilter === 'all' || i.severity === severityFilter)
        && (!q || searchable.includes(q));
    });
  }, [incidents, filter, query, examFilter, typeFilter, severityFilter]);

  useEffect(() => { setPage(1); }, [filter, query, examFilter, typeFilter, severityFilter, viewMode]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCsv = () => {
    const rows = [
      ['Exam', 'Course', 'Class', 'Type', 'Severity', 'Description', 'Reporter', 'Date & Time', 'Status'],
      ...visible.map((i) => [
        i.exam?.title || 'Exam',
        i.exam?.course?.title?.en || '',
        [i.exam?.course?.class?.title, i.exam?.course?.class?.section].filter(Boolean).join(' '),
        titleCase(i.type),
        titleCase(i.severity),
        i.description,
        i.reportedBy?.email || '',
        new Date(i.createdAt).toLocaleString(),
        titleCase(i.status),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exam-incidents.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCards = [
    { key: 'open', label: 'Open', value: counts.open, note: 'Need attention', icon: AlertTriangle, tone: 'border-red-500/30 bg-red-500/[0.06] text-red-300' },
    { key: 'resolved', label: 'Resolved', value: counts.resolved, note: 'Completed', icon: CheckCircle2, tone: 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300' },
    { key: 'dismissed', label: 'Dismissed', value: counts.dismissed, note: 'Not valid', icon: Archive, tone: 'border-slate-600 bg-slate-500/[0.05] text-slate-300' },
    { key: 'all', label: 'Total Incidents', value: counts.total, note: 'All time', icon: Columns3, tone: 'border-violet-500/30 bg-violet-500/[0.06] text-violet-300' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#06111f] p-3 pt-16 text-slate-100 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Teacher Exam Operations</p>
            <h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">Exam Incidents</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Record cheating, disruptions, technical issues, or accommodations connected to your assigned exams.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-slate-700 bg-[#0a1625] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-emerald-500/50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-[#0a1625] p-1.5">
          <TeacherExamWorkflowNav />
        </div>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-300">{message}</div>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map(({ key, label, value, note, icon: Icon, tone }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${tone} ${filter === key ? 'ring-1 ring-emerald-400/50' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-current/20 bg-black/10"><Icon className="h-6 w-6" /></div>
                <div>
                  <p className="text-sm font-bold">{label}</p>
                  <p className="mt-0.5 text-3xl font-black text-white">{value}</p>
                  <p className="text-xs text-slate-500">{note}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <section className="space-y-3">
          <div className="grid gap-2 xl:grid-cols-[minmax(260px,1.5fr)_repeat(4,minmax(140px,.75fr))_auto]">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search incidents..."
                className="min-h-11 w-full rounded-xl border border-slate-700 bg-[#0a1625] py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/50"
              />
            </div>

            <select value={examFilter} onChange={(e) => setExamFilter(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-[#0a1625] px-3 text-sm text-slate-200">
              <option value="all">All Exams</option>
              {exams.map((exam) => <option key={exam._id} value={exam._id}>{exam.title}</option>)}
            </select>

            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-[#0a1625] px-3 text-sm text-slate-200">
              <option value="all">All Types</option>
              {TYPES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
            </select>

            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-[#0a1625] px-3 text-sm text-slate-200">
              <option value="all">All Severity</option>
              {SEVERITIES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
            </select>

            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-[#0a1625] px-3 text-sm text-slate-200">
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>

            <button onClick={() => setShowReport(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-black text-white shadow-[0_0_22px_rgba(16,185,129,.18)] hover:bg-emerald-400">
              <Plus className="h-4 w-4" /> Report Incident
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl border border-slate-700 bg-[#0a1625] p-1">
              <button onClick={() => setViewMode('table')} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-xs font-bold ${viewMode === 'table' ? 'bg-emerald-500 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><List className="h-4 w-4" /> Table View</button>
              <button onClick={() => setViewMode('card')} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-xs font-bold ${viewMode === 'card' ? 'bg-emerald-500 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><Grid2X2 className="h-4 w-4" /> Card View</button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={exportCsv} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 bg-[#0a1625] px-3.5 text-xs font-bold text-slate-200 hover:bg-slate-800"><Download className="h-4 w-4" /> Export</button>
              <div className="relative">
                <button onClick={() => setShowColumns((v) => !v)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 bg-[#0a1625] px-3.5 text-xs font-bold text-slate-200 hover:bg-slate-800"><Columns3 className="h-4 w-4" /> Columns</button>
                {showColumns && (
                  <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-slate-700 bg-[#0b1726] p-2 shadow-2xl">
                    {Object.entries(columns).map(([key, enabled]) => (
                      <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-300 hover:bg-slate-800">
                        <input type="checkbox" checked={enabled} onChange={(e) => setColumns((p) => ({ ...p, [key]: e.target.checked }))} />
                        <span className="capitalize">{key}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-700 border-t-emerald-500" /></div>
          ) : pageRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-[#0a1625] p-12 text-center text-sm text-slate-400">
              <CheckCircle2 className="mx-auto mb-3 h-8 w-8" /> No incidents in this view.
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0a1625]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left">
                  <thead className="bg-[#07121f] text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      {columns.exam && <th className="px-4 py-3">Exam</th>}
                      {columns.type && <th className="px-4 py-3">Type</th>}
                      {columns.severity && <th className="px-4 py-3">Severity</th>}
                      {columns.description && <th className="px-4 py-3">Description</th>}
                      {columns.reporter && <th className="px-4 py-3">Reporter</th>}
                      {columns.date && <th className="px-4 py-3">Date & Time</th>}
                      {columns.status && <th className="px-4 py-3">Status</th>}
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {pageRows.map((i, index) => (
                      <tr key={i._id} className="transition hover:bg-slate-800/30">
                        <td className="px-4 py-4 text-sm text-slate-500">{(page - 1) * PAGE_SIZE + index + 1}</td>
                        {columns.exam && <td className="px-4 py-4"><p className="font-bold text-white">{i.exam?.title || 'Exam'}</p><p className="mt-1 text-xs text-slate-500">{i.exam?.course?.title?.en || ''}{i.exam?.course?.class?.title ? ` · ${i.exam.course.class.title}` : ''}</p></td>}
                        {columns.type && <td className="px-4 py-4"><Badge value={i.type} tone="type" /></td>}
                        {columns.severity && <td className="px-4 py-4"><Badge value={i.severity} tone="severity" /></td>}
                        {columns.description && <td className="max-w-[330px] px-4 py-4 text-sm text-slate-300"><p className="line-clamp-2">{i.description}</p></td>}
                        {columns.reporter && <td className="px-4 py-4 text-sm text-slate-300">{i.reportedBy?.email || 'You'}</td>}
                        {columns.date && <td className="px-4 py-4 text-sm text-slate-300">{new Date(i.createdAt).toLocaleString()}</td>}
                        {columns.status && <td className="px-4 py-4"><Badge value={i.status} tone="status" /></td>}
                        <td className="px-4 py-4 text-right">
                          {i.status === 'open' ? (
                            <div className="flex justify-end gap-2">
                              <button onClick={() => updateStatus(i._id, 'resolved')} className="rounded-lg bg-emerald-500 px-2.5 py-2 text-[10px] font-bold text-white">Resolve</button>
                              <button onClick={() => updateStatus(i._id, 'dismissed')} className="rounded-lg border border-slate-700 px-2.5 py-2 text-[10px] font-bold text-slate-300">Dismiss</button>
                            </div>
                          ) : <button className="rounded-lg border border-slate-700 p-2 text-slate-400"><MoreHorizontal className="h-4 w-4" /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {pageRows.map((i) => (
                <article key={i._id} className="rounded-2xl border border-slate-700 bg-[linear-gradient(145deg,#0b192a,#081321)] p-4 shadow-[0_15px_35px_rgba(0,0,0,.16)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black text-white">{i.exam?.course?.title?.en || i.exam?.title || 'Exam'}</p>
                      <p className="mt-1 truncate text-xs text-slate-400">{i.exam?.title || 'Exam'}{i.exam?.course?.class?.title ? ` · ${i.exam.course.class.title}` : ''}</p>
                    </div>
                    <Badge value={i.status} tone="status" />
                  </div>
                  <p className="mt-4 line-clamp-3 min-h-[60px] text-sm text-slate-300">{i.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2"><Badge value={i.type} tone="type" /><Badge value={i.severity} tone="severity" /></div>
                  <div className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
                    <p>{new Date(i.createdAt).toLocaleString()}</p>
                    <p className="mt-1 truncate">{i.reportedBy?.email || 'You'}</p>
                  </div>
                  {i.status === 'open' && <div className="mt-4 flex gap-2"><button onClick={() => updateStatus(i._id, 'resolved')} className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white">Resolve</button><button onClick={() => updateStatus(i._id, 'dismissed')} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300">Dismiss</button></div>}
                </article>
              ))}
            </div>
          )}

          {visible.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-[#0a1625] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, visible.length)} of {visible.length} incidents</p>
              <div className="flex items-center gap-1.5">
                <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-700 p-2 text-slate-300 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).slice(Math.max(0, page - 2), Math.max(3, page + 1)).map((n) => <button key={n} onClick={() => setPage(n)} className={`min-w-9 rounded-lg border px-2.5 py-2 text-xs font-bold ${page === n ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-slate-700 text-slate-300'}`}>{n}</button>)}
                <button disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-700 p-2 text-slate-300 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </section>
      </div>

      {showReport && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <form onSubmit={submit} className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#0b1726] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-5">
              <div><h2 className="text-lg font-black text-white">Report Incident</h2><p className="mt-1 text-xs text-slate-500">Teacher-scoped exam reporting</p></div>
              <button type="button" onClick={() => setShowReport(false)} className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block text-xs font-semibold text-slate-300">Exam
                <select value={examId} onChange={(e) => setExamId(e.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-700 bg-[#07121f] px-3 py-3 text-sm text-white">
                  <option value="">Select exam...</option>
                  {exams.map((e) => <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en || ''}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-300">Type
                  <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-[#07121f] px-3 py-3 text-sm text-white">{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select>
                </label>
                <label className="block text-xs font-semibold text-slate-300">Severity
                  <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-[#07121f] px-3 py-3 text-sm text-white">{SEVERITIES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select>
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-300">Description
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={5} placeholder="Describe what happened..." className="mt-1.5 w-full resize-none rounded-xl border border-slate-700 bg-[#07121f] px-3 py-3 text-sm text-white placeholder:text-slate-600" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-800 p-5">
              <button type="button" onClick={() => setShowReport(false)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-300">Cancel</button>
              <button disabled={saving || !examId || !description.trim()} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? 'Reporting...' : 'Report Incident'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default TeacherExamIncidents;
