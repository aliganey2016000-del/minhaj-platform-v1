/**
 * Teacher Layout — Sandboxed Portal Shell
 *
 * Shares the underlying AdminLayout shell structure (sidebar, header, grid)
 * but locks the navigation to teacher-scoped pages only.
 * Teachers CANNOT access: financial records, tenant settings, user deletion,
 * school-wide admin routes, or global system configurations.
 */

import { Outlet, useLocation } from 'react-router-dom';
import { TeacherSidebar } from './teacher-sidebar';
import { DashboardHeader } from '../../shared/components/dashboard-header';

export function TeacherLayout() {
  const { pathname } = useLocation();
  const isDashboardRoot = pathname === '/teacher' || pathname === '/teacher/';

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      <TeacherSidebar />
      <div className="lg:ml-64 min-h-screen">
        <DashboardHeader showGreeting={isDashboardRoot} />
        <Outlet />
      </div>
    </div>
  );
}

export default TeacherLayout;