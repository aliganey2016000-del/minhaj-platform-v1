/**
 * Teacher Layout — Sandboxed Portal Shell
 *
 * Shares the underlying AdminLayout shell structure (sidebar, header, grid)
 * but locks the navigation to teacher-scoped pages only.
 */

import { Outlet, useLocation } from 'react-router-dom';
import { TeacherSidebarV2 } from './teacher-sidebar-v2';
import { DashboardHeader } from '../../shared/components/dashboard-header';

export function TeacherLayout() {
  const { pathname } = useLocation();
  const isDashboardRoot = pathname === '/teacher' || pathname === '/teacher/';

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      <TeacherSidebarV2 />
      <div className="lg:ml-64 min-h-screen">
        <DashboardHeader showGreeting={isDashboardRoot} />
        <Outlet />
      </div>
    </div>
  );
}

export default TeacherLayout;
