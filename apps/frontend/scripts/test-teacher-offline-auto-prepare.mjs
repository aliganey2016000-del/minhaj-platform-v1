import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const src=fs.readFileSync(new URL('../src/lib/teacher-offline-auto-prepare.ts',import.meta.url),'utf8');
const code=ts.transpileModule(src,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const saved=new Map([['accessToken','online-token']]);
const localStorage={
  getItem:key=>saved.get(key)||null,
  setItem:(key,val)=>saved.set(key,String(val)),
};
const navigator={onLine:true};
const events=[];
const window={dispatchEvent:event=>events.push(event)};
const CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
const storedDates=[],rosters=[],teaching=[],rights=[];
let requests=0,shells=0;
const now=new Date();
const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
const owner='balcad.schoolapp.so:school-a:teacher-a:session-a';
const api={async get(url,options){
  requests++;
  if(url==='/sidebar-settings/mine')
    return {data:{data:{items:[{key:'teacher/attendance',visible:true},{key:'teacher/schedule',visible:true}]}}};
  if(url==='/class-schedules/my-teaching')return {data:{data:[{_id:'schedule-1',dayOfWeek:1}]}};
  if(url==='/class-schedules/school/period-settings')return {data:{data:{periods:[]}}};
  if(url==='/attendance/school/sessions')
    return {data:{data:{sessions:[{_id:'schedule-1'}],calendarDay:null}}};
  if(url==='/attendance/school/session/schedule-1')return {data:{data:{schedule:{_id:'schedule-1'},date:options.params.date}}};
  throw Error('Unexpected API request '+url);
}};
const context={
  exports:{},Date,Promise,localStorage,navigator,window,CustomEvent,
  require(path){
    if(path==='./axios')return api;
    if(path==='./teacher-offline-attendance')return {
      offlineAttendanceOwner:()=>owner,
      getOfflineAttendanceAccessWindow:()=>({maxOfflineDays:7}),
      prepareTeacherOfflineAppShell:async()=>{shells++;},
      cacheAttendanceSessions:async(_owner,date,value)=>storedDates.push({date,value}),
      cacheAttendanceRoster:async(_owner,date,id,value)=>rosters.push({date,id,value}),
      cacheOfflineTeachingSchedule:async(_owner,value)=>teaching.push(value),
      cacheOfflineTeacherSidebar:async(_owner,value)=>rights.push(value),
    };
    if(path.startsWith('../features/teacher/pages/'))return {};
    throw Error(path);
  },
};
vm.runInNewContext(code,context);
const {prepareTeacherOfflineAutomatically,readAutoOfflineStatus}=context.exports;
const user={id:'teacher-a',role:'teacher',organizationId:'school-a'};
await prepareTeacherOfflineAutomatically(user);
assert.equal(shells,1,'PWA shell must be downloaded automatically');
assert.equal(storedDates.length,7,'Seven consecutive local dates must be prepared');
assert.equal(storedDates[0].date,today);
assert.equal(rosters.length,7,'Each permitted date must have its roster');
assert.equal(teaching.length,1,'My Teaching Schedule must be cached');
assert.equal(rights.length,1,'Teacher sidebar permissions must be cached');
assert.equal(readAutoOfflineStatus(owner).state,'ready');
assert.equal(readAutoOfflineStatus(owner).rosters,7);
assert.equal(events.at(-1).type,'sahal-offline-preparation');
const before=requests;
await prepareTeacherOfflineAutomatically(user);
assert.equal(requests,before,'Successful same-day preparation must not redownload everything');
console.log('PASS: teacher automatic preparation caches 7 days, schedules, permissions and PWA shell without button');
