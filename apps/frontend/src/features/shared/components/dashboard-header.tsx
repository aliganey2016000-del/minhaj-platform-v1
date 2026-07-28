/**
 * Shared Dashboard Header — Clean Header + Welcome Card
 *
 * Reusable across all role portals (admin, org_admin, teacher, parent, student).
 *
 * Renders:
 *   1. A clean white top bar with the organization name, search,
 *      notifications, theme toggle, and (admin/org_admin only) a Quick
 *      Actions launcher.
 *   2. A minimalist welcome card with "Welcome back, [firstName] 👋", today's
 *      date, and the user's email + role badge.
 *
 * Data is fetched from /auth/me (which includes populated organizationId and
 * profile). Falls back to auth-context data while loading.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UserPlus, BookPlus, Mail, ChevronDown } from 'lucide-react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';
import { GlobalSearchBar } from './global-search-bar';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from '../../../components/shared/theme-toggle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeaderData {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  orgName: string;
  orgInitial: string;
}

interface DashboardHeaderProps {
  /** When true the entire header block is hidden (e.g. full-screen learn page). */
  hidden?: boolean;
}

// ---------------------------------------------------------------------------
// Role badge styling
// ---------------------------------------------------------------------------

const roleBadge: Record<string, { label: string; color: string }> = {
  admin:     { label: 'Super Admin',  color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  org_admin: { label: 'Org Admin',    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  teacher:   { label: 'Teacher',      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  student:   { label: 'Student',      color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  parent:    { label: 'Parent',       color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
};

// ---------------------------------------------------------------------------
// Quick Actions — admin/org_admin only, jumps straight into a management
// page's own "create" modal via router state (see students-manage.tsx,
// courses-manage.tsx, teachers-manage.tsx) instead of just landing on the
// list and making the admin find the button themselves.
// ---------------------------------------------------------------------------

function QuickActions() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const actions = [
    { label: 'Add New Student', icon: UserPlus, go: () => navigate('/admin/students', { state: { openCreate: true } }) },
    { label: 'Create Course', icon: BookPlus, go: () => navigate('/admin/courses', { state: { openCreate: true } }) },
    { label: 'Invite Teacher', icon: Mail, go: () => navigate('/admin/teachers', { state: { openCreate: true } }) },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        <span className="hidden sm:inline">Quick Action</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.25} />
      </button>

      {open && (
        <div className="absolute right-0 rtl:right-auto rtl:left-0 top-full mt-2 w-56 rounded-xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] shadow-lg py-1.5 z-50">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={() => { a.go(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <a.icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardHeader({ hidden }: DashboardHeaderProps) {
  const { user } = useAuth();
  const [data, setData] = useState<HeaderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data: res } = await api.get('/auth/me');
        const me = res.data;
        const profile = me?.profile;
        const orgName = me?.user?.organizationName ||
          (typeof me?.user?.organizationId === 'object' && me?.user?.organizationId?.name) ||
          user.organizationName ||
          'Sahal Education Platform';

        setData({
          firstName: profile?.firstName || user.email?.split('@')[0] || '',
          lastName: profile?.lastName || '',
          email: me?.user?.email || user.email,
          role: me?.user?.role || user.role,
          orgName,
          orgInitial: orgName.charAt(0).toUpperCase(),
        });
      } catch {
        // Fall back to auth-context data
        const fallbackOrg = user.organizationName || 'Sahal Education Platform';
        setData({
          firstName: user.email?.split('@')[0] || '',
          lastName: '',
          email: user.email,
          role: user.role,
          orgName: fallbackOrg,
          orgInitial: fallbackOrg.charAt(0).toUpperCase(),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Format today's date
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const badge = roleBadge[data?.role || ''] || roleBadge.student;
  const fullName =
    data?.firstName && data?.lastName
      ? `${data.firstName} ${data.lastName}`
      : data?.email || '';
  const canQuickAct = data?.role === 'admin' || data?.role === 'org_admin';

  if (hidden) return null;

  // Skeleton while loading
  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-16 bg-[var(--color-surface-primary)] border-b border-slate-100 dark:border-slate-800" />
        <div className="mx-auto max-w-6xl px-6 pt-6 pb-6">
          <div className="h-28 rounded-2xl bg-[var(--color-surface-primary)] border border-slate-100 dark:border-slate-800" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      {/* ── Top Bar ── */}
      <div className="relative bg-[var(--color-surface-primary)] border-b border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="relative mx-auto max-w-6xl px-6 py-3.5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Organization Avatar */}
            <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-950/40 border border-primary-100 dark:border-primary-900">
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">
                {data.orgInitial}
              </span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">
                {data.orgName}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <GlobalSearchBar />
            <NotificationBell />
            <ThemeToggle />
            {canQuickAct && <QuickActions />}
          </div>
        </div>
      </div>

      {/* ── Welcome Card ── */}
      <div className="mx-auto max-w-6xl px-6 pt-6 pb-6">
        <div className="rounded-2xl bg-[var(--color-surface-primary)] border border-slate-100 dark:border-slate-800 p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">
                {dateStr}
              </p>
              <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text-primary)]">
                Welcome back, <span className="text-primary-600 dark:text-primary-400">{data.firstName}</span>
              </h1>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
                {fullName}{' '}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.color}`}
                >
                  {badge.label}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default DashboardHeader;
