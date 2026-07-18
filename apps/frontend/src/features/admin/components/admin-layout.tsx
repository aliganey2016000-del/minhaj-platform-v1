import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './admin-sidebar';
import { DashboardHeader } from '../../shared/components/dashboard-header';

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      <AdminSidebar />
      <div className="lg:ml-64 min-h-screen">
        <DashboardHeader />
        <Outlet />
      </div>
    </div>
  );
}

export default AdminLayout;