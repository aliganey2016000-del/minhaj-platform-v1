/**
 * Teacher exam offline support.
 *
 * Cached exam data and pending exam writes are isolated to the browser host
 * and login session. The server remains authoritative: queued writes are
 * revalidated by the existing API when they sync. A 4xx rejection is kept as
 * a conflict for review instead of silently discarded.
 */
import api from './axios';
import { getOfflineData, saveOfflineData, listOfflineData, deleteOfflineData } from './offline-store';

const PREFIX = 'teacher-exams:v1:';

function notifyQueueChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('sahal-teacher-exam-queue-updated'));
}

function ownerPrefix(): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  const session = localStorage.getItem('loginSessionId');
  if (!session) return null;
  // Match the existing teacher offline-attendance ownership format so the
  // auth provider can safely transfer pending work across a same-teacher login.
  try {
    const raw = localStorage.getItem('sahal-offline-teacher-session');
    const identity = raw ? JSON.parse(raw) : null;
    if (identity?.role === 'teacher' && identity.hostname === window.location.hostname &&
      identity.loginSessionId === session && identity.id && identity.organizationId) {
      return PREFIX + [window.location.hostname, identity.organizationId, identity.id, session].map((part) => encodeURIComponent(String(part))).join(':') + ':';
    }
  } catch { /* Fall back to this exact login session when no verified teacher identity exists. */ }
  return PREFIX + encodeURIComponent(window.location.hostname) + ':session:' + encodeURIComponent(session) + ':';
}

function scopedKey(suffix: string): string | null {
  const prefix = ownerPrefix();
  return prefix ? prefix + suffix : null;
}

export async function cacheTeacherExamWorkspace(periodId: string, value: unknown): Promise<void> {
  const key = scopedKey('workspace:' + periodId);
  if (key) await saveOfflineData(key, value);
}

export async function getCachedTeacherExamWorkspace<T = any>(periodId: string): Promise<T | undefined> {
  const key = scopedKey('workspace:' + periodId);
  return key ? getOfflineData<T>(key) : undefined;
}

export async function cacheTeacherExamAttendance(examId: string, value: unknown): Promise<void> {
  const key = scopedKey('attendance:' + examId);
  if (key) await saveOfflineData(key, value);
}

export async function getCachedTeacherExamAttendance<T = any>(examId: string): Promise<T | undefined> {
  const key = scopedKey('attendance:' + examId);
  return key ? getOfflineData<T>(key) : undefined;
}

export async function cacheTeacherInvigilationRoster(assignmentId: string, value: unknown): Promise<void> {
  const key = scopedKey('room-attendance:' + assignmentId);
  if (key) await saveOfflineData(key, value);
}

export async function getCachedTeacherInvigilationRoster<T = any>(assignmentId: string): Promise<T | undefined> {
  const key = scopedKey('room-attendance:' + assignmentId);
  return key ? getOfflineData<T>(key) : undefined;
}

export async function cacheTeacherResultCourses(value: unknown): Promise<void> {
  const key = scopedKey('result-courses');
  if (key) await saveOfflineData(key, value);
}

export async function getCachedTeacherResultCourses<T = any>(): Promise<T | undefined> {
  const key = scopedKey('result-courses');
  return key ? getOfflineData<T>(key) : undefined;
}

export async function cacheTeacherResultRoster(courseId: string, value: unknown): Promise<void> {
  const key = scopedKey('result-roster:' + courseId);
  if (key) await saveOfflineData(key, value);
}

export async function getCachedTeacherResultRoster<T = any>(courseId: string): Promise<T | undefined> {
  const key = scopedKey('result-roster:' + courseId);
  return key ? getOfflineData<T>(key) : undefined;
}

export interface PendingTeacherExamWrite {
  key: string;
  owner: string;
  kind: 'attendance' | 'result';
  url: string;
  body: Record<string, unknown>;
  createdAt: number;
  status: 'pending' | 'conflict';
  error?: string;
}

function pendingKey(kind: PendingTeacherExamWrite['kind'], identity: string): string | null {
  return scopedKey('pending:' + kind + ':' + identity);
}

export async function queueTeacherExamAttendance(examId: string, records: Array<{ student: string; status: 'present' | 'absent'; notes?: string }>): Promise<void> {
  const key = pendingKey('attendance', examId);
  const prefix = ownerPrefix();
  if (!key || !prefix) throw new Error('Please sign in online before preparing offline exam attendance.');
  const existing = await getOfflineData<PendingTeacherExamWrite>(key);
  if (existing?.owner === prefix && existing.status === 'conflict') {
    throw new Error('This exam attendance has a sync conflict. Review it online before saving more offline changes.');
  }
  const merged = new Map<string, { student: string; status: 'present' | 'absent'; notes?: string }>();
  const previousRecords = existing?.owner === prefix && existing.kind === 'attendance' && Array.isArray(existing.body.records)
    ? existing.body.records as Array<{ student: string; status: 'present' | 'absent'; notes?: string }>
    : [];
  previousRecords.forEach((record) => merged.set(record.student, record));
  records.forEach((record) => merged.set(record.student, record));
  await saveOfflineData(key, {
    key, owner: prefix, kind: 'attendance', url: '/exams/' + encodeURIComponent(examId) + '/attendance',
    body: { records: Array.from(merged.values()) }, createdAt: existing?.createdAt ?? Date.now(), status: 'pending',
  } satisfies PendingTeacherExamWrite);
  notifyQueueChanged();
}

export async function queueTeacherInvigilationAttendance(assignmentId: string, records: Array<{ student: string; status: 'present' | 'absent'; notes?: string }>): Promise<void> {
  const key = pendingKey('attendance', 'room:' + assignmentId);
  const prefix = ownerPrefix();
  if (!key || !prefix) throw new Error('Please sign in online before preparing offline exam attendance.');
  const existing = await getOfflineData<PendingTeacherExamWrite>(key);
  if (existing?.owner === prefix && existing.status === 'conflict') {
    throw new Error('This room attendance has a sync conflict. Review it online before saving more offline changes.');
  }
  const merged = new Map<string, { student: string; status: 'present' | 'absent'; notes?: string }>();
  const previousRecords = existing?.owner === prefix && existing.kind === 'attendance' && Array.isArray(existing.body.records)
    ? existing.body.records as Array<{ student: string; status: 'present' | 'absent'; notes?: string }>
    : [];
  previousRecords.forEach((record) => merged.set(record.student, record));
  records.forEach((record) => merged.set(record.student, record));
  await saveOfflineData(key, {
    key, owner: prefix, kind: 'attendance', url: '/exams/invigilators/' + encodeURIComponent(assignmentId) + '/attendance',
    body: { records: Array.from(merged.values()) }, createdAt: existing?.createdAt ?? Date.now(), status: 'pending',
  } satisfies PendingTeacherExamWrite);
  notifyQueueChanged();
}

export async function queueTeacherExamResult(courseId: string, studentId: string, slot: string, score: number): Promise<void> {
  const identity = courseId + ':' + studentId + ':' + slot;
  const key = pendingKey('result', identity);
  const prefix = ownerPrefix();
  if (!key || !prefix) throw new Error('Please sign in online before preparing offline results.');
  const existing = await getOfflineData<PendingTeacherExamWrite>(key);
  if (existing?.owner === prefix && existing.status === 'conflict') {
    throw new Error('This result has a sync conflict. Review the result online before saving more offline changes.');
  }
  await saveOfflineData(key, {
    key, owner: prefix, kind: 'result', url: '/gradebook/' + encodeURIComponent(courseId) + '/manual-entry-roster/bulk',
    body: { entries: [{ studentId, slot, score }] }, createdAt: existing?.createdAt ?? Date.now(), status: 'pending',
  } satisfies PendingTeacherExamWrite);
  notifyQueueChanged();
}

export async function getTeacherExamQueue(): Promise<PendingTeacherExamWrite[]> {
  const prefix = ownerPrefix();
  if (!prefix) return [];
  const all = await listOfflineData<PendingTeacherExamWrite>(prefix + 'pending:');
  return all.map((entry) => entry.value).filter((entry) => entry && entry.owner === prefix)
    .sort((a, b) => a.createdAt - b.createdAt);
}

let flushingTeacherExamQueue = false;

export async function flushTeacherExamQueue(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine || flushingTeacherExamQueue) return;
  const prefix = ownerPrefix();
  if (!prefix) return;
  flushingTeacherExamQueue = true;
  const locks = (navigator as any).locks;
  const run = async () => {
    const queue = await getTeacherExamQueue();
    for (const item of queue) {
      if (item.status === 'conflict') continue;
      // Re-check identity before each write in case the user changed accounts.
      if (ownerPrefix() !== prefix) return;
      try {
        await api.post(item.url, item.body);
        // Do not remove a queued record if another account became active while
        // the request was in flight. The queue belongs to the original session.
        if (ownerPrefix() !== prefix) return;
        const latest = await getOfflineData<PendingTeacherExamWrite>(item.key);
        if (latest?.owner === prefix && latest.status === 'pending' && latest.createdAt === item.createdAt) {
          await deleteOfflineData(item.key);
          notifyQueueChanged();
        }
      } catch (err: any) {
        const status = err?.response?.status;
        const permanent = typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
        if (permanent) {
          await saveOfflineData(item.key, {
            ...item, status: 'conflict',
            error: err?.response?.data?.message || 'Server rejected this offline change. Review it online before retrying.',
          });
          notifyQueueChanged();
        }
        // Network/5xx failures remain pending and retry at next reconnect.
      }
    }
  };
  try {
    if (locks?.request) {
      await locks.request('sahal-teacher-exam-sync', { ifAvailable: true }, async (lock: unknown) => {
        if (lock) await run();
      });
    } else {
      await run();
    }
  } finally {
    flushingTeacherExamQueue = false;
  }
}
