import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const compile = path => ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText;
const memory=new Map([['accessToken','teacher-a-token'],['loginSessionId','session-a']]);
const sessions=new Map();
const localStorage={
  getItem:k=>memory.get(k) ?? null,
  setItem:(k,v)=>memory.set(k,String(v)),
  removeItem:k=>memory.delete(k),
};
const sessionStorage={
  getItem:k=>sessions.get(k) ?? null,
  setItem:(k,v)=>sessions.set(k,String(v)),
  removeItem:k=>sessions.delete(k),
};
const window={location:{hostname:'balcad.schoolapp.so'}};
const navigator={onLine:true};
let identity={id:'teacher-a',role:'teacher',organizationId:'school-a',hostname:window.location.hostname,
  email:'teacher-a@balcad.com',loginSessionId:'session-a',maxOfflineDays:7,
  verifiedAt:Date.now(),expiresAt:Date.now()+7*86400000};
const vaultCtx={exports:{},window,localStorage,sessionStorage,Date};
vm.runInNewContext(compile('../src/lib/offline-teacher-vault.ts'),vaultCtx);
const vault=vaultCtx.exports;
let apiCalls=0;
const api={async get(path){
  apiCalls++;
  if(path==='/auth/me')return {data:{data:{user:{_id:identity.id,role:'teacher',organizationId:identity.organizationId}}}};
  if(path==='/sidebar-settings/mine')return {data:{data:{items:[{key:'teacher/attendance',visible:true}]}}};
  throw Error('Unexpected API request '+path);
}};
const context={exports:{},crypto:webcrypto,TextEncoder,Date,navigator,window,localStorage,sessionStorage,
  require(path){
    if(path==='./axios')return api;
    if(path==='./offline-teacher-vault')return vault;
    if(path==='./teacher-offline-attendance')return {
      verifiedOfflineTeacherIdentity:()=>identity,
      saveVerifiedTeacherIdentity:async ()=>vault.rememberVerifiedTeacher(identity),
      OFFLINE_TEACHER_IDENTITY_KEY:'sahal-offline-teacher-session',
    };
    throw Error('Unexpected import '+path);
  },
};
vm.runInNewContext(compile('../src/lib/offline-teacher-pin.ts'),context);
const {setupOfflinePin,unlockTeacherWithPin,listPreparedTeachers,isOfflinePinReady,clearOfflinePin}=context.exports;
const aKey=vault.offlineAccountKey(identity);
assert.equal(listPreparedTeachers().length,0);
await assert.rejects(setupOfflinePin('111111'),/non-repeating/);
await setupOfflinePin('123456');
assert.equal(isOfflinePinReady(),true);
assert.ok(apiCalls>=2,'PIN registration must use live teacher and sidebar checks');
assert.ok(!JSON.stringify([...memory]).includes('123456'),'plaintext PIN must never appear in storage');

identity={...identity,id:'teacher-b',email:'teacher-b@balcad.com',loginSessionId:'session-b',
  verifiedAt:Date.now(),expiresAt:Date.now()+7*86400000};
memory.set('accessToken','teacher-b-token');memory.set('loginSessionId','session-b');
const bKey=vault.offlineAccountKey(identity);
await setupOfflinePin('654321');
const profiles=listPreparedTeachers();
assert.equal(profiles.length,2);
assert.deepEqual(profiles.map(x=>x.email).sort(),['teacher-a@balcad.com','teacher-b@balcad.com']);

navigator.onLine=false;
await assert.rejects(unlockTeacherWithPin('123456',bKey),/Incorrect PIN/);
const aUnlock=await unlockTeacherWithPin('123456',aKey);
assert.equal(aUnlock.id,'teacher-a');
assert.equal(localStorage.getItem('accessToken'),null,'Offline unlock must never reuse teacher B token');
assert.equal(localStorage.getItem('loginSessionId'),'session-a');
assert.equal(vault.currentOfflineUnlock(),aKey);
assert.equal((await unlockTeacherWithPin('654321',bKey)).id,'teacher-b');
assert.equal(vault.currentOfflineUnlock(),bKey);
assert.equal(listPreparedTeachers().length,2,'Switching teachers must preserve both PINs');

for(let i=0;i<5;i++)await assert.rejects(unlockTeacherWithPin('999999',aKey),/Incorrect PIN|locked for 15 minutes/);
await assert.rejects(unlockTeacherWithPin('123456',aKey),/Too many attempts/);
assert.equal((await unlockTeacherWithPin('654321',bKey)).id,'teacher-b',
  'Teacher A lockout must not affect teacher B');
window.location.hostname='other.schoolapp.so';
assert.equal(listPreparedTeachers().length,0,'Never list another tenant hostname accounts');
await assert.rejects(unlockTeacherWithPin('654321',bKey),/no valid offline PIN|Choose/);
window.location.hostname='balcad.schoolapp.so';
navigator.onLine=true;
identity={...identity,expiresAt:Date.now()+14*86400000,maxOfflineDays:14,verifiedAt:Date.now()};
vault.rememberVerifiedTeacher(identity);
assert.equal(listPreparedTeachers().length,2);
assert.equal((await unlockTeacherWithPin('654321',bKey)).id,'teacher-b','New verified policy extends only selected account');

clearOfflinePin();
assert.equal(listPreparedTeachers().length,1,'Disabling current PIN must preserve other teacher');
assert.equal(listPreparedTeachers()[0].email,'teacher-a@balcad.com');
console.log('PASS: shared-device PIN selection, account isolation, no bearer-token reuse, lockout, tenant boundary and expiry');
