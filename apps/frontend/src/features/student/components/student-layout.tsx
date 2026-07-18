/**
 * Student Layout — Wraps the sidebar with the main content area.
 * Uses React Router Outlet for nested routing.
 *
 * On the course learning page (/student/courses/:id/learn), the main
 * StudentSidebar is hidden to maximize space for the course content sidebar.
 */

import { Outlet, useLocation } from 'react-router-dom';
import { StudentSidebar } from './student-sidebar';
import { DashboardHeader } from '../../shared/components/dashboard-header';

/** Regex to match /student/courses/<any-id>/learn */
const LEARN_ROUTE_RE = /^\/student\/courses\/[^/]+\/learn/;

export function StudentLayout() {
  const { pathname } = useLocation();
  const isLearnPage = LEARN_ROUTE_RE.test(pathname);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      {!isLearnPage && <StudentSidebar />}
      {/* Main content area — offset by sidebar width on desktop (unless on learn page) */}
      <div className={`${isLearnPage ? '' : 'lg:ms-64'} min-h-screen`}>
        {/* Hide the shared header on the full-screen course learning page */}
        <DashboardHeader hidden={isLearnPage} />
        <Outlet />
      </div>
    </div>
  );
}

export default StudentLayout;