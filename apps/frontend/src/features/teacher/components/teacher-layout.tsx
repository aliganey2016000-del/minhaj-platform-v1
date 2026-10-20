/**
 * Teacher Layout — Sandboxed Portal Shell
 *
 * The tenant Teacher Sidebar configuration is an access boundary, not only a
 * navigation preference: if an org admin disables a teacher page, typing its
 * URL directly must not mount that page.
 */

import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TeacherSidebar } from './teacher-sidebar';
import { DashboardHeader } from '../../shared/components/dashboard-header';
import api from '../../../lib/axios';
import { getOfflineTeacherSidebar, getOfflineTeachingSchedule, offlineAttendanceOwner } from '../../../lib/teacher-offline-attendance';
import { getCachedTeacherExamPeriods } from '../../../lib/teacher-offline-exams';
import { useAuth } from '../../../store/auth-context';
import {
  firstAllowedTeacherRoute,
  isTeacherRouteAllowed,
  type TeacherSidebarVisibility,
} from './teacher-sidebar-access';

export function TeacherLayout() {
  const { pathname, search } = useLocation();
  const examResultEntry = pathname === '/teacher/results/enter' && /(?:\?|&)examId=[^&]+/.test(search);
  const navigate = useNavigate();
  const { user, logout, lockOfflineSession } = useAuth();
  const offlineOnly = user?.offlineOnly === true;
  const isDashboardRoot = pathname === '/teacher' || pathname === '/teacher/';
  const [visibility, setVisibility] = useState<TeacherSidebarVisibility | null>(null);
  const [accessError, setAccessError] = useState('');
  const [offlineVisibility, setOfflineVisibility] = useState<TeacherSidebarVisibility>({
    'teacher/attendance': true, 'teacher/schedule': false,
  });
  const [offlineAccessLoaded, setOfflineAccessLoaded] = useState(false);
  const [offlineExamReady, setOfflineExamReady] = useState(false);

  useEffect(() => {
    if (!offlineOnly) {
      setOfflineAccessLoaded(false);
      setOfflineExamReady(false);
      return;
    }
    let current = true;
    setOfflineAccessLoaded(false);
    const owner = offlineAttendanceOwner(user);
    if (!owner) {
      setOfflineVisibility({ 'teacher/attendance': true, 'teacher/schedule': false });
      setOfflineExamReady(false);
      setOfflineAccessLoaded(true);
      return;
    }
    void Promise.all([
      getOfflineTeacherSidebar(owner),
      getOfflineTeachingSchedule(owner),
      getCachedTeacherExamPeriods<{ periods?: unknown[] }>(),
    ]).then(([rights, timetable, cachedExams]) => {
      if (!current) return;
      const source = rights || {};
      const examsReady = Boolean(rights) && Array.isArray(cachedExams?.periods) && cachedExams.periods.length > 0;
      // Offline PIN access is intentionally restricted to downloaded attendance
      // and the explicitly prepared exam workspace. Do not expose other cached
      // sidebar capabilities through an offline-only identity.
      const restricted: TeacherSidebarVisibility = Object.fromEntries(
        Object.keys(source).map((key) => [key, false]),
      );
      restricted['teacher/attendance'] = source['teacher/attendance'] !== false;
      restricted['teacher/schedule'] = Boolean(timetable) && source['teacher/schedule'] !== false;
      restricted['group:teacher-exams'] = examsReady && source['group:teacher-exams'] !== false;
      restricted['teacher/exams'] = examsReady && source['teacher/exams'] !== false;
      restricted['teacher/exam-attendance'] = examsReady && source['teacher/exam-attendance'] !== false;
      restricted['group:gradebook'] = examsReady && source['group:gradebook'] !== false;
      restricted['teacher/results/enter'] = examsReady && source['teacher/results/enter'] !== false;
      // Confidential exam papers and incident-management pages are not part of
      // the offline workspace and must never open from an offline PIN session.
      restricted['teacher/exam-papers'] = false;
      restricted['teacher/exam-incidents'] = false;
      setOfflineVisibility(restricted);
      setOfflineExamReady(examsReady && source['group:teacher-exams'] !== false && source['teacher/exams'] !== false);
    }).catch(() => {
      if (current) {
        setOfflineVisibility({ 'teacher/attendance': true, 'teacher/schedule': false });
        setOfflineExamReady(false);
      }
    }).finally(() => {
      if (current) setOfflineAccessLoaded(true);
    });
    return () => { current = false; };
  }, [offlineOnly, user?.id, user?.organizationId]);

  const loadAccess = useCallback(async () => {
    if (offlineOnly) { setVisibility(null); setAccessError(''); return; }
    setAccessError('');
    try {
      const { data } = await api.get('/sidebar-settings/mine', { params: { portal: 'teacher' } });
      const map: TeacherSidebarVisibility = {};
      (data.data?.items || []).forEach((item: { key: string; visible: boolean }) => {
        map[item.key] = item.visible;
      });
      setVisibility(map);
    } catch (err: any) {
      // Fail closed. A temporary settings/API problem must never make a page
      // that the organization disabled become reachable by direct URL.
      setVisibility(null);
      setAccessError(err.response?.data?.message || 'Could not verify teacher portal access.');
    }
  }, [offlineOnly]);

  useEffect(() => {
    if (!offlineOnly) void loadAccess();
  }, [loadAccess, offlineOnly]);

  // PIN grants access only to locally downloaded attendance and the explicitly
  // prepared exam workspace. No dashboard, finance, exam-paper or generic teacher
  // routes may be reached with an offline-only identity.
  if (offlineOnly) {
    if (!offlineAccessLoaded) {
      return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-3 border-emerald-200 border-t-emerald-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Checking saved offline access…</p>
        </div>
      </div>;
    }
    if (offlineVisibility['teacher/attendance'] === false) {
      return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--color-surface-primary)] p-6 text-center">
        <p className="font-bold">Offline attendance is not permitted for this teacher.</p>
        <p className="text-sm text-[var(--color-text-secondary)]">Reconnect to verify your school's Teacher Sidebar permissions.</p>
        <button type="button" onClick={() => { lockOfflineSession(); navigate('/auth/login', { replace:true }); }}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Switch teacher</button>
      </div>;
    }
    const offlineExamRoute =
      pathname === '/teacher/exams' ||
      /^\/teacher\/exams\/periods\/[^/]+\/?$/.test(pathname) ||
      /^\/teacher\/exams\/[^/]+\/attendance\/?$/.test(pathname) ||
      pathname === '/teacher/exam-attendance' ||
      /^\/teacher\/exam-attendance\/[^/]+\/?$/.test(pathname) ||
      pathname === '/teacher/results/enter';
    if ((!offlineExamRoute && !isTeacherRouteAllowed(pathname, offlineVisibility, { examResultEntry })) ||
        (offlineExamRoute && (!offlineExamReady || !isTeacherRouteAllowed(pathname, offlineVisibility, { examResultEntry })))) {
      return <Navigate to="/teacher/attendance" replace />;
    }
    return (
      <div className="min-h-screen bg-[var(--color-surface-secondary)]">
        <TeacherSidebar visibility={offlineVisibility} offlineOnly />
        <div className="min-h-screen lg:ml-64">
          <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-3 pl-16 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 lg:pl-4">
            <span>Offline Teacher Portal · {user?.email || 'Teacher'} · Local data only</span>
            <button type="button" onClick={() => { lockOfflineSession(); navigate('/auth/login', { replace:true }); }}
              className="min-h-9 rounded-lg border border-emerald-300 px-3 py-1.5 font-bold">
              Switch teacher
            </button>
          </div>
          <Outlet />
        </div>
      </div>
    );
  }

  if (!visibility && !accessError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-emerald-200 border-t-emerald-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Verifying portal access...</p>
        </div>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Access could not be verified</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{accessError}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={() => void loadAccess()} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Try again</button>
            <button type="button" onClick={logout} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold">Logout</button>
          </div>
        </div>
      </div>
    );
  }

  const effectiveVisibility = visibility!;
  if (!isTeacherRouteAllowed(pathname, effectiveVisibility, { examResultEntry })) {
    const fallback = firstAllowedTeacherRoute(effectiveVisibility);
    if (fallback && fallback !== pathname) {
      return <Navigate to={fallback} replace state={{ accessDisabled: true, from: pathname }} />;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Teacher portal access disabled</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Your organization has not enabled any teacher portal pages for this account.
          </p>
          <button type="button" onClick={logout} className="mt-5 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold">Logout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      <TeacherSidebar visibility={effectiveVisibility} />
      <div className="lg:ml-64 min-h-screen">
        <DashboardHeader showGreeting={isDashboardRoot} />
        <Outlet />
      </div>
    </div>
  );
}

export default TeacherLayout;
