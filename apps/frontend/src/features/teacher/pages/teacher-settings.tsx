import { useEffect, useState } from 'react';
import { CheckCircle2, Languages, Moon, Sun, LockKeyhole, ShieldCheck, CloudDownload, Loader2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { clearOfflinePin, isOfflinePinReady, setupOfflinePin } from '../../../lib/offline-teacher-pin';
import { verifiedOfflineTeacherIdentity, saveVerifiedTeacherIdentity, offlineAttendanceOwner, prepareTeacherOfflineAppShell, cacheOfflineTeacherSidebar, cacheOfflineTeachingSchedule, cacheAttendanceSessions, cacheAttendanceRoster, preparedAttendanceDates } from '../../../lib/teacher-offline-attendance';
import { useAuth } from '../../../store/auth-context';
import { isOfflinePinReady, refreshOfflinePinValidity } from '../../../lib/offline-teacher-pin';
import { cacheTeacherExamPeriods, cacheTeacherExamWorkspace, cacheTeacherExamAttendance, cacheTeacherInvigilationRoster, cacheTeacherResultCourses, cacheTeacherResultRoster } from '../../../lib/teacher-offline-exams';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';
import { useTheme } from '../../../store/theme-context';

export function TeacherSettings() {
  const { i18n } = useTranslation();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const [language, setLanguage] = useState(i18n.language || 'en');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinReady, setPinReady] = useState(isOfflinePinReady);
  const [pinSaving, setPinSaving] = useState(false);
  const [policyDays, setPolicyDays] = useState(verifiedOfflineTeacherIdentity()?.maxOfflineDays ?? 7);
  const [showOfflineAccess, setShowOfflineAccess] = useState(location.hash === '#offline-access');
  const [preparingAllOffline, setPreparingAllOffline] = useState(false);
  const [offlinePreparationStatus, setOfflinePreparationStatus] = useState('');
  useEffect(() => {
    if (location.hash === '#offline-access') {
      setShowOfflineAccess(true);
      document.getElementById('offline-access')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);
  useEffect(() => {
    let active = true;
    api.get('/attendance/offline-policy', { timeout: 15000 }).then(({ data }) => {
      if (active && typeof data.data?.maxOfflineDays === 'number') setPolicyDays(data.data.maxOfflineDays);
    }).catch(() => {}).finally(() => { if (active) setPinReady(isOfflinePinReady()); });
    return () => { active = false; };
  }, []);

  const prepareEverythingOffline = async () => {
    if (!navigator.onLine || preparingAllOffline) return;
    if (!user || user.role !== 'teacher' || !user.organizationId) {
      setError('Sign in online with your teacher account before preparing offline access.');
      return;
    }
    if (!isOfflinePinReady()) {
      setError('Create your six-digit Offline PIN first, then prepare this device.');
      return;
    }
    setError('');
    setMessage('');
    setPreparingAllOffline(true);
    let ready = 0;
    let failed = 0;
    const recordFailure = () => { failed += 1; };
    try {
      await saveVerifiedTeacherIdentity(user);
      refreshOfflinePinValidity();
      const owner = offlineAttendanceOwner(user);
      if (!owner) throw new Error('Could not verify the offline teacher identity.');
      setOfflinePreparationStatus('Preparing offline access and app files…');
      await prepareTeacherOfflineAppShell();
      ready++;
      await Promise.all([
        import('./teacher-school-attendance-roster'),
        import('./teacher-schedule'),
        import('./teacher-exam-attendance-roster'),
        import('./teacher-invigilation-attendance-roster'),
        import('../../admin/pages/results-entry'),
      ]);
      ready++;
      const { data: sidebarData } = await api.get('/sidebar-settings/mine', { params: { portal: 'teacher' }, timeout: 15000 });
      const sidebar: Record<string, boolean> = {};
      (sidebarData.data?.items || []).forEach((item: {key:string;visible:boolean}) => { sidebar[item.key] = item.visible; });
      await cacheOfflineTeacherSidebar(owner, sidebar);

      setOfflinePreparationStatus('Downloading timetable and student attendance rosters…');
      const { data: scheduleData } = await api.get('/class-schedules/my-teaching', { timeout: 15000 });
      const scheduleRows = Array.isArray(scheduleData.data) ? scheduleData.data : [];
      let lessonPeriods: Array<{label?: string; startTime:string; endTime:string; isBreak?:boolean}> = [];
      try {
        const { data } = await api.get('/class-schedules/school/period-settings', { timeout: 15000 });
        lessonPeriods = data.data?.periods || [];
      } catch { recordFailure(); }
      await cacheOfflineTeachingSchedule(owner, { schedules: scheduleRows, periods: lessonPeriods, preparedAt: Date.now() });
      const { data: policyData } = await api.get('/attendance/offline-policy', { timeout: 15000 });
      const days = Number(policyData.data?.maxOfflineDays || 7); void days;
      const grant = (await import('../../../lib/teacher-offline-attendance')).getOfflineAttendanceAccessWindow();
      if (!grant) throw new Error('Offline access period could not be verified by the school.');
      const targetDates = preparedAttendanceDates(grant, new Date().toISOString().slice(0,10));
      for (const targetDate of targetDates) {
        try {
          const { data } = await api.get('/attendance/school/sessions', { params: { date: targetDate }, timeout: 15000 });
          const day = data.data;
          const sessions = Array.isArray(day?.sessions) ? day.sessions : [];
          await cacheAttendanceSessions(owner, targetDate, { sessions, calendarDay: day?.calendarDay || null });
          for (const session of sessions) {
            try {
              const roster = await api.get('/attendance/school/session/' + session._id, { params: { date: targetDate }, timeout: 15000 });
              await cacheAttendanceRoster(owner, targetDate, session._id, roster.data.data);
              ready++;
            } catch { recordFailure(); }
          }
          ready++;
        } catch { recordFailure(); }
      }

      setOfflinePreparationStatus('Downloading published exam periods, exam attendance, invigilation and results…');
      const [periodResponse, examResponse, courseResponse] = await Promise.all([
        api.get('/exams/periods', { timeout: 15000 }),
        api.get('/exams', { params: { limit: 200 }, timeout: 15000 }),
        api.get('/gradebook-courses', { timeout: 15000 }),
      ]);
      const periods = (periodResponse.data?.data || []).filter((period: any) => period.status === 'published');
      const exams = examResponse.data?.data || [];
      const courses = courseResponse.data?.data || [];
      await cacheTeacherExamPeriods({ periods, exams, cachedAt: Date.now() });
      await cacheTeacherResultCourses(courses);
      ready += 2;
      const courseIds = new Set<string>(courses.map((course: any) => String(course._id)).filter(Boolean));
      for (const exam of exams) {
        if (exam.course?._id) courseIds.add(String(exam.course._id));
        try {
          const { data } = await api.get('/exams/' + exam._id + '/attendance', { timeout: 15000 });
          await cacheTeacherExamAttendance(exam._id, { ...(data.data || {}), cachedAt: Date.now() });
          ready++;
        } catch { recordFailure(); }
      }
      const assignmentResponse = await api.get('/exams/invigilators/my', { timeout: 15000 }).catch(() => null);
      const assignments = assignmentResponse?.data?.data || [];
      if (!assignmentResponse) recordFailure();
      for (const period of periods) {
        try {
          const { data } = await api.get('/exams', { params: { period: period._id, limit: 200 }, timeout: 15000 });
          const periodExams = data.data || [];
          await cacheTeacherExamWorkspace(period._id, {
            periods,
            exams: periodExams,
            assignments,
            cachedAt: Date.now(),
          });
          ready++;
        } catch { recordFailure(); }
      }
      for (const assignment of assignments) {
        try {
          const { data } = await api.get('/exams/invigilators/' + assignment._id + '/roster', { timeout: 15000 });
          await cacheTeacherInvigilationRoster(assignment._id, { ...(data.data || {}), cachedAt: Date.now() });
          ready++;
        } catch { recordFailure(); }
      }
      for (const courseId of courseIds) {
        try {
          const { data } = await api.get('/gradebook/' + courseId + '/manual-entry-roster', { timeout: 15000 });
          await cacheTeacherResultRoster(courseId, data.data);
          ready++;
        } catch { recordFailure(); }
      }
      setOfflinePreparationStatus('Preparation finished: ' + ready + ' items saved; ' + failed + ' could not be downloaded. Keep this device signed in and retry failures while online.');
      setMessage('Offline preparation completed. Review the status below before disconnecting.');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Offline preparation failed. Please reconnect and retry.');
      setOfflinePreparationStatus('Preparation did not finish. Some data may have been saved; retry while online.');
    } finally {
      setPreparingAllOffline(false);
    }
  };

  const savePin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(''); setMessage('');
    if (pin !== confirmPin) { setError('PIN and confirmation do not match.'); return; }
    setPinSaving(true);
    try {
      await setupOfflinePin(pin);
      setPinReady(isOfflinePinReady());
      setPin(''); setConfirmPin('');
      setMessage('Offline PIN saved on this device. Use Prepare Exam Portal for Offline Use below to prepare exam data.');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not set up offline access.');
    } finally { setPinSaving(false); }
  };

  const changeLanguage = async (nextLanguage: string) => {
    const previousLanguage = language;
    setLanguage(nextLanguage);
    setSaving(true);
    setMessage('');
    setError('');
    await i18n.changeLanguage(nextLanguage);
    localStorage.setItem('masjid-language', nextLanguage);
    document.documentElement.dir = nextLanguage === 'ar' ? 'rtl' : 'ltr';

    try {
      await api.patch('/auth/me', { preferredLanguage: nextLanguage });
      setMessage(nextLanguage === 'so' ? 'Luqadda waa la keydiyey.' : nextLanguage === 'ar' ? 'تم حفظ اللغة.' : 'Language saved.');
    } catch (requestError: any) {
      setLanguage(previousLanguage);
      await i18n.changeLanguage(previousLanguage);
      localStorage.setItem('masjid-language', previousLanguage);
      document.documentElement.dir = previousLanguage === 'ar' ? 'rtl' : 'ltr';
      setError(requestError?.response?.data?.message || 'Could not save your language preference.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Teacher portal</p>
        <h1 className="mt-1 text-2xl font-black text-[var(--color-text-primary)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Choose how your portal looks and which language it uses.</p>
      </header>

      {message && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{message}</div>}
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm">
        <section className="border-b border-[var(--color-border-subtle)] p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40"><Languages className="h-5 w-5" /></span>
            <div><h2 className="font-bold">Language</h2><p className="text-xs text-[var(--color-text-tertiary)]">This preference is saved to your account.</p></div>
          </div>
          <label className="block text-sm font-semibold" htmlFor="teacher-language">Portal language</label>
          <select id="teacher-language" value={language} disabled={saving} onChange={(event) => void changeLanguage(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 text-sm disabled:opacity-60">
            <option value="en">English</option>
            <option value="so">Soomaali</option>
            <option value="ar">العربية</option>
          </select>
        </section>

        <section className="border-b border-[var(--color-border-subtle)] p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40">{theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</span>
            <div><h2 className="font-bold">Appearance</h2><p className="text-xs text-[var(--color-text-tertiary)]">Theme is saved on this device.</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['light', 'dark'] as const).map((option) => <button key={option} type="button" aria-pressed={theme === option} onClick={() => setTheme(option)} className={`rounded-xl border px-4 py-3 text-sm font-bold capitalize transition ${theme === option ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]'}`}>{option}</button>)}
          </div>
        </section>
        <section className="p-5 sm:p-6" id="offline-access">
          <button type="button" onClick={() => setShowOfflineAccess((current) => !current)} aria-expanded={showOfflineAccess} className="mb-4 flex w-full items-center gap-3 text-left">
            <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40"><ShieldCheck className="h-5 w-5" /></span>
            <span className="flex-1">
              <span className="block font-bold">Offline Access & PIN</span>
              <span className="block text-xs text-[var(--color-text-tertiary)]">Set your offline PIN and prepare exam data on this device.</span>
            </span>
            <span aria-hidden="true" className="text-[var(--color-text-tertiary)]">{showOfflineAccess ? '⌃' : '⌄'}</span>
          </button>
          {showOfflineAccess && <>
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <h2 className="font-bold">Offline Attendance Access</h2>
              <p className="text-xs text-[var(--color-text-tertiary)]">Securely unlock previously downloaded rosters without internet.</p>
            </div>
          </div>
          <div className="mb-4 rounded-xl bg-[var(--color-surface-secondary)] p-3 text-sm">
            <p className="font-semibold">{pinReady ? 'Offline PIN is ready on this device' : 'Offline PIN is not yet configured'}</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Sign in online, create a six-digit PIN, then visit Student Attendance and select Prepare Offline.
              {policyDays === 7
                ? 'Your school uses Saturday–Friday weekly offline periods (Somalia time). Every Saturday begins a new period. Connect online and tap Prepare Offline again to renew access.'
                : `Your school's administrator allows ${policyDays} day${policyDays === 1 ? '' : 's'} of offline access after successful online verification.`}
            </p>
          </div>
          <form onSubmit={(event) => void savePin(event)} className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              New offline PIN
              <input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required
                value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1.5 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 tracking-widest" />
            </label>
            <label className="block text-sm font-semibold">
              Confirm offline PIN
              <input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required
                value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1.5 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 tracking-widest" />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button type="submit" disabled={pinSaving || !navigator.onLine}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                <LockKeyhole className="h-4 w-4" />{pinSaving ? 'Saving...' : pinReady ? 'Change Offline PIN' : 'Enable Offline PIN'}
              </button>
              {pinReady && <button type="button" onClick={() => { clearOfflinePin(); setPinReady(false); setMessage('Offline PIN disabled on this device.'); }}
                className="min-h-11 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300">Disable PIN</button>}
              <Link to="/teacher/attendance" className="inline-flex min-h-11 items-center rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Go to Attendance
              </Link>
            </div>
          </form>
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <h3 className="font-bold text-[var(--color-text-primary)]">Prepare Everything for Offline Use</h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">One button prepares the app shell, timetable, student attendance rosters for the approved offline period, published exam periods, exam attendance and result-entry rosters on this device.</p>
            <button type="button" onClick={() => void prepareEverythingOffline()} disabled={!navigator.onLine || preparingAllOffline || !pinReady} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {preparingAllOffline ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
              {preparingAllOffline ? 'Preparing everything…' : 'Prepare Everything Offline'}
            </button>
            {!navigator.onLine && <p className="mt-2 text-xs text-amber-700">Connect to the internet before preparing.</p>}
            {!pinReady && <p className="mt-2 text-xs text-amber-700">Set up the six-digit Offline PIN first.</p>}
            {offlinePreparationStatus && <p role="status" className="mt-3 rounded-lg bg-white/80 p-3 text-sm font-medium text-[var(--color-text-primary)] dark:bg-black/10">{offlinePreparationStatus}</p>}
          </div>
          </>}
        </section>
      </div>
    </main>
  );
}

export default TeacherSettings;
