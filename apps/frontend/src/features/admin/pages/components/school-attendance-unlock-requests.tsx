import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CalendarDays, CheckCircle2, Clock3, GraduationCap, RefreshCw, Search, ShieldCheck, Users, XCircle } from 'lucide-react';
import api from '../../../../lib/axios';

type RequestRow = {
  _id: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewNote?: string;
  teacher?: { name?: string; fullName?: string; teacherId?: string; profile?: { firstName?: string; lastName?: string }; user?: { email?: string } } | string;
  course?: { _id?: string; title?: { en?: string } | string; courseCode?: string } | string;
  schedule?: { _id?: string; startTime?: string; endTime?: string; class?: { title?: string; section?: string } | string } | string;
};

const idOf = (value: any) => typeof value === 'string' ? value : value?._id || '';
const labelOf = (value: any) => typeof value === 'string' ? value : value?.name || value?.fullName || value?.title?.en || value?.title || value?.courseCode || '—';
const teacherName = (teacher: any) => {
  if (!teacher || typeof teacher === 'string') return teacher || '—';
  const profileName = [teacher.profile?.firstName, teacher.profile?.lastName].filter(Boolean).join(' ').trim();
  return profileName || teacher.name || teacher.fullName || teacher.teacherId || teacher.user?.email || 'Unknown teacher';
};
const className = (value: any) => {
  if (!value || typeof value === 'string') return value || 'Class not specified';
  return [value.title, value.section ? '(' + value.section + ')' : ''].filter(Boolean).join(' ');
};

export default function SchoolAttendanceUnlockRequests() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [status, setStatus] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/attendance/school/unlock-requests', { params: { status } });
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load attendance unlock requests.');
      setRows([]);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const review = async (row: RequestRow, decision: 'approve' | 'reject') => {
    const course = idOf(row.course);
    const schedule = idOf(row.schedule);
    if (!course || !schedule) { setError('This request is missing its course or schedule reference.'); return; }
    const reviewNote = window.prompt(decision === 'approve' ? 'Optional note for this approval:' : 'Reason for rejecting this request:');
    if (reviewNote === null) return;
    if (decision === 'reject' && !reviewNote.trim()) { setError('Please provide a reason when rejecting a request.'); return; }
    setBusy(row._id); setError(''); setMessage('');
    try {
      await api.patch('/attendance/school/unlock-requests/' + row._id + '/review', {
        course, schedule, date: String(row.date).slice(0, 10), decision, reviewNote: reviewNote.trim(),
      });
      setMessage(decision === 'approve' ? 'Request approved. Attendance has been unlocked.' : 'Request rejected.');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not review this request.');
    } finally { setBusy(''); }
  };

  const counts = {
    pending: rows.filter((row) => row.status === 'pending').length,
    approved: rows.filter((row) => row.status === 'approved').length,
    rejected: rows.filter((row) => row.status === 'rejected').length,
  };
  const visibleRows = rows.filter((row) => {
    const schedule: any = row.schedule || {};
    const haystack = [teacherName(row.teacher), className(schedule.class), labelOf(row.course), row.reason, row.status, row.date]
      .join(' ').toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const palettes = [
    'from-indigo-600 to-violet-500',
    'from-teal-600 to-cyan-500',
    'from-sky-600 to-blue-500',
    'from-pink-600 to-rose-500',
    'from-violet-600 to-indigo-500',
    'from-emerald-600 to-teal-500',
  ];

  return <section className="space-y-5">
    <div className="overflow-hidden rounded-3xl border border-[var(--color-border-default)] bg-gradient-to-r from-emerald-50 via-white to-sky-50 shadow-sm dark:from-emerald-950/30 dark:via-[var(--color-surface-primary)] dark:to-sky-950/30">
      <div className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/20 sm:h-14 sm:w-14"><ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7"/></div>
          <div className="min-w-0"><h2 className="text-xl font-black tracking-tight text-[var(--color-text-primary)] sm:text-2xl">Attendance Unlock Requests</h2><p className="mt-1 text-sm text-[var(--color-text-secondary)] sm:text-base">Review teacher requests to correct completed period attendance.</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start rounded-2xl border border-sky-200 bg-white/80 px-3 py-2 text-sm font-bold text-sky-700 shadow-sm dark:border-sky-900 dark:bg-slate-900/70 dark:text-sky-300"><Clock3 className="h-4 w-4"/><span>{counts.pending} Pending</span></div>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:gap-3 sm:px-6 sm:pb-6">
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 dark:border-amber-900/70 dark:bg-amber-950/30"><span className="truncate text-xs font-semibold text-amber-800 dark:text-amber-300 sm:text-sm">Pending</span><span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-200 px-2 text-sm font-black text-amber-900 dark:bg-amber-900 dark:text-amber-100">{counts.pending}</span></div>
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 dark:border-emerald-900/70 dark:bg-emerald-950/30"><span className="truncate text-xs font-semibold text-emerald-800 dark:text-emerald-300 sm:text-sm">Approved</span><span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-200 px-2 text-sm font-black text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">{counts.approved}</span></div>
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 dark:border-rose-900/70 dark:bg-rose-950/30"><span className="truncate text-xs font-semibold text-rose-800 dark:text-rose-300 sm:text-sm">Rejected</span><span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-rose-200 px-2 text-sm font-black text-rose-900 dark:bg-rose-900 dark:text-rose-100">{counts.rejected}</span></div>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
      <label className="relative block min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teacher, class, course, or reason…" className="min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] pl-10 pr-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"/>
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as 'pending' | 'all')} className="min-h-11 min-w-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm font-semibold text-[var(--color-text-primary)] outline-none focus:border-emerald-500"><option value="pending">Pending approval</option><option value="all">All requests</option></select>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600"><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')}/><span className="hidden sm:inline">Refresh</span></button>
      </div>
    </div>

    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
    {message && <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}

    {loading ? <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading requests…</div>
      : visibleRows.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800"><Search className="h-5 w-5"/></div><p className="mt-3 font-bold text-[var(--color-text-primary)]">{search ? 'No matching requests' : 'No requests found'}</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{search ? 'Try another teacher, class, course, or keyword.' : 'There are no ' + (status === 'pending' ? 'pending ' : '') + 'unlock requests to show.'}</p></div>
      : <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visibleRows.map((row, index) => {
          const schedule: any = row.schedule || {};
          const teacher = teacherName(row.teacher);
          const classLabel = className(schedule.class);
          const palette = palettes[index % palettes.length];
          const statusStyle = row.status === 'pending'
            ? 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/70 dark:text-amber-200 dark:ring-amber-800'
            : row.status === 'approved'
              ? 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-200 dark:ring-emerald-800'
              : 'bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-950/70 dark:text-rose-200 dark:ring-rose-800';
          return <article key={row._id} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
            <div className={'flex items-start justify-between gap-3 bg-gradient-to-r ' + palette + ' px-4 py-3.5 text-white sm:px-5'}>
              <div className="flex min-w-0 items-center gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/25"><BookOpen className="h-5 w-5"/></div><div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">Course</p><h3 className="break-words text-base font-black leading-tight sm:text-lg">{labelOf(row.course)}</h3></div></div>
              <span className={'inline-flex max-w-[48%] shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-extrabold leading-tight ring-1 sm:text-xs ' + statusStyle}>{row.status === 'pending' ? <Clock3 className="h-3.5 w-3.5 shrink-0"/> : row.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0"/> : <XCircle className="h-3.5 w-3.5 shrink-0"/>}<span>{row.status === 'pending' ? 'Pending Approval' : row.status === 'approved' ? 'Approved' : 'Rejected'}</span></span>
            </div>
            <div className="flex flex-1 flex-col p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="flex min-w-0 items-start gap-2.5 rounded-xl bg-sky-50 p-3 dark:bg-sky-950/30"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200"><Users className="h-4 w-4"/></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Teacher</p><p className="mt-0.5 break-words text-sm font-bold text-slate-800 dark:text-slate-100">{teacher}</p></div></div>
                <div className="flex min-w-0 items-start gap-2.5 rounded-xl bg-violet-50 p-3 dark:bg-violet-950/30"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200"><GraduationCap className="h-4 w-4"/></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Class</p><p className="mt-0.5 break-words text-sm font-bold text-slate-800 dark:text-slate-100">{classLabel}</p></div></div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[var(--color-text-secondary)]"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-sky-600"/>{String(row.date).slice(0, 10)}</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-violet-600"/>{schedule.startTime || '—'}–{schedule.endTime || '—'}</span></div>
              <div className="mt-4 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50 p-3.5 dark:border-amber-900/60 dark:from-amber-950/35 dark:to-orange-950/25"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-300">Teacher's reason</p><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800 dark:text-slate-100">{row.reason}</p></div>
              {row.reviewNote && <div className={'mt-3 rounded-xl border p-3 text-sm ' + (row.status === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200')}><p className="font-bold">{row.status === 'approved' ? 'Admin approval note' : 'Admin review note'}</p><p className="mt-1 whitespace-pre-wrap break-words">{row.reviewNote}</p></div>}
              {row.status === 'pending' && <div className="mt-auto grid grid-cols-1 gap-2 pt-4 sm:grid-cols-2">
                <button type="button" disabled={busy === row._id} onClick={() => void review(row, 'approve')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-3 py-2 text-sm font-extrabold text-white shadow-md shadow-emerald-600/15 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4 shrink-0"/><span>{busy === row._id ? 'Processing…' : 'Approve & Unlock'}</span></button>
                <button type="button" disabled={busy === row._id} onClick={() => void review(row, 'reject')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950"><XCircle className="h-4 w-4 shrink-0"/><span>Reject</span></button>
              </div>}
            </div>
          </article>;
        })}
      </div>}
  </section>;
}
