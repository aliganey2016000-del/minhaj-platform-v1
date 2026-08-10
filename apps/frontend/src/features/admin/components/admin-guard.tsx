/**
 * Admin Route Guard — Ensures only admin/org_admin can access /admin routes.
 *
 * Teachers who manually type /admin/* URLs or have stale cached layouts are
 * immediately evicted to their sandboxed /teacher portal.
 * Students and parents are likewise redirected to their appropriate portals.
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';

const ROLE_PORTAL: Record<string, string> = {
  teacher: '/teacher',
  student: '/student',
  parent: '/parent',
};

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      // Carry the page the user was on so login can send them straight
      // back to it instead of dumping them on the default dashboard —
      // otherwise a transient session hiccup (e.g. an access token
      // expiring mid-session) loses their place in the app.
      navigate('/auth/login', { replace: true, state: { from: location.pathname + location.search } });
      return;
    }
    if (user.role !== 'admin' && user.role !== 'org_admin') {
      const redirect = ROLE_PORTAL[user.role] || '/auth/login';
      navigate(redirect, { replace: true });
    }
  }, [user, isLoading, navigate, location]);

  if (isLoading || !user || (user.role !== 'admin' && user.role !== 'org_admin')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Verifying access...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default AdminGuard;