import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, UsersRound, UserRound } from 'lucide-react';
import { useAuth } from '../../../store/auth-context';

const cards = [
  { title: 'Staff Directory', description: 'Create, edit, import and manage staff accounts.', to: '/admin/staff', icon: UserRound },
  { title: 'Access & Permissions', description: 'Control staff sidebar access and page actions.', to: '/admin/hr/access', icon: ShieldCheck },
];

export function HrManagement() {
  const { user } = useAuth();
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300">
            <UsersRound className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Human Resources</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">HR Management</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Manage your school workforce, staff accounts and access from one place.</p>
            <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Signed in as {user?.email || 'administrator'}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(({ title, description, to, icon: Icon }) => (
          <Link key={to} to={to} className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]"><Icon className="h-5 w-5" /></div>
              <ArrowRight className="h-4 w-4 text-[var(--color-text-tertiary)] transition group-hover:translate-x-1" />
            </div>
            <h2 className="mt-4 font-semibold text-[var(--color-text-primary)]">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
