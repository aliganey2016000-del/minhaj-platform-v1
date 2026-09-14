import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, List, Pencil, Printer, RefreshCw } from 'lucide-react';
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
  const [listToolbarHost, setListToolbarHost] = useState<HTMLElement | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

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

  // In List view the shared toolbar is mounted directly beside the existing
  // "Class Schedules" heading. On narrow screens it takes a full row and is
  // centered beneath the heading/description; on desktop it stays to the right.
  useEffect(() => {
    if (!schoolMode || view !== 'table') {
      setListToolbarHost(null);
      return;
    }

    let frame = 0;
    let attempts = 0;
    let host: HTMLElement | null = null;

    const placeToolbar = () => {
      const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>('h1')).find((item) =>
        item.textContent?.trim().toLowerCase() === 'class schedules'
      );
      const header = heading?.parentElement?.parentElement;

      if (!header) {
        attempts += 1;
        if (attempts < 30) frame = window.requestAnimationFrame(placeToolbar);
        return;
      }

      header.classList.add('flex-wrap');
      host = header.querySelector<HTMLElement>('[data-schedule-list-toolbar-host]');
      if (!host) {
        host = document.createElement('div');
        host.dataset.scheduleListToolbarHost = 'true';
        host.className = 'order-3 flex w-full flex-wrap items-center justify-center gap-2 pt-3 print:hidden lg:order-none lg:ml-auto lg:w-auto lg:justify-end lg:pt-0';
        const actionMenu = header.lastElementChild;
        header.insertBefore(host, actionMenu || null);
      }
      setListToolbarHost(host);
    };

    frame = window.requestAnimationFrame(placeToolbar);
    return () => {
      window.cancelAnimationFrame(frame);
      host?.remove();
      setListToolbarHost(null);
    };
  }, [schoolMode, view, listRefreshKey]);

  // Timetable has its own legacy Refresh/Edit/Print buttons. The school shell
  // now owns the stable toolbar, so hide those duplicate controls while keeping
  // them in the DOM for the existing edit-mode behavior.
  useEffect(() => {
    if (!schoolMode || view !== 'timetable') return;

    let frame = 0;
    let attempts = 0;
    let actionArea: HTMLElement | null = null;
    let timetableRoot: HTMLElement | null = null;
    let previousDisplay = '';
    let previousPaddingTop = '';

    const normalizeTimetableHeader = () => {
      const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>('h1')).find((item) =>
        item.textContent?.trim().toLowerCase() === 'class timetable'
      );
      const titleBlock = heading?.parentElement;
      const headerRow = titleBlock?.parentElement;

      if (!heading || !headerRow) {
        attempts += 1;
        if (attempts < 30) frame = window.requestAnimationFrame(normalizeTimetableHeader);
        return;
      }

      actionArea = Array.from(headerRow.children).find((child) =>
        child !== titleBlock && child.querySelector('button')
      ) as HTMLElement | null;
      if (actionArea) {
        previousDisplay = actionArea.style.display;
        actionArea.style.display = 'none';
      }

      timetableRoot = heading.closest('.min-h-full') as HTMLElement | null;
      if (timetableRoot) {
        previousPaddingTop = timetableRoot.style.paddingTop;
        timetableRoot.style.paddingTop = '1rem';
      }
    };

    frame = window.requestAnimationFrame(normalizeTimetableHeader);
    return () => {
      window.cancelAnimationFrame(frame);
      if (actionArea) actionArea.style.display = previousDisplay;
      if (timetableRoot) timetableRoot.style.paddingTop = previousPaddingTop;
    };
  }, [schoolMode, view]);

  if (resolvingMode) {
    return <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading schedule workspace...</div>;
  }

  const openTimetableEditor = () => {
    setView('timetable');
    let attempts = 0;
    const clickEditor = () => {
      const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>('h1')).find((item) =>
        item.textContent?.trim().toLowerCase() === 'class timetable'
      );
      const headerRow = heading?.parentElement?.parentElement;
      const button = headerRow
        ? Array.from(headerRow.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === 'Edit Timetable')
        : undefined;
      if (button) {
        button.click();
        return;
      }
      attempts += 1;
      if (attempts < 30) window.requestAnimationFrame(clickEditor);
    };
    window.requestAnimationFrame(clickEditor);
  };

  const refreshCurrentView = () => {
    if (view === 'table') {
      setListRefreshKey((key) => key + 1);
      return;
    }

    const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>('h1')).find((item) =>
      item.textContent?.trim().toLowerCase() === 'class timetable'
    );
    const headerRow = heading?.parentElement?.parentElement;
    const button = headerRow
      ? Array.from(headerRow.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === 'Refresh')
      : undefined;
    button?.click();
  };

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

  const persistentActions = (
    <>
      <button
        type="button"
        onClick={refreshCurrentView}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Refresh
      </button>
      <button
        type="button"
        onClick={openTimetableEditor}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit Timetable
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700"
      >
        <Printer className="h-3.5 w-3.5" /> Print
      </button>
      {viewSwitcher}
    </>
  );

  return (
    <div className="min-w-0">
      {!schoolMode && (
        <div className="relative z-20 flex items-center justify-end px-4 pt-4 sm:px-6">
          {viewSwitcher}
        </div>
      )}

      {schoolMode && view === 'timetable' && (
        <div className="px-4 pt-4 print:hidden sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Class Schedules</h1>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Build, validate and publish the weekly school timetable.</p>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center justify-center gap-2 lg:ml-auto lg:w-auto lg:justify-end">
              {persistentActions}
            </div>
          </div>
        </div>
      )}

      {schoolMode && view === 'table' && listToolbarHost
        ? createPortal(persistentActions, listToolbarHost)
        : null}

      {view === 'table'
        ? (schoolMode ? <SchoolSchedulesManage key={listRefreshKey} /> : <SchedulesManage />)
        : <SchedulesTimetable />}
    </div>
  );
}

export default SchedulesManageShell;
