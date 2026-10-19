/**
 * Best-effort automatic offline preparation after a verified online login.
 * The teacher never has to visit Attendance or tap Prepare Offline.
 * Work is per teacher + school + session and refreshes when online.
 */
import api from './axios';
import {
  offlineAttendanceOwner, getOfflineAttendanceAccessWindow,
  cacheAttendanceSessions,cacheAttendanceRoster,
  cacheOfflineTeachingSchedule,cacheOfflineTeacherSidebar,
  prepareTeacherOfflineAppShell,
} from './teacher-offline-attendance';

const DAY=86400000;
const prefix='sahal-offline-auto-prep:';
let inFlight:Promise<void>|null=null;
function localISO(date:Date):string {
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export interface AutomaticOfflineStatus { state:'preparing'|'ready'|'error';preparedDays:number;rosters:number;detail?:string;at:number; }
function emit(owner:string,status:AutomaticOfflineStatus) {
  try{localStorage.setItem(prefix+owner,JSON.stringify(status));}catch{ /* storage full */ }
  window.dispatchEvent(new CustomEvent('sahal-offline-preparation',{detail:{owner,...status}}));
}
export function readAutoOfflineStatus(owner:string|null):AutomaticOfflineStatus|null{
  if(!owner)return null;
  try{return JSON.parse(localStorage.getItem(prefix+owner)||'null');}catch{return null;}
}
export async function prepareTeacherOfflineAutomatically(user:{id:string;role:string;organizationId?:string},force=false):Promise<void> {
  if(!navigator.onLine||user.role!=='teacher'||!localStorage.getItem('accessToken'))return;
  const owner=offlineAttendanceOwner(user);
  if(!owner)return;
  const previous=readAutoOfflineStatus(owner);
  const today=localISO(new Date());
  if(!force&&previous?.state==='ready'&&previous.detail===today&&Date.now()-previous.at<12*60*60_000)return;
  if(inFlight)return inFlight;
  const grant=getOfflineAttendanceAccessWindow();
  if(!grant)return;
  const token=localStorage.getItem('accessToken');
  const valid=()=>navigator.onLine&&offlineAttendanceOwner(user)===owner&&
    localStorage.getItem('accessToken')===token;
  inFlight=(async()=>{
    let preparedDays=0,rosters=0;
    emit(owner,{state:'preparing',preparedDays,rosters,at:Date.now()});
    try{
      await prepareTeacherOfflineAppShell();
      await Promise.all([
        import('../features/teacher/pages/teacher-school-attendance'),
        import('../features/teacher/pages/teacher-school-attendance-roster'),
        import('../features/teacher/pages/teacher-schedule'),
      ]);
      if(!valid())return;
      const {data:rightsData}=await api.get('/sidebar-settings/mine',{params:{portal:'teacher'},timeout:15000});
      if(!valid())return;
      const rights:Record<string,boolean>={};
      for(const item of rightsData.data?.items||[])rights[item.key]=item.visible;
      if(rights['teacher/attendance']===false)throw new Error('Student Attendance disabled by school.');
      await cacheOfflineTeacherSidebar(owner,rights);
      const {data:lessonsData}=await api.get('/class-schedules/my-teaching',{timeout:15000});
      if(!valid())return;
      let periods=[];
      try{
        const settings=await api.get('/class-schedules/school/period-settings',{timeout:15000});
        periods=settings.data.data?.periods||[];
      }catch{ /* period labels optional */ }
      await cacheOfflineTeachingSchedule(owner,{
        schedules:Array.isArray(lessonsData.data)?lessonsData.data:[],periods,preparedAt:Date.now(),
      });
      const now=new Date();
      // Always have today's date plus the next six teaching dates prepared.
      // Empty days are cached so offline launch does not claim missing data.
      for(let i=0;i<7;i++){
        if(!valid())return;
        const date=new Date(now);date.setDate(now.getDate()+i);
        const target=localISO(date);
        try{
          const {data}=await api.get('/attendance/school/sessions',{params:{date:target},timeout:15000});
          if(!valid())return;
          const sessions=Array.isArray(data.data?.sessions)?data.data.sessions:[];
          await cacheAttendanceSessions(owner,target,{sessions,calendarDay:data.data?.calendarDay||null});
          for(const session of sessions){
            if(!valid())return;
            const {data:roster}=await api.get('/attendance/school/session/'+session._id,{
              params:{date:target},timeout:15000,
            });
            if(!valid())return;
            await cacheAttendanceRoster(owner,target,session._id,roster.data);
            rosters++;
          }
          preparedDays++;
          emit(owner,{state:'preparing',preparedDays,rosters,at:Date.now()});
        }catch(error){
          if(!navigator.onLine)throw error;
          // One unavailable future roster cannot break all already prepared days.
        }
      }
      if(!valid())return;
      if(!preparedDays)throw new Error('No attendance dates could be downloaded.');
      emit(owner,{state:'ready',preparedDays,rosters,detail:today,at:Date.now()});
    }catch(e:any){
      emit(owner,{state:'error',preparedDays,rosters,detail:e?.message||'Reconnect to finish automatic offline preparation.',at:Date.now()});
    }
  })().finally(()=>{inFlight=null});
  return inFlight;
}
