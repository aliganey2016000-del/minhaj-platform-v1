/**
 * Device-local teacher PIN for cold PWA launches without connectivity.
 * This is a short-lived offline unlock, NOT an authentication token and it
 * never authorizes a server write. The backend rechecks every queued action.
 */
import api from './axios';
import { saveVerifiedTeacherIdentity, verifiedOfflineTeacherIdentity, type OfflineTeacherIdentity } from './teacher-offline-attendance';

const STORAGE_KEY = 'sahal-teacher-offline-pin-v1';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const ITERATIONS = 210_000;

interface PinRecord {
  version: 1;
  subject: string;
  salt: string;
  hash: string;
  expiresAt: number;
  attempts: number;
  lockedUntil: number;
}
const subjectOf = (identity: OfflineTeacherIdentity) =>
  [identity.hostname, identity.organizationId, identity.id, identity.loginSessionId].join(':');

function getRecord(identity: OfflineTeacherIdentity): PinRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as PinRecord;
    if (record.version !== 1 || record.subject !== subjectOf(identity) ||
        record.expiresAt <= Date.now() || record.expiresAt > identity.expiresAt ||
        !/^[a-f0-9]{32}$/.test(record.salt) || !/^[a-f0-9]{64}$/.test(record.hash)) return null;
    return record;
  } catch { return null; }
}

function asHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function derivePin(pin: string, salt: string): Promise<string> {
  if (!crypto?.subtle) throw new Error('Offline PIN requires a secure HTTPS connection on this device.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const raw = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: Uint8Array.from(salt.match(/../g) || [], b => parseInt(b, 16)), iterations: ITERATIONS, hash: 'SHA-256' },
    key, 256,
  );
  return asHex(new Uint8Array(raw));
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function isOfflinePinReady(): boolean {
  const identity = verifiedOfflineTeacherIdentity();
  return !!identity && !!getRecord(identity);
}

/**
 * On verified online login the teacher receives the current school policy.
 * Keep an existing unexpired PIN in step with an admin shortening/expanding
 * access, without ever extending a PIN based on a locally chosen duration.
 */
export function refreshOfflinePinValidity(): void {
  const identity = verifiedOfflineTeacherIdentity();
  if (!identity) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const record = JSON.parse(raw) as PinRecord;
    if (record.version !== 1 || record.subject !== subjectOf(identity) ||
        record.expiresAt <= Date.now() || record.lockedUntil > Date.now()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...record, expiresAt: identity.expiresAt }));
  } catch { /* no storage / invalid old PIN */ }
}

export function clearOfflinePin(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* unavailable storage */ }
}

export async function setupOfflinePin(pin: string): Promise<void> {
  if (!/^[0-9]{6}$/.test(pin) || /^([0-9])\1{5}$/.test(pin)) {
    throw new Error('Use six different-enough digits (not 000000 or 111111).');
  }
  if (!navigator.onLine) throw new Error('Connect to the internet to set up or reset your offline PIN.');
  const identity = verifiedOfflineTeacherIdentity();
  if (!identity) throw new Error('Sign in online with your teacher account first.');

  // A live backend check is required before enabling a fresh offline unlock.
  const { data } = await api.get('/auth/me', { timeout: 15000 });
  const user = data.data?.user;
  const org = typeof user?.organizationId === 'object'
    ? String(user.organizationId?._id || '')
    : String(user?.organizationId || '');
  if (user?.role !== 'teacher' || String(user?.id || user?._id) !== identity.id || org !== identity.organizationId) {
    throw new Error('Offline setup is only available to the verified teacher on this school domain.');
  }
  // The administrator may have changed the school's duration since login.
  // Refresh the server-owned policy before issuing/replacing a local PIN.
  await saveVerifiedTeacherIdentity({
    id: identity.id, role: 'teacher', organizationId: identity.organizationId,
    email: identity.email, preferredLanguage: identity.preferredLanguage,
  });
  const updated = verifiedOfflineTeacherIdentity();
  if (!updated || updated.id !== identity.id ||
      updated.organizationId !== identity.organizationId ||
      updated.loginSessionId !== identity.loginSessionId) {
    throw new Error('Offline school policy could not be verified. Reconnect and try again.');
  }
  const salt = asHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derivePin(pin, salt);
  const record: PinRecord = {
    version: 1, subject: subjectOf(updated), salt, hash,
    expiresAt: updated.expiresAt, attempts: 0, lockedUntil: 0,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export async function unlockTeacherWithPin(pin: string): Promise<OfflineTeacherIdentity> {
  const identity = verifiedOfflineTeacherIdentity();
  if (!identity) throw new Error('Offline access expired. Reconnect and sign in with your teacher account.');
  const record = getRecord(identity);
  if (!record) throw new Error('Offline PIN is not configured or has expired. Sign in online to prepare again.');
  if (record.lockedUntil > Date.now()) throw new Error('Too many PIN attempts. Wait 15 minutes or sign in online.');
  if (!/^[0-9]{6}$/.test(pin)) throw new Error('Enter your six-digit offline PIN.');

  const actual = await derivePin(pin, record.salt);
  if (!sameHash(actual, record.hash)) {
    const attempts = record.attempts + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...record, attempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
      lockedUntil: attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : 0,
    }));
    throw new Error(attempts >= MAX_ATTEMPTS
      ? 'Too many attempts. Offline access is locked for 15 minutes.'
      : 'Incorrect PIN. Please try again.');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...record, attempts: 0, lockedUntil: 0 }));
  return identity;
}
