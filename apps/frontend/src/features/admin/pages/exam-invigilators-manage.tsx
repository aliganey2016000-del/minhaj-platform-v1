import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  Search,
  UserCheck,
  UserX,
} from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';
import { ExamWorkspaceTabs } from '../components/exam-workspace-tabs';

type Period = {
  _id: string;
  name: string;
  academicYear: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
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

type TeacherAttendanceRow = {
  teacher: {
    _id: string;
    teacherId?: string;
    name: string;
    email?: string;
  };
  attendance?: {
    _id: string;
    status: 'present' | 'absent';
  } | null;
};

type TeacherAttendanceSummary = {
  total: number;
  present: number;
  absent: number;
  unmarked: number;
};

const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const input = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

const formatDay = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

const localTodayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function ExamInvigilatorsManage() {
  const [workspaceSearchParams] = useSearchParams();
  const contextPeriodId = workspaceSearchParams.get('periodId') || '';
  const contextExamName = workspaceSearchParams.get('examName') || '';
  const contextAcademicYear = workspaceSearchParams.get('academicYear') || '';
  const contextStartDate = workspaceSearchParams.get('startDate') || '';
  const contextEndDate = workspaceSearchParams.get('endDate') || '';
  const hasExamContext = Boolean(contextPeriodId);

  const [periods,setPeriods]=useState<Period[]>([]);
  const [periodId,setPeriodId]=useState(contextPeriodId);
  const [context,setContext]=useState<Context|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const [attendanceDate,setAttendanceDate]=useState(()=>localTodayKey());
  const [attendanceRows,setAttendanceRows]=useState<TeacherAttendanceRow[]>([]);
  const [attendanceSummary,setAttendanceSummary]=useState<TeacherAttendanceSummary>({total:0,present:0,absent:0,unmarked:0});
  const [attendanceLoading,setAttendanceLoading]=useState(false);
  const [savingTeacher,setSavingTeacher]=useState('');
  const [attendanceQuery,setAttendanceQuery]=useState('');

  const loadBase=async()=>{
    setLoading(true);setError('');
    try{
      const periodRes=await api.get('/exams/periods');
      const nextPeriods=periodRes.data?.data||[];
      setPeriods(nextPeriods);
      setPeriodId(prev=>{
        if(contextPeriodId&&nextPeriods.some((period:Period)=>period._id===contextPeriodId)) return contextPeriodId;
        return prev||nextPeriods[0]?._id||'';
      });
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
      const today=localTodayKey();
      setAttendanceDate(prev=>prev||today);
    }catch(err:any){
      setContext(null);
      setError(err.response?.data?.message||'Could not load invigilation rooms.');
    }
  };

  const loadTeacherAttendance=async(date=attendanceDate)=>{
    if(!periodId||!date){setAttendanceRows([]);setAttendanceSummary({total:0,present:0,absent:0,unmarked:0});return}
    setAttendanceLoading(true);setError('');
    setAttendanceRows([]);
    setAttendanceSummary({total:0,present:0,absent:0,unmarked:0});
    try{
      const r=await api.get('/exams/invigilators/teacher-attendance',{params:{periodId,date}});
      const data=r.data?.data||{};
      setAttendanceRows(data.rows||[]);
      setAttendanceSummary(data.summary||{total:0,present:0,absent:0,unmarked:0});
    }catch(err:any){
      setError(err.response?.data?.message||'Could not load teacher attendance.');
    }finally{
      setAttendanceLoading(false);
    }
  };

  const examDates=useMemo(
    ()=>Array.from(new Set((context?.sessions||[]).map(s=>s.examDate))).sort(),
    [context]
  );

  useEffect(()=>{void loadBase()},[]);
  useEffect(()=>{
    if(contextPeriodId&&contextPeriodId!==periodId) setPeriodId(contextPeriodId);
  },[contextPeriodId,periodId]);
  useEffect(()=>{if(periodId)void loadContext(periodId)},[periodId]);
  useEffect(()=>{if(periodId&&attendanceDate)void loadTeacherAttendance(attendanceDate)},[periodId,attendanceDate]);


  const filteredAttendance=useMemo(()=>{
    const q=attendanceQuery.trim().toLowerCase();
    if(!q)return attendanceRows;
    return attendanceRows.filter(row=>
      `${row.teacher.name} ${row.teacher.teacherId||''} ${row.teacher.email||''}`.toLowerCase().includes(q)
    );
  },[attendanceRows,attendanceQuery]);

  const todayKey=localTodayKey();

  const markTeacher=async(teacherId:string,status:'present'|'absent')=>{
    if(!periodId||!attendanceDate)return;
    setSavingTeacher(teacherId);setError('');setMessage('');
    try{
      await api.post('/exams/invigilators/teacher-attendance',{
        periodId,
        date:attendanceDate,
        teacherId,
        status,
      });
      setAttendanceRows(rows=>rows.map(row=>row.teacher._id===teacherId?{
        ...row,
        attendance:{...(row.attendance||{_id:''}),status}
      }:row));
      setMessage('Teacher attendance saved.');
      await loadTeacherAttendance(attendanceDate);
    }catch(err:any){
      setError(err.response?.data?.message||'Could not save teacher attendance.');
    }finally{
      setSavingTeacher('');
    }
  };

  const markAll=async(status:'present'|'absent')=>{
    if(!periodId||!attendanceDate)return;
    setSavingTeacher('all');setError('');setMessage('');
    try{
      const r=await api.post('/exams/invigilators/teacher-attendance/mark-all',{
        periodId,
        date:attendanceDate,
        status,
      });
      setMessage(r.data?.message||'Teacher attendance saved.');
      await loadTeacherAttendance(attendanceDate);
    }catch(err:any){
      setError(err.response?.data?.message||'Could not save teacher attendance.');
    }finally{
      setSavingTeacher('');
    }
  };

  const formatContextDate=(value:string)=>{
    if(!value)return '';
    const date=new Date(value+'T00:00:00');
    return Number.isNaN(date.getTime())?'':date.toLocaleDateString(undefined,{day:'numeric',month:'short'});
  };
  const contextRange=(()=>{
    const start=formatContextDate(contextStartDate);
    const end=formatContextDate(contextEndDate);
    if(start&&end)return `${start} – ${end}`;
    return start||end;
  })();
  const contextSubtitle=[
    contextExamName||context?.period?.name,
    contextAcademicYear||context?.period?.academicYear,
    contextRange,
  ].filter(Boolean).join(' · ');
  const scheduleFallback=contextPeriodId
    ? `/admin/exams/schedule?${workspaceSearchParams.toString()}`
    : '/admin/exams/schedule';

  if(loading)return <div className="p-4 pt-5 sm:p-6 sm:pt-6 lg:p-8 lg:pt-8">
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <BackButton fallback={scheduleFallback}/>
      <div>
        <h1 className="text-3xl font-bold">Invigilators</h1>
        {contextSubtitle&&<p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{contextSubtitle}</p>}
      </div>
      <ExamWorkspaceTabs />
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-5 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-semibold text-[var(--color-text-secondary)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
          Loading invigilators…
        </div>
      </div>
    </div>
  </div>;

  return <div className="p-4 pt-5 sm:p-6 sm:pt-6 lg:p-8 lg:pt-8">
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <BackButton fallback={scheduleFallback}/>

      <div>
        <h1 className="text-3xl font-bold">Invigilators</h1>
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
          {contextSubtitle || 'Check which teachers are present on each exam day.'}
        </p>
      </div>

      <ExamWorkspaceTabs />

      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
      {message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}

      {!hasExamContext&&<div className={`${card} p-5`}>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">Exam</span>
          <select className={input} value={periodId} onChange={e=>{setPeriodId(e.target.value);setAttendanceDate(localTodayKey());setError('');setMessage('')}}>
            <option value="">Select exam...</option>
            {periods.map(period=><option key={period._id} value={period._id}>{period.name} · {period.academicYear}</option>)}
          </select>
        </label>
      </div>}

      <>
        <div className={`${card} p-5`}>
          <div className="grid gap-4 lg:grid-cols-[260px_1fr_auto] lg:items-end">
            <label className="space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]">
                <span>Exam Date</span>
                {attendanceDate===todayKey&&<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Today</span>}
              </span>
              <div className="flex gap-2">
                <input
                  type="date"
                  className={input}
                  value={attendanceDate}
                  onChange={e=>setAttendanceDate(e.target.value)}
                  disabled={!periodId}
                />
                <button
                  type="button"
                  onClick={()=>setAttendanceDate(todayKey)}
                  disabled={!periodId}
                  className="rounded-xl border px-3 text-xs font-bold disabled:opacity-50"
                >
                  Today
                </button>
              </div>
              {examDates.length>0&&<p className="text-[11px] text-[var(--color-text-tertiary)]">Scheduled: {examDates.map(formatDay).join(' · ')}</p>}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"/>
              <input className={`${input} pl-9`} value={attendanceQuery} onChange={e=>setAttendanceQuery(e.target.value)} placeholder="Search teacher..." />
            </div>
            <button type="button" onClick={()=>void markAll('present')} disabled={!attendanceDate||savingTeacher==='all'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              <CheckCircle2 size={16}/> Mark All Present
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`${card} p-4`}><p className="text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Teachers</p><p className="mt-1 text-2xl font-bold">{attendanceSummary.total}</p></div>
          <div className={`${card} p-4`}><p className="text-xs font-bold uppercase text-emerald-600">Present</p><p className="mt-1 text-2xl font-bold text-emerald-600">{attendanceSummary.present}</p></div>
          <div className={`${card} p-4`}><p className="text-xs font-bold uppercase text-red-600">Absent</p><p className="mt-1 text-2xl font-bold text-red-600">{attendanceSummary.absent}</p></div>
          <div className={`${card} p-4`}><p className="text-xs font-bold uppercase text-amber-600">Not Marked</p><p className="mt-1 text-2xl font-bold text-amber-600">{attendanceSummary.unmarked}</p></div>
        </div>

        <div className={`${card} overflow-hidden`}>
          {attendanceLoading?<div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading teacher attendance...</div>:
          !attendanceDate?<div className="p-10 text-center"><CalendarDays className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]"/><p className="mt-3 font-bold">Select an exam date</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Choose today or another date to load all active teachers.</p></div>:
          <div className="divide-y divide-[var(--color-border-default)]">
            {filteredAttendance.map((row,index)=>{
              const status=row.attendance?.status;
              return <div key={row.teacher._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-secondary)] text-sm font-bold">{index+1}</div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{row.teacher.name}</p>
                    <p className="truncate text-xs text-[var(--color-text-tertiary)]">{row.teacher.teacherId||row.teacher.email||'Teacher'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button type="button" disabled={savingTeacher===row.teacher._id} onClick={()=>void markTeacher(row.teacher._id,'present')} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${status==='present'?'border-emerald-600 bg-emerald-600 text-white':'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300'}`}>
                    <CheckCircle2 size={16}/> Present
                  </button>
                  <button type="button" disabled={savingTeacher===row.teacher._id} onClick={()=>void markTeacher(row.teacher._id,'absent')} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${status==='absent'?'border-red-600 bg-red-600 text-white':'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300'}`}>
                    <UserX size={16}/> Absent
                  </button>
                </div>
              </div>;
            })}
            {filteredAttendance.length===0&&<div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No teachers found.</div>}
          </div>}
        </div>
      </>

    </div>
  </div>;
}

export default ExamInvigilatorsManage;
