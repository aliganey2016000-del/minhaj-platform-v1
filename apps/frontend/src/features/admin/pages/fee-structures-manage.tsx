/**
 * Fee Structures — Admin CRUD
 * Reusable fee templates (Tuition, Registration, Library, Transport, etc.)
 * scoped to a whole school, a Department, or a Class. Invoices are generated
 * FROM these on the separate Invoices page — editing a structure here never
 * retroactively touches invoices already generated from it.
 */

import { useEffect, useState, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Receipt, Pencil, Trash2, MoreVertical, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { ColumnFilterHeader, useColumnFilters } from '../components/column-filter-header';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchoolBrief { _id: string; name: string; }
interface DepartmentBrief { _id: string; name: string; code?: string; }
interface ClassBrief { _id: string; title: string; section: string; }

interface FeeStructure {
  _id: string;
  school?: { _id: string; name: string };
  title: string;
  description?: string;
  feeType: string;
  scopeType: 'school' | 'department' | 'class';
  scopeRef?: { _id: string; name?: string; title?: string; section?: string } | null;
  amount: number;
  billingCycle: 'one_time' | 'monthly' | 'termly' | 'annual';
  academicYear?: string;
  dueDayOffset: number;
  isActive: boolean;
  createdAt: string;
}

interface FeeStructureForm {
  school: string;
  title: string;
  description: string;
  feeType: string;
  scopeType: 'school' | 'department' | 'class';
  scopeRef: string;
  amount: string;
  billingCycle: string;
  academicYear: string;
  dueDayOffset: string;
  isActive: boolean;
}

function defaultAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const startY = now.getMonth() >= 7 ? y : y - 1;
  return `${startY}-${startY + 1}`;
}

const emptyForm: FeeStructureForm = {
  school: '', title: '', description: '', feeType: 'tuition', scopeType: 'school', scopeRef: '',
  amount: '', billingCycle: 'monthly', academicYear: defaultAcademicYear(), dueDayOffset: '14', isActive: true,
};

const FEE_TYPES = ['tuition', 'registration', 'exam', 'material', 'transport', 'library', 'activity', 'uniform', 'other'];
const BILLING_CYCLES: { value: string; label: string }[] = [
  { value: 'one_time', label: 'One-time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'termly', label: 'Termly' },
  { value: 'annual', label: 'Annual' },
];

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function ScopeBadge({ structure }: { structure: FeeStructure }) {
  if (structure.scopeType === 'school') {
    return <span className="rounded-full bg-slate-100 dark:bg-slate-800/50 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">School-wide</span>;
  }
  const label = structure.scopeType === 'department'
    ? structure.scopeRef?.name || 'Department'
    : structure.scopeRef ? `${structure.scopeRef.title || ''}${structure.scopeRef.section ? ` — ${structure.scopeRef.section}` : ''}` : 'Class';
  return <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{structure.scopeType === 'department' ? 'Dept: ' : 'Class: '}{label}</span>;
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive
    ? <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50 px-2.5 py-0.5 text-xs font-medium">Active</span>
    : <span className="rounded-full bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800 px-2.5 py-0.5 text-xs font-medium">Inactive</span>;
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${type === 'success' ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'}`}><span>{type === 'success' ? '✅' : '❌'}</span><span>{message}</span><button onClick={onClose} className="ml-2 text-lg leading-none opacity-60 hover:opacity-100">&times;</button></div>;
}

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function FeeStructureModal({ structure, schools, onClose, onSaved }: {
  structure?: FeeStructure; schools: SchoolBrief[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!structure;
  const [form, setForm] = useState<FeeStructureForm>(structure ? {
    school: structure.school?._id || '', title: structure.title, description: structure.description || '',
    feeType: structure.feeType, scopeType: structure.scopeType, scopeRef: structure.scopeRef?._id || '',
    amount: String(structure.amount), billingCycle: structure.billingCycle,
    academicYear: structure.academicYear || defaultAcademicYear(), dueDayOffset: String(structure.dueDayOffset), isActive: structure.isActive,
  } : emptyForm);
  const [departments, setDepartments] = useState<DepartmentBrief[]>([]);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FeeStructureForm, string>>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (!form.school) { setDepartments([]); setClasses([]); return; }
    (async () => {
      try { const { data } = await api.get('/departments', { params: { school: form.school } }); setDepartments(data.data || []); } catch { setDepartments([]); }
      try { const { data } = await api.get('/classes', { params: { schoolId: form.school, status: 'active', limit: '200' } }); setClasses(data.data || []); } catch { setClasses([]); }
    })();
  }, [form.school]);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FeeStructureForm, string>> = {};
    if (!form.school) errs.school = 'Organization is required';
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.amount.trim() || Number(form.amount) < 0) errs.amount = 'A valid amount is required';
    if (form.scopeType !== 'school' && !form.scopeRef) errs.scopeRef = `Select a ${form.scopeType}`;
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value, ...(name === 'scopeType' ? { scopeRef: '' } : {}) }));
    if (errors[name as keyof FeeStructureForm]) setErrors(p => { const n = { ...p }; delete n[name as keyof FeeStructureForm]; return n; });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); if (!validate()) return;
    setLoading(true); setApiError('');
    try {
      const payload: Record<string, unknown> = {
        school: form.school, title: form.title.trim(), description: form.description.trim(), feeType: form.feeType,
        scopeType: form.scopeType, scopeRef: form.scopeType === 'school' ? undefined : form.scopeRef,
        amount: Number(form.amount), billingCycle: form.billingCycle, academicYear: form.academicYear.trim(),
        dueDayOffset: Number(form.dueDayOffset),
      };
      if (isEdit) { payload.isActive = form.isActive; await api.patch(`/fee-structures/${structure._id}`, payload); }
      else await api.post('/fee-structures', payload);
      onSaved(); onClose();
    } catch (err: any) { setApiError(err.response?.data?.message || err.message || 'Failed to save fee structure'); } finally { setLoading(false); }
  };

  const ic = (f: keyof FeeStructureForm) => `w-full rounded-xl border px-3 py-2 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${errors[f] ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-border-default)]'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold text-[var(--color-text-primary)]">{isEdit ? '✏️ Edit Fee Structure' : '➕ Add Fee Structure'}</h2><button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
        {apiError && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{apiError}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Organization *</label><select className={ic('school')} name="school" value={form.school} onChange={handleChange} disabled={isEdit}><option value="">Select an organization...</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>{errors.school && <p className="mt-1 text-xs text-red-500">{errors.school}</p>}</div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Title *</label><input className={ic('title')} name="title" placeholder="e.g. Grade 5 Monthly Tuition" value={form.title} onChange={handleChange} />{errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}</div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Description</label><textarea className={ic('description')} name="description" rows={2} value={form.description} onChange={handleChange} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Fee Type</label><select className={ic('feeType')} name="feeType" value={form.feeType} onChange={handleChange}>{FEE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select></div>
            <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Billing Cycle</label><select className={ic('billingCycle')} name="billingCycle" value={form.billingCycle} onChange={handleChange}>{BILLING_CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Scope *</label>
            <select className={ic('scopeType')} name="scopeType" value={form.scopeType} onChange={handleChange} disabled={!form.school}>
              <option value="school">School-wide (every student)</option>
              <option value="department">A specific Department</option>
              <option value="class">A specific Class</option>
            </select>
            {form.scopeType === 'department' && (
              <select className={`${ic('scopeRef')} mt-2`} name="scopeRef" value={form.scopeRef} onChange={handleChange}><option value="">Select a department...</option>{departments.map(d => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}</select>
            )}
            {form.scopeType === 'class' && (
              <select className={`${ic('scopeRef')} mt-2`} name="scopeRef" value={form.scopeRef} onChange={handleChange}><option value="">Select a class...</option>{classes.map(c => <option key={c._id} value={c._id}>{c.title} — Section {c.section}</option>)}</select>
            )}
            {errors.scopeRef && <p className="mt-1 text-xs text-red-500">{errors.scopeRef}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Amount ($) *</label><input className={ic('amount')} name="amount" type="number" min={0} step="0.01" value={form.amount} onChange={handleChange} />{errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount}</p>}</div>
            <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Due Days Offset</label><input className={ic('dueDayOffset')} name="dueDayOffset" type="number" min={0} max={180} value={form.dueDayOffset} onChange={handleChange} /></div>
          </div>
          <div><label className="text-xs font-semibold text-[var(--color-text-primary)] mb-1 block">Academic Year</label><input className={ic('academicYear')} name="academicYear" placeholder="e.g. 2026-2027" value={form.academicYear} onChange={handleChange} /></div>
          {isEdit && (
            <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 cursor-pointer">
              <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30" />
              <span className="text-sm text-[var(--color-text-secondary)]">Active — available when generating invoices</span>
            </label>
          )}
          <div className="flex gap-2 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button><button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}{isEdit ? 'Update' : 'Create'}</button></div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row Actions
// ---------------------------------------------------------------------------

interface RowAction { label: string; icon: LucideIcon; onClick: () => void; tone: 'default' | 'danger' | 'success'; }
const rowActionTone: Record<RowAction['tone'], string> = { default: 'text-primary-600', success: 'text-green-600', danger: 'text-red-600' };

function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  return (<>
    <button ref={btnRef} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="rounded-lg border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-1.5 text-[var(--color-text-secondary)] shadow-sm hover:bg-[var(--color-surface-tertiary)] transition-colors" title="More Actions"><MoreVertical className="h-4 w-4" strokeWidth={1.75} /></button>
    {open && btnRef.current && createPortal(
      <div ref={menuRef} style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().bottom + 4, right: window.innerWidth - btnRef.current.getBoundingClientRect().right, zIndex: 100 }} className="w-44 rounded-xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] shadow-md py-1">
        {actions.map((a) => (<button key={a.label} onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick(); }} className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors ${rowActionTone[a.tone]}`}><a.icon className="h-3.5 w-3.5" strokeWidth={1.75} /> {a.label}</button>))}
      </div>,
      document.body,
    )}
  </>);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function FeeStructuresManage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const isOrgAdmin = user?.role === 'org_admin';

  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [feeTypeFilter, setFeeTypeFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingStructure, setEditingStructure] = useState<FeeStructure | undefined>(undefined);

  useEffect(() => { (async () => { try { const { data } = await api.get('/schools', { params: { limit: '100' } }); setSchools(data.data || []); } catch { /* ignore */ } })(); }, []);

  const fetchStructures = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = { limit: '100' };
      if (search) params.search = search;
      if (feeTypeFilter) params.feeType = feeTypeFilter;
      if (activeFilter) params.isActive = activeFilter;
      if (filterSchool) params.school = filterSchool;
      const { data } = await api.get('/fee-structures', { params });
      setStructures(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load fee structures');
    } finally {
      setLoading(false);
    }
  }, [search, feeTypeFilter, activeFilter, filterSchool]);

  useEffect(() => { fetchStructures(); }, [fetchStructures]);

  const columnAccessors: Record<string, (row: FeeStructure) => string> = {
    title: (r) => r.title,
    feeType: (r) => r.feeType,
    scope: (r) => r.scopeType,
    amount: (r) => String(r.amount),
    billingCycle: (r) => r.billingCycle,
    active: (r) => (r.isActive ? 'Active' : 'Inactive'),
  };
  const { displayedRows: displayedStructures } = useColumnFilters(structures, columnAccessors);

  const handleToggleActive = async (structure: FeeStructure) => {
    try {
      await api.patch(`/fee-structures/${structure._id}`, { isActive: !structure.isActive });
      setToast({ message: `Fee structure ${structure.isActive ? 'deactivated' : 'activated'}`, type: 'success' });
      fetchStructures();
    } catch (err: any) { setToast({ message: err.response?.data?.message || 'Failed to update', type: 'error' }); }
  };

  const handleDelete = async (structure: FeeStructure) => {
    if (!window.confirm(`Delete fee structure "${structure.title}"?`)) return;
    try {
      await api.delete(`/fee-structures/${structure._id}`);
      setToast({ message: 'Fee structure deleted', type: 'success' });
      fetchStructures();
    } catch (err: any) { setToast({ message: err.response?.data?.message || 'Failed to delete fee structure', type: 'error' }); }
  };

  const buildRowActions = (s: FeeStructure): RowAction[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setEditingStructure(s), tone: 'default' },
    s.isActive
      ? { label: 'Deactivate', icon: XCircle, onClick: () => handleToggleActive(s), tone: 'default' }
      : { label: 'Activate', icon: CheckCircle2, onClick: () => handleToggleActive(s), tone: 'success' },
    { label: 'Delete', icon: Trash2, onClick: () => handleDelete(s), tone: 'danger' },
  ];

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">
              <Receipt className="h-7 w-7 sm:h-8 sm:w-8 text-primary-600" strokeWidth={1.75} />
              Fee Structures
            </h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Reusable fee templates — Invoices are generated from these on the Invoices page.</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm whitespace-nowrap flex-shrink-0">+ Add Fee Structure</button>
        </div>

        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {(isSuperAdmin) && (<select value={filterSchool} onChange={e => setFilterSchool(e.target.value)} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Organizations</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>)}
            <input type="text" placeholder="Search by title..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
            <select value={feeTypeFilter} onChange={e => setFeeTypeFilter(e.target.value)} className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Fee Types</option>{FEE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select>
            <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Statuses</option><option value="true">Active</option><option value="false">Inactive</option></select>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm">{error}</p></div>}
        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}
        {!loading && !error && displayedStructures.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card"><p className="text-4xl mb-4">🧾</p><p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No fee structures found</p><p className="text-sm text-[var(--color-text-tertiary)]">Click "+ Add Fee Structure" to create one.</p></div>}

        {!loading && !error && displayedStructures.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]"><tr>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Title</th>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap hidden md:table-cell">Fee Type</th>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Scope</th>
              <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">Amount</th>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap hidden lg:table-cell">Billing Cycle</th>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap hidden lg:table-cell">Academic Year</th>
              <th className="text-center px-4 py-3 font-semibold whitespace-nowrap">Status</th>
              <th className="text-center px-4 py-3 font-semibold whitespace-nowrap">Actions</th>
            </tr></thead>
              <tbody>{displayedStructures.map(s => (
                <tr key={s._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                  <td className="px-4 py-3"><p className="font-semibold text-[var(--color-text-primary)]">{s.title}</p>{s.description && <p className="text-xs text-[var(--color-text-tertiary)] truncate max-w-xs">{s.description}</p>}</td>
                  <td className="px-4 py-3 hidden md:table-cell capitalize text-[var(--color-text-secondary)]">{s.feeType}</td>
                  <td className="px-4 py-3"><ScopeBadge structure={s} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--color-text-primary)]">${s.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 hidden lg:table-cell capitalize text-[var(--color-text-secondary)]">{s.billingCycle.replace('_', ' ')}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-[var(--color-text-secondary)]">{s.academicYear || '—'}</td>
                  <td className="px-4 py-3 text-center"><ActiveBadge isActive={s.isActive} /></td>
                  <td className="px-4 py-3 text-center"><RowActionsMenu actions={buildRowActions(s)} /></td>
                </tr>
              ))}</tbody></table></div>
          </div>
        )}
      </div>

      {(showCreate || editingStructure) && (
        <FeeStructureModal
          structure={editingStructure}
          schools={isOrgAdmin && schools.length === 1 ? schools : schools}
          onClose={() => { setShowCreate(false); setEditingStructure(undefined); }}
          onSaved={() => { setToast({ message: `Fee structure ${editingStructure ? 'updated' : 'created'}`, type: 'success' }); fetchStructures(); }}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
