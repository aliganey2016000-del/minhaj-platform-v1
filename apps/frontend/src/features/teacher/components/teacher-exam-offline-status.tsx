import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import { flushTeacherExamQueue, getTeacherExamQueue, type PendingTeacherExamWrite } from '../../../lib/teacher-offline-exams';

/** Compact, live status for the teacher's exam-only offline queue. */
export function TeacherExamOfflineStatus() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [queue, setQueue] = useState<PendingTeacherExamWrite[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try { setQueue(await getTeacherExamQueue()); } catch { setQueue([]); }
  }, []);

  useEffect(() => {
    const onOnline = () => { setOnline(true); void refresh(); };
    const onOffline = () => setOnline(false);
    const onQueueChanged = () => { void refresh(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('sahal-teacher-exam-queue-updated', onQueueChanged);
    void refresh();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('sahal-teacher-exam-queue-updated', onQueueChanged);
    };
  }, [refresh]);

  const syncNow = async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try { await flushTeacherExamQueue(); } finally { await refresh(); setSyncing(false); }
  };

  const conflicts = queue.filter((item) => item.status === 'conflict').length;
  const pending = queue.length - conflicts;
  if (online && queue.length === 0) return null;

  return (
    <div role="status" className={`flex flex-col gap-3 rounded-xl border p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${conflicts ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-200' : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-200'}`}>
      <div className="flex min-w-0 items-start gap-2">
        {conflicts ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : online ? <CloudUpload className="mt-0.5 h-4 w-4 shrink-0" /> : <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />}
        <div>
          <p className="font-bold">{!online ? 'Offline — exam work is saved on this device' : conflicts ? 'Some exam changes need review' : 'Exam changes waiting to sync'}</p>
          <p className="mt-0.5 text-xs opacity-90">
            {pending > 0 ? `${pending} pending change(s)` : 'No pending changes'}
            {conflicts > 0 ? ` · ${conflicts} rejected change(s) need review online` : ''}
            {!online ? ' · Reconnect to sync automatically' : ''}
          </p>
          {conflicts > 0 && <p className="mt-1 text-xs">{queue.find((item) => item.status === 'conflict')?.error || 'The server rejected one or more changes.'}</p>}
        </div>
      </div>
      {online && pending > 0 && <button type="button" onClick={() => void syncNow()} disabled={syncing} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-current/20 bg-white/60 px-3 py-2 text-xs font-bold disabled:opacity-60 dark:bg-black/10"><RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing…' : 'Sync now'}</button>}
    </div>
  );
}

export default TeacherExamOfflineStatus;
