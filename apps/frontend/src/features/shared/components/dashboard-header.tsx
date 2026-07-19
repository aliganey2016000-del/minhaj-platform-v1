/**
 * Shared Dashboard Header — Org Banner + Welcome Card
 *
 * Reusable across all role portals (admin, org_admin, teacher, parent, student).
 *
 * Renders:
 *   1. A dark green gradient banner with the user's organization name
 *      and an "Active" status pill.
 *   2. A welcome card with "Welcome back, [firstName] 👋", today's date,
 *      and the user's email + role badge.
 *
 * Data is fetched from /auth/me (which includes populated organizationId and
 * profile). Falls back to auth-context data while loading.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';
import { GlobalSearchBar } from './global-search-bar';
import { NotificationBell } from './notification-bell';

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
        const org = me?.user?.organizationId;

        setData({
          firstName: profile?.firstName || user.email?.split('@')[0] || '',
          lastName: profile?.lastName || '',
          email: me?.user?.email || user.email,
          role: me?.user?.role || user.role,
          orgName:
            (typeof org === 'object' && org?.name) ||
            'Masjid Al-Rahma Institute',
          orgInitial:
            (typeof org === 'object' && org?.name
              ? org.name.charAt(0).toUpperCase()
              : 'M'),
        });
      } catch {
        // Fall back to auth-context data
        setData({
          firstName: user.email?.split('@')[0] || '',
          lastName: '',
          email: user.email,
          role: user.role,
          orgName: 'Masjid Al-Rahma Institute',
          orgInitial: 'M',
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

  if (hidden) return null;

  // Skeleton while loading
  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-24 bg-gradient-to-r from-slate-800 to-emerald-900" />
        <div className="mx-auto max-w-6xl px-6 -mt-6 pb-6">
          <div className="h-28 rounded-2xl bg-[var(--color-surface-primary)] border border-[var(--color-border-default)]" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      {/* ── Organization Header Banner ── */}
      <div className="relative bg-gradient-to-r from-slate-900 via-emerald-900 to-slate-900">
        {/* Abstract background pattern — clipped to its own layer so it
            doesn't cut off the search/notification dropdowns, which are
            descendants of this banner and need to overflow below it. */}
        <div className="absolute inset-0 overflow-hidden opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
          <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-blue-500 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 py-8 lg:py-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Organization Logo/Avatar */}
            <div className="flex-shrink-0 flex h-14 w-14 lg:h-16 lg:w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 shadow-xl">
              <span className="text-xl lg:text-2xl font-bold text-emerald-300">
                {data.orgInitial}
              </span>
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-bold text-white tracking-tight">
                {data.orgName}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <GlobalSearchBar />
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 flex-shrink-0">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-300 uppercase tracking-wider">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Welcome Hero Card ── */}
      <div className="mx-auto max-w-6xl px-6 -mt-6 pb-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-surface-primary)] to-emerald-50 dark:to-emerald-950/30 border border-[var(--color-border-default)] shadow-card p-6 lg:p-8">
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-100 dark:bg-emerald-900/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-60" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2">
                {dateStr}
              </p>
              <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text-primary)]">
                Welcome back,{' '}
                <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                  {data.firstName}
                </span>
                <span className="ml-1">👋</span>
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