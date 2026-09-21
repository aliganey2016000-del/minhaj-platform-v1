import { useState } from 'react';
import { BarChart3, CalendarCheck, ClipboardList, UserRoundCheck } from 'lucide-react';
import SchoolPeriodAttendanceManage from './school-period-attendance-manage';
import { SchoolAttendanceDashboardPanel } from './components/school-attendance-dashboard-panel';
import { SchoolDailyAttendancePanel } from './components/school-daily-attendance-panel';
import { SchoolSubstitutesPanel } from './components/school-substitutes-panel';

type Workspace = 'dashboard' | 'period' | 'daily' | 'substitutes';

// School attendance is intentionally split into operational workspaces so a
// small-school admin can reach the daily task in one tap without navigating a
// university-style cascade of organization/department/course filters.
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
      <div className="sticky top-0 z-20 -mx-1 px-1 pt-1">
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-card sm:grid-cols-4">
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setWorkspace(key)}
              className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-xs font-semibold transition-all sm:px-3 sm:text-sm ${
                workspace === key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {workspace === 'dashboard' && (
        <SchoolAttendanceDashboardPanel
          onOpenPeriod={() => setWorkspace('period')}
          onOpenDaily={() => setWorkspace('daily')}
        />
      )}
      {workspace === 'period' && <SchoolPeriodAttendanceManage />}
      {workspace === 'daily' && <SchoolDailyAttendancePanel />}
      {workspace === 'substitutes' && <SchoolSubstitutesPanel />}
    </div>
  );
}

export default SchoolAttendanceManage;
