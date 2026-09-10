import { useState } from 'react';
import { CalendarDays, List } from 'lucide-react';
import { SchedulesManage } from './schedules-manage';
import { SchedulesTimetable } from './schedules-timetable';

export function SchedulesManageShell() {
  const [view, setView] = useState<'table' | 'timetable'>('table');

  return (
    <div className="min-w-0">
      <div className="sticky top-0 z-20 mb-3 flex items-center justify-end px-1 pt-1">
        <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setView('table')}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
              view === 'table'
                ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
            }`}
            aria-pressed={view === 'table'}
          >
            <List className="h-4 w-4" />
            Table View
          </button>
          <button
            type="button"
            onClick={() => setView('timetable')}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
              view === 'timetable'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
            }`}
            aria-pressed={view === 'timetable'}
          >
            <CalendarDays className="h-4 w-4" />
            Timetable View
          </button>
        </div>
      </div>

      {view === 'table' ? <SchedulesManage /> : <SchedulesTimetable />}
    </div>
  );
}

export default SchedulesManageShell;
