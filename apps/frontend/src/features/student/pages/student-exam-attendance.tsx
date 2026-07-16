/**
 * Attendance History — Student self-service view
 * Shows verified exam-day attendance records for past exams.
 */

import { useEffect, useState } from 'react';
import api from '../../../lib/axios';

interface AttendanceRecord {
  _id: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
  markedAt: string;
  exam: {
    title: string;
    examDate: string;
    course?: { title: { en: string }; category: string };
  };
}

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    present: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    excused: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${c[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

export function StudentExamAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/exams/my/attendance');
        setRecords(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load attendance history');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">Retry</button></div>;

  const present = records.filter((r) => r.status === 'present').length;
  const absent = records.filter((r) => r.status === 'absent').length;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">✅ Attendance History</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{records.length} verified record{records.length === 1 ? '' : 's'}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{present}</p>
            <p className="text-xs text-green-600 dark:text-green-400">Present</p>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{absent}</p>
            <p className="text-xs text-red-600 dark:text-red-400">Absent</p>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">✅</p>
            <p className="text-lg">No attendance records yet</p>
            <p className="text-sm mt-1">Records appear here once an invigilator marks attendance for your exams.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Exam</th>
                    <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Date</th>
                    <th className="text-center px-5 py-3 font-semibold">Status</th>
                    <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r._id} className="border-b border-[var(--color-border-subtle)]">
                      <td className="px-5 py-4">
                        <p className="font-semibold">{r.exam?.title}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">{r.exam?.course?.title?.en}</p>
                      </td>
                      <td className="px-5 py-4 text-center hidden sm:table-cell text-sm">
                        {r.exam?.examDate ? new Date(r.exam.examDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4 text-center"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-4 hidden md:table-cell text-sm text-[var(--color-text-tertiary)]">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentExamAttendance;
