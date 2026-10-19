import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, ShieldCheck } from 'lucide-react';
import api from '../../../../lib/axios';

const OPTIONS = [1, 3, 7, 14, 30] as const;
const optionName = (days: number) => days === 1 ? '1 day' : `${days} days`;

export function SchoolAttendanceOfflineSettings() {
  const [days, setDays] = useState<number>(7);
  const [savedDays, setSavedDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/attendance/offline-policy', { timeout: 15000 }).then(({ data }) => {
      if (!active) return;
      const current = data.data?.maxOfflineDays;
      if (OPTIONS.some(option => option === current)) {
        setDays(current);
        setSavedDays(current);
      }
    }).catch((err: any) => {
      if (active) setError(err?.response?.data?.message || 'Could not load the school offline policy.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (saving || loading || !OPTIONS.some(option => option === days)) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const { data } = await api.put('/attendance/offline-policy', { maxOfflineDays: days });
      const applied = data.data?.maxOfflineDays;
      if (!OPTIONS.some(option => option === applied)) throw new Error('Server did not confirm the updated policy.');
      setDays(applied); setSavedDays(applied);
      setMessage('Offline access duration saved for your school.');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not save offline settings.');
    } finally { setSaving(false); }
  };

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card sm:p-7">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"><ShieldCheck className="h-6 w-6" /></div>
        <div>
          <h2 className="text-xl font-black text-[var(--color-text-primary)]">Offline Attendance Access</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Set how long your teachers may unlock downloaded attendance rosters without internet.
            This setting applies only to your school.
          </p>
        </div>
      </div>
      <div className="space-y-2 rounded-xl bg-[var(--color-surface-secondary)] p-4">
        <label htmlFor="offline-attendance-days" className="block text-sm font-bold">Allowed offline duration</label>
        <select id="offline-attendance-days" value={days} disabled={loading || saving || !!error && loading}
          onChange={(event) => { setDays(Number(event.target.value)); setMessage(''); }}
          className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-600">
          {OPTIONS.map(option => <option key={option} value={option}>{optionName(option)}</option>)}
        </select>
        <div className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <p>Example: choosing 7 days allows a teacher who verifies online on Monday at 8 AM to unlock offline until the following Monday at 8 AM.</p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-[var(--color-text-tertiary)]">
        Changes reach teachers at their next successful online verification. A phone that is already offline cannot receive a new restriction immediately.
        Unsynced attendance is kept for the same teacher to review and sync after reconnecting; server confirmation is still required.
      </p>
      {message && <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" />{message}</div>}
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-text-tertiary)]">Current saved limit: <strong>{optionName(savedDays)}</strong></p>
        <button type="button" onClick={() => void save()} disabled={loading || saving || days === savedDays}
          className="min-h-11 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Offline Policy'}
        </button>
      </div>
    </section>
  );
}

export default SchoolAttendanceOfflineSettings;
