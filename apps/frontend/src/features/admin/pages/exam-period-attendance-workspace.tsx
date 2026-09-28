import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarDays, CheckCircle2, ChevronRight, Clock3, DoorOpen, Search, UserCheck, Users, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';
import { ExamWorkspaceTabs } from '../components/exam-workspace-tabs';

type Room={
  _id:string;
  name:string;
  students:number;
  markedStudents?:number;
  classBreakdown?:Array<{classId:string;className:string;subject:string;students:number}>;
  assignment?:{_id:string;teacher?:{name?:string}|null}|null;
};
type Session={key:string;examDate:string;startTime:string;endTime:string;rooms:Room[]};
type Context={period:{name:string;academicYear:string};sessions:Session[]};
type Roster={student:{_id:string;studentId:string;profile?:{firstName?:string;lastName?:string};class?:{title?:string;section?:string}|null};attendance?:{status?:string}|null};
type Item={id:string;session:Session;room:Room;start:Date;end:Date};
type Tab='upcoming'|'active'|'completed';

const card='rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const dt=(d:string,t:string)=>new Date(d+'T'+t+':00');
const day=(d:string)=>new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
const name=(r:Roster)=>[r.student.profile?.firstName,r.student.profile?.lastName].filter(Boolean).join(' ')||r.student.studentId;
const cls=(r:Roster)=>[r.student.class?.title,r.student.class?.section].filter(Boolean).join(' ')||'—';

export function ExamPeriodAttendanceWorkspace(){
  const [sp]=useSearchParams();
  const periodId=sp.get('periodId')||'';
  const subtitle=[sp.get('examName'),sp.get('academicYear'),sp.get('startDate')&&sp.get('endDate')?sp.get('startDate')+' – '+sp.get('endDate'):null].filter(Boolean).join(' · ');
  const [ctx,setCtx]=useState<Context|null>(null);
  const [tab,setTab]=useState<Tab>('active');
  const [now,setNow]=useState(new Date());
  const [selected,setSelected]=useState<Item|null>(null);
  const [roster,setRoster]=useState<Roster[]>([]);
  const [marks,setMarks]=useState<Record<string,'present'|'absent'|''>>({});
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [submitted,setSubmitted]=useState<Record<string,boolean>>({});

  const load=async()=>{
    if(!periodId)return;
    try{
      const r=await api.get('/exams/invigilators/context',{params:{periodId}});
      setCtx(r.data?.data||null);
    }catch(e:any){setError(e.response?.data?.message||'Could not load attendance sessions.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[periodId]);
  useEffect(()=>{const a=window.setInterval(()=>setNow(new Date()),15000);const b=window.setInterval(()=>void load(),60000);return()=>{clearInterval(a);clearInterval(b)}},[periodId]);

  const items=useMemo<Item[]>(()=>ctx?.sessions.flatMap(s=>s.rooms.map(room=>({id:s.key+'::'+room._id,session:s,room,start:dt(s.examDate,s.startTime),end:dt(s.examDate,s.endTime)})))||[],[ctx]);
  const state=(i:Item):Tab=>now<i.start?'upcoming':now<=i.end?'active':'completed';
  const groups=useMemo(()=>({upcoming:items.filter(i=>state(i)==='upcoming'),active:items.filter(i=>state(i)==='active'),completed:items.filter(i=>state(i)==='completed')}),[items,now]);

  const shiftNumber=(session:Session)=>{
    const shifts=Array.from(new Set(
      (ctx?.sessions||[])
        .filter(item=>item.examDate===session.examDate)
        .map(item=>item.startTime+'::'+item.endTime)
    )).sort();
    return Math.max(1,shifts.indexOf(session.startTime+'::'+session.endTime)+1);
  };

  useEffect(()=>{if(groups.active.length)setTab('active');else if(groups.upcoming.length)setTab('upcoming');else setTab('completed')},[ctx]);

  const open=async(i:Item)=>{
    if(state(i)==='upcoming')return;
    if(!i.room.assignment?._id){setError('Assign an invigilator to '+i.room.name+' first.');return}
    setSelected(i);setBusy(true);setError('');setMessage('');
    try{
      const r=await api.get('/exams/invigilators/'+i.room.assignment._id+'/roster');
      const rows:Roster[]=r.data?.data?.roster||[];
      setRoster(rows);
      const next:Record<string,'present'|'absent'|''>={};
      rows.forEach(x=>next[x.student._id]=x.attendance?.status==='present'?'present':x.attendance?.status==='absent'?'absent':'');
      setMarks(next);
      setSubmitted(p=>({...p,[i.room.assignment!._id]:rows.length>0&&rows.every(x=>Boolean(x.attendance?.status))}));
    }catch(e:any){setError(e.response?.data?.message||'Could not load room roster.')}
    finally{setBusy(false)}
  };
  const markAll=(s:'present'|'absent')=>setMarks(Object.fromEntries(roster.map(r=>[r.student._id,s])));
  const save=async()=>{
    if(!selected?.room.assignment?._id)return;
    const unmarked=roster.filter(r=>!marks[r.student._id]);
    if(unmarked.length){setError(unmarked.length+' student(s) are still unmarked.');return}
    setBusy(true);setError('');
    try{
      await api.post('/exams/invigilators/'+selected.room.assignment._id+'/attendance',{records:roster.map(r=>({student:r.student._id,status:marks[r.student._id],notes:''}))});
      setSubmitted(p=>({...p,[selected.room.assignment!._id]:true}));
      setMessage('Attendance submitted successfully.');
      await load();
    }catch(e:any){setError(e.response?.data?.message||'Could not submit attendance.')}
    finally{setBusy(false)}
  };
  const shown=roster.filter(r=>{const q=query.toLowerCase().trim();return!q||name(r).toLowerCase().includes(q)||r.student.studentId.toLowerCase().includes(q)||cls(r).toLowerCase().includes(q)});
  const marked=roster.filter(r=>marks[r.student._id]).length;
  const fallback='/admin/exams/schedule?'+sp.toString();

  return <div className="p-4 pt-5 sm:p-6 lg:p-8"><div className="mx-auto max-w-screen-2xl space-y-5">
    <BackButton fallback={fallback}/>
    <div><h1 className="text-3xl font-bold">Attendance</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{subtitle}</p></div>
    <ExamWorkspaceTabs/>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
    <div className="grid grid-cols-3 gap-2 rounded-2xl border bg-[var(--color-surface-primary)] p-2">
      {([['upcoming','Upcoming',CalendarDays],['active','Active',Clock3],['completed','Completed',CheckCircle2]] as const).map(([k,l,I])=><button key={k} onClick={()=>{setTab(k);setSelected(null)}} className={'rounded-xl p-3 text-sm font-bold '+(tab===k?'bg-primary-600 text-white':'text-[var(--color-text-secondary)]')}><I size={16} className="mx-auto mb-1"/>{l}<span className="ml-1 text-xs">({groups[k].length})</span></button>)}
    </div>
    <div className={selected?'grid gap-5 xl:grid-cols-[380px_1fr]':''}>
      <div className={selected?'space-y-3':'grid gap-4 md:grid-cols-2 xl:grid-cols-3'}>
        {loading?<div className={card+' p-10 text-center md:col-span-2 xl:col-span-3'}>Loading…</div>:groups[tab].map(i=>{
          const assignmentId=i.room.assignment?._id;
          const done=Boolean(
            assignmentId
            && (
              submitted[assignmentId]
              || (i.room.students>0&&(i.room.markedStudents||0)===i.room.students)
            )
          );
          const status=state(i);
          const classes=i.room.classBreakdown||[];
          return <div key={i.id} className={card+' overflow-hidden'}>
            <button
              type="button"
              disabled={status==='upcoming'}
              onClick={()=>void open(i)}
              className="w-full p-4 text-left disabled:cursor-default sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]">
                  <CalendarDays size={17} className="text-primary-600"/>
                  {day(i.session.examDate)}
                </div>
                {status==='active'&&<span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">● In Progress</span>}
                {status==='upcoming'&&<span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold text-blue-700">Upcoming</span>}
                {status==='completed'&&<span className={'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold '+(done?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700')}>{done?'✓ Submitted':'Missed'}</span>}
              </div>

              <div className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)]">
                <p className="flex items-center gap-2"><Clock3 size={16} className="shrink-0 text-[var(--color-text-tertiary)]"/><span><b className="text-[var(--color-text-primary)]">Shift {shiftNumber(i.session)}</b> · {i.session.startTime}–{i.session.endTime}</span></p>
                <p className="flex items-center gap-2"><DoorOpen size={16} className="shrink-0 text-[var(--color-text-tertiary)]"/><span>{i.room.name}</span></p>
                <p className="flex items-center gap-2"><UserCheck size={16} className="shrink-0 text-[var(--color-text-tertiary)]"/><span>Invigilator: <b className="font-semibold text-[var(--color-text-primary)]">{i.room.assignment?.teacher?.name||'Not assigned'}</b></span></p>
                <p className="flex items-center gap-2"><Users size={16} className="shrink-0 text-[var(--color-text-tertiary)]"/><span>Total: <b className="text-[var(--color-text-primary)]">{i.room.students} students</b></span></p>
              </div>

              <div className="mt-4 border-t border-[var(--color-border-default)] pt-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Classes / Subjects</p>
                <div className="space-y-1.5">
                  {classes.length?classes.map(row=><div key={row.classId} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-xs sm:text-sm">
                    <span className="flex min-w-0 items-center gap-2"><BookOpen size={14} className="shrink-0 text-[var(--color-text-tertiary)]"/><span className="truncate font-semibold">{row.subject} {row.className}</span></span>
                    <span className="shrink-0 font-bold text-[var(--color-text-secondary)]">{row.students} students</span>
                  </div>):<p className="rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-xs text-[var(--color-text-tertiary)]">No class breakdown available.</p>}
                </div>
              </div>
            </button>

            {status!=='upcoming'&&<button
              type="button"
              onClick={()=>void open(i)}
              className={'flex w-full items-center justify-center gap-2 border-t px-4 py-3 text-sm font-bold '+(status==='active'?'bg-primary-600 text-white':'text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/20')}
            >
              {status==='active'?'Open Attendance':'Review Attendance'} <ChevronRight size={16}/>
            </button>}
          </div>
        })}
        {!loading&&!groups[tab].length&&<div className={card+' p-10 text-center text-sm text-[var(--color-text-tertiary)] md:col-span-2 xl:col-span-3'}>No {tab} room sessions.</div>}
      </div>
      {selected&&<div className={card+' overflow-hidden'}>
        <div className="border-b p-4"><h2 className="text-xl font-bold">{selected.room.name} Attendance</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{day(selected.session.examDate)} · {selected.session.startTime}–{selected.session.endTime}</p></div>
        <div className="grid grid-cols-3 gap-2 border-b p-4"><div className="rounded-xl bg-slate-50 p-3 text-center"><b>{marked}</b><p className="text-xs">Marked</p></div><div className="rounded-xl bg-emerald-50 p-3 text-center text-emerald-700"><b>{roster.filter(r=>marks[r.student._id]==='present').length}</b><p className="text-xs">Present</p></div><div className="rounded-xl bg-red-50 p-3 text-center text-red-700"><b>{roster.filter(r=>marks[r.student._id]==='absent').length}</b><p className="text-xs">Absent</p></div></div>
        <div className="grid gap-2 border-b p-4 sm:grid-cols-[auto_auto_1fr]"><button onClick={()=>markAll('present')} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">All Present</button><button onClick={()=>markAll('absent')} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600">All Absent</button><div className="relative"><Search size={16} className="absolute left-3 top-3"/><input value={query} onChange={e=>setQuery(e.target.value)} className="w-full rounded-xl border px-9 py-2 text-sm" placeholder="Search student…"/></div></div>
        <div className="divide-y">{busy?<div className="p-10 text-center">Loading…</div>:shown.map((r,n)=><div key={r.student._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><b>{n+1}. {name(r)}</b><p className="text-xs text-[var(--color-text-tertiary)]">{r.student.studentId} · {cls(r)}</p></div><div className="grid grid-cols-2 gap-2"><button onClick={()=>setMarks(p=>({...p,[r.student._id]:'present'}))} className={'rounded-xl border px-4 py-2 text-sm font-bold '+(marks[r.student._id]==='present'?'bg-emerald-600 text-white':'text-emerald-700')}>Present</button><button onClick={()=>setMarks(p=>({...p,[r.student._id]:'absent'}))} className={'rounded-xl border px-4 py-2 text-sm font-bold '+(marks[r.student._id]==='absent'?'bg-red-600 text-white':'text-red-700')}>Absent</button></div></div>)}</div>
        <div className="flex justify-end border-t p-4"><button disabled={busy||!roster.length||marked!==roster.length} onClick={()=>void save()} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"><CheckCircle2 size={16} className="mr-2 inline"/>Submit Attendance</button></div>
      </div>}
    </div>
  </div></div>
}
export default ExamPeriodAttendanceWorkspace;
