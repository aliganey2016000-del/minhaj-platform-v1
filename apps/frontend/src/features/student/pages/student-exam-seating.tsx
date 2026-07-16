/**
 * Seat & Hall Allocation — Student self-service view
 * Shows the student's assigned room, desk number, and exam instructions.
 */

import { useEffect, useState } from 'react';
import api from '../../../lib/axios';

interface SeatAllocation {
  _id: string;
  room: { name: string; building?: string };
  deskNumber: string;
  exam: {
    _id: string;
    title: string;
    examDate: string;
    startTime: string;
    endTime: string;
    instructions?: string;
    course?: { title: { en: string }; category: string };
  };
}

export function StudentExamSeating() {
  const [allocations, setAllocations] = useState<SeatAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/exams/my/seating');
        setAllocations(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load seat allocations');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">Retry</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🪑 Seat & Hall Allocation</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{allocations.length} exam{allocations.length === 1 ? '' : 's'} with an assigned seat</p>
        </div>

        {allocations.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">🪑</p>
            <p className="text-lg">No seat assignments yet</p>
            <p className="text-sm mt-1">Your room and desk number will appear here once the admin generates seating for an exam.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {allocations.map((a) => (
              <div key={a._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                {a.exam?.course && (
                  <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300">
                    {a.exam.course.title?.en}
                  </span>
                )}
                <h3 className="font-bold mt-2">{a.exam?.title}</h3>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {a.exam?.examDate ? new Date(a.exam.examDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''} · {a.exam?.startTime} - {a.exam?.endTime}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-primary-50 dark:bg-primary-950/30 p-3 text-center">
                    <p className="text-[10px] text-primary-600 dark:text-primary-400 uppercase tracking-wide">Room</p>
                    <p className="font-bold text-primary-700 dark:text-primary-300">{a.room?.name}</p>
                    {a.room?.building && <p className="text-[10px] text-primary-600 dark:text-primary-400">{a.room.building}</p>}
                  </div>
                  <div className="rounded-xl bg-gold-50 dark:bg-gold-950/30 p-3 text-center">
                    <p className="text-[10px] text-gold-600 dark:text-gold-400 uppercase tracking-wide">Desk Number</p>
                    <p className="font-bold font-mono text-gold-700 dark:text-gold-300">{a.deskNumber}</p>
                  </div>
                </div>

                {a.exam?.instructions && (
                  <div className="mt-3 rounded-xl bg-[var(--color-surface-secondary)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">Instructions</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">{a.exam.instructions}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentExamSeating;
