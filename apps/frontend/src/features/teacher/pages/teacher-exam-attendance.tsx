import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';
import { TeacherExamWorkflowNav } from '../components/teacher-exam-workflow-nav';

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

type ViewStatus = 'upcoming' | 'active' | 'completed';

const dateKey = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value.slice(0, 10) : d.toISOString().slice(0, 10);
};

const assignmentStatus = (assignment: Assignment): ViewStatus => {
  const day = dateKey(assignment.examDate);
  const start = new Date(`${day}T${assignment.startTime}:00`);
  const end = new Date(`${day}T${assignment.endTime}:00`);
  const now = new Date();
  if (now < start) return 'upcoming';
  if (now <= end) return 'active';
  return 'completed';
};

const formatDate = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const statusTone: Record<ViewStatus, string> = {
  upcoming: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  completed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function TeacherExamAttendance() {
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [query,setQuery]=useState('');
  const [view,setView]=useState<ViewStatus>('upcoming');
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

  const counts=useMemo(()=>({
    upcoming:assignments.filter(a=>assignmentStatus(a)==='upcoming').length,
    active:assignments.filter(a=>assignmentStatus(a)==='active').length,
    completed:assignments.filter(a=>assignmentStatus(a)==='completed').length,
  }),[assignments]);

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return assignments
      .filter(a=>assignmentStatus(a)===view)
      .filter(a=>!q||`${a.period?.name||''} ${a.room?.name||''} ${a.room?.building||''} ${a.examDate}`.toLowerCase().includes(q))
      .sort((a,b)=>{
        const direction=view==='completed'?-1:1;
        return direction*(new Date(a.examDate).getTime()-new Date(b.examDate).getTime())
          || direction*a.startTime.localeCompare(b.startTime);
      });
  },[assignments,query,view]);

  return <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-16 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
    <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Teacher Exam Operations</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">Invigilation & Attendance</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-tertiary)]">Your assigned exam rooms. During an active shift, open the room and mark the mixed-grade student roster.</p>
        </div>
        <button onClick={()=>void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold">
          <RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>Refresh
        </button>
      </div>

      <TeacherExamWorkflowNav />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {([
          ['upcoming','Upcoming',counts.upcoming],
          ['active','Active',counts.active],
          ['completed','Completed',counts.completed],
        ] as const).map(([key,label,count])=>(
          <button key={key} type="button" onClick={()=>setView(key)} className={`rounded-2xl border p-3 text-left transition sm:p-4 ${view===key?'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500/20 dark:bg-emerald-950/20':'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)] sm:text-xs">{label}</p>
            <p className="mt-1 text-xl font-black sm:text-2xl">{count}</p>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search room, exam or date..." className="min-h-11 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"/>
      </div>

      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}

      {loading
        ?<div className="flex min-h-[300px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600"/></div>
        :<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(assignment=>{
            const status=assignmentStatus(assignment);
            const marked=Math.min(assignment.markedCount||0,assignment.studentCount||0);
            const pct=assignment.studentCount?Math.round(marked/assignment.studentCount*100):0;
            const openLabel=status==='active'?'Open Room':status==='completed'?'Review Room':'View Duty';
            return <Link
              key={assignment._id}
              to={`/teacher/exam-attendance/${assignment._id}`}
              className="group overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400"
            >
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/30"><ClipboardCheck className="h-6 w-6"/></div>
                    <div className="min-w-0">
                      <h2 className="truncate font-black">{assignment.room?.name||'Exam Room'}</h2>
                      <p className="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)]">{assignment.room?.building||'Main Campus'}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusTone[status]}`}>{status}</span>
                </div>

                <p className="mt-4 truncate text-sm font-bold">{assignment.period?.name||'Exam'}</p>
                <div className="mt-2 space-y-1.5 text-xs text-[var(--color-text-tertiary)]">
                  <span className="flex items-center gap-1.5"><CalendarDays size={14}/>{formatDate(assignment.examDate)}</span>
                  <span className="flex items-center gap-1.5"><Clock3 size={14}/>{assignment.startTime}–{assignment.endTime}</span>
                  <span className="flex items-center gap-1.5"><Building2 size={14}/>{assignment.room?.name||'Room'}</span>
                </div>

                <div className="mt-4 rounded-xl bg-[var(--color-surface-secondary)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><Users size={14}/>{assignment.studentCount} students</span>
                    <span className="text-xs font-bold text-emerald-600">{marked}/{assignment.studentCount} marked</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-border-subtle)]"><div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.min(100,pct)}%`}}/></div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]/50 px-4 py-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 sm:px-5">
                <span>{openLabel}</span><ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5"/>
              </div>
            </Link>;
          })}
          {visible.length===0&&<div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center">
            <Users className="mx-auto h-9 w-9 text-[var(--color-text-tertiary)]"/>
            <p className="mt-3 font-bold">No {view} invigilation duties.</p>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{view==='upcoming'?'Rooms assigned to you for exam shifts whose start time has not arrived yet will appear here.':view==='active'?'Rooms assigned to you whose exam shift is currently in progress will appear here.':'Your assigned rooms whose exam shift has ended will appear here.'}</p>
          </div>}
        </div>}
    </div>
  </div>;
}

export default TeacherExamAttendance;
