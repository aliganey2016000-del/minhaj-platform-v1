/**
 * Teacher Layout — Sandboxed Portal Shell
 *
 * The tenant Teacher Sidebar configuration is an access boundary, not only a
 * navigation preference: if an org admin disables a teacher page, typing its
 * URL directly must not mount that page.
 */

import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { TeacherSidebar } from './teacher-sidebar';
import { DashboardHeader } from '../../shared/components/dashboard-header';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import {
  firstAllowedTeacherRoute,
  isTeacherRouteAllowed,
  type TeacherSidebarVisibility,
} from './teacher-sidebar-access';

export function TeacherLayout() {
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const isDashboardRoot = pathname === '/teacher' || pathname === '/teacher/';
  const [visibility, setVisibility] = useState<TeacherSidebarVisibility | null>(null);
  const [accessError, setAccessError] = useState('');

  const loadAccess = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

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
  if (!isTeacherRouteAllowed(pathname, effectiveVisibility)) {
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
