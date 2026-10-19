import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const compile = path => ts.transpileModule(
  fs.readFileSync(new URL(path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
const data=new Map([['accessToken','token-a'],['loginSessionId','session-a']]);
const session=new Map();
const localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
const sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)};
const window={location:{hostname:'balcad.schoolapp.so'}};
const navigator={onLine:true};
const vaultScope={exports:{},localStorage,sessionStorage,window,Date};
vm.runInNewContext(compile('../src/lib/offline-teacher-vault.ts'),vaultScope);
const vault=vaultScope.exports;
const scope={exports:{},localStorage,sessionStorage,window,navigator,crypto:webcrypto,TextEncoder,Date,
  require(path){
    if(path==='./offline-teacher-vault')return vault;
    if(path==='./teacher-offline-attendance')return {
      OFFLINE_TEACHER_IDENTITY_KEY:'sahal-offline-teacher-session',
      verifiedOfflineTeacherIdentity:()=>null,
    };
    throw new Error(path);
  },
};
vm.runInNewContext(compile('../src/lib/offline-teacher-password.ts'),scope);
const {enrollTeacherOfflinePassword,unlockTeacherWithPassword,listAutomaticOfflineTeachers,OFFLINE_GRACE_MS}=scope.exports;
const mk=(id,loginSessionId)=>({
  id,role:'teacher',organizationId:'school-a',hostname:window.location.hostname,
  email:id+'@balcad.com',loginSessionId,maxOfflineDays:7,
  verifiedAt:Date.now(),expiresAt:Date.now()+7*86400000,calendarAligned:false,
});
const a=mk('teacher-a','session-a'), b=mk('teacher-b','session-b');
const aKey=vault.offlineAccountKey(a), bKey=vault.offlineAccountKey(b);
vault.rememberVerifiedTeacher(a);
await enrollTeacherOfflinePassword('Original-Password!1',a);
assert.equal(listAutomaticOfflineTeachers().length,1);
assert.ok(!JSON.stringify([...data]).includes('Original-Password!1'),'Never save raw password');
vault.rememberVerifiedTeacher(b);
await enrollTeacherOfflinePassword('Different-Pass!2',b);
assert.equal(listAutomaticOfflineTeachers().length,2,'Each teacher is separately prepared');
await assert.rejects(unlockTeacherWithPassword('Different-Pass!2',aKey),/Incorrect password/);
const unlocked=await unlockTeacherWithPassword('Original-Password!1',aKey);
assert.equal(unlocked.id,'teacher-a');
assert.equal(localStorage.getItem('accessToken'),null,'Never use token from another account');
assert.equal((await unlockTeacherWithPassword('Different-Pass!2',bKey)).id,'teacher-b');

navigator.onLine=true;
const newB={...b,loginSessionId:'session-b-new',verifiedAt:Date.now(),expiresAt:Date.now()+7*86400000};
vault.rememberVerifiedTeacher(newB);
await enrollTeacherOfflinePassword('New-Password!3',newB);
await assert.rejects(unlockTeacherWithPassword('Different-Pass!2',bKey),/Incorrect password/);
assert.equal((await unlockTeacherWithPassword('New-Password!3',bKey)).id,'teacher-b','Online password replacement must invalidate old offline verifier');

const record=vault.getPreparedTeacher(aKey);
const expiry=Date.now()-60000;
const expiredIdentity={...record.identity,expiresAt:expiry,verifiedAt:expiry-7*86400000};
vault.savePreparedTeacher(aKey,{identity:expiredIdentity,pin:{...record.pin,expiresAt:expiry,
  subject:vault.offlineSubject(expiredIdentity)}});
assert.equal(OFFLINE_GRACE_MS,24*60*60_000);
assert.ok(listAutomaticOfflineTeachers().find(x=>x.key===aKey)?.warning,
  '7 days without verification must trigger reconnect warning');
assert.equal((await unlockTeacherWithPassword('Original-Password!1',aKey)).id,'teacher-a',
  'Password may unlock during 24h grace');
const lockAt=Date.now()-24*60*60_000-60000;
vault.savePreparedTeacher(aKey,{identity:{...expiredIdentity,expiresAt:lockAt,verifiedAt:lockAt-7*86400000},
  pin:{...record.pin,expiresAt:lockAt,subject:vault.offlineSubject(expiredIdentity)}});
assert.ok(!listAutomaticOfflineTeachers().some(x=>x.key===aKey));
await assert.rejects(unlockTeacherWithPassword('Original-Password!1',aKey),/expired/);
window.location.hostname='tusma.schoolapp.so';
assert.equal(listAutomaticOfflineTeachers().length,0,'Teacher profiles are school-domain scoped');
console.log('PASS: password-only offline enrollment, no plaintext, shared teachers, password change, 7d reminder and 24h lock');
