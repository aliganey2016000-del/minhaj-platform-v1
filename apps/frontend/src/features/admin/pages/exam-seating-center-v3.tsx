import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CheckSquare,
  Download,
  FileSpreadsheet,
  GripVertical,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Unlock,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';
import { ExamWorkspaceTabs } from '../components/exam-workspace-tabs';

type Org = { _id: string; name: string };
type ClassItem = {
  _id: string;
  title: string;
  section?: string;
  room?: string;
  department?: { _id: string; name: string } | string;
  departmentId?: string;
  school?: { _id: string; name: string } | string;
  shiftMode?: string;
  status?: string;
};
type Room = {
  _id: string;
  name: string;
  building?: string;
  capacity: number;
  capacityMode?: 'auto' | 'manual';
  school?: { _id?: string; name?: string } | string;
};
type Student = {
  _id?: string;
  studentId: string;
  profile?: { firstName?: string; lastName?: string };
  organization?: string;
  department?: string;
  className?: string;
  shift?: string;
};
type Allocation = {
  _id: string;
  academicYear: string;
  examType: 'mid' | 'final';
  deskNumber?: string;
  locked?: boolean;
  room?: Room;
  student?: Student;
};
type Fields = {
  organization: string;
  department: string;
  className: string;
  shift: string;
  studentId: string;
  studentName: string;
  academicYear: string;
  examType: string;
  room: string;
  seat: string;
};
type PreviewRow = {
  row: number;
  organization: string;
  department: string;
  className: string;
  shift: string;
  studentId: string;
  studentName: string;
  academicYear: string;
  examType: string;
  room: string;
  seat: string;
  status: 'valid' | 'error';
  message?: string;
  suggestion?: { room: string; seat: string };
};
type AllocationStats = {
  totalStudents: number;
  assigned: number;
  unassigned: number;
  locked: number;
  roomsUsed: number;
};
type PreviewRoom = {
  roomId: string;
  room: string;
  building?: string;
  capacity: number;
  students: number;
  remainingCapacity: number;
  locked: number;
  balanceScore: number;
  balanceLabel: string;
  classes: Array<{ name: string; count: number }>;
};
type AutoPreview = {
  academicYear: string;
  examType: string;
  seed: string;
  students: number;
  assigned: number;
  remaining: number;
  rooms: number;
  totalCapacity: number;
  freeCapacity: number;
  lockedStudents: number;
  roomBreakdown: PreviewRoom[];
  issues: string[];
};

const columns = ['Organization','Department','Class','Shift','Student ID','Student Name','Academic Year','Exam Type','Room','Seat'];
const roomAssignmentColumns = ['Organization','Department','Class','Shift','Student ID','Student Name','Academic Year','Exam Type','Room','Lock'];
const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const input = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';
const readonly = `${input} bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]`;
const nameOf = (s?: Student) => [s?.profile?.firstName, s?.profile?.lastName].filter(Boolean).join(' ') || '';
const academicYearLabel = (y: number) => `${y}-${y + 1}`;
const currentAcademicYear = academicYearLabel(new Date().getFullYear());
const academicYears = Array.from({ length: 7 }, (_, i) => academicYearLabel(new Date().getFullYear() - 3 + i));
const emptyFields: Fields = {
  organization:'',
  department:'',
  className:'',
  shift:'',
  studentId:'',
  studentName:'',
  academicYear:currentAcademicYear,
  examType:'',
  room:'',
  seat:'',
};
const classNameOf = (c: ClassItem) => [c.title, c.section].filter(Boolean).join(' ');
const schoolIdOf = (value?: { _id?: string } | string) => typeof value === 'string' ? value : value?._id || '';

function csvDownload(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function AcademicYearSelect({ value, onChange, required = false }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  return <select className={input} value={value} onChange={e=>onChange(e.target.value)} required={required}>
    <option value="">Select academic year...</option>
    {academicYears.map(y=><option key={y} value={y}>{y}</option>)}
  </select>;
}

function Modal({ title, close, children, wide = false }: { title:string; close:()=>void; children:ReactNode; wide?:boolean }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={close}>
    <div onClick={e=>e.stopPropagation()} className={`max-h-[94vh] w-full ${wide?'max-w-6xl':'max-w-3xl'} overflow-auto rounded-3xl bg-[var(--color-surface-primary)] p-5 shadow-2xl sm:p-6`}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Exam Room Allocation</p>
        </div>
        <button type="button" onClick={close} className="rounded-lg p-1 hover:bg-[var(--color-surface-secondary)]"><X size={20}/></button>
      </div>
      {children}
    </div>
  </div>;
}

function Actions({ add, imp, exp, auto }: { add:()=>void; imp:()=>void; exp:()=>void; auto:()=>void }) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};
    document.addEventListener('mousedown',h);
    return()=>document.removeEventListener('mousedown',h);
  },[open]);
  const run=(fn:()=>void)=>{setOpen(false);fn()};
  return <div ref={ref} className="relative">
    <button type="button" aria-label="Exam Room Allocation actions" onClick={()=>setOpen(v=>!v)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]"><MoreVertical size={21}/></button>
    {open&&<div className="absolute right-0 top-12 z-[120] w-64 rounded-2xl border bg-[var(--color-surface-primary)] p-1.5 shadow-2xl">
      <button onClick={()=>run(auto)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-primary-600 hover:bg-[var(--color-surface-secondary)]"><Zap size={17}/>Smart Auto Allocation</button>
      <button onClick={()=>run(add)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Plus size={17}/>Add Room Assignment</button>
      <button onClick={()=>run(imp)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Upload size={17}/>Import Excel</button>
      <button onClick={()=>run(exp)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Download size={17}/>Export</button>
    </div>}
  </div>;
}

function RoomActions({add,imp,exp}:{add:()=>void;imp:()=>void;exp:()=>void}) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};
    document.addEventListener('mousedown',h);
    return()=>document.removeEventListener('mousedown',h);
  },[open]);
  const run=(fn:()=>void)=>{setOpen(false);fn()};
  return <div ref={ref} className="relative">
    <button type="button" aria-label="Room actions" onClick={()=>setOpen(v=>!v)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border-default)]"><MoreVertical size={21}/></button>
    {open&&<div className="absolute right-0 top-12 z-[120] w-56 rounded-2xl border bg-[var(--color-surface-primary)] p-1.5 shadow-2xl">
      <button onClick={()=>run(add)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Plus size={17}/>Add Room</button>
      <button onClick={()=>run(imp)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Upload size={17}/>Import Excel</button>
      <button onClick={()=>run(exp)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Download size={17}/>Export Excel</button>
    </div>}
  </div>;
}

function RoomRowActions({room,onEdit,onDelete}:{room:Room;onEdit:()=>void;onDelete:()=>void}) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};
    document.addEventListener('mousedown',h);
    return()=>document.removeEventListener('mousedown',h);
  },[open]);
  const run=(fn:()=>void)=>{setOpen(false);fn()};
  return <div ref={ref} className="relative inline-flex justify-end">
    <button type="button" aria-label={`Actions for ${room.name}`} onClick={()=>setOpen(v=>!v)} className="rounded-lg border p-2"><MoreVertical size={17}/></button>
    {open&&<div className="absolute right-0 top-10 z-[120] w-44 rounded-2xl border bg-[var(--color-surface-primary)] p-1.5 text-left shadow-2xl">
      <button onClick={()=>run(onEdit)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Pencil size={16}/>Edit</button>
      <button onClick={()=>run(onDelete)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><Trash2 size={16}/>Delete</button>
    </div>}
  </div>;
}

function Field({label,value,onChange,editable=false,children}:{label:string;value?:string;onChange?:(v:string)=>void;editable?:boolean;children?:ReactNode}) {
  return <label className="block space-y-1.5">
    <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}</span>
    {children||<input className={editable?input:readonly} value={value||''} readOnly={!editable} onChange={e=>onChange?.(e.target.value)}/>}
  </label>;
}

function FieldsGrid({fields,setField,rooms,lockedStudent=false}:{fields:Fields;setField:(k:keyof Fields,v:string)=>void;rooms:Room[];lockedStudent?:boolean}) {
  return <div className="grid gap-4 md:grid-cols-2">
    <Field label="Organization" value={fields.organization} onChange={v=>setField('organization',v)} editable={!lockedStudent}/>
    <Field label="Department" value={fields.department} onChange={v=>setField('department',v)} editable={!lockedStudent}/>
    <Field label="Class" value={fields.className} onChange={v=>setField('className',v)} editable={!lockedStudent}/>
    <Field label="Shift" value={fields.shift} onChange={v=>setField('shift',v)} editable={!lockedStudent}/>
    <Field label="Student ID" value={fields.studentId} onChange={v=>setField('studentId',v)} editable={!lockedStudent}/>
    <Field label="Student Name" value={fields.studentName} onChange={v=>setField('studentName',v)} editable={!lockedStudent}/>
    <Field label="Academic Year" editable><AcademicYearSelect value={fields.academicYear} onChange={v=>setField('academicYear',v)} required/></Field>
    <Field label="Exam Type" editable>
      <select className={input} value={fields.examType} onChange={e=>setField('examType',e.target.value)}>
        <option value="">Select exam type...</option><option value="mid">Mid Exam</option><option value="final">Final</option>
      </select>
    </Field>
    <Field label="Room" editable>
      <select className={input} value={fields.room} onChange={e=>setField('room',e.target.value)} required>
        <option value="">Select room...</option>
        {rooms.map(r=><option key={r._id} value={r.name}>{r.name} · {r.building||'Main Campus'} · capacity {r.capacity}</option>)}
      </select>
    </Field>
  </div>;
}

function AddModal({rooms,close,onSaved}:{rooms:Room[];close:()=>void;onSaved:()=>void}) {
  const [fields,setFields]=useState<Fields>(emptyFields);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const set=(k:keyof Fields,v:string)=>setFields(x=>({...x,[k]:v}));
  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    setBusy(true);setError('');
    try{await api.post('/exams/seating-plan',fields);onSaved();close()}
    catch(err:any){setError(err.response?.data?.message||'Failed to add room assignment')}
    finally{setBusy(false)}
  };
  return <Modal title="Add Room Assignment" close={close}>
    <form onSubmit={submit} className="space-y-5">
      {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <FieldsGrid fields={fields} setField={set} rooms={rooms}/>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button>
        <button disabled={busy} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Saving...':'Add Room Assignment'}</button>
      </div>
    </form>
  </Modal>;
}

function EditModal({allocation,rooms,close,onSaved}:{allocation:Allocation;rooms:Room[];close:()=>void;onSaved:()=>void}) {
  const s=allocation.student;
  const [fields,setFields]=useState<Fields>({
    organization:s?.organization||'',
    department:s?.department||'',
    className:s?.className||'',
    shift:s?.shift||'',
    studentId:s?.studentId||'',
    studentName:nameOf(s),
    academicYear:allocation.academicYear||currentAcademicYear,
    examType:allocation.examType,
    room:allocation.room?.name||'',
    seat:'',
  });
  const [locked,setLocked]=useState(Boolean(allocation.locked));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const set=(k:keyof Fields,v:string)=>setFields(x=>({...x,[k]:v}));
  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    setBusy(true);setError('');
    try{
      await api.patch(`/exams/seating-plan/${allocation._id}`,{
        room:fields.room,
        seat:'',
        academicYear:fields.academicYear,
        examType:fields.examType,
        locked,
      });
      onSaved();close();
    }catch(err:any){setError(err.response?.data?.message||'Failed to update room assignment')}
    finally{setBusy(false)}
  };
  return <Modal title="Edit Room Assignment" close={close}>
    <form onSubmit={submit} className="space-y-5">
      {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <FieldsGrid fields={fields} setField={set} rooms={rooms} lockedStudent/>
      <label className="flex items-start gap-3 rounded-xl border p-3">
        <input type="checkbox" checked={locked} onChange={e=>setLocked(e.target.checked)} className="mt-1"/>
        <span><b>Lock this student</b><span className="block text-xs text-[var(--color-text-tertiary)]">Smart Rebalance will keep this student in the current room.</span></span>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button>
        <button disabled={busy} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Saving...':'Save Changes'}</button>
      </div>
    </form>
  </Modal>;
}

const asJsonRows=(rows:PreviewRow[])=>rows.map(x=>({
  organization:x.organization,
  department:x.department,
  className:x.className,
  shift:x.shift,
  studentId:x.studentId,
  studentName:x.studentName,
  academicYear:x.academicYear,
  examType:x.examType,
  room:x.room,
  seat:x.seat,
}));

function ImportModal({close,onImported}:{close:()=>void;onImported:(info:{academicYear:string;examType:'mid'|'final';count:number})=>void}) {
  const [file,setFile]=useState<File|null>(null);
  const [rows,setRows]=useState<PreviewRow[]>([]);
  const [busy,setBusy]=useState(false);
  const [fixingRow,setFixingRow]=useState<number|null>(null);
  const [error,setError]=useState('');
  const [previewed,setPreviewed]=useState(false);
  const [usingFixedRows,setUsingFixedRows]=useState(false);

  const preview=async()=>{
    if(!file)return;
    setBusy(true);setError('');
    try{
      const f=new FormData();f.append('file',file);
      const r=await api.post('/exams/seating-plan/import-preview',f);
      const data=r.data.data||[];
      setRows(data);setPreviewed(true);setUsingFixedRows(false);
      if(data.some((x:PreviewRow)=>x.status==='error'))setError('Some rows contain errors. Review the suggested fixes below, or correct the Excel file and re-upload.');
    }catch(err:any){setError(err.response?.data?.message||'Import preview failed')}
    finally{setBusy(false)}
  };

  const applyFix=async(r:PreviewRow)=>{
    if(!r.suggestion)return;
    setFixingRow(r.row);setError('');
    const updated=rows.map(x=>x.row===r.row?{...x,room:r.suggestion!.room,seat:r.suggestion!.seat}:x);
    try{
      const res=await api.post('/exams/seating-plan/validate-rows',{rows:asJsonRows(updated)});
      const data=res.data.data||[];
      setRows(data);setUsingFixedRows(true);
      setError(data.some((x:PreviewRow)=>x.status==='error')?'Some rows still need correction.':'');
    }catch(err:any){setError(err.response?.data?.message||'Failed to apply fix')}
    finally{setFixingRow(null)}
  };

  const commit=async()=>{
    if(!previewed||rows.some(r=>r.status==='error'))return;
    setBusy(true);setError('');
    try{
      if(usingFixedRows)await api.post('/exams/seating-plan/import-rows',{rows:asJsonRows(rows)});
      else{
        if(!file)return;
        const f=new FormData();f.append('file',file);
        await api.post('/exams/seating-plan/import',f);
      }
      const first=rows[0]||{} as PreviewRow;
      const info={
        academicYear:first.academicYear||'',
        examType:(/final/i.test(first.examType||'')?'final':/mid/i.test(first.examType||'')?'mid':'') as 'mid'|'final',
        count:rows.length,
      };
      onImported(info);close();
    }catch(err:any){setError(err.response?.data?.message||'Import failed')}
    finally{setBusy(false)}
  };

  const template=async()=>{
    try{
      const r=await api.get('/exams/seating-template',{responseType:'blob'});
      const u=URL.createObjectURL(r.data);
      const a=document.createElement('a');a.href=u;a.download='exam-room-allocation-template.xlsx';a.click();URL.revokeObjectURL(u);
    }catch(err:any){setError(err.response?.data?.message||'Template download failed')}
  };

  return <Modal title="Import Exam Room Allocation" close={close} wide>
    <div className="space-y-5">
      <div className="rounded-2xl border bg-[var(--color-surface-secondary)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Legacy Excel import remains supported</p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{columns.join(' · ')}</p>
          </div>
          <button onClick={template} type="button" className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><FileSpreadsheet size={16}/>Download Template</button>
        </div>
      </div>
      <input type="file" accept=".xlsx,.xls,.csv" className={input} onChange={e=>{setFile(e.target.files?.[0]||null);setRows([]);setPreviewed(false);setUsingFixedRows(false);setError('')}}/>
      {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {rows.length>0&&<div className="overflow-x-auto rounded-2xl border">
        <table className="min-w-[1000px] w-full text-xs">
          <thead className="bg-[var(--color-surface-secondary)]">
            <tr>{['Row','Student ID','Student Name','Academic Year','Exam Type','Room','Seat','Status'].map(c=><th key={c} className="px-3 py-2 text-left">{c}</th>)}</tr>
          </thead>
          <tbody>{rows.slice(0,100).map(r=><tr key={r.row} className="border-t">
            <td className="px-3 py-2">{r.row}</td>
            <td className="px-3 py-2">{r.studentId}</td>
            <td className="px-3 py-2">{r.studentName}</td>
            <td className="px-3 py-2">{r.academicYear}</td>
            <td className="px-3 py-2">{r.examType}</td>
            <td className="px-3 py-2">{r.room}</td>
            <td className="px-3 py-2">{r.seat||'—'}</td>
            <td className="px-3 py-2">{r.status==='error'
              ?<div className="space-y-1">
                <p className="font-semibold text-red-600">{r.message}</p>
                {r.suggestion&&<div className="flex items-center gap-2">
                  <span className="text-[var(--color-text-tertiary)]">Suggested: {r.suggestion.room}, Seat {r.suggestion.seat}</span>
                  <button type="button" disabled={fixingRow!==null} onClick={()=>applyFix(r)} className="rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white disabled:opacity-50">{fixingRow===r.row?'Applying...':'Apply Fix'}</button>
                </div>}
              </div>
              :<span className="font-semibold text-emerald-600">Valid</span>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button>
        {!previewed
          ?<button type="button" disabled={!file||busy} onClick={preview} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Checking...':'Preview Import'}</button>
          :<button type="button" disabled={busy||fixingRow!==null||rows.some(r=>r.status==='error')} onClick={commit} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Importing...':`Import ${rows.length} Rows`}</button>}
      </div>
    </div>
  </Modal>;
}

function RoomImportModal({close,onImported}:{close:()=>void;onImported:(message:string)=>void}) {
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const submit=async()=>{
    if(!file)return;
    setBusy(true);setError('');
    try{
      const f=new FormData();f.append('file',file);
      const r=await api.post('/exam-rooms/import',f);
      const d=r.data.data||{};
      onImported(`Rooms imported: ${d.updated||0} updated, ${d.created||0} created${d.errors?.length?`, ${d.errors.length} row errors`:''}.`);
      close();
    }catch(err:any){setError(err.response?.data?.message||'Room import failed')}
    finally{setBusy(false)}
  };
  return <Modal title="Import Rooms from Excel" close={close}>
    <div className="space-y-5">
      <div className="rounded-2xl border bg-[var(--color-surface-secondary)] p-4">
        <p className="font-semibold">Room · Building · Capacity</p>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Export the current Rooms list, update it in Excel, then import it again.</p>
      </div>
      <input type="file" accept=".xlsx,.xls,.csv" className={input} onChange={e=>{setFile(e.target.files?.[0]||null);setError('')}}/>
      {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button>
        <button type="button" disabled={!file||busy} onClick={submit} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Importing...':'Import Excel'}</button>
      </div>
    </div>
  </Modal>;
}

function AutoGenerateModal({
  orgs,
  classes,
  rooms,
  selectedOrg,
  close,
  onGenerated,
}:{
  orgs:Org[];
  classes:ClassItem[];
  rooms:Room[];
  selectedOrg:string;
  close:()=>void;
  onGenerated:(info:{message:string;academicYear:string;examType:'mid'|'final'})=>void;
}) {
  const [year,setYear]=useState(currentAcademicYear);
  const [type,setType]=useState('');
  const [org,setOrg]=useState(selectedOrg);
  const [classIds,setClassIds]=useState<string[]>([]);
  const [roomIds,setRoomIds]=useState<string[]>([]);
  const [overwrite,setOverwrite]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [preview,setPreview]=useState<AutoPreview|null>(null);
  const [seed,setSeed]=useState(()=>String(Date.now()));

  const visibleClasses=useMemo(
    ()=>classes
      .filter(c=>!org||!schoolIdOf(c.school)||schoolIdOf(c.school)===org)
      .slice()
      .sort((a,b)=>classNameOf(a).localeCompare(classNameOf(b),undefined,{numeric:true})),
    [classes,org],
  );
  const visibleRooms=useMemo(
    ()=>rooms
      .filter(r=>!org||!schoolIdOf(r.school)||schoolIdOf(r.school)===org)
      .slice()
      .sort((a,b)=>(a.building||'').localeCompare(b.building||'')||a.name.localeCompare(b.name,undefined,{numeric:true})),
    [rooms,org],
  );
  const allClasses=visibleClasses.length>0&&classIds.length===visibleClasses.length;
  const allRooms=visibleRooms.length>0&&roomIds.length===visibleRooms.length;
  const selectedCapacity=visibleRooms.filter(r=>roomIds.includes(r._id)).reduce((sum,r)=>sum+(Number(r.capacity)||0),0);
  const toggle=(arr:string[],id:string,setter:(v:string[])=>void)=>setter(arr.includes(id)?arr.filter(x=>x!==id):[...arr,id]);
  const resetPreview=()=>{setPreview(null);setError('')};

  const payload=(previewOnly:boolean)=>({
    academicYear:year,
    examType:type,
    organization:org,
    classIds,
    roomIds,
    overwrite,
    preview:previewOnly,
    seed,
  });

  const previewAllocation=async(regenerate=false)=>{
    if(!classIds.length){setError('Select at least one Grade / Class.');return;}
    if(!roomIds.length){setError('Select at least one Room.');return;}
    const nextSeed=regenerate?String(Date.now()):seed;
    if(regenerate)setSeed(nextSeed);
    setBusy(true);setError('');
    try{
      const r=await api.post('/exams/seating-plan/auto-generate',{...payload(true),seed:nextSeed});
      setPreview(r.data.data||null);
    }catch(err:any){setError(err.response?.data?.message||'Could not preview room allocation')}
    finally{setBusy(false)}
  };

  const confirm=async()=>{
    if(!preview)return;
    setBusy(true);setError('');
    try{
      const r=await api.post('/exams/seating-plan/auto-generate',{...payload(false),seed:preview.seed});
      onGenerated({
        message:r.data.message||'Room allocation saved successfully.',
        academicYear:year,
        examType:type as 'mid'|'final',
      });
      close();
    }catch(err:any){setError(err.response?.data?.message||'Could not save room allocation')}
    finally{setBusy(false)}
  };

  return <Modal title="Smart Auto Allocation" close={close} wide>
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary-200 bg-primary-50/50 p-4 dark:border-primary-900/40 dark:bg-primary-950/20">
        <p className="font-semibold">Mix grades → preview → confirm</p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Students are mixed across the selected grades, room capacity is enforced, locked students stay where they are, and nothing is saved until you confirm the preview.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Academic Year" editable><AcademicYearSelect value={year} onChange={v=>{setYear(v);resetPreview()}} required/></Field>
        <Field label="Exam Type" editable>
          <select className={input} value={type} onChange={e=>{setType(e.target.value);resetPreview()}} required>
            <option value="">Select...</option><option value="mid">Mid Exam</option><option value="final">Final</option>
          </select>
        </Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Organization</p>
        {orgs.length>1
          ?<select className={input} value={org} onChange={e=>{setOrg(e.target.value);setClassIds([]);setRoomIds([]);resetPreview()}}>
            <option value="">Select organization...</option>{orgs.map(o=><option key={o._id} value={o._id}>{o.name}</option>)}
          </select>
          :<div className={readonly}>{orgs[0]?.name||'Current organization'}</div>}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className={`${card} p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><p className="font-semibold">Grades / Classes</p><p className="text-xs text-[var(--color-text-tertiary)]">{classIds.length} selected</p></div>
            <button type="button" onClick={()=>{setClassIds(allClasses?[]:visibleClasses.map(c=>c._id));resetPreview()}} className="text-xs font-semibold text-primary-600">{allClasses?'Clear all':'Select all'}</button>
          </div>
          <div className="max-h-72 space-y-2 overflow-auto">
            {visibleClasses.length===0
              ?<p className="text-sm text-[var(--color-text-tertiary)]">No active grades/classes.</p>
              :visibleClasses.map(c=><button type="button" key={c._id} onClick={()=>{toggle(classIds,c._id,setClassIds);resetPreview()}} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${classIds.includes(c._id)?'border-primary-300 bg-primary-50 dark:border-primary-900/50 dark:bg-primary-950/20':'border-transparent hover:bg-[var(--color-surface-secondary)]'}`}>
                {classIds.includes(c._id)?<CheckSquare size={18} className="text-primary-600"/>:<Square size={18}/>}
                <span className="font-medium">{classNameOf(c)}</span>
              </button>)}
          </div>
        </div>

        <div className={`${card} p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><p className="font-semibold">Rooms</p><p className="text-xs text-[var(--color-text-tertiary)]">{roomIds.length} selected · {selectedCapacity} total capacity</p></div>
            <button type="button" onClick={()=>{setRoomIds(allRooms?[]:visibleRooms.map(r=>r._id));resetPreview()}} className="text-xs font-semibold text-primary-600">{allRooms?'Clear all':'Select all'}</button>
          </div>
          <div className="max-h-72 space-y-2 overflow-auto">
            {visibleRooms.length===0
              ?<p className="text-sm text-[var(--color-text-tertiary)]">No exam rooms available.</p>
              :visibleRooms.map(r=><button type="button" key={r._id} onClick={()=>{toggle(roomIds,r._id,setRoomIds);resetPreview()}} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${roomIds.includes(r._id)?'border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20':'border-transparent hover:bg-[var(--color-surface-secondary)]'}`}>
                {roomIds.includes(r._id)?<CheckSquare size={18} className="text-emerald-600"/>:<Square size={18}/>}
                <div className="min-w-0 flex-1"><p className="font-medium">{r.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{r.building||'Main Campus'}</p></div>
                <span className="rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-xs font-bold">{r.capacity}</span>
              </button>)}
          </div>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border p-4">
        <input type="checkbox" checked={overwrite} onChange={e=>{setOverwrite(e.target.checked);resetPreview()}} className="mt-1 h-4 w-4"/>
        <span><b>Rebalance existing assignments</b><span className="block text-xs text-[var(--color-text-tertiary)]">Unlocked assignments may move. Locked students and locked rooms remain protected.</span></span>
      </label>

      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}

      {preview&&<div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold">Preview ready</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">{preview.students} students · {preview.rooms} rooms · {preview.freeCapacity} free spaces · {preview.lockedStudents} locked</p>
          </div>
          <button type="button" onClick={()=>void previewAllocation(true)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><RefreshCw size={15}/>{busy?'Regenerating...':'Regenerate Mix'}</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {preview.roomBreakdown.map(room=><div key={room.roomId} className="rounded-2xl border border-emerald-200 bg-[var(--color-surface-primary)] p-4 dark:border-emerald-900/40">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-bold">{room.room}</p><p className="text-xs text-[var(--color-text-tertiary)]">{room.building||'Main Campus'} · {room.students}/{room.capacity}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${room.balanceScore>=90?'bg-emerald-100 text-emerald-700':room.balanceScore>=75?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>{room.balanceScore}% · {room.balanceLabel}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
              <div className="h-full rounded-full bg-primary-600" style={{width:`${Math.min(100,Math.round((room.students/Math.max(1,room.capacity))*100))}%`}}/>
            </div>
            <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">{room.classes.map(c=>`${c.name}: ${c.count}`).join(' · ')||'No students'}</p>
            {room.locked>0&&<p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Lock size={12}/>{room.locked} locked</p>}
          </div>)}
        </div>
      </div>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button>
        {!preview
          ?<button type="button" onClick={()=>void previewAllocation(false)} disabled={busy||!year||!type||!org||!classIds.length||!roomIds.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50"><Zap size={17}/>{busy?'Building Preview...':'Preview Allocation'}</button>
          :<button type="button" onClick={()=>void confirm()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50"><CheckCircle2 size={17}/>{busy?'Saving...':'Confirm & Save'}</button>}
      </div>
    </div>
  </Modal>;
}

function RoomModal({room,close,onSaved}:{room?:Room;close:()=>void;onSaved:()=>void}) {
  const [name,setName]=useState(room?.name||'');
  const [building,setBuilding]=useState(room?.building||'Main Campus');
  const [capacity,setCapacity]=useState(String(room?.capacity||30));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const submit=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');
    try{
      if(room)await api.patch(`/exam-rooms/${room._id}`,{name,building,capacity:Number(capacity)});
      else await api.post('/exam-rooms',{name,building,capacity:Number(capacity)});
      onSaved();close();
    }catch(err:any){setError(err.response?.data?.message||'Failed to save room')}
    finally{setBusy(false)}
  };
  return <Modal title={room?'Edit Room':'Add Room'} close={close}>
    <form onSubmit={submit} className="space-y-4">
      {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <Field label="Room Name" value={name} onChange={setName} editable/>
      <Field label="Building" value={building} onChange={setBuilding} editable/>
      <Field label="Capacity" value={capacity} onChange={setCapacity} editable/>
      <p className="text-xs text-[var(--color-text-tertiary)]">Capacity is enforced by Smart Auto Allocation and the capacity meter.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button>
        <button disabled={busy} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Saving...':'Save Room'}</button>
      </div>
    </form>
  </Modal>;
}

function RoomStudentsModal({
  room,
  allocations,
  rooms,
  close,
  onMove,
  onToggleStudentLock,
  onToggleRoomLock,
  onPrint,
  onExport,
}:{
  room:Room;
  allocations:Allocation[];
  rooms:Room[];
  close:()=>void;
  onMove:(allocation:Allocation,room:Room)=>Promise<void>;
  onToggleStudentLock:(allocation:Allocation)=>Promise<void>;
  onToggleRoomLock:(room:Room,locked:boolean)=>Promise<void>;
  onPrint:(room:Room)=>void;
  onExport:(room:Room)=>void;
}) {
  const [busyId,setBusyId]=useState('');
  const roomLocked=allocations.length>0&&allocations.every(a=>a.locked);
  return <Modal title={`${room.name} · Students`} close={close} wide>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--color-surface-secondary)] p-4">
        <div>
          <p className="font-bold">{allocations.length} / {room.capacity} students</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">{room.building||'Main Campus'} · Drag/drop from the main room cards or move students here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>void onToggleRoomLock(room,!roomLocked)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold">{roomLocked?<Unlock size={15}/>:<Lock size={15}/>} {roomLocked?'Unlock Room':'Lock Room'}</button>
          <button type="button" onClick={()=>onPrint(room)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><Printer size={15}/>Print</button>
          <button type="button" onClick={()=>onExport(room)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><Download size={15}/>Export</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--color-surface-secondary)]"><tr>
            <th className="px-4 py-3 text-left">Student</th>
            <th className="px-4 py-3 text-left">Grade / Class</th>
            <th className="px-4 py-3 text-left">Move to Room</th>
            <th className="px-4 py-3 text-right">Lock</th>
          </tr></thead>
          <tbody>{allocations.map(a=><tr key={a._id} className="border-t">
            <td className="px-4 py-3"><p className="font-semibold">{nameOf(a.student)||'Unknown Student'}</p><p className="text-xs text-[var(--color-text-tertiary)]">{a.student?.studentId||'—'}</p></td>
            <td className="px-4 py-3">{a.student?.className||'—'}</td>
            <td className="px-4 py-3">
              <select
                className="rounded-lg border bg-[var(--color-surface-primary)] px-2.5 py-2 text-sm"
                value={room._id}
                disabled={Boolean(a.locked)||busyId===a._id}
                onChange={async e=>{
                  const target=rooms.find(r=>r._id===e.target.value);
                  if(!target||target._id===room._id)return;
                  setBusyId(a._id);
                  await onMove(a,target);
                  setBusyId('');
                }}
              >
                {rooms.map(r=><option key={r._id} value={r._id}>{r.name} · {r.capacity}</option>)}
              </select>
            </td>
            <td className="px-4 py-3 text-right">
              <button type="button" onClick={async()=>{setBusyId(a._id);await onToggleStudentLock(a);setBusyId('')}} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold ${a.locked?'text-amber-700':''}`}>
                {a.locked?<Lock size={14}/>:<Unlock size={14}/>} {a.locked?'Locked':'Unlocked'}
              </button>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </Modal>;
}

export function ExamSeatingCenterV3() {
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [classes,setClasses]=useState<ClassItem[]>([]);
  const [rooms,setRooms]=useState<Room[]>([]);
  const [allocations,setAllocations]=useState<Allocation[]>([]);
  const [stats,setStats]=useState<AllocationStats>({totalStudents:0,assigned:0,unassigned:0,locked:0,roomsUsed:0});
  const [year,setYear]=useState(currentAcademicYear);
  const [type,setType]=useState('');
  const [query,setQuery]=useState('');
  const [roomFilter,setRoomFilter]=useState('all');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [modal,setModal]=useState<'add'|'edit'|'import'|'auto'|'room'|'room-import'|'room-students'|null>(null);
  const [editing,setEditing]=useState<Allocation|undefined>();
  const [editingRoom,setEditingRoom]=useState<Room|undefined>();
  const [viewRoom,setViewRoom]=useState<Room|undefined>();
  const [tab,setTab]=useState<'seating'|'rooms'>('seating');
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [bulkBusy,setBulkBusy]=useState(false);
  const [draggedId,setDraggedId]=useState('');

  const loadBase=async()=>{
    setLoading(true);setError('');
    const [o,c,r]=await Promise.allSettled([
      api.get('/schools?limit=100'),
      api.get('/classes?limit=500'),
      api.get('/exam-rooms'),
    ]);
    const failed:string[]=[];
    if(o.status==='fulfilled')setOrgs((o.value.data.data||[]).map((x:any)=>({_id:x._id,name:x.name})));else failed.push(`Organizations (${o.reason?.response?.data?.message||o.reason?.message||'failed'})`);
    if(c.status==='fulfilled')setClasses(c.value.data.data||[]);else failed.push(`Classes (${c.reason?.response?.data?.message||c.reason?.message||'failed'})`);
    if(r.status==='fulfilled')setRooms(r.value.data.data||[]);else failed.push(`Rooms (${r.reason?.response?.data?.message||r.reason?.message||'failed'})`);
    if(failed.length)setError(`Some room configuration didn't load: ${failed.join('; ')}. Retry below.`);
    setLoading(false);
  };

  const loadSeating=async(y=year,t=type)=>{
    if(!y||!t){setAllocations([]);setStats({totalStudents:0,assigned:0,unassigned:0,locked:0,roomsUsed:0});return}
    try{
      const [a,s]=await Promise.all([
        api.get('/exams/seating-plan',{params:{academicYear:y,examType:t}}),
        api.get('/exams/seating-plan/stats',{params:{academicYear:y,examType:t}}),
      ]);
      setAllocations(a.data.data||[]);
      setStats(s.data.data||{totalStudents:0,assigned:0,unassigned:0,locked:0,roomsUsed:0});
    }catch(err:any){setError(err.response?.data?.message||'Failed to load room allocation')}
  };

  useEffect(()=>{void loadBase()},[]);
  useEffect(()=>{void loadSeating()},[year,type]);

  const filtered=useMemo(()=>allocations.filter(a=>{
    const text=[a.student?.organization,a.student?.department,a.student?.className,a.student?.shift,a.student?.studentId,nameOf(a.student),a.room?.name].join(' ').toLowerCase();
    return(!query||text.includes(query.toLowerCase()))&&(roomFilter==='all'||a.room?._id===roomFilter);
  }),[allocations,query,roomFilter]);

  const allocationsByRoom=useMemo(()=>{
    const map=new Map<string,Allocation[]>();
    rooms.forEach(r=>map.set(r._id,[]));
    allocations.forEach(a=>{
      const id=a.room?._id;
      if(!id)return;
      const list=map.get(id)||[];
      list.push(a);map.set(id,list);
    });
    return map;
  },[allocations,rooms]);

  const roomBalance=useMemo(()=>{
    const global=new Map<string,number>();
    allocations.forEach(a=>{const label=a.student?.className||'Unclassified';global.set(label,(global.get(label)||0)+1)});
    const total=Math.max(1,allocations.length);
    const result=new Map<string,number>();
    rooms.forEach(room=>{
      const list=allocationsByRoom.get(room._id)||[];
      if(!list.length){result.set(room._id,100);return}
      const local=new Map<string,number>();
      list.forEach(a=>{const label=a.student?.className||'Unclassified';local.set(label,(local.get(label)||0)+1)});
      const labels=new Set([...global.keys(),...local.keys()]);
      let tv=0;
      labels.forEach(label=>{
        const p=(local.get(label)||0)/list.length;
        const q=(global.get(label)||0)/total;
        tv+=Math.abs(p-q);
      });
      result.set(room._id,Math.max(0,Math.min(100,Math.round((1-tv/2)*100))));
    });
    return result;
  },[allocations,allocationsByRoom,rooms]);

  const issues=useMemo(()=>{
    const list:string[]=[];
    rooms.forEach(room=>{
      const count=(allocationsByRoom.get(room._id)||[]).length;
      if(count>room.capacity)list.push(`${room.name} is over capacity by ${count-room.capacity}`);
    });
    const seen=new Set<string>();
    allocations.forEach(a=>{
      const id=a.student?.studentId||a.student?._id||'';
      if(!id)return;
      if(seen.has(id))list.push(`Duplicate room assignment: ${id}`);
      seen.add(id);
      if(!a.room?._id)list.push(`${id} has no room`);
    });
    return Array.from(new Set(list));
  },[allocations,allocationsByRoom,rooms]);

  const usedRooms=useMemo(()=>rooms.filter(r=>(allocationsByRoom.get(r._id)||[]).length>0),[allocationsByRoom,rooms]);
  const totalUsedCapacity=usedRooms.reduce((sum,r)=>sum+(Number(r.capacity)||0),0);
  const freeSpaces=Math.max(0,totalUsedCapacity-allocations.length);

  useEffect(()=>{setSelectedIds([])},[year,type,query,roomFilter]);
  const allFilteredSelected=filtered.length>0&&filtered.every(a=>selectedIds.includes(a._id));
  const toggleSelect=(id:string)=>setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const toggleSelectAll=()=>setSelectedIds(allFilteredSelected?[]:filtered.map(a=>a._id));

  const handleBulkDelete=async()=>{
    if(selectedIds.length===0)return;
    if(!window.confirm(`Delete ${selectedIds.length} selected room assignment(s)? This cannot be undone.`))return;
    setBulkBusy(true);
    try{
      const{data}=await api.delete('/exams/seating-plan',{data:{ids:selectedIds}});
      setMessage(data.message||`Removed ${selectedIds.length} room assignment(s).`);
      setSelectedIds([]);await loadSeating();
    }catch(err:any){setError(err.response?.data?.message||'Failed to delete selected room assignments')}
    finally{setBulkBusy(false)}
  };

  const bulkLock=async(ids:string[],locked:boolean)=>{
    if(!ids.length)return;
    setBulkBusy(true);setError('');
    try{
      const{data}=await api.patch('/exams/seating-plan/lock',{ids,locked});
      setMessage(data.message||`${locked?'Locked':'Unlocked'} ${ids.length} assignment(s).`);
      await loadSeating();
    }catch(err:any){setError(err.response?.data?.message||'Could not update locks')}
    finally{setBulkBusy(false)}
  };

  const moveAllocation=async(allocation:Allocation,targetRoom:Room)=>{
    if(allocation.locked){setError('Unlock this student before moving them.');return}
    const targetCount=(allocationsByRoom.get(targetRoom._id)||[]).length;
    if(targetCount>=targetRoom.capacity){setError(`${targetRoom.name} is full (${targetCount}/${targetRoom.capacity}).`);return}
    setError('');
    try{
      await api.patch(`/exams/seating-plan/${allocation._id}`,{
        room:targetRoom.name,
        seat:'',
        academicYear:allocation.academicYear,
        examType:allocation.examType,
        locked:false,
      });
      setMessage(`${nameOf(allocation.student)||allocation.student?.studentId||'Student'} moved to ${targetRoom.name}.`);
      await loadSeating();
    }catch(err:any){setError(err.response?.data?.message||'Could not move student')}
  };

  const toggleStudentLock=async(allocation:Allocation)=>{
    await bulkLock([allocation._id],!allocation.locked);
  };

  const toggleRoomLock=async(room:Room,locked:boolean)=>{
    const ids=(allocationsByRoom.get(room._id)||[]).map(a=>a._id);
    if(!ids.length)return;
    await bulkLock(ids,locked);
  };

  const printRoom=(room:Room)=>{
    const list=allocationsByRoom.get(room._id)||[];
    const rows=list.map(a=>`<tr><td>${escapeHtml(a.student?.studentId||'')}</td><td>${escapeHtml(nameOf(a.student))}</td><td>${escapeHtml(a.student?.className||'')}</td></tr>`).join('');
    const w=window.open('','_blank','width=900,height=700');
    if(!w)return;
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(room.name)} Room List</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#111}h1{margin:0 0 4px}.meta{color:#555;margin-bottom:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#f3f4f6}</style></head><body><h1>${escapeHtml(room.name)} — Exam Room List</h1><div class="meta">${escapeHtml(year)} · ${escapeHtml(type==='mid'?'Mid Exam':'Final')} · ${list.length}/${room.capacity} students</div><table><thead><tr><th>Student ID</th><th>Student Name</th><th>Grade / Class</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close();w.focus();w.print();
  };

  const exportRoom=(room:Room)=>{
    const list=allocationsByRoom.get(room._id)||[];
    csvDownload(`exam-room-${room.name}-${year}-${type}.csv`,[
      ['Student ID','Student Name','Grade / Class','Room','Academic Year','Exam Type'],
      ...list.map(a=>[a.student?.studentId||'',nameOf(a.student),a.student?.className||'',room.name,a.academicYear,a.examType]),
    ]);
  };

  const exportCsv=()=>csvDownload(`exam-room-allocation-${year}-${type}.csv`,[
    roomAssignmentColumns,
    ...filtered.map(a=>[
      a.student?.organization||'',
      a.student?.department||'',
      a.student?.className||'',
      a.student?.shift||'',
      a.student?.studentId||'',
      nameOf(a.student),
      a.academicYear,
      a.examType,
      a.room?.name||'',
      a.locked?'Locked':'',
    ]),
  ]);

  const exportRooms=async()=>{
    try{
      const r=await api.get('/exam-rooms/export',{responseType:'blob'});
      const u=URL.createObjectURL(r.data);
      const a=document.createElement('a');a.href=u;a.download=`exam-rooms-${new Date().toISOString().slice(0,10)}.xlsx`;a.click();URL.revokeObjectURL(u);
    }catch(err:any){setError(err.response?.data?.message||'Room export failed')}
  };

  const deleteRoom=async(room:Room)=>{
    if(!window.confirm(`Delete ${room.name} from ${room.building||'Main Campus'}?`))return;
    try{await api.delete(`/exam-rooms/${room._id}`);setMessage('Room deleted successfully.');await loadBase()}
    catch(err:any){setError(err.response?.data?.message||'Failed to delete room')}
  };

  const orgForAuto=orgs.length===1?orgs[0]._id:'';

  if(loading)return <div className="p-20 text-center">Loading...</div>;

  return <div className="p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <BackButton fallback="/admin/exams"/>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Exam Room Allocation</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Smart mixed-grade room allocation with preview, locking, drag-and-drop moves and capacity protection.</p>
        </div>
        <Actions add={()=>setModal('add')} imp={()=>setModal('import')} exp={exportCsv} auto={()=>setModal('auto')}/>
      </div>

      <ExamWorkspaceTabs />

      {error&&<div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
        <span>{error}</span><button type="button" onClick={()=>{setError('');void loadBase();void loadSeating()}} className="flex-shrink-0 rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold">Retry</button>
      </div>}
      {message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}

      <div className="flex w-fit gap-2 rounded-xl bg-[var(--color-surface-secondary)] p-1">
        <button onClick={()=>setTab('seating')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==='seating'?'bg-[var(--color-surface-primary)] shadow-sm':''}`}>Room Allocation</button>
        <button onClick={()=>setTab('rooms')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==='rooms'?'bg-[var(--color-surface-primary)] shadow-sm':''}`}><Building2 size={15} className="mr-1 inline"/>Rooms</button>
      </div>

      {tab==='rooms'
        ?<div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="text-xl font-bold">Rooms</h2><p className="text-sm text-[var(--color-text-tertiary)]">Manage room name, building and capacity used by Smart Allocation.</p></div>
            <RoomActions add={()=>{setEditingRoom(undefined);setModal('room')}} imp={()=>setModal('room-import')} exp={exportRooms}/>
          </div>
          <div className={`${card} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)]"><tr><th className="px-5 py-3 text-left">Room</th><th className="px-5 py-3 text-left">Building</th><th className="px-5 py-3 text-left">Capacity</th><th className="px-5 py-3 text-left">Capacity Source</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
                <tbody>{rooms.map(r=><tr key={r._id} className="border-t"><td className="px-5 py-4 font-semibold">{r.name}</td><td className="px-5 py-4">{r.building||'Main Campus'}</td><td className="px-5 py-4">{r.capacity}</td><td className="px-5 py-4"><span className="rounded-full border px-2.5 py-1 text-xs">{r.capacityMode==='manual'?'Manual':'Automatic'}</span></td><td className="px-5 py-4 text-right"><RoomRowActions room={r} onEdit={()=>{setEditingRoom(r);setModal('room')}} onDelete={()=>void deleteRoom(r)}/></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
        :<>
          <div className={`${card} p-5`}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Academic Year" editable><AcademicYearSelect value={year} onChange={setYear} required/></Field>
              <Field label="Exam Type" editable><select className={input} value={type} onChange={e=>setType(e.target.value)}><option value="">Select exam type...</option><option value="mid">Mid Exam</option><option value="final">Final</option></select></Field>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">One room allocation applies to all subjects in the selected Academic Year + Exam Type.</p>
          </div>

          {year&&type&&<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ['Assigned Students',stats.assigned,Users],
              ['Unassigned Students',stats.unassigned,AlertTriangle],
              ['Rooms Used',stats.roomsUsed,Building2],
              ['Free Spaces',freeSpaces,CheckCircle2],
              ['Locked',stats.locked,Lock],
            ].map(([label,value,Icon]:any)=><div key={label} className={`${card} p-4`}>
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div><div className="rounded-xl bg-[var(--color-surface-secondary)] p-2.5"><Icon size={18}/></div></div>
            </div>)}
          </div>}

          {year&&type&&allocations.length>0&&<div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rooms.map(room=>{
                const list=allocationsByRoom.get(room._id)||[];
                const count=list.length;
                const pct=Math.min(100,Math.round((count/Math.max(1,room.capacity))*100));
                const score=roomBalance.get(room._id)||100;
                const roomLocked=count>0&&list.every(a=>a.locked);
                return <div
                  key={room._id}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={e=>{
                    e.preventDefault();
                    const id=e.dataTransfer.getData('text/plain')||draggedId;
                    const allocation=allocations.find(a=>a._id===id);
                    if(allocation&&allocation.room?._id!==room._id)void moveAllocation(allocation,room);
                    setDraggedId('');
                  }}
                  className={`${card} p-4 transition ${draggedId?'ring-1 ring-primary-300':''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-bold">{room.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{room.building||'Main Campus'}</p></div>
                    <button type="button" onClick={()=>void toggleRoomLock(room,!roomLocked)} className={`rounded-lg border p-2 ${roomLocked?'text-amber-700':''}`} title={roomLocked?'Unlock room':'Lock room'}>{roomLocked?<Lock size={15}/>:<Unlock size={15}/>}</button>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-2xl font-bold">{count}<span className="text-sm font-normal text-[var(--color-text-tertiary)]"> / {room.capacity}</span></p><p className="text-xs text-[var(--color-text-tertiary)]">{Math.max(0,room.capacity-count)} spaces free</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${score>=90?'bg-emerald-100 text-emerald-700':score>=75?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>{score}% balance</span></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-secondary)]"><div className={`h-full rounded-full ${pct>=100?'bg-red-500':pct>=85?'bg-amber-500':'bg-emerald-500'}`} style={{width:`${pct}%`}}/></div>
                  <div className="mt-3 flex flex-wrap gap-1.5">{Array.from(new Map(list.map(a=>[a.student?.className||'Unclassified',0])).keys()).slice(0,4).map(label=>{
                    const n=list.filter(a=>(a.student?.className||'Unclassified')===label).length;
                    return <span key={label} className="rounded-full bg-[var(--color-surface-secondary)] px-2 py-1 text-[10px] font-semibold">{label}: {n}</span>
                  })}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={()=>{setViewRoom(room);setModal('room-students')}} className="rounded-lg border px-3 py-2 text-xs font-semibold">View Students</button>
                    <button type="button" onClick={()=>printRoom(room)} className="rounded-lg border p-2" title="Print room list"><Printer size={14}/></button>
                    <button type="button" onClick={()=>exportRoom(room)} className="rounded-lg border p-2" title="Export room list"><Download size={14}/></button>
                  </div>
                </div>
              })}
            </div>

            <div className={`${card} p-4`}>
              <div className="flex items-center justify-between gap-3"><div><p className="font-bold">Allocation Health</p><p className="text-xs text-[var(--color-text-tertiary)]">Capacity and duplicate checks</p></div>{issues.length===0?<CheckCircle2 className="text-emerald-600" size={20}/>:<AlertTriangle className="text-red-600" size={20}/>}</div>
              {issues.length===0
                ?<div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">No allocation issues detected.</div>
                :<div className="mt-4 space-y-2">{issues.map(issue=><div key={issue} className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-950/20 dark:text-red-300">{issue}</div>)}</div>}
              <button type="button" onClick={()=>setModal('auto')} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white"><Zap size={16}/>Smart Rebalance</button>
            </div>
          </div>}

          {selectedIds.length>0&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-[var(--color-surface-primary)] px-4 py-3">
            <p className="text-sm font-semibold">{selectedIds.length} assignment{selectedIds.length!==1?'s':''} selected</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={()=>void bulkLock(selectedIds,true)} disabled={bulkBusy} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><Lock size={15}/>Lock</button>
              <button type="button" onClick={()=>void bulkLock(selectedIds,false)} disabled={bulkBusy} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><Unlock size={15}/>Unlock</button>
              <button type="button" onClick={()=>void handleBulkDelete()} disabled={bulkBusy} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white"><Trash2 size={15}/>{bulkBusy?'Working...':'Delete'}</button>
            </div>
          </div>}

          <div className={`${card} overflow-hidden`}>
            <div className="flex flex-col gap-3 border-b p-5 lg:flex-row">
              <div className="relative flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2"/><input className={`${input} pl-9`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search student, class, room..." disabled={!year||!type}/></div>
              <select className={`${input} lg:w-52`} value={roomFilter} onChange={e=>setRoomFilter(e.target.value)} disabled={!year||!type}><option value="all">All Rooms</option>{rooms.map(r=><option key={r._id} value={r._id}>{r.name}</option>)}</select>
            </div>

            {!year||!type
              ?<div className="p-20 text-center text-sm text-[var(--color-text-tertiary)]">Select Academic Year and Exam Type to view room allocation.</div>
              :filtered.length===0
                ?<div className="p-20 text-center"><b>No room assignments</b><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Use Smart Auto Allocation, Add Room Assignment, or Import Excel.</p></div>
                :<div className="overflow-x-auto">
                  <table className="w-full min-w-[1180px] text-sm">
                    <thead className="bg-[var(--color-surface-secondary)]"><tr>
                      <th className="w-10 px-5 py-3 text-center"><input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="h-4 w-4"/></th>
                      <th className="w-8 px-2 py-3"></th>
                      {roomAssignmentColumns.map(c=><th key={c} className="px-4 py-3 text-left text-xs font-semibold uppercase">{c}</th>)}
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Action</th>
                    </tr></thead>
                    <tbody>{filtered.map(a=><tr
                      key={a._id}
                      className="border-t"
                      draggable={!a.locked}
                      onDragStart={e=>{if(a.locked)return;e.dataTransfer.setData('text/plain',a._id);setDraggedId(a._id)}}
                      onDragEnd={()=>setDraggedId('')}
                    >
                      <td className="px-5 py-4 text-center"><input type="checkbox" checked={selectedIds.includes(a._id)} onChange={()=>toggleSelect(a._id)} className="h-4 w-4"/></td>
                      <td className="px-2 py-4 text-[var(--color-text-tertiary)]">{a.locked?<Lock size={14}/>:<GripVertical size={15}/>}</td>
                      <td className="px-4 py-4">{a.student?.organization||'—'}</td>
                      <td className="px-4 py-4">{a.student?.department||'—'}</td>
                      <td className="px-4 py-4">{a.student?.className||'—'}</td>
                      <td className="px-4 py-4">{a.student?.shift||'—'}</td>
                      <td className="px-4 py-4 font-semibold">{a.student?.studentId||'—'}</td>
                      <td className="px-4 py-4">{nameOf(a.student)||'—'}</td>
                      <td className="px-4 py-4">{a.academicYear}</td>
                      <td className="px-4 py-4">{a.examType==='mid'?'Mid Exam':'Final'}</td>
                      <td className="px-4 py-4 font-semibold">{a.room?.name||'—'}</td>
                      <td className="px-4 py-4">{a.locked?<span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700"><Lock size={11}/>Locked</span>:<span className="text-xs text-[var(--color-text-tertiary)]">Open</span>}</td>
                      <td className="px-4 py-4 text-right"><button onClick={()=>{setEditing(a);setModal('edit')}} className="rounded-lg border p-2"><Pencil size={16}/></button></td>
                    </tr>)}</tbody>
                  </table>
                </div>}
          </div>
        </>}

      {modal==='add'&&<AddModal rooms={rooms} close={()=>setModal(null)} onSaved={()=>{setMessage('Room assignment added successfully.');void loadSeating()}}/>}
      {modal==='edit'&&editing&&<EditModal allocation={editing} rooms={rooms} close={()=>setModal(null)} onSaved={()=>{setMessage('Room assignment updated successfully.');void loadSeating()}}/>}
      {modal==='import'&&<ImportModal close={()=>setModal(null)} onImported={(info)=>{setYear(info.academicYear);setType(info.examType);setMessage(`Imported ${info.count} room assignments successfully.`);void loadSeating(info.academicYear,info.examType)}}/>}
      {modal==='auto'&&<AutoGenerateModal orgs={orgs} classes={classes} rooms={rooms} selectedOrg={orgForAuto} close={()=>setModal(null)} onGenerated={info=>{setYear(info.academicYear);setType(info.examType);setMessage(info.message);void loadSeating(info.academicYear,info.examType)}}/>}
      {modal==='room'&&<RoomModal room={editingRoom} close={()=>setModal(null)} onSaved={()=>{setMessage('Room saved successfully.');void loadBase()}}/>}
      {modal==='room-import'&&<RoomImportModal close={()=>setModal(null)} onImported={m=>{setMessage(m);void loadBase()}}/>}
      {modal==='room-students'&&viewRoom&&<RoomStudentsModal
        room={viewRoom}
        allocations={allocationsByRoom.get(viewRoom._id)||[]}
        rooms={rooms}
        close={()=>setModal(null)}
        onMove={moveAllocation}
        onToggleStudentLock={toggleStudentLock}
        onToggleRoomLock={toggleRoomLock}
        onPrint={printRoom}
        onExport={exportRoom}
      />}
    </div>
  </div>;
}

export default ExamSeatingCenterV3;
