import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, GraduationCap, MoreVertical, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import api from '../../../lib/axios';
import BulkEntityImportModal from './components/bulk-entity-import-modal';
import { useAuth } from '../../../store/auth-context';
import { resolveInstitutionType, isHigherEdInstitutionType } from '../../../lib/institution-type';

type Status = 'active' | 'inactive' | 'completed';
type Shift = 'Morning' | 'Afternoon' | 'Evening' | 'Virtual';
type AcademicSystem = 'annual' | 'semester';
type SchoolClassTab = 'active' | 'completed';
type PromotionAction = 'promote-new' | 'promote-existing' | 'graduate' | 'already-promoted' | 'skipped';

interface Organization { _id: string; name: string; institutionType?: string; organizationType?: string; }
interface Faculty { _id: string; name: string; code?: string; }
interface Department { _id: string; name: string; code?: string; facultyId?: string | Faculty | null; }
interface Program { _id: string; name: string; code?: string; department?: string | { _id: string; name: string } | null; }
interface AcademicStructure { _id: string; school: string; academicSystem: AcademicSystem; semestersPerAcademicYear: 1 | 2 | 3; usesFaculty?: boolean; }
interface ClassItem {
  _id: string;
  title: string;
  section?: string;
  room: string;
  department?: string;
  departmentId?: string;
  program?: string;
  programId?: string;
  capacity?: number;
  shiftMode?: Shift;
  status: Status;
  batch?: string;
  gradeLevel?: number;
  academicYear?: string;
  studyYear?: number;
  semesterNumber?: number;
  semesterInYear?: number;
  isGraduatingGrade?: boolean;
  isEntryGrade?: boolean;
}
interface ClassForm {
  faculty: string;
  department: string;
  program: string;
  capacity: string;
  title: string;
  section: string;
  room: string;
  shiftMode: Shift;
  batch: string;
  gradeLevel: string;
  academicYear: string;
  studyYear: string;
  semesterNumber: string;
  isGraduatingGrade: boolean;
  isEntryGrade: boolean;
}
interface PromotionGroup {
  classId: string;
  title: string;
  section?: string;
  gradeLevel: number;
  studentCount: number;
  action: PromotionAction;
  targetClassId?: string;
  targetTitle?: string;
  targetGradeLevel?: number;
  targetCourseCount?: number;
  sourceCourseCount?: number;
  willCreateTarget?: boolean;
  willCopyCurriculum?: boolean;
  reason?: string;
}
interface PromotionPreview {
  sourceAcademicYear: string;
  targetAcademicYear: string;
  suggestedAcademicYear: string;
  groups: PromotionGroup[];
  entryIntakesToOpen?: number;
  missingGradeLevel?: Array<{ classId: string; title: string; section?: string }>;
}
interface PromotionResult {
  sourceAcademicYear: string;
  targetAcademicYear: string;
  promoted: number;
  graduated: number;
  skipped: number;
  studentsMoved: number;
  intakesOpened: number;
  targetsCreated: number;
  coursesCopied: number;
}

interface RowActionsProps {
  item: ClassItem;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-800';
const years = Array.from({ length: 8 }, (_, i) => { const y = new Date().getFullYear() - 3 + i; return `${y}-${y + 1}`; });
const dataOf = <T,>(r: any): T => r?.data?.data ?? r?.data ?? r;
const errOf = (e: any) => e?.response?.data?.message || e?.message || 'Something went wrong. Please try again.';
const fid = (d: Department) => typeof d.facultyId === 'string' ? d.facultyId : d.facultyId?._id || '';
const pid = (p: Program) => typeof p.department === 'string' ? p.department : p.department?._id || '';
const semesterYear = (semester: number, perYear: number) => Math.ceil(semester / perYear);
const semesterInYear = (semester: number, perYear: number) => ((semester - 1) % perYear) + 1;

function Field({ label, required, children, className = '' }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">{label}{required ? ' *' : ''}</span>{children}</label>;
}

function RowActions({ item, open, onToggle, onClose, onEdit, onDuplicate, onToggleStatus, onDelete }: RowActionsProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const placeMenu = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 192;
      const estimatedHeight = item.status === 'completed' ? 142 : 184;
      const top = window.innerHeight - rect.bottom >= estimatedHeight + 8
        ? rect.bottom + 4
        : Math.max(8, rect.top - estimatedHeight - 4);
      setPosition({ top, left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)) });
    };
    placeMenu();
    window.addEventListener('resize', placeMenu);
    const closeOnScroll = () => onCloseRef.current();
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [item.status, open]);

  return <div className="inline-flex">
    <button ref={buttonRef} type="button" aria-label={`Actions for ${item.title}`} aria-haspopup="menu" aria-expanded={open} onClick={onToggle} className="rounded-lg border border-transparent p-2 text-slate-600 hover:border-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"><MoreVertical size={17}/></button>
    {open && createPortal(<>
      <button type="button" className="fixed inset-0 z-[190] cursor-default" aria-label="Close class actions" onClick={onClose}/>
      <div role="menu" style={{ top: position.top, left: position.left }} className="fixed z-[200] w-48 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <button type="button" role="menuitem" onClick={onEdit} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil size={15}/> Edit</button>
        <button type="button" role="menuitem" onClick={onDuplicate} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><Copy size={15}/> Duplicate / Copy</button>
        {item.status !== 'completed' && <button type="button" role="menuitem" onClick={onToggleStatus} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{item.status === 'active' ? <RefreshCw size={15}/> : <Plus size={15}/>} {item.status === 'active' ? 'Deactivate' : 'Activate'}</button>}
        <div className="my-1 border-t border-slate-100 dark:border-slate-800"/>
        <button type="button" role="menuitem" onClick={onDelete} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={15}/> Delete</button>
      </div>
    </>, document.body)}
  </div>;
}

function ClassModal({ cls, organization, structure, faculties, departments, programs, onClose, onSaved }: {
  cls?: ClassItem;
  organization: Organization | null;
  structure: AcademicStructure | null;
  faculties: Faculty[];
  departments: Department[];
  programs: Program[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const institutionType = resolveInstitutionType(organization);
  const higherEd = isHigherEdInstitutionType(institutionType);
  const isTrainingCenter = institutionType === 'training_center';
  const usesFaculty = higherEd && !!structure?.usesFaculty;
  const semesterMode = higherEd && structure?.academicSystem === 'semester';
  const perYear = structure?.semestersPerAcademicYear === 3 ? 3 : 2;
  const [form, setForm] = useState<ClassForm>(() => ({
    faculty: cls ? (departments.find(d => d._id === (cls.departmentId || '')) ? fid(departments.find(d => d._id === (cls.departmentId || ''))!) : '') : '',
    department: cls?.departmentId || '',
    program: cls?.programId || '',
    capacity: cls?.capacity == null ? '' : String(cls.capacity),
    title: cls?.title || '',
    section: cls?.section || '',
    room: cls?.room || '',
    shiftMode: cls?.shiftMode || 'Morning',
    batch: cls?.batch || '',
    gradeLevel: cls?.gradeLevel == null ? '' : String(cls.gradeLevel),
    academicYear: cls?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    studyYear: cls?.studyYear == null ? (cls?.semesterNumber ? String(semesterYear(cls.semesterNumber, perYear)) : '') : String(cls.studyYear),
    semesterNumber: cls?.semesterNumber == null ? '' : String(cls.semesterNumber),
    isGraduatingGrade: !!cls?.isGraduatingGrade,
    isEntryGrade: !!cls?.isEntryGrade,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const availableDepartments = useMemo(() => usesFaculty ? (form.faculty ? departments.filter(d => fid(d) === form.faculty) : []) : departments, [departments, form.faculty, usesFaculty]);
  const availablePrograms = useMemo(() => programs.filter(p => !pid(p) || pid(p) === form.department), [programs, form.department]);
  const set = <K extends keyof ClassForm>(key: K, value: ClassForm[K]) => setForm(x => ({ ...x, [key]: value }));
  const selectedSemester = Number(form.semesterNumber);
  const derivedStudyYear = semesterMode && selectedSemester > 0 ? semesterYear(selectedSemester, perYear) : Number(form.studyYear);
  const derivedSemesterInYear = semesterMode && selectedSemester > 0 ? semesterInYear(selectedSemester, perYear) : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const isNewDepartment = form.department === '__new_department__';
    if (!isTrainingCenter && !form.department) return setError('Department is required.');
    if (isNewDepartment && !newDepartmentName.trim()) return setError('Enter the new department name.');
    if (higherEd && !form.program) return setError('Program is required for college and university classes.');
    if (!form.title.trim()) return setError(higherEd ? 'Program / Cohort Name is required.' : isTrainingCenter ? 'Program / Course Name is required.' : 'Class Name is required.');
    if (!form.room.trim()) return setError('Room is required.');
    if (!form.academicYear) return setError('Academic Year is required.');
    if (institutionType === 'school' && (!form.batch.trim() || !form.gradeLevel)) return setError('Batch Number and Grade Level are required for schools.');
    if (isTrainingCenter && !form.batch.trim()) return setError('Batch / Cohort is required.');
    if (higherEd && semesterMode && !form.semesterNumber) return setError('Semester Number is required.');
    if (higherEd && !semesterMode && !form.studyYear) return setError('Study Year is required.');
    if (form.capacity && (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1)) return setError('Capacity must be a whole number of at least 1.');

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        department: isNewDepartment ? null : form.department || null,
        departmentName: isNewDepartment ? newDepartmentName.trim() : undefined,
        program: form.program || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        title: form.title.trim(),
        section: form.section.trim(),
        room: form.room.trim(),
        shiftMode: form.shiftMode,
        academicYear: form.academicYear,
      };
      if (institutionType === 'school') {
        payload.batch = form.batch.trim();
        payload.gradeLevel = Number(form.gradeLevel);
        payload.isGraduatingGrade = form.isGraduatingGrade;
        payload.isEntryGrade = form.isEntryGrade;
      }
      if (isTrainingCenter) payload.batch = form.batch.trim();
      if (higherEd) {
        payload.studyYear = semesterMode ? derivedStudyYear : Number(form.studyYear);
        payload.semesterNumber = semesterMode ? selectedSemester : null;
        payload.semesterInYear = semesterMode ? derivedSemesterInYear : null;
      }
      if (cls) await api.patch(`/classes/${cls._id}`, payload); else await api.post('/classes', payload);
      await onSaved();
    } catch (e) {
      setError(errOf(e));
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
    <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl dark:bg-slate-950">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
        <div><h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">{cls ? 'Edit Class' : higherEd ? 'Add Academic Class' : isTrainingCenter ? 'Add Program' : 'Add Class'}</h2><p className="mt-0.5 text-xs text-slate-500">{higherEd ? (semesterMode ? `Semester-based • ${perYear} semesters/year` : 'Annual progression') : isTrainingCenter ? 'Training program / batch structure' : 'School class structure'}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18}/></button>
      </div>
      <form id="class-modal-form" onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {higherEd ? <>
          {usesFaculty ? <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="mb-3 flex items-center gap-2"><GraduationCap size={17}/><span className="text-sm font-semibold">Faculty &amp; Department</span></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Faculty" required><select className={inputClass} value={form.faculty} onChange={e => setForm(x => ({ ...x, faculty: e.target.value, department: '' }))}><option value="">Select Faculty</option>{faculties.map(f => <option key={f._id} value={f._id}>{f.name}{f.code ? ` (${f.code})` : ''}</option>)}</select></Field>
              <Field label="Department" required><select className={inputClass} value={form.department} onChange={e => set('department', e.target.value)} disabled={!form.faculty}><option value="">{form.faculty ? 'Select Department' : 'Select Faculty first'}</option>{availableDepartments.map(d => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}</select></Field>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Faculty and Department are managed from Institution Structure.</p>
          </div> : <div className="mb-5"><Field label="Department" required><select className={inputClass} value={form.department} onChange={e => set('department', e.target.value)}><option value="">Select Department</option>{departments.map(d => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}</select></Field></div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Program / Cohort Name" required className="sm:col-span-2"><input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. BSc Computer Science - Cohort 2026"/></Field>
            <Field label="Program" required><select className={inputClass} value={form.program} onChange={e => set('program', e.target.value)}><option value="">Select program</option>{availablePrograms.map(p => <option key={p._id} value={p._id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}</select></Field>
            <Field label="Academic Year" required><select className={inputClass} value={form.academicYear} onChange={e => set('academicYear', e.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select></Field>
            {semesterMode ? <>
              <Field label="Semester Number" required><select className={inputClass} value={form.semesterNumber} onChange={e => set('semesterNumber', e.target.value)}><option value="">Select Semester</option>{Array.from({ length: 12 }, (_, i) => i + 1).map(s => <option key={s} value={s}>Semester {s}</option>)}</select></Field>
              <Field label="Study Year"><input className={`${inputClass} bg-slate-100 dark:bg-slate-800`} readOnly value={derivedStudyYear || ''}/></Field>
              <Field label="Semester in Academic Year"><input className={`${inputClass} bg-slate-100 dark:bg-slate-800`} readOnly value={derivedSemesterInYear ? `Semester ${derivedSemesterInYear} of ${perYear}` : ''}/></Field>
            </> : <Field label="Study Year" required><input type="number" min="1" max="30" className={inputClass} value={form.studyYear} onChange={e => set('studyYear', e.target.value)} placeholder="e.g. 1"/></Field>}
            <Field label="Section"><input className={inputClass} value={form.section} onChange={e => set('section', e.target.value)} placeholder="e.g. A"/></Field>
            <Field label="Room" required><input className={inputClass} value={form.room} onChange={e => set('room', e.target.value)} placeholder="e.g. Hall 204"/></Field>
            <Field label="Capacity (optional)"><input type="number" min="1" className={inputClass} value={form.capacity} onChange={e => set('capacity', e.target.value)} placeholder="e.g. 80"/></Field>
            <Field label="Shift / Learning Mode"><select className={inputClass} value={form.shiftMode} onChange={e => set('shiftMode', e.target.value as Shift)}>{['Morning','Afternoon','Evening','Virtual'].map(x => <option key={x}>{x}</option>)}</select></Field>
          </div>
        </> : isTrainingCenter ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Program / Course Name" required className="sm:col-span-2"><input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Web Development Bootcamp"/></Field>
          <Field label="Program (optional)"><select className={inputClass} value={form.program} onChange={e => set('program', e.target.value)}><option value="">No program</option>{availablePrograms.map(p => <option key={p._id} value={p._id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}</select></Field>
          <Field label="Batch / Cohort" required><input className={inputClass} value={form.batch} onChange={e => set('batch', e.target.value)} placeholder="e.g. B12"/></Field>
          <Field label="Academic Year / Term" required><select className={inputClass} value={form.academicYear} onChange={e => set('academicYear', e.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select></Field>
          <Field label="Department (optional)"><select className={inputClass} value={form.department} onChange={e => set('department', e.target.value)}><option value="">No department</option>{departments.map(d => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}</select></Field>
          <Field label="Section"><input className={inputClass} value={form.section} onChange={e => set('section', e.target.value)} placeholder="e.g. A"/></Field>
          <Field label="Room" required><input className={inputClass} value={form.room} onChange={e => set('room', e.target.value)} placeholder="e.g. Lab 1"/></Field>
          <Field label="Capacity (optional)"><input type="number" min="1" className={inputClass} value={form.capacity} onChange={e => set('capacity', e.target.value)} placeholder="e.g. 20"/></Field>
          <Field label="Shift / Delivery Mode"><select className={inputClass} value={form.shiftMode} onChange={e => set('shiftMode', e.target.value as Shift)}>{['Morning','Afternoon','Evening','Virtual'].map(x => <option key={x}>{x}</option>)}</select></Field>
        </div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Batch Number" required><input className={inputClass} value={form.batch} onChange={e => set('batch', e.target.value)} placeholder="e.g. SCH26"/></Field>
          <Field label="Academic Year" required><select className={inputClass} value={form.academicYear} onChange={e => set('academicYear', e.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select></Field>
          <Field label="Grade Level" required><input type="number" min="0" max="30" className={inputClass} value={form.gradeLevel} onChange={e => set('gradeLevel', e.target.value)} placeholder="e.g. 8"/></Field>
          <Field label="Department" required><select className={inputClass} value={form.department} onChange={e => { set('department', e.target.value); if (e.target.value !== '__new_department__') setNewDepartmentName(''); }}><option value="">Select Department</option>{departments.map(d => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}<option value="__new_department__">+ Create new department</option></select>{form.department === '__new_department__' && <input autoFocus className={`${inputClass} mt-2`} value={newDepartmentName} onChange={e => setNewDepartmentName(e.target.value)} placeholder="New department name" />}</Field>
          <Field label="Class Name" required className="sm:col-span-2"><input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Grade 8"/></Field>
          <Field label="Section"><input className={inputClass} value={form.section} onChange={e => set('section', e.target.value)} placeholder="e.g. A"/></Field>
          <Field label="Room" required><input className={inputClass} value={form.room} onChange={e => set('room', e.target.value)} placeholder="e.g. Room 8"/></Field>
          <Field label="Capacity (optional)"><input type="number" min="1" className={inputClass} value={form.capacity} onChange={e => set('capacity', e.target.value)} placeholder="e.g. 35"/></Field>
          <Field label="Shift / Learning Mode"><select className={inputClass} value={form.shiftMode} onChange={e => set('shiftMode', e.target.value as Shift)}>{['Morning','Afternoon','Evening','Virtual'].map(x => <option key={x}>{x}</option>)}</select></Field>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isGraduatingGrade} onChange={e => set('isGraduatingGrade', e.target.checked)}/> Final Grade</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isEntryGrade} onChange={e => set('isEntryGrade', e.target.checked)}/> Entry Grade</label></div>
        </div>}
      </form>
      <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:justify-end sm:px-6 dark:border-slate-800 dark:bg-slate-950"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold sm:flex-none dark:border-slate-700">Cancel</button><button type="submit" form="class-modal-form" disabled={saving} className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none dark:bg-white dark:text-slate-900">{saving ? 'Saving...' : cls ? 'Save Changes' : 'Add Class'}</button></div>
    </div>
  </div>;
}

function SchoolPromotionModal({ onClose, onCompleted }: { onClose: () => void; onCompleted: () => Promise<void> | void }) {
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [result, setResult] = useState<PromotionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await api.get('/classes/promotion-preview');
        if (active) setPreview(dataOf<PromotionPreview>(response));
      } catch (e) {
        if (active) setError(errOf(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const execute = async () => {
    if (!preview || running) return;
    setRunning(true);
    setError('');
    try {
      const response = await api.post('/classes/promote-all', { targetAcademicYear: preview.targetAcademicYear });
      setResult(dataOf<PromotionResult>(response));
      await onCompleted();
    } catch (e) {
      setError(errOf(e));
    } finally {
      setRunning(false);
    }
  };

  const actionable = preview?.groups.filter(g => g.action === 'promote-new' || g.action === 'promote-existing' || g.action === 'graduate') || [];
  const studentTotal = actionable.reduce((sum, g) => sum + (g.studentCount || 0), 0);
  const skipped = preview?.groups.filter(g => g.action === 'skipped') || [];

  return <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4">
    <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl dark:bg-slate-950">
      <div className="flex shrink-0 items-start justify-between border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
        <div><h2 className="text-lg font-bold text-slate-900 dark:text-white">End Academic Year &amp; Promote Students</h2><p className="mt-1 text-xs text-slate-500">One review, one confirmation. Existing history is kept.</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18}/></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {loading ? <div className="py-12 text-center text-sm text-slate-500">Preparing promotion preview...</div> : error && !preview ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div> : result ? <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30"><div className="font-bold text-emerald-800 dark:text-emerald-200">Promotion completed successfully</div><p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">{result.sourceAcademicYear} → {result.targetAcademicYear}</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="text-xl font-bold">{result.studentsMoved}</div><div className="text-xs text-slate-500">Students promoted</div></div>
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="text-xl font-bold">{result.graduated}</div><div className="text-xs text-slate-500">Graduated</div></div>
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="text-xl font-bold">{result.targetsCreated}</div><div className="text-xs text-slate-500">Classes prepared</div></div>
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="text-xl font-bold">{result.intakesOpened}</div><div className="text-xs text-slate-500">New intakes</div></div>
          </div>
          {result.skipped > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">{result.skipped} class(es) were skipped. Review the class setup before promoting those students.</div>}
        </div> : preview ? <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Academic year</div><div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{preview.sourceAcademicYear} → {preview.targetAcademicYear}</div></div><GraduationCap className="text-slate-500" size={28}/></div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white p-2 dark:bg-slate-950"><div className="font-bold">{actionable.length}</div><div className="text-[11px] text-slate-500">Classes</div></div><div className="rounded-xl bg-white p-2 dark:bg-slate-950"><div className="font-bold">{studentTotal}</div><div className="text-[11px] text-slate-500">Students</div></div><div className="rounded-xl bg-white p-2 dark:bg-slate-950"><div className="font-bold">{preview.entryIntakesToOpen || 0}</div><div className="text-[11px] text-slate-500">New intakes</div></div></div>
          </div>

          <div className="space-y-2">
            {preview.groups.map(group => {
              const isSkipped = group.action === 'skipped';
              const isGraduate = group.action === 'graduate';
              const isDone = group.action === 'already-promoted';
              const targetText = isGraduate ? 'Graduated' : isDone ? 'Already promoted' : `Grade ${group.targetGradeLevel ?? group.gradeLevel + 1}`;
              return <div key={group.classId} className={`rounded-xl border p-3 ${isSkipped ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-slate-900 dark:text-white">{group.title}{group.section ? ` · ${group.section}` : ''}</div><div className="mt-1 text-sm text-slate-600 dark:text-slate-300">Grade {group.gradeLevel} → {targetText}</div></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{group.studentCount} student{group.studentCount === 1 ? '' : 's'}</span></div>
                {group.willCreateTarget && !isSkipped && <div className="mt-2 text-xs font-medium text-blue-700 dark:text-blue-300">New class will be created automatically.</div>}
                {group.willCopyCurriculum && !isSkipped && <div className="mt-1 text-xs text-slate-500">Grade curriculum will be copied automatically.</div>}
                {group.reason && <div className={`mt-2 text-xs ${isSkipped ? 'text-amber-800 dark:text-amber-200' : 'text-slate-500'}`}>{group.reason}</div>}
              </div>;
            })}
            {!preview.groups.length && <div className="rounded-xl border border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800">No active classes are ready for year-end promotion.</div>}
          </div>

          {!!preview.entryIntakesToOpen && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">The system will also prepare {preview.entryIntakesToOpen} empty entry-grade class(es) for new students in {preview.targetAcademicYear}.</div>}
          {!!preview.missingGradeLevel?.length && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">{preview.missingGradeLevel.length} class(es) have no Grade Level and will not be touched.</div>}
          {!!skipped.length && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{skipped.length} class(es) need attention before their students can be promoted.</div>}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        </div> : null}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:justify-end sm:px-6 dark:border-slate-800 dark:bg-slate-950">
        {result ? <button type="button" onClick={onClose} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white sm:w-auto dark:bg-white dark:text-slate-900">Done</button> : <><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold sm:flex-none dark:border-slate-700">Cancel</button><button type="button" onClick={() => void execute()} disabled={!preview || !actionable.length || running} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none">{running ? 'Promoting...' : `Confirm & Promote to ${preview?.targetAcademicYear || ''}`}</button></>}
      </div>
    </div>
  </div>;
}

export function ClassesManage() {
  const { user, isLoading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [structure, setStructure] = useState<AcademicStructure | null>(null);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [schoolTab, setSchoolTab] = useState<SchoolClassTab>('active');
  const [modal, setModal] = useState<{ open: boolean; cls?: ClassItem }>({ open: false });
  const [menu, setMenu] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [academicSystem, setAcademicSystem] = useState<AcademicSystem>('annual');
  const [semestersPerYear, setSemestersPerYear] = useState<2 | 3>(2);

  const orgId = user?.organizationId;
  const institutionType = resolveInstitutionType(organization);
  const higherEd = isHigherEdInstitutionType(institutionType);
  const isTrainingCenter = institutionType === 'training_center';
  const semesterMode = higherEd && academicSystem === 'semester';

  const loadMeta = useCallback(async () => {
    if (!orgId) return;
    const o = await api.get(`/schools/${orgId}`);
    const org = dataOf<Organization>(o);
    setOrganization(org);
    const [f, d, pr, s] = await Promise.all([
      api.get(`/departments/faculties?school=${orgId}`),
      api.get(`/departments?school=${orgId}`),
      api.get(`/programs?school=${orgId}`),
      api.get('/classes/academic-structure'),
    ]);
    const st = dataOf<AcademicStructure>(s);
    setFaculties(dataOf<Faculty[]>(f) || []);
    setDepartments(dataOf<Department[]>(d) || []);
    setPrograms(dataOf<Program[]>(pr) || []);
    setStructure(st);
    setAcademicSystem(st?.academicSystem || (isHigherEdInstitutionType(resolveInstitutionType(org)) ? 'semester' : 'annual'));
    setSemestersPerYear(st?.semestersPerAcademicYear === 3 ? 3 : 2);
  }, [orgId]);

  const loadClasses = useCallback(async (spin = true) => {
    if (spin) setLoading(true); else setRefreshing(true);
    try {
      const p = new URLSearchParams({ limit: '200' });
      if (search.trim()) p.set('search', search.trim());
      if (institutionType !== 'school' && status !== 'all') p.set('status', status);
      const r = await api.get(`/classes?${p}`);
      setClasses(dataOf<ClassItem[]>(r) || []);
      setError('');
    } catch (e) {
      setError(errOf(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, status, institutionType]);

  useEffect(() => { if (!authLoading) loadMeta().catch(e => setError(errOf(e))); }, [authLoading, loadMeta]);
  useEffect(() => { if (!authLoading) loadClasses().catch(() => undefined); }, [authLoading, loadClasses]);
  const refresh = () => loadClasses(false);

  const remove = async (c: ClassItem) => {
    setRowMenu(null);
    if (!confirm(`Delete ${c.title}${c.section ? ` - ${c.section}` : ''}?`)) return;
    try { await api.delete(`/classes/${c._id}`); await refresh(); } catch (e) { setError(errOf(e)); }
  };
  const toggleStatus = async (c: ClassItem) => {
    setRowMenu(null);
    if (c.status === 'completed') return;
    try { await api.patch(`/classes/${c._id}/status`, { status: c.status === 'active' ? 'inactive' : 'active' }); await refresh(); } catch (e) { setError(errOf(e)); }
  };
  const duplicateClass = async (c: ClassItem) => {
    setRowMenu(null);
    if (!confirm(`Create a copy of ${c.title}${c.section ? ` - ${c.section}` : ''}?`)) return;
    try { await api.post(`/classes/${c._id}/duplicate`); await refresh(); } catch (e) { setError(errOf(e)); }
  };
  const bulkDelete = async () => {
    if (!selected.length || !confirm(`Delete ${selected.length} selected class(es)?`)) return;
    try { await api.delete('/classes/bulk', { data: { ids: selected } }); setSelected([]); await refresh(); } catch (e) { setError(errOf(e)); }
  };
  const advanceSemester = async () => {
    if (!semesterMode) return;
    const scope = selected.length ? `${selected.length} selected class(es)` : 'all active classes';
    if (!confirm(`Advance ${scope} to the next semester?\n\nExample: Year 1 Semester 2 → Year 2 Semester 3.`)) return;
    try { await api.post('/classes/advance-semester', selected.length ? { classIds: selected } : {}); setSelected([]); await refresh(); } catch (e) { setError(errOf(e)); }
  };
  const exportXlsx = async () => {
    try {
      const r = await api.get('/classes/export', { responseType: 'blob' });
      const u = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = u;
      a.download = `classes-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(u);
    } catch (e) { setError(errOf(e)); }
  };

  const schoolActiveCount = useMemo(() => classes.filter(c => c.status !== 'completed').length, [classes]);
  const schoolCompletedCount = useMemo(() => classes.filter(c => c.status === 'completed').length, [classes]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes
      .filter(c => {
        if (institutionType === 'school') {
          if (schoolTab === 'completed' && c.status !== 'completed') return false;
          if (schoolTab === 'active' && c.status === 'completed') return false;
        }
        return !q || `${c.title} ${c.section || ''} ${c.room || ''} ${c.department || ''} ${c.academicYear || ''} ${higherEd ? c.semesterNumber || '' : ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (institutionType !== 'school') return 0;
        const yearCompare = String(b.academicYear || '').localeCompare(String(a.academicYear || ''), undefined, { numeric: true });
        if (yearCompare !== 0) return yearCompare;
        const gradeA = a.gradeLevel ?? Number.MAX_SAFE_INTEGER;
        const gradeB = b.gradeLevel ?? Number.MAX_SAFE_INTEGER;
        if (gradeA !== gradeB) return gradeA - gradeB;
        const sectionCompare = String(a.section || '').localeCompare(String(b.section || ''), undefined, { numeric: true, sensitivity: 'base' });
        if (sectionCompare !== 0) return sectionCompare;
        return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [classes, search, higherEd, institutionType, schoolTab]);
  const switchSchoolTab = (tab: SchoolClassTab) => {
    setSchoolTab(tab);
    setSelected([]);
    setRowMenu(null);
  };
  const toggleSelected = (id: string) => setSelected(x => x.includes(id) ? x.filter(i => i !== id) : [...x, id]);
  const allSelected = filtered.length > 0 && filtered.every(c => selected.includes(c._id));
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map(c => c._id));
  const rowMenuFor = (c: ClassItem) => rowMenu === c._id ? null : c._id;
  const emptyText = institutionType === 'school' ? (schoolTab === 'active' ? 'No active classes found.' : 'No completed classes found.') : 'No classes found.';

  const rowActions = (c: ClassItem) => <RowActions item={c} open={rowMenu === c._id} onToggle={() => setRowMenu(rowMenuFor(c))} onClose={() => setRowMenu(null)} onEdit={() => { setRowMenu(null); setModal({ open: true, cls: c }); }} onDuplicate={() => void duplicateClass(c)} onToggleStatus={() => void toggleStatus(c)} onDelete={() => void remove(c)}/>;

  const statusBadge = (c: ClassItem) => {
    const cls = `rounded-full px-2.5 py-1 text-xs font-semibold ${c.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : c.status === 'completed' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`;
    return c.status === 'completed' ? <span className={cls}>{c.status}</span> : <button onClick={() => void toggleStatus(c)} className={cls}>{c.status}</button>;
  };

  return <div className="space-y-5 p-4 sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><h1 className="text-xl font-bold text-slate-900 dark:text-white">Manage Classes</h1><p className="mt-1 text-sm text-slate-500">{organization?.name || 'Organization'} · {higherEd ? 'Academic classes / cohorts' : isTrainingCenter ? 'Training programs / batches' : 'School classes'}</p></div>
      <div className="relative shrink-0">
        <button aria-label="Class actions" onClick={() => setMenu(!menu)} className="rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><MoreVertical size={18}/></button>
        {menu && <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <button onClick={() => { setMenu(false); setModal({ open: true }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"><Plus size={16}/> {higherEd ? 'Add Academic Class' : isTrainingCenter ? 'Add Program' : 'Add Class'}</button>
          <button onClick={() => { setMenu(false); void exportXlsx(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><Download size={16}/> Export Classes</button>
          <button onClick={() => { setMenu(false); setShowImportModal(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><Upload size={16}/> Import Classes</button>
          {institutionType === 'school' && <button onClick={() => { setMenu(false); setShowPromotionModal(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"><GraduationCap size={16}/> End Academic Year &amp; Promote</button>}
          {selected.length > 0 && <button onClick={() => { setMenu(false); void bulkDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={16}/> Delete Selected</button>}
        </div>}
      </div>
    </div>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

    {institutionType === 'school' && <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
      <button type="button" onClick={() => switchSchoolTab('active')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${schoolTab === 'active' ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-950 dark:text-emerald-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}><span>Active</span><span className={`rounded-full px-2 py-0.5 text-[11px] ${schoolTab === 'active' ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-slate-200 dark:bg-slate-800'}`}>{schoolActiveCount}</span></button>
      <button type="button" onClick={() => switchSchoolTab('completed')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${schoolTab === 'completed' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}><span>Completed</span><span className={`rounded-full px-2 py-0.5 text-[11px] ${schoolTab === 'completed' ? 'bg-blue-50 dark:bg-blue-950/40' : 'bg-slate-200 dark:bg-slate-800'}`}>{schoolCompletedCount}</span></button>
    </div>}

    <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input className={`${inputClass} pl-9`} value={search} onChange={e => setSearch(e.target.value)} placeholder={higherEd ? 'Search class, program, room, semester...' : isTrainingCenter ? 'Search program, batch, room...' : schoolTab === 'completed' ? 'Search completed class, grade, year...' : 'Search active class, grade, room...'}/></div>{institutionType !== 'school' && <select className={`${inputClass} sm:w-44`} value={status} onChange={e => setStatus(e.target.value as 'all' | Status)}><option value="all">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="completed">Completed</option></select>}<button onClick={() => void refresh()} className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700" title="Refresh"><RefreshCw size={17} className={refreshing ? 'animate-spin' : ''}/></button></div>

    {selected.length > 0 && <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900"><span>{selected.length} class(es) selected</span>{semesterMode && <button onClick={() => void advanceSemester()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">Advance Selected Semester</button>}</div>}

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="hidden overflow-x-auto lg:block"><table className="w-full table-fixed text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900"><tr><th className="w-10 px-4 py-3"><input type="checkbox" checked={allSelected} onChange={toggleAll}/></th><th className="w-[22%] px-4 py-3">{higherEd ? 'Program / Cohort' : isTrainingCenter ? 'Program' : 'Class / Grade'}</th><th className="w-[18%] px-4 py-3">Department</th>{higherEd && <th className="px-4 py-3">Progression</th>}<th className="w-[14%] px-4 py-3">Academic Year</th><th className="w-[17%] px-4 py-3">{institutionType === 'school' ? 'Room / Capacity' : 'Room'}</th><th className="w-[9%] px-4 py-3">Status</th><th className="w-[8%] px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? <tr><td colSpan={higherEd ? 8 : 7} className="px-4 py-10 text-center text-slate-500">Loading...</td></tr> : filtered.length === 0 ? <tr><td colSpan={higherEd ? 8 : 7} className="px-4 py-10 text-center text-slate-500">{emptyText}</td></tr> : filtered.map(c => <tr key={c._id} className="hover:bg-slate-50 dark:hover:bg-slate-900/60"><td className="px-4 py-3"><input type="checkbox" checked={selected.includes(c._id)} onChange={() => toggleSelected(c._id)}/></td><td className="px-4 py-3"><div className="font-semibold text-slate-900 dark:text-white">{c.title}</div><div className="text-xs text-slate-500">{institutionType === 'school' && c.batch ? `Batch ${c.batch}` : ''}{c.section ? `${institutionType === 'school' && c.batch ? ' · ' : ''}Section ${c.section}` : ''}{institutionType === 'school' && c.gradeLevel != null ? ` · Grade ${c.gradeLevel}` : ''}{isTrainingCenter && c.batch ? ` · Batch ${c.batch}` : ''}</div></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.department || '—'}{c.program ? <span className="block text-xs text-slate-400">{c.program}</span> : null}</td>{higherEd && <td className="px-4 py-3">{c.semesterNumber ? <><span className="font-semibold">Y{c.studyYear || semesterYear(c.semesterNumber, semestersPerYear)} S{c.semesterNumber}</span><span className="ml-2 text-xs text-slate-500">({c.semesterInYear || semesterInYear(c.semesterNumber, semestersPerYear)}/{semestersPerYear})</span></> : `Year ${c.studyYear || '—'}`}</td>}<td className="px-4 py-3">{c.academicYear || '—'}</td><td className="px-4 py-3">{c.room}{c.capacity ? <span className="block text-xs text-slate-400">Cap. {c.capacity}</span> : null}{institutionType === 'school' && c.shiftMode ? <span className="block text-xs text-slate-400">{c.shiftMode}</span> : null}</td><td className="px-4 py-3">{statusBadge(c)}</td><td className="px-4 py-3 text-right">{rowActions(c)}</td></tr>)}
      </tbody></table></div>
      <div className="divide-y divide-slate-100 lg:hidden dark:divide-slate-800">{loading ? <div className="px-4 py-10 text-center text-slate-500">Loading...</div> : filtered.length === 0 ? <div className="px-4 py-10 text-center text-slate-500">{emptyText}</div> : filtered.map(c => <div key={c._id} className="p-4"><div className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={selected.includes(c._id)} onChange={() => toggleSelected(c._id)}/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-slate-900 dark:text-white"><span className="font-semibold">{c.title}</span>{c.section && <span className="text-xs text-slate-500">· Section {c.section}</span>}<span className="text-xs text-slate-500">· Room {c.room}</span></div><div className="mt-1.5 text-xs text-slate-500"><span>{c.department || 'No department'}</span>{c.batch && <span> · Batch {c.batch}</span>}</div></div>{rowActions(c)}</div>{higherEd && <div className="mt-2 text-xs font-medium">{c.semesterNumber ? `Year ${c.studyYear || semesterYear(c.semesterNumber, semestersPerYear)} · Semester ${c.semesterNumber}` : `Year ${c.studyYear || '—'}`}</div>}<div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{c.academicYear || 'No academic year'}</span>{statusBadge(c)}</div></div></div></div>)}</div>
    </div>

    {semesterMode && selected.length === 0 && filtered.length > 0 && <button onClick={() => void advanceSemester()} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900">Advance All Active Classes to Next Semester</button>}

    {showImportModal && <BulkEntityImportModal
      title="Import Classes"
      description="Download the 12-class school template, generate and import the same classes instantly, upload a completed file, or paste spreadsheet rows."
      templateUrl="/classes/template"
      generateImportUrl="/classes/generate"
      generateTemplateDescription="Import the same 12 classes instantly without uploading a file."
      importUrl="/classes/import"
      templateName="classes-template.xlsx"
      headers={institutionType === 'school' ? ['Batch Number', 'Academic Year', 'Grade Level', 'Department', 'Class Name', 'Section', 'Room', 'Capacity', 'Shift / Learning Mode', 'Final Grade (Yes/No)', 'Entry Grade (Yes/No)'] : ['Organization', 'Faculty', 'Department', 'Program', 'Batch Number', 'Grade Level', 'Academic Year', 'Study Year', 'Semester Number', 'Semester In Year', 'Final Grade (Yes/No)', 'Entry Grade (Yes/No)', 'Class Name', 'Section', 'Room', 'Capacity', 'Shift / Learning Mode']}
      onClose={() => setShowImportModal(false)}
      onImported={refresh}
    />}
    {showPromotionModal && <SchoolPromotionModal onClose={() => setShowPromotionModal(false)} onCompleted={refresh}/>} 
    {modal.open && <ClassModal cls={modal.cls} organization={organization} structure={{ ...(structure || { _id: '', school: orgId || '', academicSystem, semestersPerAcademicYear: semestersPerYear }), academicSystem, semestersPerAcademicYear: semestersPerYear } as AcademicStructure} faculties={faculties} departments={departments} programs={programs} onClose={() => setModal({ open: false })} onSaved={async () => { setModal({ open: false }); await refresh(); }}/>} 
  </div>;
}
