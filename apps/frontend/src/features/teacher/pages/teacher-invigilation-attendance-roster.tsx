import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, CalendarDays, Check, Clock3, Save, Users, XCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';

const STATUSES = ['present','absent','excused'] as const;
type Status = typeof STATUSES[number];

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
  attendance?: { status?: Status; notes?: string } | null;
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
        nextStatuses[row.student._id]=row.attendance?.status as Status|undefined;
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
    excused:Object.values(statuses).filter(v=>v==='excused').length,
    marked:Object.values(statuses).filter(Boolean).length,
  }),[statuses]);

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

  return <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-16 sm:p-6 sm:pt-20 lg:p-10 lg:pt-10">
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
        <button onClick={()=>navigate('/teacher/exam-attendance')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-tertiary)] hover:text-emerald-600"><ArrowLeft size={16}/>Exam Attendance</button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Invigilation Room</p>
            <h1 className="mt-1 text-2xl font-bold">{assignment?.room?.name||'Exam Room'}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{assignment?.period?.name||'Exam'} · {assignment?.period?.academicYear||''}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--color-text-tertiary)]">
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={14}/>{assignment?.examDate?new Date(assignment.examDate).toLocaleDateString():'—'}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 size={14}/>{assignment?.startTime||'—'}–{assignment?.endTime||'—'}</span>
              <span className="inline-flex items-center gap-1.5"><Building2 size={14}/>{assignment?.room?.building||'Main Campus'}</span>
            </div>
          </div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"><Users className="mr-1.5 inline h-4 w-4"/>{rows.length} students</div>
        </div>
      </div>

      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
      {message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}

      <div className="sticky top-2 z-10 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={()=>setAll('present')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Mark All Present</button>
            <button type="button" onClick={()=>setAll('absent')} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white">Mark All Absent</button>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold">
            <span className="text-emerald-600">Present {counts.present}</span>
            <span className="text-red-600">Absent {counts.absent}</span>
            <span className="text-blue-600">Excused {counts.excused}</span>
            <span>{counts.marked}/{rows.length} marked</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
        {rows.length===0
          ?<div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">No students are assigned to this room for this exam session.</div>
          :rows.map((row,index)=>{
            const id=row.student._id;
            const current=statuses[id];
            return <div key={id} className="border-b border-[var(--color-border-subtle)] p-4 last:border-0 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{index+1}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{nameOf(row.student)}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{row.student.studentId} · {classOf(row.student)}</p>
                  <p className="mt-1 text-xs font-semibold text-primary-600">{row.exam.course?.title?.en||row.exam.title}</p>
                </div>
                {current&&<span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${current==='present'?'bg-emerald-100 text-emerald-700':current==='absent'?'bg-red-100 text-red-700':'bg-blue-100 text-blue-700'}`}>{current}</span>}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button type="button" onClick={()=>setStatuses(p=>({...p,[id]:'present'}))} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold ${current==='present'?'border-emerald-600 bg-emerald-600 text-white':'border-[var(--color-border-default)]'}`}><Check size={14}/>Present</button>
                <button type="button" onClick={()=>setStatuses(p=>({...p,[id]:'absent'}))} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold ${current==='absent'?'border-red-600 bg-red-600 text-white':'border-[var(--color-border-default)]'}`}><XCircle size={14}/>Absent</button>
                <button type="button" onClick={()=>setStatuses(p=>({...p,[id]:'excused'}))} className={`rounded-xl border px-2 py-2.5 text-xs font-bold ${current==='excused'?'border-blue-600 bg-blue-600 text-white':'border-[var(--color-border-default)]'}`}>Excused</button>
              </div>

              {(current==='absent'||current==='excused')&&<input value={notes[id]||''} onChange={e=>setNotes(p=>({...p,[id]:e.target.value}))} placeholder={current==='excused'?'Excuse / reason...':'Optional absence note...'} className="mt-2 w-full rounded-lg border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-xs"/>}
            </div>;
          })}
      </div>

      <button type="button" onClick={()=>void save()} disabled={saving||rows.length===0} className="fixed bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl disabled:opacity-60 sm:static sm:w-full sm:justify-center sm:rounded-xl"><Save size={16}/>{saving?'Saving...':'Save Room Attendance'}</button>
    </div>
  </div>;
}

export default TeacherInvigilationAttendanceRoster;
