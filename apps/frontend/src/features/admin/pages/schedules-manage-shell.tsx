import { useEffect, useState } from 'react';
import { CalendarDays, List } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { resolveInstitutionType } from '../../../lib/institution-type';
import { SchedulesManage } from './schedules-manage';
import { SchoolSchedulesManage } from './school-schedules-manage';
import { SchedulesTimetable } from './schedules-timetable';

export function SchedulesManageShell() {
  const { user } = useAuth();
  const [view, setView] = useState<'table' | 'timetable'>('table');
  const [schoolMode, setSchoolMode] = useState(false);
  const [resolvingMode, setResolvingMode] = useState(user?.role === 'org_admin');

  useEffect(() => {
    if (user?.role !== 'org_admin') {
      setSchoolMode(false);
      setResolvingMode(false);
      return;
    }
    const organizationId = user?.organizationId || (user as any)?.schoolId;
    if (!organizationId) {
      setSchoolMode(false);
      setResolvingMode(false);
      return;
    }
    let cancelled = false;
    setResolvingMode(true);
    (async () => {
      try {
        const { data } = await api.get(`/schools/${organizationId}`);
        const org = data.data || data;
        if (!cancelled) setSchoolMode(resolveInstitutionType(org) === 'school');
      } catch {
        if (!cancelled) setSchoolMode(false);
      } finally {
        if (!cancelled) setResolvingMode(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (resolvingMode) {
    return <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading schedule workspace...</div>;
  }

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
            {schoolMode ? 'Schedule List' : 'Table View'}
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

      {view === 'table'
        ? (schoolMode ? <SchoolSchedulesManage /> : <SchedulesManage />)
        : <SchedulesTimetable />}
    </div>
  );
}

export default SchedulesManageShell;
