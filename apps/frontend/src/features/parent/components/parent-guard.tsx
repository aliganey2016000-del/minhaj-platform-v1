/** Parent Route Guard — keeps /parent isolated to authenticated parent users. */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';

export function ParentGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate('/auth/login', {
        replace: true,
        state: { from: location.pathname + location.search },
      });
      return;
    }

    if (user.role !== 'parent') {
      const redirectMap: Record<string, string> = {
        admin: '/admin',
        org_admin: '/admin',
        finance_manager: '/admin',
        cashier: '/admin',
        auditor: '/admin',
        staff: '/admin',
        teacher: '/teacher',
        student: '/student',
      };
      navigate(redirectMap[user.role] || '/auth/login', { replace: true });
    }
  }, [user, isLoading, navigate, location]);

  if (isLoading || !user || user.role !== 'parent') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-emerald-200 border-t-emerald-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Verifying parent access...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default ParentGuard;
