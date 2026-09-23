import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, RefreshCw, Search, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';

type Assignment = {
  _id: string;
  examDate: string;
  startTime: string;
  endTime: string;
  studentCount: number;
  markedCount: number;
  completed: boolean;
  room?: { _id: string; name: string; building?: string; capacity?: number };
  period?: { _id: string; name: string; academicYear: string; status?: string };
};

const formatDate = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export function TeacherExamAttendance() {
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const {data}=await api.get('/exams/invigilators/my');
      setAssignments(data.data||[]);
    }catch(err:any){
      setError(err.response?.data?.message||'Failed to load invigilation duties');
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{void load()},[]);

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return assignments;
    return assignments.filter(a=>`${a.period?.name||''} ${a.room?.name||''} ${a.room?.building||''} ${a.examDate}`.toLowerCase().includes(q));
  },[assignments,query]);

  const pending=assignments.filter(a=>!a.completed).length;

  return <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Invigilation Duties</p>
          <h1 className="mt-1 text-3xl font-bold">Exam Attendance</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Only rooms assigned to you appear here. Open a room to see its mixed-grade student list and take attendance.</p>
        </div>
        <button onClick={()=>void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>Refresh</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-[var(--color-surface-primary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Assigned Rooms</p><p className="mt-1 text-2xl font-bold">{assignments.length}</p></div>
        <div className="rounded-2xl border bg-[var(--color-surface-primary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Pending</p><p className="mt-1 text-2xl font-bold">{pending}</p></div>
        <div className="rounded-2xl border bg-[var(--color-surface-primary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Completed</p><p className="mt-1 text-2xl font-bold">{assignments.length-pending}</p></div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search room, exam or date..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-4 text-sm"/>
      </div>

      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}

      {loading
        ?<div className="flex min-h-[300px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600"/></div>
        :<div className="grid gap-4 sm:grid-cols-2">
          {visible.map(assignment=><Link
            key={assignment._id}
            to={`/teacher/exam-attendance/${assignment._id}`}
            className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/30"><ClipboardCheck className="h-6 w-6"/></div>
                <div>
                  <h2 className="font-bold">{assignment.room?.name||'Exam Room'}</h2>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{assignment.room?.building||'Main Campus'}</p>
                </div>
              </div>
              {assignment.completed?<CheckCircle2 className="h-5 w-5 text-emerald-600"/>:<span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700">Pending</span>}
            </div>

            <p className="mt-4 text-sm font-semibold">{assignment.period?.name||'Exam'}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-text-tertiary)]">
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={14}/>{formatDate(assignment.examDate)}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 size={14}/>{assignment.startTime}–{assignment.endTime}</span>
              <span className="inline-flex items-center gap-1.5"><Building2 size={14}/>{assignment.room?.name||'Room'}</span>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--color-surface-secondary)] p-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><Users size={14}/>{assignment.studentCount} students</span>
              <span className="text-xs font-bold text-emerald-600">{assignment.markedCount}/{assignment.studentCount} marked</span>
            </div>
          </Link>)}
          {visible.length===0&&<div className="sm:col-span-2 rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center">
            <UserCheckEmpty/>
          </div>}
        </div>}
    </div>
  </div>;
}

function UserCheckEmpty(){
  return <><Users className="mx-auto h-9 w-9 text-[var(--color-text-tertiary)]"/><p className="mt-3 font-bold">No invigilation rooms assigned.</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">When the exam administrator assigns you to a room, it will appear here automatically.</p></>;
}

export default TeacherExamAttendance;
