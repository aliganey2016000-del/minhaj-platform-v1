import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { getOfflineData, saveOfflineData } from '../../../lib/offline-store';
import { offlineAttendanceOwner, flushTeacherAttendanceQueue } from '../../../lib/teacher-offline-attendance';
import TeacherAttendanceLegacy from './teacher-attendance-legacy';
import TeacherSchoolAttendance from './teacher-school-attendance';

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/** Student attendance only; personal check-in has its own My Attendance route. */
export function TeacherAttendance() {
  const { user } = useAuth();
  const [schoolMode, setSchoolMode] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.onLine || user?.offlineOnly) {
          const owner = offlineAttendanceOwner();
          const cached = owner ? await getOfflineData<boolean>('attendance-school-mode:' + owner) : null;
          if (!cancelled) setSchoolMode(cached === true);
          return;
        }
        await api.get('/attendance/school/sessions', { params: { date: localDate() } });
        const owner = offlineAttendanceOwner();
        if (owner) await saveOfflineData('attendance-school-mode:' + owner, true).catch(() => {});
        if (!cancelled) { setSchoolMode(true); void flushTeacherAttendanceQueue(); }
      } catch (error: any) {
        const status = error?.response?.status;
        const message = String(error?.response?.data?.message || '').toLowerCase();
        if (!cancelled) {
          if (status === 400 && message.includes('only available for schools')) {
            setSchoolMode(false);
          } else if (!error?.response && offlineAttendanceOwner()) {
            // A verified teacher may reopen downloaded school rosters offline.
            const cached = await getOfflineData<boolean>('attendance-school-mode:' + offlineAttendanceOwner());
            if (!cancelled) setSchoolMode(cached === true);
          } else setSchoolMode(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.offlineOnly]);

  if (user?.offlineOnly) return <TeacherSchoolAttendance />;

  return (
    <>
      {schoolMode === null ? (
        <div className="flex min-h-[35vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
        </div>
      ) : schoolMode ? (
        <TeacherSchoolAttendance />
      ) : (
        <TeacherAttendanceLegacy />
      )}
    </>
  );
}

export default TeacherAttendance;
