import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Download, List, MoreVertical, Pencil, Plus, Printer, RefreshCw, School, Settings, Upload, Users } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { resolveInstitutionType } from '../../../lib/institution-type';
import { SchedulesManage } from './schedules-manage';
import { PeriodSettingsModal, ScheduleModal, SchoolSchedulesManage, type Ref, type Teacher } from './school-schedules-manage';
import { SchedulesTimetable } from './schedules-timetable';
import BulkEntityImportModal from './components/bulk-entity-import-modal';

const SCHEDULE_IMPORT_HEADERS = ['Class / Section', 'Course / Subject', 'Teacher / Instructor', 'Day', 'Time', 'Status'];

// Climbs up from a heading looking, at each level, for a sibling of the
// current ancestor that contains a button. This is deliberately structure-
// agnostic (rather than a fixed number of parentElement hops) because the
// heading can be wrapped in a different number of layout divs (e.g. an icon
// badge) depending on the page — a fixed hop count silently stops matching
// the moment a wrapper div is added or removed.
function findActionSibling(heading: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = heading;
  while (node && node.parentElement) {
    const parent: HTMLElement = node.parentElement;
    const sibling = Array.from(parent.children).find(
      (child): child is HTMLElement => child !== node && !child.contains(heading) && !!child.querySelector('button')
    );
    if (sibling) return sibling;
    node = parent;
  }
  return null;
}

export function SchedulesManageShell() {
  const { user } = useAuth();
  const organizationId = user?.organizationId || (user as any)?.schoolId || '';
  const [view, setView] = useState<'table' | 'timetable'>('timetable');
  const [schedulePerspective, setSchedulePerspective] = useState<'day' | 'class' | 'teacher'>('day');
  const [schoolMode, setSchoolMode] = useState(false);
  const [resolvingMode, setResolvingMode] = useState(user?.role === 'org_admin');
  const [listToolbarHost, setListToolbarHost] = useState<HTMLElement | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  // Table (Timetable) view has no "..." page-actions menu of its own — Add
  // Schedule / Import / Export / Period Settings previously only existed
  // inside the List view's own component, so switching to Table hid them
  // entirely instead of just changing which rows/grid is shown. The shell
  // owns a second copy of that menu, shown only in Table view (List view
  // keeps its own, which also has the list-specific bulk-delete actions).
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [classes, setClasses] = useState<Ref[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPeriodSettings, setShowPeriodSettings] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);

  useEffect(() => {
    if (!schoolMode || !organizationId) { setClasses([]); setTeachers([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const [classRes, teacherRes] = await Promise.all([
          api.get('/classes', { params: { schoolId: organizationId, status: 'active', limit: 200 } }),
          api.get('/teachers', { params: { school: organizationId, status: 'active', limit: 500 } }),
        ]);
        if (!cancelled) { setClasses(classRes.data.data || []); setTeachers(teacherRes.data.data || []); }
      } catch {
        if (!cancelled) { setClasses([]); setTeachers([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [schoolMode, organizationId]);

  const exportSchedules = async () => {
    setPageMenuOpen(false);
    try {
      const response = await api.get('/class-schedules/school/export', { params: { school: organizationId }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url; link.download = `school-class-schedules-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click(); URL.revokeObjectURL(url);
    } catch { /* the List view's own export surfaces its own error state; this menu has no error banner to show one in */ }
  };

  useEffect(() => {
    if (user?.role !== 'org_admin') {
      setSchoolMode(false);
      setResolvingMode(false);
      return;
    }
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
  // "Class Schedules" heading, grouped together with the page's own "..."
  // actions button (rather than as a separate third sibling) so on narrow
  // screens the two wrap together as one right-aligned unit below the
  // heading/description instead of each landing on its own line — which
  // used to leave the "..." button stranded between the title and the
  // toolbar. On desktop both stay inline to the right of the heading.
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
      const actionMenu = header?.lastElementChild as HTMLElement | null;

      if (!header || !actionMenu) {
        attempts += 1;
        if (attempts < 30) frame = window.requestAnimationFrame(placeToolbar);
        return;
      }

      header.classList.add('flex-wrap');
      actionMenu.classList.add('flex', 'flex-wrap', 'w-full', 'items-center', 'justify-end', 'gap-2', 'lg:w-auto');
      host = actionMenu.querySelector<HTMLElement>('[data-schedule-list-toolbar-host]');
      if (!host) {
        host = document.createElement('div');
        host.dataset.scheduleListToolbarHost = 'true';
        host.className = 'flex flex-wrap items-center justify-end gap-2 print:hidden';
        actionMenu.insertBefore(host, actionMenu.firstElementChild);
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

  // Timetable has its own legacy header — icon, "Class Timetable" title +
  // session/class count, and Refresh/Edit/Print buttons. The school shell
  // now owns the title and toolbar (rendered just above), so hide that
  // entire legacy row — not just its buttons — while keeping it in the DOM
  // for the existing edit-mode behavior (its buttons are still clicked
  // programmatically below).
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

      if (!heading) {
        attempts += 1;
        if (attempts < 30) frame = window.requestAnimationFrame(normalizeTimetableHeader);
        return;
      }

      const actionSibling = findActionSibling(heading);
      const legacyHeaderRow = actionSibling?.parentElement as HTMLElement | null;
      if (!legacyHeaderRow) {
        attempts += 1;
        if (attempts < 30) frame = window.requestAnimationFrame(normalizeTimetableHeader);
        return;
      }

      actionArea = legacyHeaderRow;
      previousDisplay = actionArea.style.display;
      actionArea.style.display = 'none';

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
    setSchedulePerspective('day');
    setView('timetable');
    let attempts = 0;
    const clickEditor = () => {
      const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>('h1')).find((item) =>
        item.textContent?.trim().toLowerCase() === 'class timetable'
      );
      const actionArea = heading ? findActionSibling(heading) : null;
      const button = actionArea
        ? Array.from(actionArea.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === 'Edit Timetable')
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
    const actionArea = heading ? findActionSibling(heading) : null;
    const button = actionArea
      ? Array.from(actionArea.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === 'Refresh')
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

  const perspectiveButtonClass = (perspective: 'day' | 'class' | 'teacher') =>
    `inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:flex-none sm:min-w-28 ${
      schedulePerspective === perspective
        ? 'bg-primary-600 text-white shadow-sm'
        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
    }`;

  const schedulePerspectiveTabs = (
    <div className="flex w-full items-center gap-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-sm">
      <button
        type="button"
        onClick={() => setSchedulePerspective('day')}
        className={perspectiveButtonClass('day')}
        aria-current={schedulePerspective === 'day' ? 'page' : undefined}
      >
        <CalendarDays className="h-4 w-4" />
        By Day
      </button>
      <button
        type="button"
        onClick={() => setSchedulePerspective('class')}
        className={perspectiveButtonClass('class')}
        aria-current={schedulePerspective === 'class' ? 'page' : undefined}
      >
        <School className="h-4 w-4" />
        By Class
      </button>
      <button
        type="button"
        onClick={() => setSchedulePerspective('teacher')}
        className={perspectiveButtonClass('teacher')}
        aria-current={schedulePerspective === 'teacher' ? 'page' : undefined}
      >
        <Users className="h-4 w-4" />
        By Teacher
      </button>
    </div>
  );

  const printPerspective = (perspective: 'day' | 'class' | 'teacher') => {
    setShowPrintOptions(false);
    setView('timetable');
    setSchedulePerspective(perspective);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

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
        onClick={() => view === 'timetable' ? setShowPrintOptions(true) : window.print()}
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPageMenuOpen((value) => !value)}
                  className="rounded-lg border border-[var(--color-border-default)] p-2.5 hover:bg-[var(--color-surface-secondary)]"
                  aria-label="Schedule page actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {pageMenuOpen && (
                  <div className="absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-xl">
                    <button type="button" onClick={() => { setPageMenuOpen(false); setShowAddSchedule(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-secondary)]"><Plus className="h-4 w-4" /> Add Schedule</button>
                    <button type="button" onClick={() => { setPageMenuOpen(false); setShowImport(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Upload className="h-4 w-4" /> Import Schedules</button>
                    <button type="button" onClick={() => void exportSchedules()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Download className="h-4 w-4" /> Export Schedules</button>
                    <div className="my-1 border-t border-[var(--color-border-subtle)]" />
                    <button type="button" onClick={() => { setPageMenuOpen(false); setShowPeriodSettings(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Settings className="h-4 w-4" /> Period &amp; Break Settings</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {schoolMode && view === 'table' && listToolbarHost
        ? createPortal(persistentActions, listToolbarHost)
        : null}

      {schoolMode && view === 'timetable' && (
        <div className="px-4 pt-3 print:hidden sm:px-6">
          {schedulePerspectiveTabs}
        </div>
      )}

      {view === 'table'
        ? (schoolMode ? <SchoolSchedulesManage key={listRefreshKey} /> : <SchedulesManage />)
        : <SchedulesTimetable perspective={schedulePerspective} />}

      {showAddSchedule && (
        <ScheduleModal
          organizationId={organizationId}
          classes={classes}
          teachers={teachers}
          onClose={() => setShowAddSchedule(false)}
          onSaved={refreshCurrentView}
        />
      )}
      {showImport && (
        <BulkEntityImportModal
          title="Import Class Schedules"
          description="School schedule template, import and export use the same simple columns. Teacher can be blank for Unassigned."
          templateUrl="/class-schedules/school/template"
          importUrl="/class-schedules/school/import"
          templateName="school-class-schedules-template.xlsx"
          headers={SCHEDULE_IMPORT_HEADERS}
          onClose={() => setShowImport(false)}
          onImported={refreshCurrentView}
        />
      )}
      {showPeriodSettings && <PeriodSettingsModal organizationId={organizationId} onClose={() => setShowPeriodSettings(false)} />}

      {showPrintOptions && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-3 sm:items-center" onClick={() => setShowPrintOptions(false)}>
          <div className="w-full max-w-md rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-3">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Print Schedule</h2>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Choose the schedule view to print. The filters already applied to that view will be used.</p>
            </div>
            <div className="grid gap-2">
              <button type="button" onClick={() => printPerspective('day')} className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] px-4 py-3 text-left hover:bg-[var(--color-surface-secondary)]">
                <CalendarDays className="h-5 w-5 text-primary-600" />
                <div><div className="text-sm font-bold">By Day</div><div className="text-xs text-[var(--color-text-tertiary)]">Print the selected day with Department, Shift and selected Classes filters.</div></div>
              </button>
              <button type="button" onClick={() => printPerspective('class')} className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] px-4 py-3 text-left hover:bg-[var(--color-surface-secondary)]">
                <School className="h-5 w-5 text-primary-600" />
                <div><div className="text-sm font-bold">By Class</div><div className="text-xs text-[var(--color-text-tertiary)]">Print the selected class weekly timetable with current filters.</div></div>
              </button>
              <button type="button" onClick={() => printPerspective('teacher')} className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] px-4 py-3 text-left hover:bg-[var(--color-surface-secondary)]">
                <Users className="h-5 w-5 text-primary-600" />
                <div><div className="text-sm font-bold">By Teacher</div><div className="text-xs text-[var(--color-text-tertiary)]">Print the selected teacher weekly timetable with current filters.</div></div>
              </button>
            </div>
            <button type="button" onClick={() => setShowPrintOptions(false)} className="mt-3 w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SchedulesManageShell;
