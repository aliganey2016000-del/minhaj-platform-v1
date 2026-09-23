import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Download, FileSpreadsheet, MoreVertical, Pencil, Plus, Search, Upload, X, Zap, Building2, CheckSquare, Square, Trash2 } from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';
import { ExamWorkspaceTabs } from '../components/exam-workspace-tabs';
import { useAuth } from '../../../store/auth-context';

type Org = { _id: string; name: string };
type Department = { _id: string; name: string; code?: string };
type ClassItem = { _id: string; title: string; section?: string; room?: string; department?: { _id: string; name: string } | string; departmentId?: string; school?: { _id: string; name: string }; shiftMode?: string; status?: string };
type Room = { _id: string; name: string; building?: string; capacity: number; capacityMode?: 'auto' | 'manual' };
type Student = { _id?: string; studentId: string; profile?: { firstName?: string; lastName?: string }; organization?: string; department?: string; className?: string; shift?: string };
type Allocation = { _id: string; academicYear: string; examType: 'mid' | 'final'; deskNumber?: string; room?: Room; student?: Student };
type Fields = { organization: string; department: string; className: string; shift: string; studentId: string; studentName: string; academicYear: string; examType: string; room: string; seat: string };
type PreviewRow = { row: number; organization: string; department: string; className: string; shift: string; studentId: string; studentName: string; academicYear: string; examType: string; room: string; seat: string; status: 'valid' | 'error'; message?: string; suggestion?: { room: string; seat: string } };

const columns = ['Organization','Department','Class','Shift','Student ID','Student Name','Academic Year','Exam Type','Room','Seat'];
const roomAssignmentColumns = ['Organization','Department','Class','Shift','Student ID','Student Name','Academic Year','Exam Type','Room'];
const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const input = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';
const readonly = `${input} bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]`;
const nameOf = (s?: Student) => [s?.profile?.firstName, s?.profile?.lastName].filter(Boolean).join(' ') || '';
const academicYearLabel = (y: number) => `${y}-${y + 1}`;
const currentAcademicYear = academicYearLabel(new Date().getFullYear());
const academicYears = Array.from({ length: 7 }, (_, i) => academicYearLabel(new Date().getFullYear() - 3 + i));
const emptyFields: Fields = { organization:'', department:'', className:'', shift:'', studentId:'', studentName:'', academicYear:currentAcademicYear, examType:'', room:'', seat:'' };
const classNameOf = (c: ClassItem) => [c.title, c.section].filter(Boolean).join(' ');
const deptIdOf = (c: ClassItem) => typeof c.department === 'object' ? c.department?._id : c.departmentId || c.department || '';

function AcademicYearSelect({ value, onChange, required = false }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  return <select className={input} value={value} onChange={e=>onChange(e.target.value)} required={required}>
    <option value="">Select academic year...</option>
    {academicYears.map(y=><option key={y} value={y}>{y}</option>)}
  </select>;
}

function Modal({ title, close, children, wide = false }: { title:string; close:()=>void; children:ReactNode; wide?:boolean }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={close}><div onClick={e=>e.stopPropagation()} className={`max-h-[94vh] w-full ${wide?'max-w-6xl':'max-w-3xl'} overflow-auto rounded-3xl bg-[var(--color-surface-primary)] p-6 shadow-2xl`}><div className="mb-6 flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Exam Room Assignment</p></div><button type="button" onClick={close} className="rounded-lg p-1 hover:bg-[var(--color-surface-secondary)]"><X size={20}/></button></div>{children}</div></div>;
}

function Actions({ add, imp, exp, auto }: { add:()=>void; imp:()=>void; exp:()=>void; auto:()=>void }) {
  const [open,setOpen]=useState(false); const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ if(!open)return; const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}; document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)},[open]);
  const run=(fn:()=>void)=>{setOpen(false);fn()};
  return <div ref={ref} className="relative"><button type="button" aria-label="Exam Room Assignment actions" onClick={()=>setOpen(v=>!v)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border-default)]"><MoreVertical size={21}/></button>{open&&<div className="absolute right-0 top-12 z-[120] w-64 rounded-2xl border bg-[var(--color-surface-primary)] p-1.5 shadow-2xl"><button onClick={()=>run(auto)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-primary-600 hover:bg-[var(--color-surface-secondary)]"><Zap size={17}/>Auto Assign Rooms</button><button onClick={()=>run(add)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Plus size={17}/>Add Room Assignment</button><button onClick={()=>run(imp)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Upload size={17}/>Import Excel</button><button onClick={()=>run(exp)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Download size={17}/>Export</button></div>}</div>;
}

function RoomActions({add,imp,exp}:{add:()=>void;imp:()=>void;exp:()=>void}) {
  const [open,setOpen]=useState(false); const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!open)return;const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[open]);
  const run=(fn:()=>void)=>{setOpen(false);fn()};
  return <div ref={ref} className="relative"><button type="button" aria-label="Room actions" onClick={()=>setOpen(v=>!v)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border-default)]"><MoreVertical size={21}/></button>{open&&<div className="absolute right-0 top-12 z-[120] w-56 rounded-2xl border bg-[var(--color-surface-primary)] p-1.5 shadow-2xl"><button onClick={()=>run(add)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Plus size={17}/>Add Room</button><button onClick={()=>run(imp)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Upload size={17}/>Import Excel</button><button onClick={()=>run(exp)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Download size={17}/>Export Excel</button></div>}</div>;
}

function RoomRowActions({room,onEdit,onDelete}:{room:Room;onEdit:()=>void;onDelete:()=>void}) {
  const [open,setOpen]=useState(false); const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!open)return;const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[open]);
  const run=(fn:()=>void)=>{setOpen(false);fn()};
  return <div ref={ref} className="relative inline-flex justify-end"><button type="button" aria-label={`Actions for ${room.name}`} onClick={()=>setOpen(v=>!v)} className="rounded-lg border p-2"><MoreVertical size={17}/></button>{open&&<div className="absolute right-0 top-10 z-[120] w-44 rounded-2xl border bg-[var(--color-surface-primary)] p-1.5 text-left shadow-2xl"><button onClick={()=>run(onEdit)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-[var(--color-surface-secondary)]"><Pencil size={16}/>Edit</button><button onClick={()=>run(onDelete)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><Trash2 size={16}/>Delete</button></div>}</div>;
}

function Field({label,value,onChange,editable=false,children}:{label:string;value?:string;onChange?:(v:string)=>void;editable?:boolean;children?:ReactNode}) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}</span>{children||<input className={editable?input:readonly} value={value||''} readOnly={!editable} onChange={e=>onChange?.(e.target.value)}/>}</label>;
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
    <Field label="Exam Type" editable><select className={input} value={fields.examType} onChange={e=>setField('examType',e.target.value)}><option value="">Select exam type...</option><option value="mid">Mid Exam</option><option value="final">Final</option></select></Field>
    <Field label="Room" editable><select className={input} value={fields.room} onChange={e=>setField('room',e.target.value)} required><option value="">Select room...</option>{rooms.map(r=><option key={r._id} value={r.name}>{r.name} · {r.building||'Main Campus'} · capacity {r.capacity}</option>)}</select></Field>
  </div>;
}

function AddModal({rooms,close,onSaved}:{rooms:Room[];close:()=>void;onSaved:()=>void}) {
  const [fields,setFields]=useState<Fields>(emptyFields); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const set=(k:keyof Fields,v:string)=>setFields(x=>({...x,[k]:v}));
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await api.post('/exams/seating-plan',fields);onSaved();close()}catch(err:any){setError(err.response?.data?.message||'Failed to add seating')}finally{setBusy(false)}};
  return <Modal title="Add Room Assignment" close={close}><form onSubmit={submit} className="space-y-5">{error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}<FieldsGrid fields={fields} setField={set} rooms={rooms}/><div className="flex justify-end gap-2"><button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button><button disabled={busy} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Saving...':'Add Room Assignment'}</button></div></form></Modal>;
}

function EditModal({allocation,rooms,close,onSaved}:{allocation:Allocation;rooms:Room[];close:()=>void;onSaved:()=>void}) {
  const s=allocation.student; const [fields,setFields]=useState<Fields>({organization:s?.organization||'',department:s?.department||'',className:s?.className||'',shift:s?.shift||'',studentId:s?.studentId||'',studentName:nameOf(s),academicYear:allocation.academicYear||currentAcademicYear,examType:allocation.examType,room:allocation.room?.name||'',seat:allocation.deskNumber||''}); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const set=(k:keyof Fields,v:string)=>setFields(x=>({...x,[k]:v}));
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await api.patch(`/exams/seating-plan/${allocation._id}`,{room:fields.room,seat:fields.seat,academicYear:fields.academicYear,examType:fields.examType});onSaved();close()}catch(err:any){setError(err.response?.data?.message||'Failed to update seating')}finally{setBusy(false)}};
  return <Modal title="Edit Room Assignment" close={close}><form onSubmit={submit} className="space-y-5">{error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}<FieldsGrid fields={fields} setField={set} rooms={rooms} lockedStudent/><div className="flex justify-end gap-2"><button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button><button disabled={busy} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Saving...':'Save Changes'}</button></div></form></Modal>;
}

const asJsonRows=(rows:PreviewRow[])=>rows.map(x=>({organization:x.organization,department:x.department,className:x.className,shift:x.shift,studentId:x.studentId,studentName:x.studentName,academicYear:x.academicYear,examType:x.examType,room:x.room,seat:x.seat}));

function ImportModal({close,onImported}:{close:()=>void;onImported:(info:{academicYear:string;examType:'mid'|'final';count:number})=>void}) {
  const [file,setFile]=useState<File|null>(null); const [rows,setRows]=useState<PreviewRow[]>([]); const [busy,setBusy]=useState(false); const [fixingRow,setFixingRow]=useState<number|null>(null); const [error,setError]=useState(''); const [previewed,setPreviewed]=useState(false); const [usingFixedRows,setUsingFixedRows]=useState(false);
  const preview=async()=>{if(!file)return;setBusy(true);setError('');try{const f=new FormData();f.append('file',file);const r=await api.post('/exams/seating-plan/import-preview',f);const data=r.data.data||[];setRows(data);setPreviewed(true);setUsingFixedRows(false);if(data.some((x:PreviewRow)=>x.status==='error'))setError('Some rows contain errors. Review the suggested fixes below, or correct the Excel file and re-upload.')}catch(err:any){setError(err.response?.data?.message||'Import preview failed')}finally{setBusy(false)}};
  const applyFix=async(r:PreviewRow)=>{if(!r.suggestion)return;setFixingRow(r.row);setError('');const updated=rows.map(x=>x.row===r.row?{...x,room:r.suggestion!.room,seat:r.suggestion!.seat}:x);try{const res=await api.post('/exams/seating-plan/validate-rows',{rows:asJsonRows(updated)});const data=res.data.data||[];setRows(data);setUsingFixedRows(true);setError(data.some((x:PreviewRow)=>x.status==='error')?'Some rows still need correction.':'')}catch(err:any){setError(err.response?.data?.message||'Failed to apply fix')}finally{setFixingRow(null)}};
  const commit=async()=>{if(!previewed||rows.some(r=>r.status==='error'))return;setBusy(true);setError('');try{if(usingFixedRows)await api.post('/exams/seating-plan/import-rows',{rows:asJsonRows(rows)});else{if(!file)return;const f=new FormData();f.append('file',file);await api.post('/exams/seating-plan/import',f)}const first=rows[0]||{} as PreviewRow;const info={academicYear:first.academicYear||'',examType:(/final/i.test(first.examType||'')?'final':/mid/i.test(first.examType||'')?'mid':'') as 'mid'|'final',count:rows.length};onImported(info);close()}catch(err:any){setError(err.response?.data?.message||'Import failed')}finally{setBusy(false)}};
  const template=async()=>{try{const r=await api.get('/exams/seating-template',{responseType:'blob'});const u=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=u;a.download='exam-seating-master-template.xlsx';a.click();URL.revokeObjectURL(u)}catch(err:any){setError(err.response?.data?.message||'Template download failed')}};
  return <Modal title="Import Exam Seating" close={close} wide><div className="space-y-5"><div className="rounded-2xl border bg-[var(--color-surface-secondary)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">10 required Excel columns</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{columns.join(' · ')}</p></div><button onClick={template} type="button" className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><FileSpreadsheet size={16}/>Download Template</button></div></div><input type="file" accept=".xlsx,.xls,.csv" className={input} onChange={e=>{setFile(e.target.files?.[0]||null);setRows([]);setPreviewed(false);setUsingFixedRows(false);setError('')}}/>{error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}{rows.length>0&&<div className="overflow-x-auto rounded-2xl border"><table className="min-w-[1100px] w-full text-xs"><thead className="bg-[var(--color-surface-secondary)]"><tr>{['Row','Student ID','Student Name','Academic Year','Exam Type','Room','Seat','Status'].map(c=><th key={c} className="px-3 py-2 text-left">{c}</th>)}</tr></thead><tbody>{rows.slice(0,100).map(r=><tr key={r.row} className="border-t"><td className="px-3 py-2">{r.row}</td><td className="px-3 py-2">{r.studentId}</td><td className="px-3 py-2">{r.studentName}</td><td className="px-3 py-2">{r.academicYear}</td><td className="px-3 py-2">{r.examType}</td><td className="px-3 py-2">{r.room}</td><td className="px-3 py-2">{r.seat||'—'}</td><td className="px-3 py-2">{r.status==='error'?<div className="space-y-1"><p className="font-semibold text-red-600">{r.message}</p>{r.suggestion&&<div className="flex items-center gap-2"><span className="text-[var(--color-text-tertiary)]">Suggested fix: {r.suggestion.room}, Seat {r.suggestion.seat}</span><button type="button" disabled={fixingRow!==null} onClick={()=>applyFix(r)} className="rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white disabled:opacity-50">{fixingRow===r.row?'Applying...':'Apply Fix'}</button></div>}</div>:<span className="font-semibold text-emerald-600">Valid</span>}</td></tr>)}</tbody></table></div>}<div className="flex justify-end gap-2"><button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button>{!previewed?<button type="button" disabled={!file||busy} onClick={preview} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Checking...':'Preview Import'}</button>:<button type="button" disabled={busy||fixingRow!==null||rows.some(r=>r.status==='error')} onClick={commit} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Importing...':`Import ${rows.length} Rows`}</button>}</div></div></Modal>;
}

function RoomImportModal({close,onImported}:{close:()=>void;onImported:(message:string)=>void}) {
  const [file,setFile]=useState<File|null>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const submit=async()=>{if(!file)return;setBusy(true);setError('');try{const f=new FormData();f.append('file',file);const r=await api.post('/exam-rooms/import',f);const d=r.data.data||{};const detail=`Rooms imported: ${d.updated||0} updated, ${d.created||0} created${d.errors?.length?`, ${d.errors.length} row errors`:''}.`;onImported(detail);close()}catch(err:any){setError(err.response?.data?.message||'Room import failed')}finally{setBusy(false)}};
  return <Modal title="Import Rooms from Excel" close={close}><div className="space-y-5"><div className="rounded-2xl border bg-[var(--color-surface-secondary)] p-4"><p className="font-semibold">Room · Building · Capacity</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Export the current Rooms list, change Capacity in Excel, then import it again. Room + Building identifies an existing room. A different Building creates a separate room.</p></div><input type="file" accept=".xlsx,.xls,.csv" className={input} onChange={e=>{setFile(e.target.files?.[0]||null);setError('')}}/>{error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}<div className="flex justify-end gap-2"><button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button><button type="button" disabled={!file||busy} onClick={submit} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Importing...':'Import Excel'}</button></div></div></Modal>;
}

function AutoGenerateModal({orgs,departments: _departments,classes,rooms,selectedOrg,close,onGenerated}:{orgs:Org[];departments:Department[];classes:ClassItem[];rooms:Room[];selectedOrg:string;close:()=>void;onGenerated:(message:string)=>void}) {
  const [year,setYear]=useState(currentAcademicYear);
  const [type,setType]=useState('');
  const [org,setOrg]=useState(selectedOrg);
  const [classIds,setClassIds]=useState<string[]>([]);
  const [roomIds,setRoomIds]=useState<string[]>([]);
  const [overwrite,setOverwrite]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<any>(null);

  const toggle=(arr:string[],id:string,setter:(v:string[])=>void)=>setter(arr.includes(id)?arr.filter(x=>x!==id):[...arr,id]);
  const sortedClasses=useMemo(()=>classes.slice().sort((a,b)=>classNameOf(a).localeCompare(classNameOf(b),undefined,{numeric:true})),[classes]);
  const sortedRooms=useMemo(()=>rooms.slice().sort((a,b)=>(a.building||'').localeCompare(b.building||'')||a.name.localeCompare(b.name,undefined,{numeric:true})),[rooms]);
  const allClasses=sortedClasses.length>0&&classIds.length===sortedClasses.length;
  const allRooms=sortedRooms.length>0&&roomIds.length===sortedRooms.length;
  const selectedCapacity=sortedRooms.filter(r=>roomIds.includes(r._id)).reduce((sum,r)=>sum+(Number(r.capacity)||0),0);

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    if(!classIds.length){setError('Select at least one Grade / Class.');return;}
    if(!roomIds.length){setError('Select at least one Room.');return;}
    setBusy(true);setError('');setResult(null);
    try{
      const r=await api.post('/exams/seating-plan/auto-generate',{
        academicYear:year,
        examType:type,
        organization:org,
        classIds,
        roomIds,
        overwrite,
      });
      const generated=r.data.data;
      setResult(generated);
      onGenerated(r.data.message||'Room assignments generated successfully.');
    }catch(err:any){
      setError(err.response?.data?.message||'Automatic room assignment failed');
    }finally{
      setBusy(false);
    }
  };

  return <Modal title="Auto Balance Room Assignment" close={close} wide>
    <form onSubmit={submit} className="space-y-6">
      <div className="rounded-2xl border border-primary-200 bg-primary-50/50 p-4 dark:border-primary-900/40 dark:bg-primary-950/20">
        <p className="font-semibold">Mix grades and balance students across rooms</p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Select the grades and rooms. The system mixes students from the selected grades and assigns only a Room — no seat number is needed.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Academic Year" editable><AcademicYearSelect value={year} onChange={setYear} required/></Field>
        <Field label="Exam Type" editable>
          <select className={input} value={type} onChange={e=>setType(e.target.value)} required>
            <option value="">Select...</option>
            <option value="mid">Mid Exam</option>
            <option value="final">Final</option>
          </select>
        </Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Organization</p>
        {orgs.length>1?
          <select className={input} value={org} onChange={e=>{setOrg(e.target.value);setClassIds([]);setRoomIds([])}}>
            <option value="">Select organization...</option>
            {orgs.map(o=><option key={o._id} value={o._id}>{o.name}</option>)}
          </select>
          :<div className={readonly}>{orgs[0]?.name||'Current organization'}</div>}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className={`${card} p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><p className="font-semibold">Grades / Classes</p><p className="text-xs text-[var(--color-text-tertiary)]">{classIds.length} selected</p></div>
            <button type="button" onClick={()=>setClassIds(allClasses?[]:sortedClasses.map(c=>c._id))} className="text-xs font-semibold text-primary-600">{allClasses?'Clear all':'Select all'}</button>
          </div>
          <div className="max-h-72 space-y-2 overflow-auto">
            {sortedClasses.length===0?<p className="text-sm text-[var(--color-text-tertiary)]">No active grades/classes.</p>:sortedClasses.map(c=>
              <button type="button" key={c._id} onClick={()=>toggle(classIds,c._id,setClassIds)} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${classIds.includes(c._id)?'border-primary-300 bg-primary-50 dark:border-primary-900/50 dark:bg-primary-950/20':'border-transparent hover:bg-[var(--color-surface-secondary)]'}`}>
                {classIds.includes(c._id)?<CheckSquare size={18} className="text-primary-600"/>:<Square size={18}/>}
                <span className="font-medium">{classNameOf(c)}</span>
              </button>
            )}
          </div>
        </div>

        <div className={`${card} p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><p className="font-semibold">Rooms</p><p className="text-xs text-[var(--color-text-tertiary)]">{roomIds.length} selected · {selectedCapacity} total capacity</p></div>
            <button type="button" onClick={()=>setRoomIds(allRooms?[]:sortedRooms.map(r=>r._id))} className="text-xs font-semibold text-primary-600">{allRooms?'Clear all':'Select all'}</button>
          </div>
          <div className="max-h-72 space-y-2 overflow-auto">
            {sortedRooms.length===0?<p className="text-sm text-[var(--color-text-tertiary)]">No exam rooms available.</p>:sortedRooms.map(r=>
              <button type="button" key={r._id} onClick={()=>toggle(roomIds,r._id,setRoomIds)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${roomIds.includes(r._id)?'border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20':'border-transparent hover:bg-[var(--color-surface-secondary)]'}`}>
                {roomIds.includes(r._id)?<CheckSquare size={18} className="text-emerald-600"/>:<Square size={18}/>}
                <div className="min-w-0 flex-1"><p className="font-medium">{r.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{r.building||'Main Campus'}</p></div>
                <span className="rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-xs font-bold">{r.capacity}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Grades</p><p className="mt-1 text-xl font-bold">{classIds.length}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Rooms</p><p className="mt-1 text-xl font-bold">{roomIds.length}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-[var(--color-text-tertiary)]">Room Capacity</p><p className="mt-1 text-xl font-bold">{selectedCapacity}</p></div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Students are mixed by Grade/Class first, then room headcounts are kept as equal as possible without exceeding room capacity.</p>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border p-4">
        <input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)} className="mt-1 h-4 w-4"/>
        <span><b>Rebalance existing assignments</b><span className="block text-xs text-[var(--color-text-tertiary)]">Replace existing room assignments for the selected students in this Academic Year + Exam Type.</span></span>
      </label>

      {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
      {result&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <b>{result.students} students</b> assigned to <b>{result.rooms} rooms</b>.
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{(result.roomBreakdown||[]).map((r:any)=>
          <div key={r.roomId||r.room} className="rounded-xl border border-emerald-200 bg-white/70 p-3 dark:border-emerald-900/40 dark:bg-black/10">
            <div className="flex items-center justify-between gap-3"><b>{r.room}</b><span>{r.students}/{r.capacity}</span></div>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{(r.classes||[]).map((c:any)=>`${c.name}: ${c.count}`).join(' · ')}</p>
          </div>)}</div>
      </div>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button>
        <button disabled={busy||!year||!type||!org||!classIds.length||!roomIds.length} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">
          <Zap size={17}/>{busy?'Balancing...':'Auto Balance & Assign'}
        </button>
      </div>
    </form>
  </Modal>;
}

function RoomModal({room,close,onSaved}:{room?:Room;close:()=>void;onSaved:()=>void}) {
  const [name,setName]=useState(room?.name||''); const [building,setBuilding]=useState(room?.building||'Main Campus'); const [capacity,setCapacity]=useState(String(room?.capacity||30)); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{if(room)await api.patch(`/exam-rooms/${room._id}`,{name,building,capacity:Number(capacity)});else await api.post('/exam-rooms',{name,building,capacity:Number(capacity)});onSaved();close()}catch(err:any){setError(err.response?.data?.message||'Failed to save room')}finally{setBusy(false)}};
  return <Modal title={room?'Edit Room':'Add Room'} close={close}><form onSubmit={submit} className="space-y-4">{error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}<Field label="Room Name" value={name} onChange={setName} editable/><Field label="Building" value={building} onChange={setBuilding} editable/><Field label="Capacity" value={capacity} onChange={setCapacity} editable/><p className="text-xs text-[var(--color-text-tertiary)]">Default capacity is calculated from the maximum active students across the shifts/classes using the room. Editing this value creates a manual capacity override.</p><div className="flex justify-end gap-2"><button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button><button disabled={busy} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white">{busy?'Saving...':'Save Room'}</button></div></form></Modal>;
}

export function ExamSeatingCenterV3() {
  const { user } = useAuth(); const isSuperAdmin=user?.role==='admin';
  const [orgs,setOrgs]=useState<Org[]>([]); const [departments,setDepartments]=useState<Department[]>([]); const [classes,setClasses]=useState<ClassItem[]>([]); const [rooms,setRooms]=useState<Room[]>([]); const [allocations,setAllocations]=useState<Allocation[]>([]);
  const [year,setYear]=useState(currentAcademicYear); const [type,setType]=useState(''); const [query,setQuery]=useState(''); const [roomFilter,setRoomFilter]=useState('all'); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  const [modal,setModal]=useState<'add'|'edit'|'import'|'auto'|'room'|'room-import'|null>(null); const [editing,setEditing]=useState<Allocation|undefined>(); const [editingRoom,setEditingRoom]=useState<Room|undefined>(); const [tab,setTab]=useState<'seating'|'rooms'>('seating');
  const [selectedIds,setSelectedIds]=useState<string[]>([]); const [bulkDeleting,setBulkDeleting]=useState(false);
  const selectedOrg=orgs.length===1?orgs[0]._id:'';

  // Promise.allSettled rather than Promise.all — a single slow/failed call
  // (e.g. Exam Rooms recomputing capacities right after a big import) must
  // not blank the whole page. Whatever succeeds is shown; only the pieces
  // that actually failed are reported, with a Retry action.
  const loadBase=async()=>{setLoading(true);setError('');
    const [o,d,c,r]=await Promise.allSettled([api.get('/schools?limit=100'),api.get('/departments',isSuperAdmin?{}:undefined),api.get('/classes?limit=200'),api.get('/exam-rooms')]);
    const failed:string[]=[];
    if(o.status==='fulfilled')setOrgs((o.value.data.data||[]).map((x:any)=>({_id:x._id,name:x.name})));else failed.push(`Organizations (${o.reason?.response?.data?.message||o.reason?.message||'failed'})`);
    if(d.status==='fulfilled')setDepartments(d.value.data.data||[]);else failed.push(`Departments (${d.reason?.response?.data?.message||d.reason?.message||'failed'})`);
    if(c.status==='fulfilled')setClasses(c.value.data.data||[]);else failed.push(`Classes (${c.reason?.response?.data?.message||c.reason?.message||'failed'})`);
    if(r.status==='fulfilled')setRooms(r.value.data.data||[]);else failed.push(`Rooms (${r.reason?.response?.data?.message||r.reason?.message||'failed'})`);
    if(failed.length)setError(`Some seating configuration didn't load: ${failed.join('; ')}. Retry below.`);
    setLoading(false);
  };
  useEffect(()=>{void loadBase()},[isSuperAdmin]);
  const loadSeating=async(y=year,t=type)=>{if(!y||!t){setAllocations([]);return}try{const r=await api.get('/exams/seating-plan',{params:{academicYear:y,examType:t}});setAllocations(r.data.data||[])}catch(err:any){setError(err.response?.data?.message||'Failed to load seating plan')}};
  useEffect(()=>{void loadSeating()},[year,type]);
  const filtered=useMemo(()=>allocations.filter(a=>{const text=[a.student?.organization,a.student?.department,a.student?.className,a.student?.shift,a.student?.studentId,nameOf(a.student),a.room?.name,a.deskNumber].join(' ').toLowerCase();return(!query||text.includes(query.toLowerCase()))&&(roomFilter==='all'||a.room?._id===roomFilter)}),[allocations,query,roomFilter]);
  useEffect(()=>{setSelectedIds([])},[year,type,query,roomFilter]);
  const allFilteredSelected=filtered.length>0&&filtered.every(a=>selectedIds.includes(a._id));
  const toggleSelect=(id:string)=>setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const toggleSelectAll=()=>setSelectedIds(allFilteredSelected?[]:filtered.map(a=>a._id));
  const handleBulkDelete=async()=>{if(selectedIds.length===0)return;if(!window.confirm(`Delete ${selectedIds.length} selected room assignment(s)? This cannot be undone.`))return;setBulkDeleting(true);try{const{data}=await api.delete('/exams/seating-plan',{data:{ids:selectedIds}});setMessage(data.message||`Removed ${selectedIds.length} room assignment(s).`);setSelectedIds([]);await loadSeating()}catch(err:any){setError(err.response?.data?.message||'Failed to delete selected room assignments')}finally{setBulkDeleting(false)}};
  const exportCsv=()=>{const rows=[columns,...filtered.map(a=>[a.student?.organization||'',a.student?.department||'',a.student?.className||'',a.student?.shift||'',a.student?.studentId||'',nameOf(a.student),a.academicYear,a.examType,a.room?.name||'',a.deskNumber||''])];const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=u;a.download=`exam-seating-${year}-${type}.csv`;a.click();URL.revokeObjectURL(u)};
  const exportRooms=async()=>{try{const r=await api.get('/exam-rooms/export',{responseType:'blob'});const u=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=u;a.download=`exam-rooms-${new Date().toISOString().slice(0,10)}.xlsx`;a.click();URL.revokeObjectURL(u)}catch(err:any){setError(err.response?.data?.message||'Room export failed')}};
  const deleteRoom=async(room:Room)=>{if(!window.confirm(`Delete ${room.name} from ${room.building||'Main Campus'}?`))return;try{await api.delete(`/exam-rooms/${room._id}`);setMessage('Room deleted successfully.');await loadBase()}catch(err:any){setError(err.response?.data?.message||'Failed to delete room')}};
  const orgForAuto=orgs.length===1?orgs[0]._id:'';
  if(loading)return <div className="p-20 text-center">Loading...</div>;
  return <div className="p-6 pt-20 lg:p-10 lg:pt-10"><div className="mx-auto max-w-screen-2xl space-y-6"><BackButton fallback="/admin/exams"/>
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">Exam Room Assignment</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">One master room assignment for every student across all exam subjects.</p></div><Actions add={()=>setModal('add')} imp={()=>setModal('import')} exp={exportCsv} auto={()=>setModal('auto')}/></div>
    <ExamWorkspaceTabs />
    {error&&<div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={()=>void loadBase()} className="flex-shrink-0 rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold hover:bg-red-100">Retry</button></div>}{message&&<div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
    <div className="flex gap-2 rounded-xl bg-[var(--color-surface-secondary)] p-1 w-fit"><button onClick={()=>setTab('seating')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==='seating'?'bg-[var(--color-surface-primary)] shadow-sm':''}`}>Room Assignment</button><button onClick={()=>setTab('rooms')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==='rooms'?'bg-[var(--color-surface-primary)] shadow-sm':''}`}><Building2 size={15} className="mr-1 inline"/>Rooms</button></div>
    {tab==='rooms'?<div className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Rooms</h2><p className="text-sm text-[var(--color-text-tertiary)]">Rooms are automatically created from Class → Room assignments. Building defaults to Main Campus, and capacity follows the maximum active students across shifts unless manually overridden.</p></div><RoomActions add={()=>{setEditingRoom(undefined);setModal('room')}} imp={()=>setModal('room-import')} exp={exportRooms}/></div><div className={`${card} overflow-hidden`}><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[var(--color-surface-secondary)]"><tr><th className="px-5 py-3 text-left">Room</th><th className="px-5 py-3 text-left">Building</th><th className="px-5 py-3 text-left">Capacity</th><th className="px-5 py-3 text-left">Capacity Source</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{rooms.map(r=><tr key={r._id} className="border-t"><td className="px-5 py-4 font-semibold">{r.name}</td><td className="px-5 py-4">{r.building||'Main Campus'}</td><td className="px-5 py-4">{r.capacity}</td><td className="px-5 py-4"><span className="rounded-full border px-2.5 py-1 text-xs">{r.capacityMode==='manual'?'Manual':'Automatic'}</span></td><td className="px-5 py-4 text-right"><RoomRowActions room={r} onEdit={()=>{setEditingRoom(r);setModal('room')}} onDelete={()=>void deleteRoom(r)}/></td></tr>)}</tbody></table></div></div></div>:<>
      <div className={`${card} p-5`}><div className="grid gap-4 md:grid-cols-2"><Field label="Academic Year" editable><AcademicYearSelect value={year} onChange={setYear} required/></Field><Field label="Exam Type" editable><select className={input} value={type} onChange={e=>setType(e.target.value)}><option value="">Select exam type...</option><option value="mid">Mid Exam</option><option value="final">Final</option></select></Field></div><p className="mt-2 text-xs text-[var(--color-text-tertiary)]">There is no Examination/Subject dropdown. This plan applies to all subjects for the selected Academic Year + Exam Type.</p></div>
      {selectedIds.length>0&&<div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 px-4 py-3"><p className="text-sm font-semibold text-red-700 dark:text-red-300">{selectedIds.length} room assignment{selectedIds.length!==1?'s':''} selected</p><button type="button" onClick={()=>void handleBulkDelete()} disabled={bulkDeleting} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"><Trash2 size={16}/>{bulkDeleting?'Deleting...':'Delete Selected'}</button></div>}
      <div className={`${card} overflow-hidden`}><div className="flex flex-col gap-3 border-b p-5 lg:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2"/><input className={`${input} pl-9`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search student, organization, department, class, room..." disabled={!year||!type}/></div><select className={`${input} lg:w-52`} value={roomFilter} onChange={e=>setRoomFilter(e.target.value)} disabled={!year||!type}><option value="all">All Rooms</option>{rooms.map(r=><option key={r._id} value={r._id}>{r.name} · {r.building||'Main Campus'}</option>)}</select></div>{!year||!type?<div className="p-20 text-center text-sm text-[var(--color-text-tertiary)]">Select Academic Year and Exam Type to view the master seating plan.</div>:filtered.length===0?<div className="p-20 text-center"><b>No room assignments</b><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Use Auto Generate, Add Room Assignment, or Import Excel.</p></div>:<div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm"><thead className="bg-[var(--color-surface-secondary)]"><tr><th className="w-10 px-5 py-3 text-center"><input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="h-4 w-4 accent-red-600"/></th>{roomAssignmentColumns.map(c=><th key={c} className="px-5 py-3 text-left text-xs font-semibold uppercase">{c}</th>)}<th className="px-5 py-3 text-right text-xs font-semibold uppercase">Action</th></tr></thead><tbody>{filtered.map(a=><tr key={a._id} className="border-t"><td className="px-5 py-4 text-center"><input type="checkbox" checked={selectedIds.includes(a._id)} onChange={()=>toggleSelect(a._id)} className="h-4 w-4 accent-red-600"/></td><td className="px-5 py-4">{a.student?.organization||'—'}</td><td className="px-5 py-4">{a.student?.department||'—'}</td><td className="px-5 py-4">{a.student?.className||'—'}</td><td className="px-5 py-4">{a.student?.shift||'—'}</td><td className="px-5 py-4 font-semibold">{a.student?.studentId||'—'}</td><td className="px-5 py-4">{nameOf(a.student)||'—'}</td><td className="px-5 py-4">{a.academicYear}</td><td className="px-5 py-4">{a.examType==='mid'?'Mid Exam':'Final'}</td><td className="px-5 py-4 font-semibold">{a.room?.name||'—'}</td><td className="px-5 py-4 text-right"><button onClick={()=>{setEditing(a);setModal('edit')}} className="rounded-lg border p-2"><Pencil size={16}/></button></td></tr>)}</tbody></table></div>}</div>
    </>}
    {modal==='add'&&<AddModal rooms={rooms} close={()=>setModal(null)} onSaved={()=>{setMessage('Room assignment added successfully.');void loadSeating()}}/>}
    {modal==='edit'&&editing&&<EditModal allocation={editing} rooms={rooms} close={()=>setModal(null)} onSaved={()=>{setMessage('Room assignment updated successfully.');void loadSeating()}}/>}
    {modal==='import'&&<ImportModal close={()=>setModal(null)} onImported={(info)=>{setYear(info.academicYear);setType(info.examType);setMessage(`Imported ${info.count} room assignments successfully.`);void loadSeating(info.academicYear,info.examType)}}/>}
    {modal==='auto'&&<AutoGenerateModal orgs={orgs} departments={departments} classes={classes} rooms={rooms} selectedOrg={orgForAuto} close={()=>setModal(null)} onGenerated={m=>{setMessage(m);setModal(null);void loadSeating()}}/>}
    {modal==='room'&&<RoomModal room={editingRoom} close={()=>setModal(null)} onSaved={()=>{setMessage('Room saved successfully.');void loadBase()}}/>}
    {modal==='room-import'&&<RoomImportModal close={()=>setModal(null)} onImported={m=>{setMessage(m);void loadBase()}}/>}
  </div></div>;
}
