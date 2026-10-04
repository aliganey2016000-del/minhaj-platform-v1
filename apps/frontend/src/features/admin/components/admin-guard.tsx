/**
 * Admin Route Guard — role gate plus Staff direct-URL permission gate.
 * Backend middleware remains authoritative; this keeps the client shell from
 * rendering a page the Staff account cannot read.
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';

const ROLE_PORTAL: Record<string, string> = {
  teacher: '/teacher',
  student: '/student',
  parent: '/parent',
  staff: '/admin',
};

function staffPageForLocation(pathname: string, search: string): string | null {
  if (pathname === '/admin' || pathname === '/admin/') return null;
  if (pathname.startsWith('/admin/students/report')) return 'admin/students/report';
  if (pathname.startsWith('/admin/students')) return 'admin/students';
  if (pathname.startsWith('/admin/activity')) return 'admin/activity';

  if (/^\/admin\/courses\/[^/]+\/builder/.test(pathname)) return 'admin/courses/builder';
  if (/^\/admin\/courses\/[^/]+\/gradebook/.test(pathname)) return 'admin/courses/gradebook';
  if (/^\/admin\/courses\/[^/]+\/gate-report/.test(pathname)) return 'admin/courses/gate-report';
  if (/^\/admin\/courses\/[^/]+\/lessons\//.test(pathname)) return 'admin/courses/lesson-edit';
  if (/^\/admin\/courses\/[^/]+\/quizzes\//.test(pathname)) return 'admin/courses/quiz-edit';
  if (/^\/admin\/courses\/[^/]+\/exams\//.test(pathname)) return 'admin/courses/exam-paper-edit';
  if (/^\/admin\/courses\/[^/]+\/preview/.test(pathname)) return 'admin/courses/preview';
  if (pathname.startsWith('/admin/courses')) return 'admin/courses';

  if (pathname.startsWith('/admin/results/enter')) return 'admin/results/enter';
  if (pathname.startsWith('/admin/results')) return 'admin/results';
  if (pathname.startsWith('/admin/exams/invigilators')) return 'admin/exams/invigilators';
  if (pathname.startsWith('/admin/exams/rooms')) return 'admin/exams/rooms';
  if (pathname.startsWith('/admin/exams/attendance')) return 'admin/exams/attendance';
  if (/^\/admin\/exams\/[^/]+\/paper\/review/.test(pathname)) return 'admin/exams/paper-review';
  if (pathname.startsWith('/admin/exams/review')) return 'admin/exams/review';
  if (pathname.startsWith('/admin/exams/papers')) return 'admin/exams/papers';
  if (pathname.startsWith('/admin/exams/compliance')) return 'admin/exams/compliance';
  if (pathname.startsWith('/admin/exams/grading-rules')) return 'admin/exams/grading-rules';
  if (pathname.startsWith('/admin/exams/schedule')) return 'admin/exams/schedule';
  if (pathname.startsWith('/admin/exams')) return 'admin/exams';
  if (pathname.startsWith('/admin/certificates')) return 'admin/certificates';

  if (/^\/admin\/payments\/balances\/[^/]+/.test(pathname)) return 'admin/payments/balances/detail';
  if (pathname.startsWith('/admin/payments/fee-structures')) return 'admin/payments/fee-structures';
  if (pathname.startsWith('/admin/payments/invoices')) return 'admin/payments/invoices';
  if (pathname.startsWith('/admin/payments/record')) return 'admin/payments/record';
  if (pathname.startsWith('/admin/payments/bulk')) return 'admin/payments/bulk';
  if (pathname.startsWith('/admin/payments/balances')) return 'admin/payments/balances';
  if (pathname.startsWith('/admin/payments/discounts')) return 'admin/payments/discounts';
  if (pathname.startsWith('/admin/payments/history')) return 'admin/payments/history';
  if (pathname.startsWith('/admin/payments/reports')) return 'admin/payments/reports';
  if (pathname.startsWith('/admin/payments')) return 'admin/payments';

  if (pathname === '/admin/hr') {
    if (search.includes('tab=attendance') && search.includes('view=settings')) return 'admin/hr?tab=attendance&view=settings';
    if (search.includes('tab=attendance')) return 'admin/hr?tab=attendance';
    if (search.includes('tab=structure')) return 'admin/hr?tab=structure';
    return 'admin/hr';
  }
  if (pathname.startsWith('/admin/hr/access')) return 'admin/hr/access';
  if (pathname.startsWith('/admin/staff')) return 'admin/staff';
  if (pathname.startsWith('/admin/parents')) return 'admin/parents';
  if (pathname.startsWith('/admin/teachers')) return 'admin/teachers';
  if (pathname.startsWith('/admin/schools')) return 'admin/schools';
  if (pathname.startsWith('/admin/website')) return 'admin/website';
  if (pathname.startsWith('/admin/users')) return 'admin/users';
  if (pathname.startsWith('/admin/classes')) return 'admin/classes';
  if (pathname.startsWith('/admin/schedules')) return 'admin/schedules';
  if (pathname.startsWith('/admin/attendance')) return 'admin/attendance';
  if (pathname.startsWith('/admin/assignments')) return 'admin/assignments';
  if (pathname.startsWith('/admin/forum')) return 'admin/forum';
  if (pathname.startsWith('/admin/whatsapp')) return 'admin/whatsapp';
  if (pathname.startsWith('/admin/telegram')) return 'admin/telegram';
  if (pathname.startsWith('/admin/announcements')) return 'admin/announcements';
  if (pathname.startsWith('/admin/news')) return 'admin/news';
  if (pathname.startsWith('/admin/events')) return 'admin/events';
  if (pathname.startsWith('/admin/gallery')) return 'admin/gallery';
  if (pathname.startsWith('/admin/roles')) return 'admin/roles';
  if (pathname.startsWith('/admin/settings/sidebar')) return 'admin/settings/sidebar';
  if (pathname.startsWith('/admin/settings')) return 'admin/settings';
  if (pathname.startsWith('/admin/analytics')) return search.includes('tab=overview') ? 'admin/analytics?tab=overview' : 'admin/analytics';
  if (pathname.startsWith('/admin/logs')) return 'admin/logs';
  if (pathname.startsWith('/admin/trash')) return 'admin/trash';
  if (pathname.startsWith('/admin/profile')) return 'admin/profile';
  return '__unmapped__';
}

function moduleForKey(key: string): string | null {
  if (key.startsWith('admin/payments')) return 'finance';
  if (key.startsWith('admin/exams') || key.startsWith('admin/results') || key === 'admin/certificates') return 'exams';
  if (key.startsWith('admin/students') || key === 'admin/activity') return 'admissions';
  if (key.startsWith('admin/courses') || key.startsWith('admin/analytics')) return 'courses';
  if (['admin/parents','admin/teachers','admin/staff','admin/schools','admin/website','admin/users','admin/classes','admin/hr?tab=structure','admin/hr?tab=attendance','admin/hr?tab=attendance&view=settings','admin/hr','admin/hr/access'].includes(key)) return 'organization';
  if (['admin/schedules','admin/attendance','admin/assignments'].includes(key)) return 'academic';
  if (['admin/announcements','admin/news','admin/events','admin/gallery'].includes(key)) return 'content';
  if (['admin/forum','admin/whatsapp','admin/telegram'].includes(key)) return 'communication';
  if (['admin/roles','admin/settings','admin/settings/sidebar','admin/analytics?tab=overview','admin/logs','admin/trash','admin/profile'].includes(key)) return 'system';
  return null;
}

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const staffPage = user?.role === 'staff' ? staffPageForLocation(location.pathname, location.search) : null;
  const staffDenied = user?.role === 'staff' && staffPage !== null && (
    staffPage === '__unmapped__' ||
    !user.sidebarAccess.includes(staffPage) ||
    !user.permissions.some((permission) => {
      const module = moduleForKey(staffPage);
      return Boolean(module && permission.module === module && permission.actions.includes('read') && (!permission.page || permission.page === staffPage));
    })
  );

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate('/auth/login', { replace: true, state: { from: location.pathname + location.search } });
      return;
    }
    if (user.role !== 'admin' && user.role !== 'org_admin' && user.role !== 'staff') {
      navigate(ROLE_PORTAL[user.role] || '/auth/login', { replace: true });
      return;
    }
    if (staffDenied) navigate('/admin', { replace: true, state: { accessDenied: true } });
  }, [user, isLoading, navigate, location.pathname, location.search, staffDenied]);

  if (isLoading || !user || (user.role !== 'admin' && user.role !== 'org_admin' && user.role !== 'staff') || staffDenied) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">{staffDenied ? 'Access denied. Redirecting…' : 'Verifying access...'}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default AdminGuard;
