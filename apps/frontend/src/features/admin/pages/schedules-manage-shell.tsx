import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, List } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { resolveInstitutionType } from '../../../lib/institution-type';
import { SchedulesManage } from './schedules-manage';
import { SchoolSchedulesManage } from './school-schedules-manage';
import { SchedulesTimetable } from './schedules-timetable';

export function SchedulesManageShell() {
  const { user } = useAuth();
  const [view, setView] = useState<'table' | 'timetable'>('timetable');
  const [schoolMode, setSchoolMode] = useState(false);
  const [resolvingMode, setResolvingMode] = useState(user?.role === 'org_admin');
  const [timetableSwitcherHost, setTimetableSwitcherHost] = useState<HTMLElement | null>(null);

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

  useEffect(() => {
    if (!schoolMode || view !== 'timetable') {
      setTimetableSwitcherHost(null);
      return;
    }

    let frame = 0;
    let attempts = 0;
    let host: HTMLElement | null = null;

    const placeSwitcher = () => {
      const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>('h2')).find((item) =>
        item.textContent?.toLowerCase().includes('class time table')
      );
      const header = heading?.parentElement;

      if (!header) {
        attempts += 1;
        if (attempts < 30) frame = window.requestAnimationFrame(placeSwitcher);
        return;
      }

      header.classList.add('relative');
      host = header.querySelector<HTMLElement>('[data-schedule-view-switcher-host]');
      if (!host) {
        host = document.createElement('div');
        host.dataset.scheduleViewSwitcherHost = 'true';
        host.className = 'mt-3 flex justify-center print:hidden sm:absolute sm:right-4 sm:top-4 sm:mt-0';
        header.appendChild(host);
      }
      setTimetableSwitcherHost(host);
    };

    frame = window.requestAnimationFrame(placeSwitcher);
    return () => {
      window.cancelAnimationFrame(frame);
      host?.remove();
      setTimetableSwitcherHost(null);
    };
  }, [schoolMode, view]);

  if (resolvingMode) {
    return <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading schedule workspace...</div>;
  }

  const viewSwitcher = (
    <div className="inline-flex max-w-full items-center overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-0.5 shadow-sm">
      <button
        type="button"
        onClick={() => setView('table')}
        className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
          view === 'table'
            ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
        }`}
        aria-pressed={view === 'table'}
      >
        <List className="h-3.5 w-3.5" />
        List
      </button>
      <button
        type="button"
        onClick={() => setView('timetable')}
        className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
          view === 'timetable'
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
        }`}
        aria-pressed={view === 'timetable'}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Table
      </button>
    </div>
  );

  return (
    <div className="min-w-0">
      {(!schoolMode || view === 'table') && (
        <div className="relative z-20 flex items-center justify-end px-4 pt-4 sm:px-6">
          {viewSwitcher}
        </div>
      )}

      {schoolMode && view === 'timetable' && timetableSwitcherHost
        ? createPortal(viewSwitcher, timetableSwitcherHost)
        : null}

      {view === 'table'
        ? (schoolMode ? <SchoolSchedulesManage /> : <SchedulesManage />)
        : <SchedulesTimetable />}
    </div>
  );
}

export default SchedulesManageShell;
