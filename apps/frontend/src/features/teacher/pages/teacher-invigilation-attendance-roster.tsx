import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  Save,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { TeacherExamWorkflowNav } from '../components/teacher-exam-workflow-nav';

type Status = 'present' | 'absent';

type Student = {
  _id: string;
  studentId: string;
  profile?: { firstName?: string; lastName?: string };
  class?: { title?: string; section?: string };
};

type RosterRow = {
  student: Student;
  exam: {
    _id: string;
    title: string;
    course?: { title?: { en?: string } } | null;
  };
  attendance?: { status?: string; notes?: string } | null;
};

type Assignment = {
  _id: string;
  examDate: string;
  startTime: string;
  endTime: string;
  teacherName?: string;
  room?: { name?: string; building?: string; capacity?: number };
  period?: { name?: string; academicYear?: string };
};

const nameOf=(student:Student)=>[student.profile?.firstName,student.profile?.lastName].filter(Boolean).join(' ').trim()||student.studentId;
const classOf=(student:Student)=>[student.class?.title,student.class?.section].filter(Boolean).join(' ')||'—';

export function TeacherInvigilationAttendanceRoster(){
  const { assignmentId }=useParams<{assignmentId:string}>();
  const navigate=useNavigate();
  const [assignment,setAssignment]=useState<Assignment|null>(null);
  const [rows,setRows]=useState<RosterRow[]>([]);
  const [statuses,setStatuses]=useState<Record<string,Status|undefined>>({});
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const load=async()=>{
    if(!assignmentId)return;
    setLoading(true);setError('');
    try{
      const {data}=await api.get(`/exams/invigilators/${assignmentId}/roster`);
      const payload=data.data||{};
      const nextRows:RosterRow[]=payload.roster||[];
      setAssignment(payload.assignment||null);
      setRows(nextRows);
      const nextStatuses:Record<string,Status|undefined>={};
      const nextNotes:Record<string,string>={};
      nextRows.forEach(row=>{
        const previous=row.attendance?.status;
        nextStatuses[row.student._id]=previous==='present'?'present':previous?'absent':undefined;
        nextNotes[row.student._id]=row.attendance?.notes||'';
      });
      setStatuses(nextStatuses);
      setNotes(nextNotes);
    }catch(err:any){
      setError(err.response?.data?.message||'Failed to load room attendance list.');
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{void load()},[assignmentId]);

  const counts=useMemo(()=>({
    present:Object.values(statuses).filter(v=>v==='present').length,
    absent:Object.values(statuses).filter(v=>v==='absent').length,
    marked:Object.values(statuses).filter(Boolean).length,
  }),[statuses]);

  const visibleRows=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return rows;
    return rows.filter(row=>`${nameOf(row.student)} ${row.student.studentId} ${classOf(row.student)} ${row.exam.course?.title?.en||row.exam.title}`.toLowerCase().includes(q));
  },[rows,query]);

  const setAll=(status:Status)=>{
    setStatuses(prev=>{
      const next={...prev};
      rows.forEach(row=>{next[row.student._id]=status});
      return next;
    });
  };

  const save=async()=>{
    if(!assignmentId)return;
    const records=rows
      .filter(row=>statuses[row.student._id])
      .map(row=>({
        student:row.student._id,
        status:statuses[row.student._id],
        notes:notes[row.student._id]||'',
      }));
    if(!records.length){setError('Mark at least one student before saving.');return}
    setSaving(true);setError('');setMessage('');
    try{
      const {data}=await api.post(`/exams/invigilators/${assignmentId}/attendance`,{records});
      setMessage(data.message||`Attendance saved for ${records.length} students.`);
      await load();
    }catch(err:any){
      setError(err.response?.data?.message||'Failed to save room attendance.');
    }finally{
      setSaving(false);
    }
  };

  if(loading)return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600"/></div>;

  const unmarked=Math.max(0,rows.length-counts.marked);

  return <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pb-24 pt-16 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
      <TeacherExamWorkflowNav />

      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-5">
        <button onClick={()=>navigate('/teacher/exam-attendance')} className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-emerald-600"><ArrowLeft size={16}/>Invigilation Duties</button>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Assigned Exam Room</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">{assignment?.room?.name||'Exam Room'}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{assignment?.period?.name||'Exam'} · {assignment?.period?.academicYear||''}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-text-tertiary)]">
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={14}/>{assignment?.examDate?new Date(assignment.examDate).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'}):'—'}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 size={14}/>{assignment?.startTime||'—'}–{assignment?.endTime||'—'}</span>
              <span className="inline-flex items-center gap-1.5"><Building2 size={14}/>{assignment?.room?.building||'Main Campus'}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[440px]">
            <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Students</p><p className="mt-1 text-xl font-black">{rows.length}</p></div>
            <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/20"><p className="text-[10px] font-bold uppercase text-emerald-700">Present</p><p className="mt-1 text-xl font-black text-emerald-700">{counts.present}</p></div>
            <div className="rounded-xl bg-red-50 p-3 dark:bg-red-950/20"><p className="text-[10px] font-bold uppercase text-red-700">Absent</p><p className="mt-1 text-xl font-black text-red-700">{counts.absent}</p></div>
            <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/20"><p className="text-[10px] font-bold uppercase text-amber-700">Unmarked</p><p className="mt-1 text-xl font-black text-amber-700">{unmarked}</p></div>
          </div>
        </div>
      </div>

      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
      {message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}

      <div className="sticky top-2 z-20 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 p-3 shadow-lg backdrop-blur sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={()=>setAll('present')} className="min-h-10 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Mark All Present</button>
            <button type="button" onClick={()=>setAll('absent')} className="min-h-10 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white">Mark All Absent</button>
          </div>
          <div className="relative min-w-0 lg:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search student, ID, class..." className="min-h-10 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2 pl-9 pr-3 text-sm"/>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {visibleRows.length===0
          ?<div className="lg:col-span-2 rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">No students match this search.</div>
          :visibleRows.map((row)=>{
            const index=rows.findIndex(item=>item.student._id===row.student._id);
            const id=row.student._id;
            const current=statuses[id];
            return <article key={id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-sm sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{index+1}</div>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-black">{nameOf(row.student)}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{row.student.studentId} · {classOf(row.student)}</p>
                  <p className="mt-1 truncate text-xs font-bold text-primary-600">{row.exam.course?.title?.en||row.exam.title}</p>
                </div>
                {current&&<span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${current==='present'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}`}>{current}</span>}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={()=>setStatuses(p=>({...p,[id]:'present'}))} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-bold ${current==='present'?'border-emerald-600 bg-emerald-600 text-white':'border-[var(--color-border-default)] hover:border-emerald-400'}`}><Check size={16}/>Present</button>
                <button type="button" onClick={()=>setStatuses(p=>({...p,[id]:'absent'}))} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-bold ${current==='absent'?'border-red-600 bg-red-600 text-white':'border-[var(--color-border-default)] hover:border-red-400'}`}><XCircle size={16}/>Absent</button>
              </div>

              {current==='absent'&&<input value={notes[id]||''} onChange={e=>setNotes(p=>({...p,[id]:e.target.value}))} placeholder="Excuse / reason (optional)" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm"/>}
            </article>;
          })}
      </div>

      <button type="button" onClick={()=>void save()} disabled={saving||rows.length===0} className="fixed bottom-4 left-1/2 z-30 inline-flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-xl disabled:opacity-60 sm:static sm:w-full sm:translate-x-0 sm:justify-center sm:rounded-xl"><Save size={17}/>{saving?'Saving...':unmarked>0?`Save Attendance · ${unmarked} unmarked`:'Save Complete Attendance'}</button>
    </div>
  </div>;
}

export default TeacherInvigilationAttendanceRoster;
