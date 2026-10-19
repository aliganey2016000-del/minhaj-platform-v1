/**
 * Device-local directory of teacher accounts that were prepared online.
 * Stores no password, auth token or reusable server credential. Each entry
 * holds a PBKDF2 PIN verifier and the server-issued offline time window.
 * PIN unlock allows local attendance only; online submission requires login.
 */
import type { OfflineTeacherIdentity } from './teacher-offline-attendance';

export const TEACHER_VAULT_KEY = 'sahal-offline-teacher-vault-v1';
export const OFFLINE_UNLOCKED_KEY = 'sahal-offline-teacher-unlocked';
const LEGACY_PIN_KEY = 'sahal-teacher-offline-pin-v1';
const LEGACY_IDENTITY_KEY = 'sahal-offline-teacher-session';

export interface TeacherPinVerifier {
  version: 1;
  subject: string;
  salt: string;
  hash: string;
  expiresAt: number;
  attempts: number;
  lockedUntil: number;
}
export interface PreparedTeacherAccount {
  identity: OfflineTeacherIdentity;
  pin: TeacherPinVerifier | null;
}
export const offlineAccountKey = (identity: Pick<OfflineTeacherIdentity,'hostname'|'organizationId'|'id'>): string =>
  [identity.hostname.toLowerCase(), identity.organizationId, identity.id].join('|');
export const offlineSubject = (identity: OfflineTeacherIdentity): string =>
  [identity.hostname, identity.organizationId, identity.id, identity.loginSessionId].join(':');

function isIdentity(value: any): value is OfflineTeacherIdentity {
  return value && value.role === 'teacher' && typeof value.hostname === 'string' &&
    typeof value.organizationId === 'string' && typeof value.id === 'string' &&
    typeof value.loginSessionId === 'string' && value.loginSessionId.length > 0 &&
    [1,3,7,14,30].includes(value.maxOfflineDays) &&
    Number.isFinite(value.expiresAt) && value.expiresAt > 0;
}
function isPin(value: any): value is TeacherPinVerifier {
  return value?.version === 1 && /^[a-f0-9]{32}$/.test(value.salt) &&
    /^[a-f0-9]{64}$/.test(value.hash) && Number.isFinite(value.expiresAt) &&
    Number.isFinite(value.lockedUntil) && Number.isFinite(value.attempts);
}
function readRaw(): Record<string, PreparedTeacherAccount> {
  try {
    const saved = JSON.parse(localStorage.getItem(TEACHER_VAULT_KEY) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    const result: Record<string, PreparedTeacherAccount> = {};
    for (const [key, value] of Object.entries(saved)) {
      const candidate = value as PreparedTeacherAccount;
      if (isIdentity(candidate?.identity) && offlineAccountKey(candidate.identity) === key) {
        result[key] = { identity: candidate.identity, pin: isPin(candidate.pin) ? candidate.pin : null };
      }
    }
    return result;
  } catch { return {}; }
}
function writeRaw(value: Record<string, PreparedTeacherAccount>): void {
  localStorage.setItem(TEACHER_VAULT_KEY, JSON.stringify(value));
}

/** Migrates the prior single-account PIN on the same device without disclosing
 * it to another teacher. Does not fabricate preparation for a different user. */
export function migrateLegacyTeacherPin(): void {
  try {
    const identity = JSON.parse(localStorage.getItem(LEGACY_IDENTITY_KEY) || 'null');
    const verifier = JSON.parse(localStorage.getItem(LEGACY_PIN_KEY) || 'null');
    if (!isIdentity(identity) || !isPin(verifier) ||
        verifier.subject !== offlineSubject(identity) ||
        verifier.expiresAt > identity.expiresAt) return;
    const key = offlineAccountKey(identity);
    const profiles = readRaw();
    if (!profiles[key]?.pin) {
      profiles[key] = { identity, pin: verifier };
      writeRaw(profiles);
    }
    localStorage.removeItem(LEGACY_PIN_KEY);
  } catch { /* incomplete legacy setup */ }
}

export function getPreparedTeacher(key: string): PreparedTeacherAccount | null {
  migrateLegacyTeacherPin();
  const item = readRaw()[key];
  if (!item || item.identity.hostname.toLowerCase() !== window.location.hostname.toLowerCase()) return null;
  return item;
}
export function listPreparedTeachers(): Array<{key:string; email:string; expiresAt:number; expired:boolean; organizationId:string}> {
  migrateLegacyTeacherPin();
  const now = Date.now();
  return Object.entries(readRaw()).filter(([, entry]) =>
    entry.pin && entry.identity.hostname.toLowerCase() === window.location.hostname.toLowerCase()
  ).map(([key, entry]) => ({
    key, email: entry.identity.email || 'Teacher account', expiresAt: entry.identity.expiresAt,
    expired: entry.identity.expiresAt <= now || entry.pin!.expiresAt <= now,
    organizationId: entry.identity.organizationId,
  })).sort((a,b) => a.email.localeCompare(b.email));
}

/** Called only after the backend has verified the teacher and their school's
 * offline policy. Existing PIN is allowed to follow a new login session of
 * the *same* verified account; no cross-account PIN transfer. */
export function rememberVerifiedTeacher(identity: OfflineTeacherIdentity): void {
  if (!isIdentity(identity) || identity.hostname.toLowerCase() !== window.location.hostname.toLowerCase()) return;
  migrateLegacyTeacherPin();
  const records = readRaw();
  const key = offlineAccountKey(identity);
  const previous = records[key];
  const pin = previous?.pin && isPin(previous.pin) ? {
    ...previous.pin, subject: offlineSubject(identity), expiresAt: identity.expiresAt,
  } : null;
  records[key] = { identity, pin };
  writeRaw(records);
}

export function savePreparedTeacher(key: string, profile: PreparedTeacherAccount): void {
  if (!isIdentity(profile.identity) || !isPin(profile.pin) || offlineAccountKey(profile.identity) !== key ||
      profile.pin.subject !== offlineSubject(profile.identity) ||
      profile.pin.expiresAt > profile.identity.expiresAt) throw new Error('Invalid offline teacher preparation.');
  const records = readRaw();
  records[key] = profile;
  writeRaw(records);
}

export function forgetPreparedTeacher(key: string): void {
  const records = readRaw();
  delete records[key];
  writeRaw(records);
  if (currentOfflineUnlock() === key) sessionStorage.removeItem(OFFLINE_UNLOCKED_KEY);
}

export function currentOfflineUnlock(): string | null {
  try { return sessionStorage.getItem(OFFLINE_UNLOCKED_KEY); } catch { return null; }
}
export function isOfflineIdentityUnlocked(identity: OfflineTeacherIdentity): boolean {
  return currentOfflineUnlock() === offlineAccountKey(identity) &&
    !!getPreparedTeacher(offlineAccountKey(identity))?.pin &&
    getPreparedTeacher(offlineAccountKey(identity))?.identity.loginSessionId === identity.loginSessionId;
}
export function markOfflineUnlocked(identity: OfflineTeacherIdentity): void {
  sessionStorage.setItem(OFFLINE_UNLOCKED_KEY, offlineAccountKey(identity));
}
export function lockOfflineTeacher(): void {
  try { sessionStorage.removeItem(OFFLINE_UNLOCKED_KEY); } catch { /* unavailable */ }
}
