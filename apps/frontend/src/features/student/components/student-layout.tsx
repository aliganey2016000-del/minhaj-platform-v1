/**
 * Student Layout — Wraps the sidebar with the main content area.
 * Uses React Router Outlet for nested routing.
 *
 * On the course learning page (/student/courses/:id/learn), the main
 * StudentSidebar is hidden to maximize space for the course content sidebar.
 */

import { Outlet, useLocation } from 'react-router-dom';
import { StudentSidebar } from './student-sidebar';
import { StudentPortalHeader } from './student-portal-header';

/** Regex to match /student/courses/<any-id>/learn */
const LEARN_ROUTE_RE = /^\/student\/courses\/[^/]+\/learn/;

export function StudentLayout() {
  const { pathname } = useLocation();
  const isLearnPage = LEARN_ROUTE_RE.test(pathname);
  const isDashboardRoot = pathname === '/student' || pathname === '/student/';

  return (
    <div className="student-portal-shell relative min-h-screen overflow-x-hidden bg-[var(--color-surface-secondary)]">
      <div className="student-portal-orb student-portal-orb-one" aria-hidden="true" />
      <div className="student-portal-orb student-portal-orb-two" aria-hidden="true" />
      {!isLearnPage && <StudentSidebar />}
      <div className={`${isLearnPage ? '' : 'lg:ms-72'} relative min-h-screen`}>
        <StudentPortalHeader hidden={isLearnPage} showGreeting={isDashboardRoot} />
        <main className="relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default StudentLayout;