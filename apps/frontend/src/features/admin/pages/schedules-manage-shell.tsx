import { useEffect, useState } from 'react';
import { CalendarDays, List, School, Users } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { resolveInstitutionType } from '../../../lib/institution-type';
import { SchedulesManage } from './schedules-manage';
import { PeriodSettingsModal, ScheduleModal, SchoolSchedulesManage, type Ref, type Teacher } from './school-schedules-manage';
import { SchedulesTimetable, type SchedulePerspective } from './schedules-timetable';
import BulkEntityImportModal from './components/bulk-entity-import-modal';

const SCHEDULE_IMPORT_HEADERS = ['Class / Section', 'Course / Subject', 'Teacher / Instructor', 'Day', 'Time', 'Status'];

export function SchedulesManageShell() {
  const { user } = useAuth();
  const organizationId = user?.organizationId || (user as any)?.schoolId || '';
  const [view, setView] = useState<'table' | 'timetable'>('timetable');
  const [schedulePerspective, setSchedulePerspective] = useState<SchedulePerspective>('day');
  const [schoolMode, setSchoolMode] = useState(false);
  const [resolvingMode, setResolvingMode] = useState(user?.role === 'org_admin');
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [timetableRefreshKey, setTimetableRefreshKey] = useState(0);
  const [classes, setClasses] = useState<Ref[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPeriodSettings, setShowPeriodSettings] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);

  useEffect(() => {
    if (!schoolMode || !organizationId) {
      setClasses([]);
      setTeachers([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [classRes, teacherRes] = await Promise.all([
          api.get('/classes', { params: { schoolId: organizationId, status: 'active', limit: 200 } }),
          api.get('/teachers', { params: { school: organizationId, status: 'active', limit: 500 } }),
        ]);
        if (!cancelled) {
          setClasses(classRes.data.data || []);
          setTeachers(teacherRes.data.data || []);
        }
      } catch {
        if (!cancelled) {
          setClasses([]);
          setTeachers([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [schoolMode, organizationId]);

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

    return () => {
      cancelled = true;
    };
  }, [user, organizationId]);

  const exportSchedules = async () => {
    try {
      const response = await api.get('/class-schedules/school/export', {
        params: { school: organizationId },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `school-class-schedules-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // The page keeps export deliberately lightweight; existing list view
      // continues to surface its own export error state.
    }
  };

  const refreshCurrentView = () => {
    if (view === 'table') setListRefreshKey(key => key + 1);
    else setTimetableRefreshKey(key => key + 1);
  };

  const openTimetable = (perspective: SchedulePerspective) => {
    setSchedulePerspective(perspective);
    setView('timetable');
  };

  const printPerspective = (perspective: SchedulePerspective) => {
    setShowPrintOptions(false);
    setSchedulePerspective(perspective);
    setView('timetable');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  if (resolvingMode) {
    return <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading schedule workspace...</div>;
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      {!schoolMode && (
        <div className="relative z-20 flex items-center justify-end gap-2 px-4 pt-4 sm:px-6">
          <button
            type="button"
            onClick={() => setView('table')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${view === 'table' ? 'bg-[var(--color-surface-secondary)]' : ''}`}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            type="button"
            onClick={() => setView('timetable')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${view === 'timetable' ? 'bg-primary-600 text-white' : ''}`}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Table
          </button>
        </div>
      )}

      {view === 'table'
        ? schoolMode
          ? (
            <SchoolSchedulesManage
              key={listRefreshKey}
              onOpenTimetable={openTimetable}
              onPrint={() => setShowPrintOptions(true)}
            />
          )
          : <SchedulesManage />
        : (
          <SchedulesTimetable
            key={timetableRefreshKey}
            perspective={schedulePerspective}
            onPerspectiveChange={setSchedulePerspective}
            onSwitchToList={() => setView('table')}
            onPrint={() => setShowPrintOptions(true)}
            onAddSchedule={schoolMode ? () => setShowAddSchedule(true) : undefined}
            onImportSchedules={schoolMode ? () => setShowImport(true) : undefined}
            onExportSchedules={schoolMode ? () => void exportSchedules() : undefined}
            onPeriodSettings={schoolMode ? () => setShowPeriodSettings(true) : undefined}
          />
        )}

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

      {showPeriodSettings && (
        <PeriodSettingsModal
          organizationId={organizationId}
          onClose={() => setShowPeriodSettings(false)}
        />
      )}

      {showPrintOptions && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-3 sm:items-center"
          onClick={() => setShowPrintOptions(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-3">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Print Schedule</h2>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Choose the schedule view to print. Current filters for that view will be used.</p>
            </div>

            <div className="grid gap-2">
              <button type="button" onClick={() => printPerspective('day')} className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] px-4 py-3 text-left hover:bg-[var(--color-surface-secondary)]">
                <CalendarDays className="h-5 w-5 text-primary-600" />
                <div><div className="text-sm font-bold">By Day</div><div className="text-xs text-[var(--color-text-tertiary)]">Selected day, department, shift and classes.</div></div>
              </button>
              <button type="button" onClick={() => printPerspective('class')} className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] px-4 py-3 text-left hover:bg-[var(--color-surface-secondary)]">
                <School className="h-5 w-5 text-primary-600" />
                <div><div className="text-sm font-bold">By Class</div><div className="text-xs text-[var(--color-text-tertiary)]">Selected class weekly timetable.</div></div>
              </button>
              <button type="button" onClick={() => printPerspective('teacher')} className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] px-4 py-3 text-left hover:bg-[var(--color-surface-secondary)]">
                <Users className="h-5 w-5 text-primary-600" />
                <div><div className="text-sm font-bold">By Teacher</div><div className="text-xs text-[var(--color-text-tertiary)]">Selected teacher weekly timetable.</div></div>
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
