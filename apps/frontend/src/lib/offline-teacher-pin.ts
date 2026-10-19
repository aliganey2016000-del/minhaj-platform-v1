/**
 * Account-selective offline PIN verification. PIN never authenticates server
 * requests, and each teacher on a shared device has a separate salted hash
 * and independent lockout. Online writes require a fresh online login.
 */
import api from './axios';
import { saveVerifiedTeacherIdentity, verifiedOfflineTeacherIdentity,
  OFFLINE_TEACHER_IDENTITY_KEY, type OfflineTeacherIdentity } from './teacher-offline-attendance';
import { offlineAccountKey, offlineSubject, getPreparedTeacher, listPreparedTeachers,
  rememberVerifiedTeacher, savePreparedTeacher, forgetPreparedTeacher, markOfflineUnlocked, lockOfflineTeacher,
  type TeacherPinVerifier } from './offline-teacher-vault';
export { listPreparedTeachers };

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;
const ITERATIONS = 210_000;
const asHex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

async function derivePin(pin: string, salt: string): Promise<string> {
  if (!crypto?.subtle) throw new Error('Offline PIN requires HTTPS on this device.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const raw = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: Uint8Array.from(salt.match(/../g) || [], x => parseInt(x,16)), hash:'SHA-256', iterations:ITERATIONS },
    key, 256);
  return asHex(new Uint8Array(raw));
}
function sameHash(a:string, b:string) {
  if (a.length !== b.length) return false;
  let changed = 0;
  for (let i=0;i<a.length;i++) changed |= a.charCodeAt(i)^b.charCodeAt(i);
  return changed === 0;
}
function validVerifier(pin: TeacherPinVerifier | null, identity: OfflineTeacherIdentity): boolean {
  return !!pin && pin.version === 1 && pin.subject === offlineSubject(identity) &&
    pin.expiresAt <= identity.expiresAt && pin.expiresAt > Date.now() &&
    /^[a-f0-9]{32}$/.test(pin.salt) && /^[a-f0-9]{64}$/.test(pin.hash);
}
export function isOfflinePinReady(): boolean {
  const identity = verifiedOfflineTeacherIdentity();
  return !!identity && validVerifier(getPreparedTeacher(offlineAccountKey(identity))?.pin || null, identity);
}
export function clearOfflinePin(): void {
  const identity = verifiedOfflineTeacherIdentity();
  if (identity) forgetPreparedTeacher(offlineAccountKey(identity));
  try { localStorage.removeItem('sahal-teacher-offline-pin-v1'); } catch {}
}
export function refreshOfflinePinValidity(): void {
  if (!navigator.onLine) return;
  const identity = verifiedOfflineTeacherIdentity();
  if (!identity || !identity.verifiedAt || Math.abs(Date.now() - identity.verifiedAt) > 120_000) return;
  rememberVerifiedTeacher(identity);
}
export async function setupOfflinePin(pin: string): Promise<void> {
  if (!/^[0-9]{6}$/.test(pin) || /^([0-9])\1{5}$/.test(pin))
    throw new Error('Use six non-repeating digits for your PIN.');
  if (!navigator.onLine) throw new Error('Connect online to enable your offline PIN.');
  const identity = verifiedOfflineTeacherIdentity();
  if (!identity) throw new Error('Sign in online as your teacher account first.');
  const { data } = await api.get('/auth/me', { timeout: 15000 });
  const user = data.data?.user;
  const org = typeof user?.organizationId === 'object' ? String(user.organizationId?._id || '') : String(user?.organizationId || '');
  if (user?.role !== 'teacher' || String(user?.id || user?._id) !== identity.id || org !== identity.organizationId)
    throw new Error('Current verified account does not match this teacher.');
  // The attendance page must not be hidden by the admin's sidebar policy.
  const access = await api.get('/sidebar-settings/mine', { params: { portal:'teacher' }, timeout:15000 });
  if ((access.data?.data?.items || []).some((item:{key:string;visible:boolean}) =>
      item.key === 'teacher/attendance' && item.visible === false))
    throw new Error('Your administrator has disabled Teacher Attendance.');
  await saveVerifiedTeacherIdentity({
    id: identity.id, role:'teacher', organizationId: identity.organizationId,
    email: identity.email, preferredLanguage: identity.preferredLanguage,
  });
  const updated = verifiedOfflineTeacherIdentity();
  if (!updated || updated.id !== identity.id || updated.loginSessionId !== identity.loginSessionId)
    throw new Error('Could not verify your school offline policy.');
  const salt = asHex(crypto.getRandomValues(new Uint8Array(16)));
  const verifier:TeacherPinVerifier = {
    version:1, subject:offlineSubject(updated), salt, hash: await derivePin(pin,salt),
    expiresAt:updated.expiresAt, attempts:0, lockedUntil:0,
  };
  savePreparedTeacher(offlineAccountKey(updated), { identity:updated, pin:verifier });
}
export async function unlockTeacherWithPin(pin:string, selectedKey?:string):Promise<OfflineTeacherIdentity> {
  const key = selectedKey || listPreparedTeachers().find(x => !x.expired)?.key;
  if (!key) throw new Error('Choose a teacher account that was prepared online.');
  const record = getPreparedTeacher(key);
  if (!record || !validVerifier(record.pin, record.identity))
    throw new Error('This account has no valid offline PIN. Connect online and prepare it again.');
  if (record.pin!.lockedUntil > Date.now())
    throw new Error('Too many attempts. Wait 15 minutes or sign in online.');
  if (!/^[0-9]{6}$/.test(pin)) throw new Error('Enter the six-digit PIN.');
  const actual = await derivePin(pin,record.pin!.salt);
  if (!sameHash(actual,record.pin!.hash)) {
    const tries=record.pin!.attempts+1;
    const next={...record.pin!,attempts:tries >= MAX_ATTEMPTS ? 0 : tries,
      lockedUntil:tries >= MAX_ATTEMPTS ? Date.now()+LOCK_MS : 0};
    savePreparedTeacher(key,{...record,pin:next});
    throw new Error(tries >= MAX_ATTEMPTS ? 'PIN locked for 15 minutes.' : 'Incorrect PIN for the selected teacher.');
  }
  savePreparedTeacher(key,{...record,pin:{...record.pin!,attempts:0,lockedUntil:0}});
  // No token from teacher A is allowed to follow teacher B into offline mode.
  localStorage.removeItem('accessToken');
  localStorage.setItem('loginSessionId',record.identity.loginSessionId);
  localStorage.setItem(OFFLINE_TEACHER_IDENTITY_KEY,JSON.stringify(record.identity));
  lockOfflineTeacher();
  markOfflineUnlocked(record.identity);
  return record.identity;
}
