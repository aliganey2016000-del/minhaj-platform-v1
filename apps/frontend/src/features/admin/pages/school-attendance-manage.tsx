import { useState } from 'react';
import { MoreVertical, Trash2 } from 'lucide-react';
import { CalendarCheck, UserRoundCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../store/auth-context';
import SchoolAttendanceOfflineSettings from './components/school-attendance-offline-settings';
import SchoolPeriodAttendanceManage from './school-period-attendance-manage';
import { SchoolSubstitutesPanel } from './components/school-substitutes-panel';
import SchoolAttendanceReset from './components/school-attendance-reset';

type Workspace = 'period' | 'substitutes' | 'offline' | 'reset';

export function SchoolAttendanceManage() {
  const [workspace, setWorkspace] = useState<Workspace>('period');
  const [actionsOpen, setActionsOpen] = useState(false);
  const { user } = useAuth();
  const canManageOffline = user?.role === 'org_admin';
  const canResetAttendance = user?.role === 'admin' || user?.role === 'org_admin';

  const actions = [
    ['substitutes', 'Substitutes', UserRoundCheck],
    ...(canManageOffline ? [['offline', 'Offline Settings', ShieldCheck] as const] : []),
    ...(canResetAttendance ? [['reset', 'Reset Attendance', Trash2] as const] : []),
  ] as const;

  return (
    <div className="min-w-0 w-full space-y-3 p-3 pt-3 sm:space-y-4 sm:p-6 lg:pt-4">
      <div className="flex min-w-0 items-center gap-2 py-1 sm:gap-3">
        <CalendarCheck className="h-7 w-7 shrink-0 text-emerald-500 sm:h-8 sm:w-8" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold leading-tight tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Attendance Control Center</h1>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Attendance Control Center actions"
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)] shadow-sm transition hover:bg-[var(--color-surface-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:h-10 sm:w-10"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {actionsOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-xl">
              {actions.map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setWorkspace(key); setActionsOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${workspace === key ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {workspace === 'period' && <SchoolPeriodAttendanceManage />}
      {workspace === 'substitutes' && <SchoolSubstitutesPanel />}
      {workspace === 'offline' && canManageOffline && <SchoolAttendanceOfflineSettings />}
      {workspace === 'reset' && canResetAttendance && <SchoolAttendanceReset />}
    </div>
  );
}

export default SchoolAttendanceManage;
