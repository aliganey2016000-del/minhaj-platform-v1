import { useState } from 'react';
import { CalendarCheck, ClipboardList, UserRoundCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../store/auth-context';
import SchoolAttendanceOfflineSettings from './components/school-attendance-offline-settings';
import SchoolPeriodAttendanceManage from './school-period-attendance-manage';
import { SchoolSubstitutesPanel } from './components/school-substitutes-panel';

type Workspace = 'period' | 'substitutes' | 'offline';

export function SchoolAttendanceManage() {
  const [workspace, setWorkspace] = useState<Workspace>('period');
  const { user } = useAuth();
  const canManageOffline = user?.role === 'org_admin';

  const tabs = [
    ['period', 'Period Attendance', ClipboardList],
    ['substitutes', 'Substitutes', UserRoundCheck],
    ...(canManageOffline ? [['offline', 'Offline Settings', ShieldCheck] as const] : []),
  ] as const;

  return (
    <div className="min-w-0 w-full space-y-4 p-3 pt-20 sm:p-6 lg:pt-6">
      <div className="flex min-w-0 items-start gap-3 py-1">
        <CalendarCheck className="mt-1 h-8 w-8 shrink-0 text-emerald-500" />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-[var(--color-text-primary)] sm:text-3xl">Attendance Control Center</h1>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-tertiary)]">Take attendance, review records, and generate simple class reports.</p>
        </div>
      </div>
      <div className="min-w-0 w-full">
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:gap-2 sm:p-2.5">
          {tabs.map(([key, label, Icon]) => {
            const selected = workspace === key;
            const tone = key === 'period'
              ? selected ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-900/15' : 'border-emerald-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
              : key === 'substitutes'
                ? selected ? 'border-sky-600 bg-sky-600 text-white shadow-md shadow-sky-900/15' : 'border-sky-100 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300'
                : selected ? 'border-violet-600 bg-violet-600 text-white shadow-md shadow-violet-900/15' : 'border-violet-100 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300';
            return (
              <button
                key={key}
                type="button"
                onClick={() => setWorkspace(key)}
                aria-current={selected ? 'page' : undefined}
                className={`flex min-h-[4.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-center text-[10px] font-bold leading-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:min-h-14 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${tone}`}
              >
                <Icon className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" />
                <span className="min-w-0 break-words">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {workspace === 'period' && <SchoolPeriodAttendanceManage />}
      {workspace === 'substitutes' && <SchoolSubstitutesPanel />}
      {workspace === 'offline' && canManageOffline && <SchoolAttendanceOfflineSettings />}
    </div>
  );
}

export default SchoolAttendanceManage;
