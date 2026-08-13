import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Download, FileSpreadsheet, MoreVertical, Pencil, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';

type Room = { _id: string; name: string; building?: string; capacity: number };
type ExamClass = { _id: string; academicYear?: string };
type Exam = {
  _id: string;
  title: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  milestone?: 'mid' | 'final' | null;
  course?: { title?: { en?: string }; class?: ExamClass | string };
};
type ClassRecord = { _id: string; academicYear?: string };
type Student = {
  _id: string;
  studentId: string;
  profile?: { firstName?: string; lastName?: string };
  organization?: string;
  department?: string;
  className?: string;
  class?: string;
  shift?: string;
  shiftMode?: string;
  academicYear?: string;
  assigned?: boolean;
};
type Allocation = { _id: string; room?: Room; deskNumber?: string; student?: Student };
type Preview = {
  row: number;
  studentId: string;
  studentName: string;
  room: string;
  seat: string;
  status: 'valid' | 'warning' | 'error';
  message?: string;
};

type SeatingFields = {
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

const columns = ['Organization', 'Department', 'Class', 'Shift', 'Student ID', 'Student Name', 'Academic Year', 'Exam Type', 'Room', 'Seat'];
const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const input = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';
const readOnlyInput = `${input} bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]`;
const studentName = (student?: Student) => [student?.profile?.firstName, student?.profile?.lastName].filter(Boolean).join(' ') || 'Unknown Student';
const examTypeLabel = (milestone?: 'mid' | 'final' | null) => milestone === 'mid' ? 'Mid Exam' : milestone === 'final' ? 'Final' : '—';
const classLabel = (student?: Student) => student?.className || student?.class || '';
const shiftLabel = (student?: Student) => student?.shift || student?.shiftMode || '';

function Actions({ onAdd, onImport, onExport }: { onAdd: () => void; onImport: () => void; onExport: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-label="Exam Seating Center actions" onClick={() => setOpen((value) => !value)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]">
        <MoreVertical size={21} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-[100] w-56 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-2xl">
          <button type="button" onClick={() => run(onAdd)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Plus size={17} />Add Seating</button>
          <button type="button" onClick={() => run(onImport)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Upload size={17} />Import</button>
          <button type="button" onClick={() => run(onExport)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-secondary)]"><Download size={17} />Export</button>
        </div>
      )}
    </div>
  );
}

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div onClick={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl bg-[var(--color-surface-primary)] p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Exam Seating Center</p></div>
          <button type="button" aria-label="Close" onClick={close} className="rounded-lg p-1 hover:bg-[var(--color-surface-secondary)]"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, editable = false, children }: { label: string; value?: string; editable?: boolean; children?: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}</span>
      {children || <input className={editable ? input : readOnlyInput} value={value || ''} readOnly={!editable} />}
    </label>
  );
}

function FieldsGrid({ fields, editableRoom, editableSeat, onRoomChange, onSeatChange, rooms }: {
  fields: SeatingFields;
  editableRoom?: boolean;
  editableSeat?: boolean;
  onRoomChange?: (value: string) => void;
  onSeatChange?: (value: string) => void;
  rooms?: Room[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Organization" value={fields.organization} />
      <Field label="Department" value={fields.department} />
      <Field label="Class" value={fields.className} />
      <Field label="Shift" value={fields.shift} />
      <Field label="Student ID" value={fields.studentId} />
      <Field label="Student Name" value={fields.studentName} />
      <Field label="Academic Year" value={fields.academicYear} />
      <Field label="Exam Type" value={fields.examType} />
      {editableRoom ? (
        <Field label="Room" editable>
          <select className={input} value={fields.room} onChange={(event) => onRoomChange?.(event.target.value)} required>
            <option value="">Select room...</option>
            {(rooms || []).map((room) => <option key={room._id} value={room._id}>{room.name} · {room.capacity} seats</option>)}
          </select>
        </Field>
      ) : <Field label="Room" value={fields.room} />}
      {editableSeat ? (
        <Field label="Seat" editable><input className={input} value={fields.seat} onChange={(event) => onSeatChange?.(event.target.value)} placeholder="A-01" required /></Field>
      ) : <Field label="Seat" value={fields.seat} />}
    </div>
  );
}

function AddModal({ examId, rooms, academicYear, examType, close, onSaved }: { examId: string; rooms: Room[]; academicYear: string; examType: string; close: () => void; onSaved: (allocation: Allocation) => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  const [room, setRoom] = useState('');
  const [seat, setSeat] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const selected = students.find((student) => student._id === studentId);
  const fields: SeatingFields = {
    organization: selected?.organization || '',
    department: selected?.department || '',
    className: classLabel(selected),
    shift: shiftLabel(selected),
    studentId: selected?.studentId || '',
    studentName: studentName(selected),
    academicYear: academicYear || selected?.academicYear || '',
    examType,
    room,
    seat,
  };

  useEffect(() => {
    setBusy(true);
    api.get(`/exams/${examId}/seating/candidates`)
      .then((response) => setStudents((response.data.data || []).filter((student: Student) => !student.assigned)))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load students'))
      .finally(() => setBusy(false));
  }, [examId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!studentId || !room || !seat.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.post(`/exams/${examId}/seating`, { studentId, room, deskNumber: seat.trim() });
      onSaved(response.data.data);
      close();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add seating');
    } finally {
      setBusy(false);
    }
  };

  return <Modal title="Add Seating" close={close}>
    <form onSubmit={submit} className="space-y-5">
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <Field label="Student" editable>
        <select className={input} value={studentId} onChange={(event) => setStudentId(event.target.value)} required>
          <option value="">Select student...</option>
          {students.map((student) => <option key={student._id} value={student._id}>{student.studentId} — {studentName(student)}</option>)}
        </select>
      </Field>
      <FieldsGrid fields={fields} editableRoom editableSeat onRoomChange={setRoom} onSeatChange={setSeat} rooms={rooms} />
      <div className="flex justify-end gap-2"><button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button><button disabled={busy || !studentId || !room || !seat.trim()} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Add Seating'}</button></div>
    </form>
  </Modal>;
}

function EditModal({ examId, allocation, rooms, academicYear, examType, close, onSaved }: { examId: string; allocation: Allocation; rooms: Room[]; academicYear: string; examType: string; close: () => void; onSaved: (allocation: Allocation) => void }) {
  const [room, setRoom] = useState(allocation.room?._id || '');
  const [seat, setSeat] = useState(allocation.deskNumber || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const student = allocation.student;
  const fields: SeatingFields = {
    organization: student?.organization || '',
    department: student?.department || '',
    className: classLabel(student),
    shift: shiftLabel(student),
    studentId: student?.studentId || '',
    studentName: studentName(student),
    academicYear: academicYear || student?.academicYear || '',
    examType,
    room,
    seat,
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!room || !seat.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.patch(`/exams/${examId}/seating/${allocation._id}`, { room, deskNumber: seat.trim() });
      onSaved(response.data.data);
      close();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update seating');
    } finally {
      setBusy(false);
    }
  };

  return <Modal title="Edit Seating" close={close}>
    <form onSubmit={submit} className="space-y-5">
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <FieldsGrid fields={fields} editableRoom editableSeat onRoomChange={setRoom} onSeatChange={setSeat} rooms={rooms} />
      <div className="flex justify-end gap-2"><button type="button" onClick={close} className="rounded-xl border px-4 py-2.5">Cancel</button><button disabled={busy || !room || !seat.trim()} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save Changes'}</button></div>
    </form>
  </Modal>;
}

function ImportModal({ examId, academicYear, examType, close, onImported }: { examId: string; academicYear: string; examType: string; close: () => void; onImported: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<'upload' | 'preview'>('upload');
  const [rows, setRows] = useState<Preview[]>([]);
  const [summary, setSummary] = useState({ total: 0, valid: 0, warnings: 0, errors: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/exams/seating-template', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'exam-seating-template.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Template download failed');
    }
  };

  const preview = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await api.post(`/exams/${examId}/seating/import-preview`, form);
      const data = response.data.data || {};
      setRows(data.rows || []);
      setSummary({ total: data.totalRows || 0, valid: data.valid || 0, warnings: data.warnings || 0, errors: data.errors || 0 });
      setStage('preview');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import validation failed');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file || summary.errors > 0 || summary.valid === 0) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await api.post(`/exams/${examId}/seating/import`, form);
      onImported(response.data.message || 'Seating imported successfully.');
      close();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return <Modal title="Import Exam Seating" close={close}>
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2"><div className={`${card} p-4`}><p className="text-xs text-[var(--color-text-tertiary)]">Academic Year</p><p className="mt-1 font-semibold">{academicYear || '—'}</p></div><div className={`${card} p-4`}><p className="text-xs text-[var(--color-text-tertiary)]">Exam Type</p><p className="mt-1 font-semibold">{examType}</p></div></div>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {stage === 'upload' ? <>
        <div className="grid gap-4 md:grid-cols-2">
          <button type="button" onClick={downloadTemplate} className="rounded-2xl border-2 border-dashed p-6 text-left hover:bg-[var(--color-surface-secondary)]"><FileSpreadsheet className="mb-2" size={22}/><b>Download Excel Template</b><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{columns.join(' · ')}</p></button>
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-2xl border-2 border-dashed p-6 text-left hover:bg-[var(--color-surface-secondary)]"><Upload className="mb-2" size={22}/><b>Choose Excel File</b><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)}/><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{file?.name || '.xlsx, .xls or .csv'}</p></button>
        </div>
        <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs text-[var(--color-text-tertiary)]">Import must use exactly the same 10 fields as the seating table, Add Seating, Edit Seating, and Export: {columns.join(', ')}.</div>
        <div className="flex justify-end"><button type="button" disabled={!file || busy} onClick={preview} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Validating...' : 'Preview & Validate'}</button></div>
      </> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(summary).map(([key, value]) => <div key={key} className={`${card} p-4`}><p className="text-xs capitalize text-[var(--color-text-tertiary)]">{key}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</div>
        <div className="overflow-auto rounded-2xl border"><table className="w-full min-w-[900px] text-sm"><thead className="bg-[var(--color-surface-secondary)]"><tr><th className="p-3 text-left">Row</th><th className="p-3 text-left">Student</th><th className="p-3 text-left">Academic Year</th><th className="p-3 text-left">Exam Type</th><th className="p-3 text-left">Room</th><th className="p-3 text-left">Seat</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Message</th></tr></thead><tbody>{rows.map((row) => <tr key={row.row} className="border-t"><td className="p-3">{row.row}</td><td className="p-3">{row.studentName}<div className="text-xs text-[var(--color-text-tertiary)]">{row.studentId}</div></td><td className="p-3">{academicYear || '—'}</td><td className="p-3">{examType}</td><td className="p-3">{row.room}</td><td className="p-3">{row.seat}</td><td className="p-3">{row.status}</td><td className="p-3">{row.message || '—'}</td></tr>)}</tbody></table></div>
        <div className="flex justify-between gap-2"><button type="button" onClick={() => setStage('upload')} className="rounded-xl border px-4 py-2.5">Back</button><button type="button" disabled={busy || summary.errors > 0 || summary.valid === 0} onClick={commit} className="rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Importing...' : `Import ${summary.valid} Valid Rows`}</button></div>
      </>}
    </div>
  </Modal>;
}

export function ExamSeatingCenter() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [examId, setExamId] = useState('');
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [room, setRoom] = useState('all');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modal, setModal] = useState<'add' | 'import' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Allocation | null>(null);

  useEffect(() => {
    Promise.all([api.get('/exam-rooms'), api.get('/exams'), api.get('/classes')])
      .then(([roomsResponse, examsResponse, classesResponse]) => {
        setRooms(roomsResponse.data.data || []);
        setExams(examsResponse.data.data || []);
        setClasses(classesResponse.data.data || []);
      })
      .catch((err: any) => setError(err.response?.data?.message || 'Failed to load Exam Seating Center'))
      .finally(() => setLoading(false));
  }, []);

  const loadExam = async (id: string) => {
    setExamId(id);
    setAllocations([]);
    setError('');
    setMessage('');
    setRoom('all');
    if (!id) return;
    setRefreshing(true);
    try {
      const response = await api.get(`/exams/${id}/seating`);
      setAllocations(response.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load seating');
    } finally {
      setRefreshing(false);
    }
  };

  const exam = exams.find((item) => item._id === examId);
  const academicYear = useMemo(() => {
    const linkedClass = typeof exam?.course?.class === 'object' ? exam.course.class : null;
    if (linkedClass?.academicYear) return linkedClass.academicYear;
    const classId = typeof exam?.course?.class === 'string' ? exam.course.class : linkedClass?._id;
    return classes.find((item) => item._id === classId)?.academicYear || '';
  }, [exam, classes]);
  const examType = examTypeLabel(exam?.milestone);

  const filtered = useMemo(() => allocations.filter((allocation) => {
    const text = [allocation.student?.organization, allocation.student?.department, classLabel(allocation.student), shiftLabel(allocation.student), allocation.student?.studentId, studentName(allocation.student), academicYear, examType, allocation.room?.name, allocation.deskNumber].join(' ').toLowerCase();
    return (!query.trim() || text.includes(query.trim().toLowerCase())) && (room === 'all' || allocation.room?._id === room);
  }), [allocations, query, room, academicYear, examType]);

  const exportCsv = () => {
    if (!examId) {
      setError('Select an examination first.');
      return;
    }
    const rows = [columns, ...allocations.map((allocation) => [
      allocation.student?.organization || '',
      allocation.student?.department || '',
      classLabel(allocation.student),
      shiftLabel(allocation.student),
      allocation.student?.studentId || '',
      studentName(allocation.student),
      academicYear,
      examType,
      allocation.room?.name || '',
      allocation.deskNumber || '',
    ])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'exam-seating.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openAdd = () => {
    if (!examId) { setError('Select an examination first.'); return; }
    setModal('add');
  };
  const openImport = () => {
    if (!examId) { setError('Select an examination first.'); return; }
    setModal('import');
  };
  const openEdit = (allocation: Allocation) => {
    setEditing(allocation);
    setModal('edit');
  };

  if (loading) return <div className="flex min-h-[500px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary-600"/></div>;

  return (
    <div className="p-6 pt-20 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <BackButton fallback="/admin/exams" />
        <div className="flex items-start justify-between gap-4">
          <div><h1 className="text-3xl font-bold">Exam Seating Center</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Manage exam seating assignments.</p></div>
          <Actions onAdd={openAdd} onImport={openImport} onExport={exportCsv} />
        </div>

        {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <select className={`${input} lg:max-w-xl`} value={examId} onChange={(event) => loadExam(event.target.value)}><option value="">Select an examination...</option>{exams.map((item) => <option key={item._id} value={item._id}>{item.title} · {item.examDate ? new Date(item.examDate).toLocaleDateString() : 'No date'}</option>)}</select>
          {exam && <div className="text-sm text-[var(--color-text-tertiary)]">{academicYear || 'Academic year not set'} · {examType}{exam.startTime ? ` · ${exam.startTime}${exam.endTime ? ` – ${exam.endTime}` : ''}` : ''}{exam.course?.title?.en ? ` · ${exam.course.title.en}` : ''}</div>}
          <button type="button" disabled={!examId || refreshing} onClick={() => loadExam(examId)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}/>Refresh</button>
        </div>

        <div className={`${card} overflow-hidden`}>
          <div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="font-bold">Seating</h2><p className="text-xs text-[var(--color-text-tertiary)]">{examId ? `${filtered.length} of ${allocations.length} assignments` : 'Select an examination first'}</p></div>
            <div className="flex gap-2"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2"/><input className={`${input} min-w-[240px] pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student, organization, room or seat..." disabled={!examId}/></div><select className={`${input} sm:w-40`} value={room} onChange={(event) => setRoom(event.target.value)} disabled={!examId}><option value="all">All Rooms</option>{rooms.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></div>
          </div>

          {!examId ? <div className="p-20 text-center text-sm text-[var(--color-text-tertiary)]">Select an examination to start.</div> : filtered.length === 0 ? <div className="p-20 text-center"><b>No seating assignments</b><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Use the three-dot menu to Add Seating or Import.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-sm"><thead className="bg-[var(--color-surface-secondary)]"><tr>{columns.map((column) => <th key={column} className="px-5 py-3 text-left text-xs font-semibold uppercase">{column}</th>)}<th className="px-5 py-3 text-right text-xs font-semibold uppercase">Action</th></tr></thead><tbody>{filtered.map((allocation) => <tr key={allocation._id} className="border-t hover:bg-[var(--color-surface-secondary)]"><td className="px-5 py-4">{allocation.student?.organization || '—'}</td><td className="px-5 py-4">{allocation.student?.department || '—'}</td><td className="px-5 py-4">{classLabel(allocation.student) || '—'}</td><td className="px-5 py-4">{shiftLabel(allocation.student) || '—'}</td><td className="px-5 py-4 font-semibold">{allocation.student?.studentId || '—'}</td><td className="px-5 py-4">{studentName(allocation.student)}</td><td className="px-5 py-4">{academicYear || '—'}</td><td className="px-5 py-4">{examType}</td><td className="px-5 py-4">{allocation.room?.name || '—'}</td><td className="px-5 py-4 font-semibold">{allocation.deskNumber || '—'}</td><td className="px-5 py-4 text-right"><button type="button" aria-label={`Edit seating for ${studentName(allocation.student)}`} onClick={() => openEdit(allocation)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-[var(--color-surface-primary)]"><Pencil size={16}/></button></td></tr>)}</tbody></table></div>}
        </div>

        {modal === 'add' && examId && <AddModal examId={examId} rooms={rooms} academicYear={academicYear} examType={examType} close={() => setModal(null)} onSaved={(allocation) => { setAllocations((current) => [allocation, ...current]); setMessage('Seating added successfully.'); }} />}
        {modal === 'edit' && examId && editing && <EditModal examId={examId} allocation={editing} rooms={rooms} academicYear={academicYear} examType={examType} close={() => { setModal(null); setEditing(null); }} onSaved={(allocation) => { setAllocations((current) => current.map((item) => item._id === allocation._id ? allocation : item)); setMessage('Seating updated successfully.'); setEditing(null); }} />}
        {modal === 'import' && examId && <ImportModal examId={examId} academicYear={academicYear} examType={examType} close={() => setModal(null)} onImported={(msg) => { setMessage(msg); loadExam(examId); }} />}
      </div>
    </div>
  );
}
