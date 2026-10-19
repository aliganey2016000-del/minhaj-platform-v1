/**
 * Offline scheduled-school attendance. All cached values are isolated by
 * hostname + verified login session + organization + teacher. The server
 * remains authoritative and repeats tenant/roster/teacher/lock checks.
 *
 * Sync runs on reconnect or next open while the PWA is running. Browsers do
 * not guarantee delivery after the application is fully closed.
 */
import api from './axios';
import {
  getOfflineData, saveOfflineData,
  listAttendanceSubmissions, putAttendanceSubmission, removeAttendanceSubmission,
  type OfflineAttendanceSubmission,
} from './offline-store';

export type AttendanceStatus = 'present' | 'absent';
export type AttendanceReason = '' | 'sick' | 'medical' | 'family_emergency' |
  'school_activity' | 'suspension' | 'transport_delay' | 'other';
export interface OfflineStudent {
  _id: string;
  studentId: string;
  name: string;
  attendance?: { status?: AttendanceStatus; reasonCode?: AttendanceReason; notes?: string; locked?: boolean } | null;
}
export interface OfflineRoster {
  date: string;
  schedule: {
    _id: string;
    className: string;
    startTime: string;
    endTime: string;
    course?: { _id?: string; title?: { en?: string }; courseCode?: string };
  };
  locked: boolean;
  completionStatus?: 'not_taken' | 'partial' | 'complete';
  revision?: string | null;
  roster: OfflineStudent[];
}
export interface AttendanceDraft {
  status: AttendanceStatus;
  reasonCode: string;
  notes: string;
}
export interface OfflineSessionList {
  sessions: Array<{
    _id: string;
    className: string;
    course?: { _id: string; title?: { en?: string }; courseCode?: string };
    teacherName: string;
    startTime: string;
    endTime: string;
    attendance: { present: number; absent: number; locked: boolean; completionStatus?: string };
  }>;
  calendarDay: { name?: string; type?: string; isInstructional?: boolean } | null;
}
export interface OfflineTeacherIdentity {
  id: string;
  role: 'teacher';
  organizationId: string;
  loginSessionId: string;
  hostname: string;
  expiresAt: number;
  /** Last successful online policy verification, not a roster-download date. */
  verifiedAt?: number;
  /** School-local weekly Saturday boundary verified by the server. */
  periodStart?: number;
  calendarAligned?: boolean;
  maxOfflineDays: number;
  email?: string;
  preferredLanguage?: string;
}
export const OFFLINE_TEACHER_IDENTITY_KEY = 'sahal-offline-teacher-session';
// The administrator can choose up to 30 days. Cached rosters are scoped by
// teacher/session/date and never become server authority after expiration.
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const ALLOWED_OFFLINE_DAYS = [1, 3, 7, 14, 30] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function saveVerifiedTeacherIdentity(user: { id: string; role: string; organizationId?: string; email?: string; preferredLanguage?: string }): Promise<void> {
  if (user.role !== 'teacher' || !user.id || !user.organizationId || !navigator.onLine) return;
  const loginSessionId = localStorage.getItem('loginSessionId');
  const hostname = window.location.hostname;
  if (!loginSessionId) return;
  // Never guess the number of days from a local value. Fetch the admin's
  // authoritative policy following successful online verification.
  const { data } = await api.get('/attendance/offline-policy', { timeout: 15000 });
  const maxOfflineDays = data.data?.maxOfflineDays;
  const serverPeriodStart = Date.parse(String(data.data?.periodStart || ''));
  const serverPeriodEnd = Date.parse(String(data.data?.periodEndExclusive || ''));
  const serverVerifiedAt = Date.parse(String(data.data?.verifiedAt || ''));
  const calendarAligned = data.data?.calendarAligned === true;
  if (!ALLOWED_OFFLINE_DAYS.some(days => days === maxOfflineDays) ||
      String(data.data?.organizationId) !== user.organizationId ||
      !Number.isFinite(serverPeriodStart) || !Number.isFinite(serverPeriodEnd) ||
      !Number.isFinite(serverVerifiedAt) || serverPeriodStart > serverVerifiedAt ||
      serverVerifiedAt >= serverPeriodEnd || serverPeriodEnd - serverPeriodStart !== maxOfflineDays * DAY_MS ||
      (maxOfflineDays === 7 && (!calendarAligned || data.data?.timezone !== 'Africa/Mogadishu'))) {
    throw new Error('Offline attendance policy could not be verified for your school.');
  }
  // Avoid a stale background request binding a previous teacher's identity
  // after another user has logged in or the school domain has changed.
  if (localStorage.getItem('loginSessionId') !== loginSessionId || window.location.hostname !== hostname ||
      !localStorage.getItem('accessToken')) return;
  const verifiedAt = Date.now();
  // A 7-day grant is NEVER extended to 7 days after Monday/Wednesday login.
  // Server-controlled Saturday-to-Saturday boundaries are authoritative.
  // Other policies keep their rolling duration.
  const identity: OfflineTeacherIdentity = {
    id: user.id, role: 'teacher', organizationId: user.organizationId,
    loginSessionId, hostname, maxOfflineDays, verifiedAt,
    periodStart: serverPeriodStart, calendarAligned,
    expiresAt: maxOfflineDays === 7 ? serverPeriodEnd : verifiedAt + maxOfflineDays * DAY_MS,
    email: user.email, preferredLanguage: user.preferredLanguage,
  };
  localStorage.setItem(OFFLINE_TEACHER_IDENTITY_KEY, JSON.stringify(identity));
  // A background /auth/me verification may finish after Attendance renders.
  // Notify the current page so its From/Until labels reflect the new grant.
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('sahal-offline-access-updated'));
  }
}

export function verifiedOfflineTeacherIdentity(): OfflineTeacherIdentity | null {
  try {
    const stored = localStorage.getItem(OFFLINE_TEACHER_IDENTITY_KEY);
    if (!stored || !localStorage.getItem('accessToken')) return null;
    const info = JSON.parse(stored) as OfflineTeacherIdentity;
    if (info.role !== 'teacher' || !info.id || !info.organizationId ||
        info.expiresAt < Date.now() || !ALLOWED_OFFLINE_DAYS.some(days => days === info.maxOfflineDays) ||
        info.hostname !== window.location.hostname ||
        info.loginSessionId !== localStorage.getItem('loginSessionId')) return null;
    return info;
  } catch { return null; }
}

/** Display-only offline PIN access window, including expired grants. Never
 * use this function to authorize attendance or unlock cached rosters. */
export interface OfflineAttendanceAccessWindow {
  from: number;
  to: number;
  maxOfflineDays: number;
  calendarAligned: boolean;
  verifiedAt: number;
  expired: boolean;
}

export function getOfflineAttendanceAccessWindow(): OfflineAttendanceAccessWindow | null {
  try {
    const raw = localStorage.getItem(OFFLINE_TEACHER_IDENTITY_KEY);
    if (!raw || !localStorage.getItem('accessToken')) return null;
    const info = JSON.parse(raw) as OfflineTeacherIdentity;
    if (info.role !== 'teacher' || !info.id || !info.organizationId ||
        info.hostname !== window.location.hostname ||
        info.loginSessionId !== localStorage.getItem('loginSessionId') ||
        !ALLOWED_OFFLINE_DAYS.some(days => days === info.maxOfflineDays) ||
        !Number.isFinite(info.expiresAt)) return null;
    const from = info.calendarAligned && info.maxOfflineDays === 7
      ? info.periodStart
      : info.verifiedAt ?? info.expiresAt - info.maxOfflineDays * DAY_MS;
    if (from === undefined || !Number.isFinite(from)) return null;
    const verifiedAt = info.verifiedAt ?? from;
    if (!Number.isFinite(verifiedAt) ||
        from > verifiedAt || verifiedAt > info.expiresAt || from > info.expiresAt ||
        Math.abs((info.expiresAt - from) - info.maxOfflineDays * DAY_MS) > 1000) return null;
    return { from, to: info.expiresAt, maxOfflineDays: info.maxOfflineDays,
      calendarAligned: !!info.calendarAligned, verifiedAt,
      expired: info.expiresAt <= Date.now() };
  } catch { return null; }
}

export function offlineAttendanceOwner(user?: { id?: string; organizationId?: string } | null): string | null {
  const identity = verifiedOfflineTeacherIdentity();
  if (!identity || (user && (user.id !== identity.id || user.organizationId !== identity.organizationId))) return null;
  return [identity.hostname, identity.organizationId, identity.id, identity.loginSessionId].join(':');
}
const keyFor = (owner: string, kind: string, date: string, scheduleId?: string) =>
  'school-attendance:v1:' + owner + ':' + kind + ':' + date + ':' + (scheduleId || '');

async function readCached<T>(key: string): Promise<T | null> {
  const stored = await getOfflineData<{ cachedAt: number; value: T }>(key);
  if (!stored || Date.now() - stored.cachedAt > CACHE_TTL) return null;
  return stored.value;
}
async function writeCached<T>(key: string, value: T) {
  await saveOfflineData(key, { cachedAt: Date.now(), value });
}

/**
 * PWA updates intentionally do not precache index.html (avoids stale live
 * deployments). Prepare Offline caches the current, verified SPA shell only
 * on demand so a *new* teacher attendance URL can reopen without internet.
 */
export async function prepareTeacherOfflineAppShell(): Promise<void> {
  if (!navigator.onLine || !('caches' in window)) throw new Error('Offline setup requires an online PWA.');
  const response = await fetch('/', { credentials: 'same-origin', cache: 'reload' });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Could not prepare the offline app shell.');
  }
  const cache = await caches.open('sahal-offline-app-shell');
  await cache.put('/', response);
}

/**
 * Calendar dates of the school week, independent of browser timezone.
 * The weekly start is a server-issued Saturday midnight in Mogadishu.
 */
export function preparedAttendanceDates(access: OfflineAttendanceAccessWindow, selectedDate: string): string[] {
  if (!access.calendarAligned || access.maxOfflineDays !== 7) return [selectedDate];
  const offset = 3 * 60 * 60 * 1000;
  return Array.from({ length: 7 }, (_, index) =>
    new Date(access.from + index * DAY_MS + offset).toISOString().slice(0, 10));
}

export const cacheAttendanceSessions = (owner: string, date: string, value: OfflineSessionList) =>
  writeCached(keyFor(owner, 'sessions', date), value);
export const getCachedAttendanceSessions = (owner: string, date: string) =>
  readCached<OfflineSessionList>(keyFor(owner, 'sessions', date));
export const cacheAttendanceRoster = (owner: string, date: string, scheduleId: string, value: OfflineRoster) =>
  writeCached(keyFor(owner, 'roster', date, scheduleId), value);
export const getCachedAttendanceRoster = (owner: string, date: string, scheduleId: string) =>
  readCached<OfflineRoster>(keyFor(owner, 'roster', date, scheduleId));
export const storeAttendanceDraft = (owner: string, date: string, scheduleId: string, value: Record<string, AttendanceDraft>) =>
  writeCached(keyFor(owner, 'draft', date, scheduleId), value);
export const readAttendanceDraft = (owner: string, date: string, scheduleId: string) =>
  readCached<Record<string, AttendanceDraft>>(keyFor(owner, 'draft', date, scheduleId));

const submissionKey = (owner: string, date: string, scheduleId: string) =>
  keyFor(owner, 'submission', date, scheduleId);

export async function pendingForSession(owner: string, date: string, scheduleId: string): Promise<OfflineAttendanceSubmission | null> {
  return (await listAttendanceSubmissions(owner)).find(item => item.key === submissionKey(owner, date, scheduleId)) || null;
}
export async function queueTeacherAttendance(owner: string, roster: OfflineRoster, drafts: Record<string, AttendanceDraft>): Promise<OfflineAttendanceSubmission> {
  const scheduleId = roster.schedule._id;
  const courseId = roster.schedule.course?._id;
  if (!courseId || roster.locked || !roster.roster.length) throw new Error('An unlocked, downloaded school attendance roster is required.');
  if (!crypto?.randomUUID) throw new Error('Secure submission IDs require a modern browser.');
  const existing = await pendingForSession(owner, roster.date, scheduleId);
  if (existing) return existing; // no duplicate queue entries per school period
  const submission: OfflineAttendanceSubmission = {
    key: submissionKey(owner, roster.date, scheduleId), owner,
    submissionId: crypto.randomUUID(),
    scheduleId, courseId, date: roster.date,
    revision: roster.revision || null, createdAt: Date.now(),
    status: 'pending',
    records: roster.roster.map(student => {
      const draft = drafts[student._id] || { status: 'present', reasonCode: '', notes: '' };
      return {
        student: student._id,
        status: draft.status,
        reasonCode: draft.status === 'absent' ? draft.reasonCode : '',
        notes: draft.notes.slice(0, 1000),
      };
    }),
  };
  await putAttendanceSubmission(submission);
  window.dispatchEvent(new Event('sahal-attendance-queue-change'));
  return submission;
}

let flushing = false;
export async function flushTeacherAttendanceQueue(): Promise<void> {
  const owner = offlineAttendanceOwner();
  if (!owner || flushing || !navigator.onLine) return;
  const run = async () => {
    const currentOwner = offlineAttendanceOwner();
    if (currentOwner !== owner || !navigator.onLine) return;
    const queued = (await listAttendanceSubmissions(owner)).filter(s => s.status === 'pending');
    for (const item of queued.sort((a, b) => a.createdAt - b.createdAt)) {
      if (offlineAttendanceOwner() !== owner || !navigator.onLine) break;
      try {
        await api.post('/attendance', {
          course: item.courseId, schedule: item.scheduleId, date: item.date,
          records: item.records, clientSubmissionId: item.submissionId,
          expectedRevision: item.revision,
        }, { timeout: 25000 });
        // Login/logout may have changed mid-flight. Never delete another
        // user's new queue item at the same key after the await.
        if (offlineAttendanceOwner() !== owner) break;
        const latest = await pendingForSession(owner, item.date, item.scheduleId);
        if (latest?.submissionId === item.submissionId) await removeAttendanceSubmission(item.key);
        window.dispatchEvent(new Event('sahal-attendance-queue-change'));
      } catch (error: any) {
        const status = error?.response?.status;
        if (!status || status === 408 || status === 429 || status >= 500) break;
        // Permanent server-side permission/revision/roster conflicts are
        // preserved. Never delete unsynced attendance on a 4xx.
        item.status = 'conflict';
        item.error = error.response?.data?.message || 'Attendance requires review before it can be synced.';
        await putAttendanceSubmission(item);
        window.dispatchEvent(new Event('sahal-attendance-queue-change'));
      }
    }
  };
  flushing = true;
  try {
    const locks = (navigator as Navigator & { locks?: { request: (name: string, opts: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<void>) => Promise<void> } }).locks;
    if (locks?.request) await locks.request('sahal-attendance-flush', { ifAvailable: true }, async lock => { if (lock) await run(); });
    else await run();
  } finally { flushing = false; }
}

export async function listMyAttendanceQueue() {
  const owner = offlineAttendanceOwner();
  return owner ? listAttendanceSubmissions(owner) : [];
}
export async function retryTeacherAttendanceSubmission(item: OfflineAttendanceSubmission) {
  if (offlineAttendanceOwner() !== item.owner) throw new Error('Session changed. Sign in again.');
  // Permanent server conflicts must never be auto-overwritten. A manual
  // retry retains original revision and requires an admin correction if stale.
  await putAttendanceSubmission({ ...item, status: 'pending', error: undefined });
  await flushTeacherAttendanceQueue();
}
export async function discardTeacherAttendanceSubmission(item: OfflineAttendanceSubmission) {
  if (offlineAttendanceOwner() !== item.owner) throw new Error('Session changed. Sign in again.');
  await removeAttendanceSubmission(item.key);
  window.dispatchEvent(new Event('sahal-attendance-queue-change'));
}
