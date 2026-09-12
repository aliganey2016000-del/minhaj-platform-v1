import { useEffect, useState } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { resolveInstitutionType } from '../../../lib/institution-type';
import { AttendanceManage as AttendanceManageLegacy } from './attendance-manage-legacy';
import { SchoolAttendanceManage } from './school-attendance-manage';

/**
 * Institution-aware attendance entry point.
 * Schools use the schedule-first workspace; other institution types retain
 * the comprehensive legacy attendance manager unchanged.
 */
export function AttendanceManage() {
  const { user } = useAuth();
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
    return <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading attendance workspace...</div>;
  }

  return schoolMode ? <SchoolAttendanceManage /> : <AttendanceManageLegacy />;
}

export default AttendanceManage;
