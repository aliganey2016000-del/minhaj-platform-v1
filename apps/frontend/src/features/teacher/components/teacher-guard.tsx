/**
 * Teacher Route Guard — Strict RBAC Isolation
 *
 * Wraps teacher routes. If the authenticated user is not a teacher,
 * redirects to login with a forbidden message. This is the frontend
 * equivalent of the backend roleMiddleware(['teacher']).
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';

export function TeacherGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      // Carry the page the user was on so login can send them straight back
      // to it instead of the default dashboard.
      navigate('/auth/login', { replace: true, state: { from: location.pathname + location.search } });
      return;
    }
    if (user.role !== 'teacher') {
      // Redirect non-teachers away. Students go to student portal,
      // admins go to admin portal.
      const redirectMap: Record<string, string> = {
        admin: '/admin',
        org_admin: '/admin',
        student: '/student',
        parent: '/parent',
      };
      navigate(redirectMap[user.role] || '/auth/login', { replace: true });
    }
  }, [user, isLoading, navigate, location]);

  if (isLoading || !user || user.role !== 'teacher') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-emerald-200 border-t-emerald-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Verifying access...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default TeacherGuard;