import { Search, Sparkles } from 'lucide-react';
import { useAuth } from '../../../store/auth-context';
import { GlobalSearchBar } from '../../shared/components/global-search-bar';
import { NotificationBell } from '../../shared/components/notification-bell';
import { ThemeToggle } from '../../../components/shared/theme-toggle';

interface StudentPortalHeaderProps {
  hidden?: boolean;
  showGreeting?: boolean;
}

export function StudentPortalHeader({ hidden = false, showGreeting = false }: StudentPortalHeaderProps) {
  const { user } = useAuth();
  if (hidden || !user) return null;

  const firstName = user.firstName || user.email?.split('@')[0] || 'Student';
  const orgName = user.organizationName || 'Sahal Education Platform';
  const orgLogo = user.organizationLogo || '';
  const initials = firstName.slice(0, 1).toUpperCase();

  return (
    <header className="student-portal-header sticky top-0 z-30 border-b border-[var(--color-border-subtle)]">
      <div className="mx-auto flex min-h-16 w-full max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1 pl-12 lg:pl-0">
          {showGreeting ? (
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-400/10 sm:flex">
                {orgLogo ? <img src={orgLogo} alt="" className="h-full w-full bg-white object-contain p-1" /> : <Sparkles className="h-5 w-5 text-emerald-400" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-[.18em] text-emerald-500">Student Portal</p>
                <h1 className="truncate text-base font-black text-[var(--color-text-primary)] sm:text-lg">
                  Ku soo dhowow, {firstName}
                </h1>
                <p className="truncate text-xs text-[var(--color-text-tertiary)]">{orgName}</p>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-emerald-500 lg:hidden" />
              <p className="truncate text-sm font-black text-[var(--color-text-primary)]">{orgName}</p>
            </div>
          )}
        </div>

        <div className="hidden min-w-[220px] max-w-md flex-1 md:block">
          <GlobalSearchBar />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <NotificationBell />
          <ThemeToggle />
          <div className="ml-1 hidden items-center gap-2 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]/80 px-2.5 py-1.5 shadow-sm sm:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-black text-slate-950">
              {initials}
            </div>
            <div className="max-w-[130px]">
              <p className="truncate text-xs font-bold text-[var(--color-text-primary)]">{firstName}</p>
              <p className="truncate text-[10px] text-[var(--color-text-tertiary)]">Student</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default StudentPortalHeader;
