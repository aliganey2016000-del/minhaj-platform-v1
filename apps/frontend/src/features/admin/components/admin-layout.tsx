import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AdminSidebar } from './admin-sidebar';
import { DashboardHeader } from '../../shared/components/dashboard-header';

export function AdminLayout() {
  const { pathname } = useLocation();
  const isDashboardRoot = pathname === '/admin' || pathname === '/admin/';

  // Desktop sidebar is always expanded on first load. The sidebar component
  // owns the actual collapse interaction; this state keeps the content area
  // aligned with its width.
  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapsed = () => setCollapsed((prev) => !prev);

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      {/*
        Tailwind's responsive display utility can be overridden by a global
        `.hidden` rule in some production builds. Keep a small, scoped desktop
        guard here so the fixed desktop sidebar can never disappear while the
        mobile drawer behavior remains unchanged.
      */}
      <style>{`
        @media (min-width: 1024px) {
          .admin-sidebar-host > div:not(:first-child) {
            display: block !important;
          }
        }
      `}</style>

      <div className="admin-sidebar-host">
        <AdminSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </div>

      <div className={`min-h-screen transition-[margin] duration-200 ${collapsed ? 'lg:ml-[76px]' : 'lg:ml-72'}`}>
        <DashboardHeader showGreeting={isDashboardRoot} />
        <Outlet />
      </div>
    </div>
  );
}

export default AdminLayout;
