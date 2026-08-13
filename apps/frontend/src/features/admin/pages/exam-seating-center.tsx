import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, MoreVertical, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';

type Room = { _id: string; name: string; building?: string; capacity: number };
type Exam = { _id: string; title: string; examDate: string; startTime?: string; endTime?: string; course?: { title?: { en?: string } } };
type Student = { _id: string; studentId: string; profile?: { firstName?: string; lastName?: string }; organization?: string; department?: string; class?: string; shift?: string; assigned?: boolean };
type Allocation = { _id: string; room?: Room; deskNumber?: string; student?: Student };
type Preview = { row: number; studentId: string; studentName: string; room: string; seat: string; status: 'valid' | 'warning' | 'error'; message?: string };

const columns = ['Organization', 'Department', 'Class', 'Shift', 'Student ID', 'Student Name', 'Room', 'Seat'];
const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const input = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';
const studentName = (student?: Student) => [student?.profile?.firstName, student?.profile?.lastName].filter(Boolean).join(' ') || 'Unknown Student';

function Actions({ disabled, onAdd, onImport, onExport }: { disabled: boolean; onAdd: () => void; onImport: () => void; onExport: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const run = (action: () => void) => { setOpen(false); action(); };
  return <div ref={ref} className="relative">
    <button type="button" aria-label="Exam Seating Center actions" disabled={disabled} onClick={() => setOpen(v => !v)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border hover:bg-[var(--color-surface-secondary)] disabled:cursor-not-allowed disabled:opacity-40"><MoreVertical size={20} /></button>
    {open && <div className="absolute right-0 top-12 z-50 w-48 rounded-2xl border bg-[var(--color-surface-primary)] p-1.5 shadow-2xl">
      <button type="button" onClick={() => run(onAdd)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Plus size={17} />Add Seating</button>
      <button type="button" onClick={() => run(onImport)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Upload size={17} />Import</button>
      <button type="button" onClick={() => run(onExport)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Download size={17} />Export</button>
    </div>}
  </div>;
}

function Modal({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
    <div onClick={e => e.stopPropagation()} className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl bg-[var(--color-surface-primary)] p-6 shadow-2xl">
      <div className="mb-6 flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Exam Seating Center</p></div><button type="button" aria-label="Close" onClick={close} className="rounded-lg p-1 hover:bg-[var(--color-surface-secondary)]"><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}

function AddModal({ examId, rooms, close, onSaved }: { examId: string; rooms: Room[]; close: () => void; onSaved: (allocation: Allocation) => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [student, setStudent] = useState('');
  const [room, setRoom] = useState('');
  const [seat, setSeat] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/exams/${examId}/seating/candidates`).then(r => setStudents((r.data.data || []).filter((s: Student) => !s.assigned))).catch(e => setError(e.response?.data?.message || 'Failed to load students')).finally(() => setBusy(false)); }, [examId]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const r = await api.post(`/exams/${examId}/seating`, { studentId: student, room, deskNumber: seat.trim() }); onSaved(r.data.data); close(); } catch (e: any) { setError(e.response?.data?.message || 'Failed to add seating'); } finally { setBusy(false); } };
  return <Modal title="Add Seating" close={close}>
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <select className={input} value={student} onChange={e => setStudent(e.target.value)} required><option value="">Select student...</option>{students.map(s => <option key={s._id} value={s._id}>{s.studentId} — {studentName(s)}</option>)}</select>
      <select className={input} value={room} onChange={e => setRoom(e.target.value)} required><option value="">Select room...</option>{rooms.map(r => <option key={r._id} value={r._id}>{r.name} · {r.capacity} seats</option>)}</select>
      <input className={input} value={seat} onChange={e => setSeat(e.target.value)} placeholder="A-01" required />
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button><button disabled={busy || !student || !room || !seat.trim()} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Add Seating'}</button></div>
    </form>
  </Modal>;
}

function ImportModal({ examId, close, onImported }: { examId: string; close: () => void; onImported: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<'upload' | 'preview'>('upload');
  const [rows, setRows] = useState<Preview[]>([]);
  const [summary, setSummary] = useState({ total: 0, valid: 0, warnings: 0, errors: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const downloadTemplate = async () => { try { const r = await api.get('/exams/seating-template', { responseType: 'blob' }); const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = 'exam-seating-template.xlsx'; a.click(); URL.revokeObjectURL(url); } catch (e: any) { setError(e.response?.data?.message || 'Template download failed'); } };
  const preview = async () => { if (!file) return; setBusy(true); setError(''); try { const form = new FormData(); form.append('file', file); const r = await api.post(`/exams/${examId}/seating/import-preview`, form); const d = r.data.data || {}; setRows(d.rows || []); setSummary({ total: d.totalRows || 0, valid: d.valid || 0, warnings: d.warnings || 0, errors: d.errors || 0 }); setStage('preview'); } catch (e: any) { setError(e.response?.data?.message || 'Import validation failed'); } finally { setBusy(false); } };
  const commit = async () => { if (!file || summary.errors > 0) return; setBusy(true); setError(''); try { const form = new FormData(); form.append('file', file); const r = await api.post(`/exams/${examId}/seating/import`, form); onImported(r.data.message || 'Seating imported successfully.'); close(); } catch (e: any) { setError(e.response?.data?.message || 'Import failed'); } finally { setBusy(false); } };
  return <Modal title="Import Exam Seating" close={close}>
    {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {stage === 'upload' ? <>
      <div className="grid gap-4 md:grid-cols-2">
        <button type="button" onClick={downloadTemplate} className="rounded-2xl border-2 border-dashed p-6 text-left hover:bg-[var(--color-surface-secondary)]"><FileSpreadsheet className="mb-2" size={22} /><b>Download Excel Template</b><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{columns.join(' · ')}</p></button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-2xl border-2 border-dashed p-6 text-left hover:bg-[var(--color-surface-secondary)]"><Upload className="mb-2" size={22} /><b>Choose Excel File</b><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} /><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{file?.name || '.xlsx, .xls or .csv'}</p></button>
      </div>
      <div className="mt-5 flex justify-end"><button type="button" disabled={!file || busy} onClick={preview} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Validating...' : 'Preview & Validate'}</button></div>
    </> : <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(summary).map(([key, value]) => <div key={key} className={`${card} p-4`}><p className="text-xs capitalize text-[var(--color-text-tertiary)]">{key}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</div>
      <div className="mt-5 overflow-auto rounded-2xl border"><table className="w-full min-w-[720px] text-sm"><thead className="bg-[var(--color-surface-secondary)]"><tr><th className="p-3 text-left">Row</th><th className="p-3 text-left">Student</th><th className="p-3 text-left">Room</th><th className="p-3 text-left">Seat</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Message</th></tr></thead><tbody>{rows.map(row => <tr key={row.row} className="border-t"><td className="p-3">{row.row}</td><td className="p-3">{row.studentName}<div className="text-xs text-[var(--color-text-tertiary)]">{row.studentId}</div></td><td className="p-3">{row.room}</td><td className="p-3">{row.seat}</td><td className="p-3">{row.status}</td><td className="p-3">{row.message || '—'}</td></tr>)}</tbody></table></div>
      <div className="mt-5 flex justify-between gap-2"><button type="button" onClick={() => setStage('upload')} className="rounded-xl border px-4 py-2.5">Back</button><button type="button" disabled={busy || summary.errors > 0 || summary.valid === 0} onClick={commit} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Importing...' : `Import ${summary.valid} Valid Rows`}</button></div>
    </>}
  </Modal>;
}

export function ExamSeatingCenter() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState('');
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [room, setRoom] = useState('all');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modal, setModal] = useState<'add' | 'import' | null>(null);

  useEffect(() => { Promise.all([api.get('/exam-rooms'), api.get('/exams')]).then(([roomsResponse, examsResponse]) => { setRooms(roomsResponse.data.data || []); setExams(examsResponse.data.data || []); }).catch((e: any) => setError(e.response?.data?.message || 'Failed to load Exam Seating Center')).finally(() => setLoading(false)); }, []);

  const loadExam = async (id: string) => { setExamId(id); setAllocations([]); setError(''); setMessage(''); setRoom('all'); if (!id) return; setRefreshing(true); try { const r = await api.get(`/exams/${id}/seating`); setAllocations(r.data.data || []); } catch (e: any) { setError(e.response?.data?.message || 'Failed to load seating'); } finally { setRefreshing(false); } };

  const filtered = useMemo(() => allocations.filter(a => { const text = [a.student?.organization, a.student?.department, a.student?.class, a.student?.shift, a.student?.studentId, studentName(a.student), a.room?.name, a.deskNumber].join(' ').toLowerCase(); return (!query.trim() || text.includes(query.trim().toLowerCase())) && (room === 'all' || a.room?._id === room); }), [allocations, query, room]);

  const exportCsv = () => { const rows = [columns, ...allocations.map(a => [a.student?.organization || '', a.student?.department || '', a.student?.class || '', a.student?.shift || '', a.student?.studentId || '', studentName(a.student), a.room?.name || '', a.deskNumber || ''])]; const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'exam-seating.csv'; a.click(); URL.revokeObjectURL(url); };

  if (loading) return <div className="flex min-h-[500px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary-600" /></div>;
  const exam = exams.find(e => e._id === examId);

  return <div className="p-6 pt-20 lg:p-10 lg:pt-10"><div className="mx-auto max-w-screen-2xl space-y-6">
    <BackButton fallback="/admin/exams" />
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">Exam Seating Center</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Manage exam seating assignments.</p></div><Actions disabled={!examId} onAdd={() => setModal('add')} onImport={() => setModal('import')} onExport={exportCsv} /></div>
    {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}{message && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><select className={`${input} lg:max-w-xl`} value={examId} onChange={e => loadExam(e.target.value)}><option value="">Select an examination...</option>{exams.map(e => <option key={e._id} value={e._id}>{e.title} · {new Date(e.examDate).toLocaleDateString()}</option>)}</select>{exam && <div className="text-sm text-[var(--color-text-tertiary)]">{exam.startTime || 'Time not set'}{exam.endTime ? ` – ${exam.endTime}` : ''}{exam.course?.title?.en ? ` · ${exam.course.title.en}` : ''}</div>}<button type="button" disabled={!examId || refreshing} onClick={() => loadExam(examId)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />Refresh</button></div>
    <div className={`${card} overflow-hidden`}><div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-bold">Seating</h2><p className="text-xs text-[var(--color-text-tertiary)]">{examId ? `${filtered.length} of ${allocations.length} assignments` : 'Select an examination first'}</p></div><div className="flex gap-2"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2" /><input className={`${input} min-w-[240px] pl-9`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search student, organization, room or seat..." disabled={!examId} /></div><select className={`${input} sm:w-40`} value={room} onChange={e => setRoom(e.target.value)} disabled={!examId}><option value="all">All Rooms</option>{rooms.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}</select></div></div>
      {!examId ? <div className="p-20 text-center text-sm text-[var(--color-text-tertiary)]">Select an examination to start.</div> : filtered.length === 0 ? <div className="p-20 text-center"><b>No seating assignments</b><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Use the three-dot menu to Add Seating or Import.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-[var(--color-surface-secondary)]"><tr>{columns.map(column => <th key={column} className="px-5 py-3 text-left text-xs font-semibold uppercase">{column}</th>)}</tr></thead><tbody>{filtered.map(a => <tr key={a._id} className="border-t hover:bg-[var(--color-surface-secondary)]"><td className="px-5 py-4">{a.student?.organization || '—'}</td><td className="px-5 py-4">{a.student?.department || '—'}</td><td className="px-5 py-4">{a.student?.class || '—'}</td><td className="px-5 py-4">{a.student?.shift || '—'}</td><td className="px-5 py-4 font-semibold">{a.student?.studentId || '—'}</td><td className="px-5 py-4">{studentName(a.student)}</td><td className="px-5 py-4">{a.room?.name || '—'}</td><td className="px-5 py-4 font-semibold">{a.deskNumber || '—'}</td></tr>)}</tbody></table></div>}
    </div>
    {modal === 'add' && examId && <AddModal examId={examId} rooms={rooms} close={() => setModal(null)} onSaved={allocation => { setAllocations(current => [allocation, ...current]); setMessage('Seating added successfully.'); }} />}
    {modal === 'import' && examId && <ImportModal examId={examId} close={() => setModal(null)} onImported={msg => { setMessage(msg); loadExam(examId); }} />}
  </div></div>;
}
