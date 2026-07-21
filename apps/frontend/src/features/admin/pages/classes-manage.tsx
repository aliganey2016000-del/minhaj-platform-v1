/**
 * Class Management — Admin Full CRUD
 * Fields: School, Class Name, Section, Room, Shift / Learning Mode.
 */

import { useEffect, useState, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchoolBrief { _id: string; name: string; }

interface DepartmentItem {
  _id: string;
  name: string;
  code?: string;
}

interface ClassItem {
  _id: string;
  title: string;
  section: string;
  room: string;
  department?: string;
  departmentId?: string;
  shiftMode: 'Morning' | 'Afternoon' | 'Evening' | 'Virtual';
  school?: { _id: string; name: string };
  course?: { _id: string; title: { en: string }; slug: string; category: string };
  teacher?: { _id: string; teacherId: string };
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  meetingLink?: string;
  status: 'active' | 'inactive' | 'completed';
  createdAt: string;
}

interface ClassForm {
  school: string;
  department: string;
  title: string;
  section: string;
  room: string;
  shiftMode: string;
}

const emptyForm: ClassForm = { school: '', department: '', title: '', section: '', room: '', shiftMode: 'Morning' };

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function ShiftBadge({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    Morning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    Afternoon: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    Evening: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    Virtual: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[mode] || 'bg-gray-100 text-gray-600'}`}>{mode}</span>;
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${type === 'success' ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'}`}><span>{type === 'success' ? '✅' : '❌'}</span><span>{message}</span><button onClick={onClose} className="ml-2 text-lg leading-none opacity-60 hover:opacity-100">&times;</button></div>;
}

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function ClassModal({ cls, schools, departments, onClose, onSaved }: { cls?: ClassItem; schools: SchoolBrief[]; departments: DepartmentItem[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!cls;
  const [form, setForm] = useState<ClassForm>(cls ? { school: cls.school?._id || '', department: cls.departmentId || cls.department || '', title: cls.title || '', section: cls.section || '', room: cls.room || '', shiftMode: cls.shiftMode || 'Morning' } : emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ClassForm, string>>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const validate = (): boolean => {
    const errs: Partial<Record<keyof ClassForm, string>> = {};
    if (!form.school) errs.school = 'Organization is required';
    if (!form.department) errs.department = 'Department is required';
    if (!form.title.trim()) errs.title = 'Class name is required';
    if (!form.section.trim()) errs.section = 'Section is required';
    if (!form.room.trim()) errs.room = 'Room is required';
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target; setForm(p => ({ ...p, [name]: value }));
    if (errors[name as keyof ClassForm]) setErrors(p => { const n = { ...p }; delete n[name as keyof ClassForm]; return n; });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); if (!validate()) return;
    setLoading(true); setApiError('');
    try {
      const payload = { school: form.school, department: form.department, title: form.title.trim(), section: form.section.trim(), room: form.room.trim(), shiftMode: form.shiftMode };
      if (isEdit) await api.patch(`/classes/${cls._id}`, payload); else await api.post('/classes', payload);
      onSaved(); onClose();
    } catch (err: any) { setApiError(err.response?.data?.message || err.message || 'Failed to save class'); } finally { setLoading(false); }
  };

  const ic = (f: keyof ClassForm) => `w-full rounded-xl border px-4 py-2.5 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${errors[f] ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-border-default)]'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h2 className="text-xl font-bold text-[var(--color-text-primary)]">{isEdit ? '✏️ Edit Class' : '➕ Add Class'}</h2><button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div>
        {apiError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{apiError}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label htmlFor="school" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Organization <span className="text-red-500">*</span></label><select id="school" name="school" value={form.school} onChange={handleChange} className={ic('school')}><option value="">Select an organization...</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>{errors.school && <p className="mt-1 text-xs text-red-500">{errors.school}</p>}</div>
          <div><label htmlFor="department" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Department <span className="text-red-500">*</span></label><select id="department" name="department" value={form.department} onChange={handleChange} className={ic('department')}><option value="">Select a department...</option>{departments.map((dept) => (<option key={dept._id} value={dept._id}>{dept.name}{dept.code ? ` (${dept.code})` : ''}</option>))}</select>{errors.department && <p className="mt-1 text-xs text-red-500">{errors.department}</p>}</div>
          <div><label htmlFor="title" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Class Name <span className="text-red-500">*</span></label><input id="title" name="title" type="text" value={form.title} onChange={handleChange} placeholder="e.g. Grade 3" className={ic('title')} />{errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}</div>
          <div><label htmlFor="section" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Section <span className="text-red-500">*</span></label><input id="section" name="section" type="text" value={form.section} onChange={handleChange} placeholder="e.g. A" className={ic('section')} />{errors.section && <p className="mt-1 text-xs text-red-500">{errors.section}</p>}</div>
          <div><label htmlFor="room" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Room <span className="text-red-500">*</span></label><input id="room" name="room" type="text" value={form.room} onChange={handleChange} placeholder="e.g. Room 5" className={ic('room')} />{errors.room && <p className="mt-1 text-xs text-red-500">{errors.room}</p>}</div>
          <div><label htmlFor="shiftMode" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Shift / Learning Mode <span className="text-red-500">*</span></label><select id="shiftMode" name="shiftMode" value={form.shiftMode} onChange={handleChange} className={ic('shiftMode')}><option value="Morning">Morning</option><option value="Afternoon">Afternoon</option><option value="Evening">Evening</option><option value="Virtual">Virtual</option></select></div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button><button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}{isEdit ? 'Update' : 'Create'}</button></div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Three-Dot Actions Dropdown
// ---------------------------------------------------------------------------

function DepartmentModal({ open, departments, onClose, onSaved }: { open: boolean; departments: DepartmentItem[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState<DepartmentItem | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setCode('');
      setEditing(null);
      setError('');
    }
  }, [open]);

  const close = () => {
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Department name is required'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await api.patch(`/departments/${editing._id}`, { name: name.trim(), code: code.trim() || undefined });
      } else {
        await api.post('/departments', { name: name.trim(), code: code.trim() || undefined });
      }
      onSaved();
      setName('');
      setCode('');
      setEditing(null);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save department');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (dept: DepartmentItem) => {
    setEditing(dept);
    setName(dept.name);
    setCode(dept.code || '');
    setError('');
  };

  const handleDelete = async (dept: DepartmentItem) => {
    if (!window.confirm(`Delete department "${dept.name}"? Classes linked to this department must be reassigned first.`)) return;
    setSaving(true);
    setError('');
    try {
      await api.delete(`/departments/${dept._id}`);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to delete department');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Manage Departments</h2>
            <p className="text-sm text-[var(--color-text-tertiary)]">Create, rename, or delete your tenant's departments.</p>
          </div>
          <button onClick={close} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="grid gap-3">
              <label className="text-sm font-semibold text-[var(--color-text-primary)]">Department Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="e.g. Secondary" />
            </div>
            <div className="grid gap-3">
              <label className="text-sm font-semibold text-[var(--color-text-primary)]">Code (optional)</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="e.g. SEC" />
            </div>
          </div>
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors disabled:opacity-60">{editing ? 'Update Department' : 'Add Department'}</button>
              {editing && <button type="button" onClick={() => { setEditing(null); setName(''); setCode(''); setError(''); }} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>}
            </div>
            <div className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Existing Departments</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{departments.length}</span>
              </div>
              <div className="space-y-3">
                {departments.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">No departments yet. Add one to begin.</p>}
                {departments.map((dept) => (
                  <div key={dept._id} className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-[var(--color-text-primary)]">{dept.name}</p>
                      {dept.code && <p className="text-xs text-[var(--color-text-tertiary)]">Code: {dept.code}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleEdit(dept)} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]">Edit</button>
                      <button type="button" onClick={() => handleDelete(dept)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionsDropdown({ onImport, onExport, exporting, label }: { onImport: () => void; onExport: () => void; exporting: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);

  const toggle = (e: React.MouseEvent) => { e.stopPropagation(); setOpen(!open); };

  return (<>
    <button ref={btnRef} onClick={toggle} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors" title="More Actions">
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 16 16">
        <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
      </svg>
    </button>
    {open && btnRef.current && createPortal(
      <div ref={menuRef} style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().bottom + 4, right: window.innerWidth - btnRef.current.getBoundingClientRect().right, zIndex: 100 }} className="w-52 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-elevated py-1">
        <button onClick={() => { setOpen(false); onImport(); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] flex items-center gap-2 transition-colors">{'\u2191 Import ' + label + ' via Excel'}</button>
        <button onClick={() => { setOpen(false); onExport(); }} disabled={exporting} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-50 flex items-center gap-2 transition-colors">{exporting ? <div className="h-3 w-3 animate-spin rounded-full border border-[var(--color-border-default)] border-t-primary-600" /> : '\u2193 Export ' + label + ' to Excel'}</button>
      </div>,
      document.body,
    )}
  </>);
}

// Main Component
// ---------------------------------------------------------------------------

export function ClassesManage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [showDepartments, setShowDepartments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Import / Export state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteError, setPasteError] = useState('');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ totalRows: number; created: number; failed: number; errors: { row: number; message: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [classesRes, schoolsRes, departmentsRes] = await Promise.all([
        api.get('/classes', { params }),
        api.get('/schools', { params: { limit: '100' } }),
        api.get('/departments'),
      ]);
      setClasses(classesRes.data.data || []);
      setSchools(schoolsRes.data.data || []);
      setDepartments(departmentsRes.data.data || []);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load data'); } finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try { await api.patch(`/classes/${id}/status`, { status: newStatus }); setClasses(p => p.map(c => c._id === id ? { ...c, status: newStatus as ClassItem['status'] } : c)); setToast({ message: `Status updated to ${newStatus}`, type: 'success' }); }
    catch (err: any) { setToast({ message: err.response?.data?.message || 'Failed to update status', type: 'error' }); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this class?')) return;
    try { await api.delete(`/classes/${id}`); setClasses(p => p.filter(c => c._id !== id)); setToast({ message: 'Class deleted', type: 'success' }); }
    catch (err: any) { setToast({ message: err.response?.data?.message || 'Failed to delete', type: 'error' }); }
  };

  // ───────────────────────────────────────────────────────────────────────
  // Import Modal Logic
  // ───────────────────────────────────────────────────────────────────────

  const openImportModal = () => { setShowImportModal(true); setImportMode('upload'); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };
  const closeImportModal = () => { setShowImportModal(false); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/classes/template`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'classes-template.xlsx';
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    } catch { setError('Failed to download template'); }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setSelectedFile(f); };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); };

  const submitFileImport = async () => {
    if (!selectedFile) return; setImporting(true); setError(''); setImportResult(null);
    try {
      const fd = new FormData(); fd.append('file', selectedFile);
      const { data } = await api.post('/classes/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(data.data);
      if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} classes`); fetchData(); closeImportModal(); }
    } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); }
  };

  const parsePastedRows = (): string[][] => {
    if (!pasteText.trim()) return [];
    return pasteText.trim().split(/\r?\n/).map(l => l.split('\t').map(c => c.trim())).filter(r => r.length > 0 && r.some(c => c !== ''));
  };

  const submitPasteImport = async () => {
    const rows = parsePastedRows();
    if (rows.length === 0) { setPasteError('Please paste at least one row of data before submitting.'); return; }
    if (rows[0].length < 5) { setPasteError('Expected 5 columns (Class Name, Section, Room, Department, Shift / Learning Mode). Found ' + rows[0].length + '.'); return; }
    const csvContent = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], 'pasted-classes.csv', { type: 'text/csv' });
    setImporting(true); setError(''); setImportResult(null); setPasteError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/classes/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(data.data);
      if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} classes`); fetchData(); closeImportModal(); }
    } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); }
  };

  const handleExport = async () => {
    setExporting(true); setError('');
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/classes/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `classes-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      setMessage('Export downloaded successfully');
    } catch (err: any) { setError(err.message || 'Export failed'); } finally { setExporting(false); }
  };

  const activeCount = classes.filter(c => c.status === 'active').length;
  const inactiveCount = classes.filter(c => c.status === 'inactive').length;
  const completedCount = classes.filter(c => c.status === 'completed').length;
  const parsedRows = parsePastedRows();

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

        {/* Header + Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🏫 Manage Classes</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{classes.length} total — {activeCount} active, {inactiveCount} inactive, {completedCount} completed</p></div>
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelectedFile(f); submitFileImport(); } }} className="hidden" />
            <ActionsDropdown onImport={openImportModal} onExport={handleExport} exporting={exporting} label="Classes" />
            <button onClick={() => setShowDepartments(true)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Manage Departments</button>
            <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">+ Add Class</button>
          </div>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}

        {/* ═══════════════════════════════════════════════════════════════
            Import Modal
           ═══════════════════════════════════════════════════════════════ */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
              <div className="border-b border-[var(--color-border-subtle)] px-6 py-5">
                <div className="flex items-start justify-between">
                  <div><h2 className="text-xl font-bold text-[var(--color-text-primary)]">Import Classes</h2><p className="text-sm text-[var(--color-text-tertiary)] mt-1">Select your preferred method to import multiple classes into the system.</p></div>
                  <button onClick={closeImportModal} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors" disabled={importing}><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              </div>
              <div className="px-6 py-5 space-y-6">
                <button onClick={handleDownloadTemplate} className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3"><span className="text-2xl">📥</span><div><p className="text-sm font-bold text-primary-700 dark:text-primary-300 group-hover:text-primary-800 dark:group-hover:text-primary-200">Download Excel Class Template</p><p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">Pre-formatted .xlsx file with the correct column structure</p></div></div>
                    <svg className="h-5 w-5 text-primary-500 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setImportMode('upload'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'upload' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}>
                    <span className="text-2xl block mb-1">📁</span><p className={`text-sm font-bold ${importMode === 'upload' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Upload Excel File</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Drag and drop your .xlsx file</p>
                  </button>
                  <button onClick={() => { setImportMode('paste'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'paste' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}>
                    <span className="text-2xl block mb-1">📋</span><p className={`text-sm font-bold ${importMode === 'paste' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Manual Copy & Paste</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Paste tabular data from your clipboard</p>
                  </button>
                </div>

                {importMode === 'upload' && (
                  <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop} className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}>
                    {selectedFile ? (
                      <div className="space-y-3"><span className="text-3xl">✅</span><p className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedFile.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p><button onClick={() => setSelectedFile(null)} className="text-xs text-red-500 hover:underline">Remove file</button></div>
                    ) : (
                      <div className="space-y-3"><span className="text-3xl">📂</span><p className="text-sm font-medium text-[var(--color-text-secondary)]">Drag and drop your Excel file here, or</p><label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">Browse Files<input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInputChange} className="hidden" /></label><p className="text-xs text-[var(--color-text-tertiary)]">Supported formats: .xlsx, .xls, .csv (max 10 MB)</p></div>
                    )}
                  </div>
                )}

                {importMode === 'paste' && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                      <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Paste your spreadsheet data below (tab-separated columns, one row per line):</p>
                      <p className="text-xs text-[var(--color-text-tertiary)] mb-3 font-mono">Class Name &nbsp; Section &nbsp; Room &nbsp; Shift / Learning Mode</p>
                      <textarea value={pasteText} onChange={e => { setPasteText(e.target.value); setPasteError(''); }} rows={8} placeholder={"Paste data from Excel here...\n\nExample:\nGrade 3\tA\tRoom 5\tPrimary\tMorning\nGrade 4\tB\tRoom 2\tSecondary\tAfternoon\nQuran Online\tA\tVirtual Room 1\tMiddle School\tVirtual"} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y" />
                    </div>
                    {pasteError && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{pasteError}</div>}
                    {parsedRows.length > 0 && (
                      <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
                        <div className="bg-[var(--color-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-tertiary)]">Preview — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed</div>
                        <div className="max-h-40 overflow-auto"><table className="w-full text-xs"><tbody className="divide-y divide-[var(--color-border-subtle)]">{parsedRows.slice(0, 20).map((row, ri) => (<tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--color-surface-primary)]' : 'bg-[var(--color-surface-secondary)]'}>{row.map((cell, ci) => (<td key={ci} className="px-3 py-1.5 text-[var(--color-text-secondary)] whitespace-nowrap border-r border-[var(--color-border-subtle)] last:border-r-0">{cell}</td>))}</tr>))}</tbody></table></div>
                      </div>
                    )}
                  </div>
                )}
                {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}
              </div>

              <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between">
                <button onClick={closeImportModal} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button>
                <button onClick={importMode === 'upload' ? submitFileImport : submitPasteImport} disabled={importing || (importMode === 'upload' && !selectedFile) || (importMode === 'paste' && !pasteText.trim())} className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2">{importing ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importing...</> : 'Import Classes'}</button>
              </div>
              {importResult && (
                <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 space-y-2">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{importResult.created} of {importResult.totalRows} rows imported successfully{importResult.failed > 0 && ` — ${importResult.failed} failed`}</p>
                  {importResult.errors.length > 0 && (<div className="max-h-36 overflow-y-auto rounded-lg border border-red-200 dark:border-red-900/40"><table className="w-full text-xs"><thead className="bg-red-50 dark:bg-red-950/30 text-left text-red-700 dark:text-red-300"><tr><th className="px-3 py-1.5">Row</th><th className="px-3 py-1.5">Error</th></tr></thead><tbody className="divide-y divide-red-100 dark:divide-red-900/30">{importResult.errors.map((e, idx) => (<tr key={idx}><td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{e.row}</td><td className="px-3 py-1.5 text-red-600 dark:text-red-400">{e.message}</td></tr>))}</tbody></table></div>)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center"><p className="text-2xl font-bold text-green-700 dark:text-green-300">{activeCount}</p><p className="text-xs text-green-600 dark:text-green-400">Active</p></div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 p-4 text-center"><p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{inactiveCount}</p><p className="text-xs text-gray-500 dark:text-gray-500">Inactive</p></div>
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-center"><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{completedCount}</p><p className="text-xs text-blue-600 dark:text-blue-400">Completed</p></div>
        </div>

        {error && !showImportModal && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm mb-2">{error}</p><button onClick={fetchData} className="text-primary-600 font-medium text-sm hover:underline">Retry</button></div>}

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="text" placeholder="Search by class name, section, room, or organization..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="completed">Completed</option></select>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Class</th>
                  <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Section</th>
                  <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)] hidden md:table-cell">Organization</th>
                  <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Department</th>
                  <th className="text-left px-5 py-3 font-semibold text-[var(--color-text-primary)]">Room</th>
                  <th className="text-center px-5 py-3 font-semibold text-[var(--color-text-primary)]">Shift / Mode</th>
                  <th className="text-center px-5 py-3 font-semibold text-[var(--color-text-primary)]">Status</th>
                  <th className="text-center px-5 py-3 font-semibold text-[var(--color-text-primary)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {classes.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">🏫 No classes found</p><p className="text-sm">Click "+ Add Class" to create one.</p></td></tr>
                ) : (
                  classes.map(c => (
                    <tr key={c._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <td className="px-5 py-4"><p className="font-semibold text-[var(--color-text-primary)]">{c.title}</p></td>
                      <td className="px-5 py-4"><span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{c.section}</span></td>
                      <td className="px-5 py-4 hidden md:table-cell text-[var(--color-text-secondary)] text-sm">{c.school?.name || '—'}</td>
                      <td className="px-5 py-4 text-[var(--color-text-secondary)] text-sm">{c.department || 'Primary'}</td>
                      <td className="px-5 py-4 text-[var(--color-text-secondary)] text-sm">{c.room}</td>
                      <td className="px-5 py-4 text-center"><ShiftBadge mode={c.shiftMode || 'Morning'} /></td>
                      <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><select value={c.status} onChange={e => handleStatusChange(c._id, e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer text-[var(--color-text-primary)]"><option value="active">Active</option><option value="inactive">Inactive</option><option value="completed">Completed</option></select></td>
                      <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><div className="flex items-center justify-center gap-1"><button onClick={() => setEditingClass(c)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30" title="Edit">✏️</button><button onClick={() => handleDelete(c._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete">🗑️</button></div></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreate && <ClassModal departments={departments} schools={schools} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchData(); }} />}
      {editingClass && <ClassModal cls={editingClass} departments={departments} schools={schools} onClose={() => setEditingClass(undefined)} onSaved={() => { setEditingClass(undefined); fetchData(); }} />}
      <DepartmentModal open={showDepartments} departments={departments} onClose={() => setShowDepartments(false)} onSaved={() => { setShowDepartments(false); fetchData(); }} />
    </div>
  );
}

export default ClassesManage;