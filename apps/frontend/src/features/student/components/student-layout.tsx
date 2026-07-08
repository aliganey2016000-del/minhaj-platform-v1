/**
 * Student Layout — Wraps the sidebar with the main content area.
 * Uses React Router Outlet for nested routing.
 */

import { Outlet } from 'react-router-dom';
import { StudentSidebar } from './student-sidebar';

export function StudentLayout() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      <StudentSidebar />
      {/* Main content area — offset by sidebar width on desktop */}
      <div className="lg:ms-64 min-h-screen">
        <Outlet />
      </div>
    </div>
  );
}

export default StudentLayout;