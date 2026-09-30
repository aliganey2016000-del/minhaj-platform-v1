import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../../../lib/axios';
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
  const [schoolMode, setSchoolMode] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.get('/attendance/school/sessions', { params: { date: localDate() } });
        if (!cancelled) setSchoolMode(true);
      } catch (error: any) {
        const status = error?.response?.status;
        const message = String(error?.response?.data?.message || '').toLowerCase();
        if (!cancelled) {
          setSchoolMode(status === 400 && message.includes('only available for schools') ? false : false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
