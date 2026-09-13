import { Outlet, useLocation } from 'react-router-dom';
import { ParentSidebar } from './parent-sidebar';
import { ParentGuard } from './parent-guard';
import { DashboardHeader } from '../../shared/components/dashboard-header';

export function ParentLayout() {
  const { pathname } = useLocation();
  const isDashboardRoot = pathname === '/parent' || pathname === '/parent/';

  return (
    <ParentGuard>
      <div className="min-h-screen bg-[var(--color-surface-secondary)]">
        <ParentSidebar />
        <div className="lg:ml-64 min-h-screen">
          <DashboardHeader showGreeting={isDashboardRoot} />
          <Outlet />
        </div>
      </div>
    </ParentGuard>
  );
}

export default ParentLayout;
