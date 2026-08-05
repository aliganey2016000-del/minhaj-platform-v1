import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AdminSidebar } from './admin-sidebar';
import { DashboardHeader } from '../../shared/components/dashboard-header';

const SIDEBAR_COLLAPSED_KEY = 'adminSidebarCollapsed';

export function AdminLayout() {
  const { pathname } = useLocation();
  const isDashboardRoot = pathname === '/admin' || pathname === '/admin/';

  // Lifted here (not local to AdminSidebar) because the content area's own
  // left margin has to shrink in lockstep with the sidebar's width.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
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