import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Save, Search, Users, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { TeacherExamWorkflowNav } from '../components/teacher-exam-workflow-nav';

type Status = 'present' | 'absent';
interface Student { _id: string; studentId: string; profile?: { firstName?: string; lastName?: string } }
interface RosterRow { student: Student; attendance?: { status?: string; notes?: string } | null }
interface Exam { _id: string; title: string; examDate?: string; startTime?: string; endTime?: string; course?: { title?: { en?: string } } }

function nameOf(student: Student) { return `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId; }

export function TeacherExamAttendanceRoster() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [query,setQuery]=useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get(`/exams/${examId}/attendance`);
      const payload = data.data || {};
      const roster: RosterRow[] = payload.roster || [];
      setExam(payload.exam || null);
      setRows(roster);
      const next: Record<string, Status | undefined> = {};
      const nextNotes: Record<string, string> = {};
      roster.forEach((r) => {
        next[r.student._id] = r.attendance?.status === 'present' ? 'present' : r.attendance?.status ? 'absent' : undefined;
        nextNotes[r.student._id] = r.attendance?.notes || '';
      });
      setStatuses(next); setNotes(nextNotes);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load attendance roster');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [examId]);

  const counts = useMemo(() => ({
    present:Object.values(statuses).filter(v=>v==='present').length,
    absent:Object.values(statuses).filter(v=>v==='absent').length,
    marked:Object.values(statuses).filter(Boolean).length,
  }), [statuses]);

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return q?rows.filter(r=>`${nameOf(r.student)} ${r.student.studentId}`.toLowerCase().includes(q)):rows;
  },[rows,query]);

  const setAll = (status: Status) => setStatuses((prev) => {
    const next = { ...prev }; rows.forEach((r) => { next[r.student._id] = status; }); return next;
  });

  const save = async () => {
    const records = rows.filter((r) => statuses[r.student._id]).map((r) => ({ student: r.student._id, status: statuses[r.student._id], notes: notes[r.student._id] || '' }));
    if (!records.length) { setError('Mark at least one student before saving.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      await api.post(`/exams/${examId}/attendance`, { records });
      setMessage(`Attendance saved for ${records.length} student${records.length === 1 ? '' : 's'}.`);
      await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save attendance'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600" /></div>;

  const unmarked=Math.max(0,rows.length-counts.marked);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pb-24 pt-16 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <TeacherExamWorkflowNav />

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-5">
          <button onClick={() => navigate('/teacher/exams')} className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-emerald-600"><ArrowLeft className="h-4 w-4" /> Exam Workspace</button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Course Exam Roster</p><h1 className="mt-1 text-2xl font-black">{exam?.title || 'Exam'}</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{exam?.course?.title?.en || ''} · {exam?.examDate ? new Date(exam.examDate).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : 'No date'} · {exam?.startTime || ''}{exam?.endTime ? `–${exam.endTime}` : ''}</p></div>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl bg-[var(--color-surface-secondary)] px-3 py-2 text-center"><p className="text-[10px] font-bold text-[var(--color-text-tertiary)]">Total</p><p className="font-black">{rows.length}</p></div>
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center dark:bg-emerald-950/20"><p className="text-[10px] font-bold text-emerald-700">P</p><p className="font-black text-emerald-700">{counts.present}</p></div>
              <div className="rounded-xl bg-red-50 px-3 py-2 text-center dark:bg-red-950/20"><p className="text-[10px] font-bold text-red-700">A</p><p className="font-black text-red-700">{counts.absent}</p></div>
              <div className="rounded-xl bg-amber-50 px-3 py-2 text-center dark:bg-amber-950/20"><p className="text-[10px] font-bold text-amber-700">—</p><p className="font-black text-amber-700">{unmarked}</p></div>
            </div>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600 dark:border-red-900/50 dark:bg-red-950/30">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30">{message}</div>}

        <div className="sticky top-2 z-10 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 p-3 shadow-lg backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2"><button onClick={() => setAll('present')} className="min-h-10 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">All Present</button><button onClick={() => setAll('absent')} className="min-h-10 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white">All Absent</button></div>
            <div className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search student or ID..." aria-label="Search student or ID" className="min-h-10 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent py-2 pl-9 pr-3 text-sm"/></div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {visible.length === 0 ? <div className="md:col-span-2 rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">No participants match this search.</div> : visible.map((row) => {
            const id = row.student._id; const current = statuses[id];
            return <article key={id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><Users className="h-4 w-4"/></div>
                <div className="min-w-0 flex-1"><p className="break-words font-black">{nameOf(row.student)}</p><p className="mt-0.5 text-xs font-medium text-[var(--color-text-tertiary)]">{row.student.studentId}</p></div>
                {current && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${current==='present'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}`}>{current}</span>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setStatuses((p) => ({ ...p, [id]: 'present' }))} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-sm font-bold ${current === 'present' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-[var(--color-border-default)]'}`}><Check className="h-4 w-4"/>Present</button>
                <button onClick={() => setStatuses((p) => ({ ...p, [id]: 'absent' }))} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-sm font-bold ${current === 'absent' ? 'border-red-600 bg-red-600 text-white' : 'border-[var(--color-border-default)]'}`}><X className="h-4 w-4"/>Absent</button>
              </div>
              {current==='absent'&&<input value={notes[id] || ''} onChange={(e) => setNotes((p) => ({ ...p, [id]: e.target.value }))} placeholder="Excuse / reason (optional)" aria-label={`Excuse or reason for ${nameOf(row.student)}`} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm" />}
            </article>;
          })}
        </div>

        <button onClick={()=>void save()} disabled={saving || rows.length === 0} className="fixed bottom-4 left-1/2 z-20 inline-flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-xl disabled:opacity-60 sm:static sm:w-full sm:translate-x-0 sm:justify-center sm:rounded-xl"><Save className="h-4 w-4" />{saving ? 'Saving...' : unmarked ? `Save Attendance · ${unmarked} unmarked` : 'Save Complete Attendance'}</button>
      </div>
    </div>
  );
}

export default TeacherExamAttendanceRoster;
