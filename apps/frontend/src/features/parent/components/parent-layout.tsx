import { Outlet } from 'react-router-dom';
import { ParentSidebar } from './parent-sidebar';

export function ParentLayout() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      <ParentSidebar />
      <div className="lg:ml-64 min-h-screen">
        <Outlet />
      </div>
    </div>
  );
}

export default ParentLayout;