import { useState } from 'react';
import { ClipboardList, UserRoundCheck } from 'lucide-react';
import SchoolPeriodAttendanceManage from './school-period-attendance-manage';
import { SchoolSubstitutesPanel } from './components/school-substitutes-panel';

type Workspace = 'period' | 'substitutes';

export function SchoolAttendanceManage() {
  const [workspace, setWorkspace] = useState<Workspace>('period');

  const tabs = [
    ['period', 'Period Attendance', ClipboardList],
    ['substitutes', 'Substitutes', UserRoundCheck],
  ] as const;

  return (
    <div className="min-w-0 space-y-4">
      <div className="sticky top-0 z-20 -mx-1 px-1 pt-1">
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-card">
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setWorkspace(key)}
              className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-all sm:gap-2 sm:px-3 sm:text-sm ${
                workspace === key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span className="min-w-0 truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {workspace === 'period' && <SchoolPeriodAttendanceManage />}
      {workspace === 'substitutes' && <SchoolSubstitutesPanel />}
    </div>
  );
}

export default SchoolAttendanceManage;
