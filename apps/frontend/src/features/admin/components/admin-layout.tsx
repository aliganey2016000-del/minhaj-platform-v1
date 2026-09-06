import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Building2 } from 'lucide-react';
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

      {/* Always-visible shortcut for the institution hierarchy. The existing
          sidebar stays unchanged; this keeps Faculty/Department management
          reachable on both desktop and mobile without hiding other items. */}
      <Link
        to="/admin/hr?tab=structure"
        title="Institution Structure"
        className={`fixed bottom-[4.75rem] left-0 z-40 hidden lg:flex items-center gap-3 border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-[13px] font-medium text-[var(--color-text-secondary)] shadow-md transition-[width] duration-200 hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] ${collapsed ? 'w-[76px] justify-center' : 'w-72'}`}
      >
        <Building2 className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.75} />
        {!collapsed && <span className="truncate">Institution Structure</span>}
      </Link>
      <Link
        to="/admin/hr?tab=structure"
        title="Institution Structure"
        aria-label="Institution Structure"
        className="fixed bottom-[4.75rem] left-3 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)] shadow-md lg:hidden"
      >
        <Building2 className="h-5 w-5" strokeWidth={1.75} />
      </Link>

      <div className={`min-h-screen transition-[margin] duration-200 ${collapsed ? 'lg:ml-[76px]' : 'lg:ml-72'}`}>
        <DashboardHeader showGreeting={isDashboardRoot} />
        <Outlet />
      </div>
    </div>
  );
}

export default AdminLayout;
