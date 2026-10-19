/**
 * Device-local offline credential verifier. Derived only after a successful
 * online password login; passwords and server password hashes are never saved.
 * PIN-only legacy records are deliberately ineligible until next online login.
 */
import type { OfflineTeacherIdentity } from './teacher-offline-attendance';
import {
  offlineAccountKey, offlineSubject, getPreparedTeacher, savePreparedTeacher,
  listPreparedTeachers as listLegacyPrepared, forgetPreparedTeacher, markOfflineUnlocked,
  lockOfflineTeacher, type TeacherPinVerifier,
} from './offline-teacher-vault';
import { OFFLINE_TEACHER_IDENTITY_KEY, verifiedOfflineTeacherIdentity } from './teacher-offline-attendance';

const ITERATIONS=210_000;
const ATTEMPTS=5;
const LOCK_MS=15*60_000;
export const OFFLINE_GRACE_MS=24*60*60_000;
type PasswordVerifier = TeacherPinVerifier & { credential:'password'; activatedAt:number };
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
async function digest(password:string,salt:string):Promise<string> {
  if(!crypto?.subtle)throw new Error('Offline password verification requires HTTPS and secure device storage.');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const buffer=await crypto.subtle.deriveBits({
    name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g)||[],h=>parseInt(h,16)),
    iterations:ITERATIONS,hash:'SHA-256',
  },key,256);
  return hex(new Uint8Array(buffer));
}
function isPassword(pin:TeacherPinVerifier|null):pin is PasswordVerifier {
  return !!pin && (pin as PasswordVerifier).credential==='password';
}
function gate(identity:OfflineTeacherIdentity,verifier:PasswordVerifier,now=Date.now()) {
  if(verifier.subject!==offlineSubject(identity))return false;
  if(!Number.isFinite(verifier.activatedAt) || verifier.activatedAt>now)return false;
  return identity.expiresAt+OFFLINE_GRACE_MS>now &&
    verifier.expiresAt===identity.expiresAt;
}
export function listAutomaticOfflineTeachers() {
  const now=Date.now();
  return listLegacyPrepared().filter(x=>{
    const record=getPreparedTeacher(x.key);
    return !!record && isPassword(record.pin) && gate(record.identity,record.pin,now);
  }).map(x=>{
    const record=getPreparedTeacher(x.key)!;
    return {...x,expired:false,warning:now>=record.identity.expiresAt,
      lockAt:record.identity.expiresAt+OFFLINE_GRACE_MS};
  });
}
export async function enrollTeacherOfflinePassword(password:string,identity:OfflineTeacherIdentity):Promise<void>{
  if(!password || !navigator.onLine)throw new Error('Online password sign-in is required for offline setup.');
  const record=getPreparedTeacher(offlineAccountKey(identity));
  if(!record || record.identity.loginSessionId!==identity.loginSessionId)
    throw new Error('Offline teacher policy is not verified.');
  const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
  const verifier:PasswordVerifier={
    credential:'password',activatedAt:Date.now(),version:1,subject:offlineSubject(identity),
    salt,hash:await digest(password,salt),expiresAt:identity.expiresAt,attempts:0,lockedUntil:0,
  };
  savePreparedTeacher(offlineAccountKey(identity),{identity,pin:verifier});
}
export async function unlockTeacherWithPassword(password:string,key:string):Promise<OfflineTeacherIdentity>{
  const record=getPreparedTeacher(key);
  if(!record || !isPassword(record.pin) || !gate(record.identity,record.pin))
    throw new Error('Offline access has expired. Connect to the internet and sign in to renew.');
  if(record.pin.lockedUntil>Date.now())throw new Error('Too many attempts. Wait 15 minutes or sign in online.');
  if(!password)throw new Error('Enter your account password.');
  const match=await digest(password,record.pin.salt);
  let different=0;
  for(let i=0;i<match.length;i++)different |= match.charCodeAt(i)^record.pin.hash.charCodeAt(i);
  if(different) {
    const attempt=record.pin.attempts+1;
    const verifier={...record.pin,attempts:attempt>=ATTEMPTS?0:attempt,
      lockedUntil:attempt>=ATTEMPTS?Date.now()+LOCK_MS:0};
    savePreparedTeacher(key,{...record,pin:verifier});
    throw new Error(attempt>=ATTEMPTS?'Offline access locked for 15 minutes.':'Incorrect password for this teacher account.');
  }
  savePreparedTeacher(key,{...record,pin:{...record.pin,attempts:0,lockedUntil:0}});
  localStorage.removeItem('accessToken');
  localStorage.setItem('loginSessionId',record.identity.loginSessionId);
  localStorage.setItem(OFFLINE_TEACHER_IDENTITY_KEY,JSON.stringify(record.identity));
  lockOfflineTeacher();
  markOfflineUnlocked(record.identity);
  return record.identity;
}
export function isAutomaticOfflineReady() {
  const identity=verifiedOfflineTeacherIdentity();
  if(!identity)return false;
  const record=getPreparedTeacher(offlineAccountKey(identity));
  return !!record && isPassword(record.pin) && gate(record.identity,record.pin);
}
export function clearAutomaticOfflineAccess() {
  const identity=verifiedOfflineTeacherIdentity();
  if(identity)forgetPreparedTeacher(offlineAccountKey(identity));
}
