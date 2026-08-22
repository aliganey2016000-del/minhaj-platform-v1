import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, Save, UserCheck, Users, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';

const STATUSES = ['present', 'absent', 'late', 'excused'] as const;
type Status = typeof STATUSES[number];
interface Student { _id: string; studentId: string; profile?: { firstName?: string; lastName?: string } }
interface RosterRow { student: Student; attendance?: { status?: Status; notes?: string } | null }
interface Exam { _id: string; title: string; examDate?: string; startTime?: string; endTime?: string; course?: { title?: { en?: string } } }

function nameOf(student: Student) { return `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId; }

export function TeacherExamAttendanceRoster() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
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
      roster.forEach((r) => { next[r.student._id] = r.attendance?.status; nextNotes[r.student._id] = r.attendance?.notes || ''; });
      setStatuses(next); setNotes(nextNotes);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load attendance roster');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [examId]);

  const counts = useMemo(() => STATUSES.reduce((acc, s) => ({ ...acc, [s]: Object.values(statuses).filter((v) => v === s).length }), {} as Record<Status, number>), [statuses]);

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

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-16 sm:p-6 sm:pt-20 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
          <button onClick={() => navigate('/teacher/exam-attendance')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-tertiary)] hover:text-emerald-600"><ArrowLeft className="h-4 w-4" /> Exam Attendance</button>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Take Attendance</p><h1 className="mt-1 text-2xl font-bold">{exam?.title || 'Exam'}</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{exam?.course?.title?.en || ''} · {exam?.examDate ? new Date(exam.examDate).toLocaleDateString() : 'No date'} · {exam?.startTime || ''}{exam?.endTime ? `–${exam.endTime}` : ''}</p></div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><Users className="h-4 w-4" /> {rows.length} participants</div>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30">{message}</div>}

        <div className="sticky top-2 z-10 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 p-3 shadow-lg backdrop-blur-md">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setAll('present')} className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">All Present</button>
            <button onClick={() => setAll('absent')} className="whitespace-nowrap rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white">All Absent</button>
            <button onClick={() => setAll('late')} className="whitespace-nowrap rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white">All Late</button>
            <button onClick={() => setAll('excused')} className="whitespace-nowrap rounded-lg bg-slate-600 px-3 py-2 text-xs font-bold text-white">All Excused</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-text-tertiary)]"><span className="text-emerald-600">P {counts.present}</span><span className="text-red-600">A {counts.absent}</span><span className="text-amber-600">L {counts.late}</span><span>E {counts.excused}</span></div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
          {rows.length === 0 ? <div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">No participants found for this exam.</div> : rows.map((row, index) => {
            const id = row.student._id; const current = statuses[id];
            return <div key={id} className="border-b border-[var(--color-border-subtle)] p-4 last:border-0 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-base font-bold text-[var(--color-text-primary)]">{nameOf(row.student)}</p>
                  <p className="mt-0.5 text-xs font-medium text-[var(--color-text-tertiary)]">{row.student.studentId}</p>
                </div>
                {current && <span className="rounded-full bg-[var(--color-surface-secondary)] px-2 py-1 text-[11px] font-bold capitalize">{current}</span>}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {STATUSES.map((status) => <button key={status} onClick={() => setStatuses((p) => ({ ...p, [id]: status }))} className={`rounded-xl border px-2 py-2.5 text-xs font-bold capitalize transition ${current === status ? (status === 'present' ? 'border-emerald-600 bg-emerald-600 text-white' : status === 'absent' ? 'border-red-600 bg-red-600 text-white' : status === 'late' ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-600 bg-slate-600 text-white') : 'border-[var(--color-border-default)] hover:border-emerald-400'}`}>{status}</button>)}
              </div>
              {current && <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]"><Clock3 className="h-3.5 w-3.5" /><input value={notes[id] || ''} onChange={(e) => setNotes((p) => ({ ...p, [id]: e.target.value }))} placeholder="Optional note" className="min-w-0 flex-1 rounded-lg border border-[var(--color-border-default)] bg-transparent px-2.5 py-2" /></div>}
            </div>;
          })}
        </div>

        <button onClick={save} disabled={saving || rows.length === 0} className="fixed bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl disabled:opacity-60 sm:static sm:w-full sm:justify-center sm:rounded-xl"><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save Attendance'}</button>
      </div>
    </div>
  );
}

export default TeacherExamAttendanceRoster;
