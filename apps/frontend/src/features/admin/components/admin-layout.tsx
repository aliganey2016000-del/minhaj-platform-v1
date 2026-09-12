import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AdminSidebar } from './admin-sidebar';
import { DashboardHeader } from '../../shared/components/dashboard-header';

export function AdminLayout() {
  const { pathname } = useLocation();
  const isDashboardRoot = pathname === '/admin' || pathname === '/admin/';

  // Keep the desktop navigation visible by default. A previously stored
  // collapsed state could leave the desktop portal looking empty after a
  // layout update, so the sidebar state is intentionally session-local.
  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      <AdminSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />

      <div className={`min-h-screen transition-[margin] duration-200 ${collapsed ? 'lg:ml-[76px]' : 'lg:ml-72'}`}>
        <DashboardHeader showGreeting={isDashboardRoot} />
        <Outlet />
      </div>
    </div>
  );
}

export default AdminLayout;
