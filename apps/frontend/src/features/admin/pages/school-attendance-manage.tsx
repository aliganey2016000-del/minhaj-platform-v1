import { useState } from 'react';
import { BarChart3, CalendarCheck, ClipboardList, UserRoundCheck } from 'lucide-react';
import SchoolPeriodAttendanceManage from './school-period-attendance-manage';
import { SchoolAttendanceDashboardPanel } from './components/school-attendance-dashboard-panel';
import { SchoolDailyAttendancePanel } from './components/school-daily-attendance-panel';
import { SchoolSubstitutesPanel } from './components/school-substitutes-panel';

type Workspace = 'dashboard' | 'period' | 'daily' | 'substitutes';

export function SchoolAttendanceManage() {
  const [workspace, setWorkspace] = useState<Workspace>('dashboard');

  const tabs = [
    ['dashboard', 'Dashboard', BarChart3],
    ['period', 'Period Attendance', ClipboardList],
    ['daily', 'Daily Attendance', CalendarCheck],
    ['substitutes', 'Substitutes', UserRoundCheck],
  ] as const;

  return (
    <div className="min-w-0 space-y-4">
      <div className="sticky top-0 z-20 -mx-1 overflow-x-auto px-1 pt-1">
        <div className="grid min-w-[560px] grid-cols-4 gap-1 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-card">
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setWorkspace(key)}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors sm:text-sm ${
                workspace === key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {workspace === 'dashboard' && <SchoolAttendanceDashboardPanel />}
      {workspace === 'period' && <SchoolPeriodAttendanceManage />}
      {workspace === 'daily' && <SchoolDailyAttendancePanel />}
      {workspace === 'substitutes' && <SchoolSubstitutesPanel />}
    </div>
  );
}

export default SchoolAttendanceManage;
