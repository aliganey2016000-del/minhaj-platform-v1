import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCcw, ShieldAlert } from 'lucide-react';
import api from '../../../../lib/axios';

interface Preview { school?: { name: string }; students: number; schedules: number; attendanceRecords: number; attendanceSessions: number; dateFrom?: string | null; dateTo?: string | null; confirmationPhrase: string; }

export default function SchoolAttendanceReset() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const loadPreview = useCallback(async () => {
    setLoading(true); setError('');
    try { const r = await api.get('/attendance/school/reset-preview'); setPreview(r.data?.data ?? r.data); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not load attendance reset preview.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadPreview(); }, [loadPreview]);
  const reset = async () => {
    if (!preview || confirmation !== preview.confirmationPhrase || reason.trim().length < 10) return;
    setSubmitting(true); setError(''); setMessage('');
    try {
      const r = await api.post('/attendance/school/reset', { confirmation, reason: reason.trim() });
      const d = r.data?.data ?? r.data;
      setMessage(`Reset complete: ${d.attendanceRecordsDeleted ?? 0} attendance records and ${d.attendanceSessionsDeleted ?? 0} session records deleted. Timetable and student records were preserved.`);
      setConfirmation(''); setReason(''); await loadPreview();
    } catch (e: any) { setError(e?.response?.data?.message || 'Reset failed.'); }
    finally { setSubmitting(false); }
  };
  return <section className="mx-auto w-full max-w-4xl space-y-5">
    <div className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 via-white to-orange-50 p-4 shadow-sm dark:border-red-900/60 dark:from-red-950/30 dark:via-[var(--color-surface-primary)] dark:to-orange-950/20 sm:p-6">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-red-100 p-3 text-red-700 dark:bg-red-900/50 dark:text-red-300"><ShieldAlert className="h-6 w-6" /></div><div><h2 className="text-lg font-extrabold text-red-900 dark:text-red-200 sm:text-xl">Reset School Attendance</h2><p className="mt-1 text-sm leading-6 text-red-800 dark:text-red-300">Permanently remove historical lesson attendance and session completion/lock records for this school. Review the counts and confirm explicitly.</p></div></div>
    </div>
    {loading && <div className="flex items-center gap-2 rounded-xl border p-5 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading reset preview…</div>}
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
    {message && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}
    {preview && !loading && <>
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">Selected school</p><h3 className="mt-1 text-lg font-extrabold text-[var(--color-text-primary)]">{preview.school?.name || 'Current school'}</h3></div><button type="button" onClick={() => void loadPreview()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-[var(--color-surface-secondary)]"><RefreshCcw className="h-4 w-4" />Refresh preview</button></div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Attendance records', preview.attendanceRecords], ['Session records', preview.attendanceSessions], ['Students preserved', preview.students], ['Schedules preserved', preview.schedules]].map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]/60 p-3"><p className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</p><p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--color-text-primary)]">{Number(value).toLocaleString()}</p></div>)}</div>
        <p className="mt-3 text-xs text-[var(--color-text-secondary)]">Historical dates: {preview.dateFrom ? new Date(preview.dateFrom).toLocaleDateString() : '—'} to {preview.dateTo ? new Date(preview.dateTo).toLocaleDateString() : '—'}. Students, classes, courses, teachers, timetables, school calendar, daily attendance, and unlock requests are not targeted.</p>
      </div>
      <div className="space-y-4 rounded-2xl border border-red-300 bg-[var(--color-surface-primary)] p-4 sm:p-5">
        <div className="flex gap-2 text-sm font-bold text-red-700 dark:text-red-300"><AlertTriangle className="h-5 w-5 shrink-0" />Permanent action — verify these counts first.</div>
        <label className="block space-y-1.5"><span className="text-sm font-semibold text-[var(--color-text-primary)]">Reason for reset (at least 10 characters)</span><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} placeholder="Explain why historical attendance must be cleared." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20" /></label>
        <label className="block space-y-1.5"><span className="text-sm font-semibold text-[var(--color-text-primary)]">Type <strong className="text-red-700">{preview.confirmationPhrase}</strong> to confirm</span><input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" placeholder="RESET ATTENDANCE" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20" /></label>
        <button type="button" disabled={submitting || confirmation !== preview.confirmationPhrase || reason.trim().length < 10 || (preview.attendanceRecords === 0 && preview.attendanceSessions === 0)} onClick={() => void reset()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}{submitting ? 'Resetting attendance…' : 'Permanently reset attendance'}</button>
        <p className="text-xs leading-5 text-[var(--color-text-secondary)]">The administrator, school, reason, and affected counts are recorded in the activity audit log. Teachers can resume attendance using the existing timetable.</p>
      </div>
    </>}
  </section>;
}
