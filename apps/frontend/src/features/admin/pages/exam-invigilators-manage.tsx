import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';
import { ExamWorkspaceTabs } from '../components/exam-workspace-tabs';

type Period = {
  _id: string;
  name: string;
  academicYear: string;
  status?: string;
};

type Teacher = {
  _id: string;
  teacherId?: string;
  profile?: { firstName?: string; lastName?: string };
  user?: { email?: string };
};

type Assignment = {
  _id: string;
  teacher?: {
    _id: string;
    teacherId?: string;
    name?: string;
    email?: string;
  } | null;
};

type RoomRow = {
  _id: string;
  name: string;
  building?: string;
  capacity: number;
  students: number;
  assignment?: Assignment | null;
};

type Session = {
  key: string;
  examDate: string;
  startTime: string;
  endTime: string;
  exams: Array<{ _id: string; subject: string; className: string }>;
  rooms: RoomRow[];
};

type Context = {
  period: Period;
  examType: 'mid' | 'final';
  sessions: Session[];
};

const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const input = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

const teacherName = (teacher: Teacher) =>
  [teacher.profile?.firstName, teacher.profile?.lastName].filter(Boolean).join(' ').trim()
  || teacher.user?.email
  || teacher.teacherId
  || 'Teacher';

const formatDay = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

export function ExamInvigilatorsManage() {
  const [periods,setPeriods]=useState<Period[]>([]);
  const [teachers,setTeachers]=useState<Teacher[]>([]);
  const [periodId,setPeriodId]=useState('');
  const [context,setContext]=useState<Context|null>(null);
  const [activeSession,setActiveSession]=useState('');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [savingRoom,setSavingRoom]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const loadBase=async()=>{
    setLoading(true);setError('');
    try{
      const [periodRes,teacherRes]=await Promise.all([
        api.get('/exams/periods'),
        api.get('/teachers',{params:{status:'active',limit:500}}),
      ]);
      const nextPeriods=periodRes.data?.data||[];
      setPeriods(nextPeriods);
      setTeachers(teacherRes.data?.data||[]);
      setPeriodId(prev=>prev||nextPeriods[0]?._id||'');
    }catch(err:any){
      setError(err.response?.data?.message||'Could not load exams and teachers.');
    }finally{
      setLoading(false);
    }
  };

  const loadContext=async(id=periodId)=>{
    if(!id){setContext(null);return}
    setError('');
    try{
      const r=await api.get('/exams/invigilators/context',{params:{periodId:id}});
      const next=r.data?.data||null;
      setContext(next);
      setActiveSession(prev=>next?.sessions?.some((s:Session)=>s.key===prev)?prev:next?.sessions?.[0]?.key||'');
    }catch(err:any){
      setContext(null);
      setError(err.response?.data?.message||'Could not load invigilation rooms.');
    }
  };

  useEffect(()=>{void loadBase()},[]);
  useEffect(()=>{if(periodId)void loadContext(periodId)},[periodId]);

  const session=context?.sessions.find(s=>s.key===activeSession)||null;
  const assignedTeacherBySession=useMemo(()=>{
    const map=new Map<string,Set<string>>();
    for(const s of context?.sessions||[]){
      const ids=new Set<string>();
      s.rooms.forEach(r=>{const id=r.assignment?.teacher?._id;if(id)ids.add(id)});
      map.set(s.key,ids);
    }
    return map;
  },[context]);

  const filteredRooms=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!session)return[];
    if(!q)return session.rooms;
    return session.rooms.filter(room=>{
      const teacher=room.assignment?.teacher;
      return `${room.name} ${room.building||''} ${teacher?.name||''} ${teacher?.teacherId||''}`.toLowerCase().includes(q);
    });
  },[session,query]);

  const totals=useMemo(()=>{
    const sessions=context?.sessions||[];
    const rooms=sessions.flatMap(s=>s.rooms);
    const assigned=rooms.filter(r=>r.assignment?.teacher?._id).length;
    return {rooms:rooms.length,assigned,missing:Math.max(rooms.length-assigned,0)};
  },[context]);

  const assign=async(room:RoomRow,teacherId:string)=>{
    if(!session||!context)return;
    setSavingRoom(room._id);setError('');setMessage('');
    try{
      if(!teacherId){
        if(room.assignment?._id){
          await api.delete(`/exams/invigilators/${room.assignment._id}`);
          setMessage(`Invigilator removed from ${room.name}.`);
        }
      }else{
        const r=await api.post('/exams/invigilators',{
          periodId:context.period._id,
          examDate:session.examDate,
          startTime:session.startTime,
          endTime:session.endTime,
          roomId:room._id,
          teacherId,
        });
        setMessage(r.data?.message||`Invigilator assigned to ${room.name}.`);
      }
      await loadContext(context.period._id);
    }catch(err:any){
      setError(err.response?.data?.message||'Could not assign invigilator.');
    }finally{
      setSavingRoom('');
    }
  };

  if(loading)return <div className="p-20 text-center">Loading...</div>;

  return <div className="p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <BackButton fallback="/admin/exams"/>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Assign Invigilators</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Assign one teacher to each exam room and session. The teacher automatically receives that room's mixed-grade student list for attendance.</p>
        </div>
        <button type="button" onClick={()=>void loadContext()} disabled={!periodId} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16}/>Refresh</button>
      </div>

      <ExamWorkspaceTabs />

      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
      {message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}

      <div className={`${card} p-5`}>
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">Exam</span>
            <select className={input} value={periodId} onChange={e=>setPeriodId(e.target.value)}>
              <option value="">Select exam...</option>
              {periods.map(period=><option key={period._id} value={period._id}>{period.name} · {period.academicYear}</option>)}
            </select>
          </label>
          <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
            <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">Assignment Progress</p>
            <p className="mt-1 text-xl font-bold">{totals.assigned}/{totals.rooms}</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">{totals.missing} room session{totals.missing===1?'':'s'} missing invigilator</p>
          </div>
        </div>
      </div>

      {context&&context.sessions.length>0&&<>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {context.sessions.map((s,index)=><button
            key={s.key}
            type="button"
            onClick={()=>setActiveSession(s.key)}
            className={`min-w-[170px] rounded-2xl border px-4 py-3 text-left transition ${activeSession===s.key?'border-primary-500 bg-primary-50 dark:bg-primary-950/20':'bg-[var(--color-surface-primary)]'}`}
          >
            <p className="text-xs font-bold text-primary-600">Session {index+1}</p>
            <p className="mt-1 text-sm font-bold">{formatDay(s.examDate)}</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{s.startTime}–{s.endTime} · {s.rooms.length} rooms</p>
          </button>)}
        </div>

        {session&&<div className="space-y-4">
          <div className={`${card} p-4`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700 dark:bg-primary-950/30 dark:text-primary-300"><CalendarDays size={13}/>{formatDay(session.examDate)}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-xs font-bold"><Clock3 size={13}/>{session.startTime}–{session.endTime}</span>
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{session.exams.map(e=>`${e.className}: ${e.subject}`).join(' · ')}</p>
              </div>
              <div className="relative w-full lg:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/><input className={`${input} pl-9`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search room or teacher..."/></div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredRooms.map(room=>{
              const currentTeacher=room.assignment?.teacher;
              const usedThisSession=assignedTeacherBySession.get(session.key)||new Set<string>();
              return <div key={room._id} className={`${card} p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-primary-50 p-2.5 text-primary-600 dark:bg-primary-950/30"><DoorOpen size={20}/></div>
                    <div><h2 className="font-bold">{room.name}</h2><p className="text-xs text-[var(--color-text-tertiary)]">{room.building||'Main Campus'}</p></div>
                  </div>
                  {currentTeacher?<CheckCircle2 size={20} className="text-emerald-600"/>:<AlertCircle size={20} className="text-amber-500"/>}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Students</p><p className="mt-1 text-xl font-bold">{room.students}</p></div>
                  <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Capacity</p><p className="mt-1 text-xl font-bold">{room.capacity}</p></div>
                </div>

                <label className="mt-4 block space-y-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">Invigilator</span>
                  <select
                    className={input}
                    value={currentTeacher?._id||''}
                    disabled={savingRoom===room._id}
                    onChange={e=>void assign(room,e.target.value)}
                  >
                    <option value="">Not assigned</option>
                    {teachers.map(teacher=>{
                      const used=usedThisSession.has(teacher._id)&&teacher._id!==currentTeacher?._id;
                      return <option key={teacher._id} value={teacher._id} disabled={used}>{teacherName(teacher)}{teacher.teacherId?` · ${teacher.teacherId}`:''}{used?' · Already assigned':''}</option>;
                    })}
                  </select>
                </label>

                {currentTeacher&&<div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-emerald-800 dark:text-emerald-300">{currentTeacher.name}</p><p className="truncate text-xs text-emerald-700/70 dark:text-emerald-400">{currentTeacher.teacherId||currentTeacher.email||'Assigned'}</p></div>
                  <button type="button" onClick={()=>void assign(room,'')} disabled={savingRoom===room._id} className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" title="Remove invigilator"><Trash2 size={16}/></button>
                </div>}
              </div>;
            })}
          </div>
        </div>}
      </>}

      {context&&context.sessions.length===0&&<div className={`${card} p-12 text-center`}><ShieldCheck className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]"/><p className="mt-3 font-bold">No scheduled exam sessions found.</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Create the Exam Schedule first, then return here to assign invigilators.</p></div>}
      {!context&&periodId&&<div className={`${card} p-10 text-center text-sm text-[var(--color-text-tertiary)]`}><Users className="mx-auto mb-3 h-7 w-7"/>Loading room sessions...</div>}
    </div>
  </div>;
}

export default ExamInvigilatorsManage;
