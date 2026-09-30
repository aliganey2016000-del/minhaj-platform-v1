import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../../../lib/axios';
import TeacherAttendanceLegacy from './teacher-attendance-legacy';
import TeacherSchoolAttendance from './teacher-school-attendance';
import TeacherSmartAttendance from '../components/teacher-smart-attendance';

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/**
 * The top card records the teacher's own workplace attendance using GPS +
 * encrypted face verification. The existing content below it remains the
 * teacher's student/course attendance workspace.
 */
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
      <TeacherSmartAttendance />
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
